import OpenAI from "openai";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { LLMMessage, StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";

function stripThinkBlocks(text: string): string {
    return text
        .replace(/<think(?:\s+[^>]*?)?>[\s\S]*?<\/think\s*>/g, "")
        .replace(/<thought(?:\s+[^>]*?)?>[\s\S]*?<\/thought\s*>/g, "")
        .replace(/<thinkmeta\s+seconds="\d+"\s*\/>/g, "")
        .trim();
}

function stripThinkBlocksFromConversation(
    messages: LLMMessage[],
): LLMMessage[] {
    return messages.map((message) => {
        if (message.role !== "assistant") return message;
        return {
            ...message,
            content: stripThinkBlocks(message.content || ""),
        };
    });
}

export class ProviderFireworks implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        additionalHeaders,
        tools,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelName = modelConfig.modelId.split("::")[1];

        const { canProceed, reason } = canProceedWithProvider(
            "fireworks",
            apiKeys,
        );
        if (!canProceed) {
            throw new Error(
                reason || "Please add your Fireworks API key in Settings.",
            );
        }

        const client = new OpenAI({
            baseURL: customBaseUrl || "https://api.fireworks.ai/inference/v1",
            apiKey: apiKeys.fireworks,
            fetch: tauriFetch,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
            },
            dangerouslyAllowBrowser: true,
        });

        const functionSupport = (tools?.length ?? 0) > 0;
        const sanitizedConversation =
            stripThinkBlocksFromConversation(llmConversation);
        const messages = await OpenAICompletionsAPIUtils.convertConversation(
            sanitizedConversation,
            { imageSupport: true, functionSupport },
        );

        const params: OpenAI.ChatCompletionCreateParamsStreaming & {
            reasoning_effort?: string;
        } = {
            model: modelName,
            messages: [
                ...(modelConfig.systemPrompt
                    ? [
                          {
                              role: "system" as const,
                              content: modelConfig.systemPrompt,
                          },
                      ]
                    : []),
                ...messages,
            ],
            stream: true,
        };

        const normalizedEffort = (
            effort: "low" | "medium" | "high" | "xhigh" | null | undefined,
        ): "low" | "medium" | "high" => {
            if (effort === "low" || effort === "medium" || effort === "high") {
                return effort;
            }
            if (effort === "xhigh") {
                return "high";
            }
            return "medium";
        };

        const lowerModelName = modelName.toLowerCase();
        const canDisableReasoning =
            !lowerModelName.includes("gpt-oss") &&
            !lowerModelName.includes("minimax") &&
            !lowerModelName.includes("m2");

        // Kimi streams verbose reasoning_content that includes draft answers.
        // For Kimi, we should redact the reasoning content and only show the clean answer from `content`.
        const shouldRedactReasoning = lowerModelName.includes("kimi");

        const detectNativeThinkMarkup = (text: string): boolean => {
            const lower = text.toLowerCase();
            return (
                lower.includes("<think") ||
                lower.includes("</think") ||
                lower.includes("<thought") ||
                lower.includes("</thought") ||
                lower.includes("<thinkmeta")
            );
        };

        const stripNativeThinkTags = (text: string): { thinking: string; answer: string } => {
            // Extract content inside <think>...</think> or <thought>...</thought>
            const thinkMatch = text.match(/<think(?:\s+[^>]*?)?>([\s\S]*?)<\/think\s*>/i);
            const thoughtMatch = text.match(/<thought(?:\s+[^>]*?)?>([\s\S]*?)<\/thought\s*>/i);

            let thinking = "";
            let remainingText = text;

            if (thinkMatch) {
                thinking = thinkMatch[1].trim();
                remainingText = text.replace(/<think(?:\s+[^>]*?)?>([\s\S]*?)<\/think\s*>/gi, "").trim();
            } else if (thoughtMatch) {
                thinking = thoughtMatch[1].trim();
                remainingText = text.replace(/<thought(?:\s+[^>]*?)?>([\s\S]*?)<\/thought\s*>/gi, "").trim();
            }

            // Remove <thinkmeta> tags from remaining text
            const answer = remainingText.replace(/<thinkmeta\s+[^>]*?\/>/gi, "").trim();

            return { thinking, answer };
        };

        if (modelConfig.showThoughts) {
            // Fireworks streams reasoning in `reasoning_content` when enabled.
            // Default to medium when user hasn't set anything.
            params.reasoning_effort = normalizedEffort(
                modelConfig.reasoningEffort,
            );
        } else if (canDisableReasoning) {
            // Best-effort: disable reasoning so we don't pay tokens for it.
            params.reasoning_effort = "none";
        }

        if (tools && tools.length > 0) {
            params.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            params.tool_choice = "auto";
        }

        const chunks: OpenAI.ChatCompletionChunk[] = [];
        let inReasoning = false;
        let reasoningStartedAtMs: number | undefined;
        let sawNativeReasoning = false;
        let sawContent = false;
        let reasoningBuffer = "";
        type ReasoningStreamMode = "unknown" | "wrapped";
        let reasoningStreamMode: ReasoningStreamMode = "unknown";
        let pendingReasoning = "";
        let nativeProbe = "";
        const MAX_NATIVE_PROBE_CHARS = 96;
        const DECIDE_WRAPPED_AFTER_CHARS = 128;
        let nativeThinkDetected = false;
        let nativeThinkClosed = false;
        let wroteRedactedPlaceholder = false;

        const closeReasoning = () => {
            if (!inReasoning) return;
            inReasoning = false;
            onChunk("</think>");
            if (reasoningStartedAtMs !== undefined) {
                const seconds = Math.max(
                    1,
                    Math.round((Date.now() - reasoningStartedAtMs) / 1000),
                );
                onChunk(`<thinkmeta seconds="${seconds}"/>`);
            }
            reasoningStartedAtMs = undefined;
        };

        const sanitizeTextDelta = (text: string) => {
            if (
                sawNativeReasoning &&
                (text.includes("<think") ||
                    text.includes("</think") ||
                    text.includes("<thought") ||
                    text.includes("</thought"))
            ) {
                return text
                    .replace(/<think/g, "&lt;think")
                    .replace(/<\/think/g, "&lt;/think")
                    .replace(/<thought/g, "&lt;thought")
                    .replace(/<\/thought/g, "&lt;/thought");
            }
            return text;
        };

        let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
        try {
            stream = await client.chat.completions.create(params);
        } catch (error) {
            // Some Fireworks models reject reasoning_effort="none".
            // If disabling reasoning fails, retry once without the param.
            if (
                !modelConfig.showThoughts &&
                params.reasoning_effort === "none"
            ) {
                delete params.reasoning_effort;
                stream = await client.chat.completions.create(params);
            } else {
                throw error;
            }
        }

        for await (const chunk of stream) {
            chunks.push(chunk);
            const delta = chunk.choices[0]?.delta as unknown as {
                content?: string;
                reasoning?: string;
                reasoning_content?: string;
            };

            const reasoningDelta =
                typeof delta?.reasoning_content === "string"
                    ? delta.reasoning_content
                    : typeof delta?.reasoning === "string"
                      ? delta.reasoning
                      : undefined;

            if (modelConfig.showThoughts && reasoningDelta) {
                sawNativeReasoning = true;
                reasoningBuffer += reasoningDelta;

                // For Kimi, redact the verbose reasoning content
                if (shouldRedactReasoning) {
                    if (!inReasoning) {
                        inReasoning = true;
                        reasoningStartedAtMs = Date.now();
                        onChunk("<think>");
                    }
                    if (!wroteRedactedPlaceholder) {
                        wroteRedactedPlaceholder = true;
                        onChunk("[redacted]");
                    }
                    continue;
                }

                if (reasoningStreamMode === "unknown") {
                    pendingReasoning += reasoningDelta;
                    nativeProbe = (nativeProbe + reasoningDelta).slice(
                        -MAX_NATIVE_PROBE_CHARS,
                    );

                    if (detectNativeThinkMarkup(nativeProbe)) {
                        // Detected native <think> tags - we'll strip them and wrap content ourselves
                        nativeThinkDetected = true;
                        reasoningStreamMode = "wrapped";

                        // Process the buffered text
                        let textToProcess = pendingReasoning;
                        pendingReasoning = "";

                        // Remove opening tags
                        textToProcess = textToProcess
                            .replace(/<think(?:\s+[^>]*?)?>/gi, "")
                            .replace(/<thought(?:\s+[^>]*?)?>/gi, "");

                        // Check if we've hit the closing tag
                        const closingTagMatch = textToProcess.match(/<\/(think|thought)\s*>/i);
                        if (closingTagMatch) {
                            nativeThinkClosed = true;
                            const parts = textToProcess.split(/<\/(think|thought)\s*>/i);
                            const thinkingPart = parts[0];
                            // Clean native <thinkmeta> tags from answer part
                            const answerPart = parts.slice(2).join("")
                                .replace(/<thinkmeta\s+[^>]*?\/>/gi, "")
                                .trim();

                            if (thinkingPart) {
                                inReasoning = true;
                                reasoningStartedAtMs = Date.now();
                                onChunk("<think>");
                                onChunk(thinkingPart);
                            }
                            closeReasoning();
                            if (answerPart) {
                                onChunk(answerPart);
                            }
                        } else {
                            // Opening tag found but no closing tag yet
                            if (textToProcess) {
                                inReasoning = true;
                                reasoningStartedAtMs = Date.now();
                                onChunk("<think>");
                                onChunk(textToProcess);
                            }
                        }
                    } else if (
                        pendingReasoning.length >=
                        DECIDE_WRAPPED_AFTER_CHARS
                    ) {
                        reasoningStreamMode = "wrapped";
                        inReasoning = true;
                        reasoningStartedAtMs = Date.now();
                        onChunk("<think>");
                        onChunk(pendingReasoning);
                        pendingReasoning = "";
                    }
                } else if (reasoningStreamMode === "wrapped") {
                    let textToProcess = reasoningDelta;

                    if (nativeThinkDetected && !nativeThinkClosed) {
                        // Remove any native tags
                        textToProcess = textToProcess
                            .replace(/<think(?:\s+[^>]*?)?>/gi, "")
                            .replace(/<thought(?:\s+[^>]*?)?>/gi, "")
                            .replace(/<thinkmeta\s+[^>]*?\/>/gi, "");

                        // Check for closing tag
                        const closingTagMatch = textToProcess.match(/<\/(think|thought)\s*>/i);
                        if (closingTagMatch) {
                            nativeThinkClosed = true;
                            const parts = textToProcess.split(/<\/(think|thought)\s*>/i);
                            const thinkingPart = parts[0];
                            // Clean native <thinkmeta> tags from answer part
                            const answerPart = parts.slice(2).join("")
                                .replace(/<thinkmeta\s+[^>]*?\/>/gi, "")
                                .trim();

                            if (thinkingPart && inReasoning) {
                                onChunk(thinkingPart);
                            }
                            closeReasoning();
                            if (answerPart) {
                                onChunk(answerPart);
                            }
                        } else {
                            // No closing tag yet, continue accumulating thinking content
                            if (!inReasoning) {
                                inReasoning = true;
                                reasoningStartedAtMs = Date.now();
                                onChunk("<think>");
                            }
                            if (textToProcess) {
                                onChunk(textToProcess);
                            }
                        }
                    } else if (nativeThinkDetected && nativeThinkClosed) {
                        // We're past the native </think> tag, treat remaining as answer
                        onChunk(textToProcess);
                    } else {
                        // Normal wrapped mode, no native tags detected
                        if (!inReasoning) {
                            inReasoning = true;
                            reasoningStartedAtMs = Date.now();
                            onChunk("<think>");
                        }
                        onChunk(textToProcess);
                    }
                }
            }

            if (typeof delta?.content === "string" && delta.content) {
                sawContent = true;
                if (modelConfig.showThoughts) {
                    if (reasoningStreamMode === "unknown") {
                        // If we got here, we buffered a little reasoning but haven't decided how to render it.
                        // No native markup detected, so default to wrapped.
                        reasoningStreamMode = "wrapped";
                        if (pendingReasoning) {
                            inReasoning = true;
                            reasoningStartedAtMs = Date.now();
                            onChunk("<think>");
                            onChunk(pendingReasoning);
                            pendingReasoning = "";
                        }
                    } else if (nativeThinkDetected && pendingReasoning) {
                        // Flush any buffered reasoning
                        if (pendingReasoning) {
                            onChunk(pendingReasoning);
                            pendingReasoning = "";
                        }
                    }
                }
                closeReasoning();
                onChunk(sanitizeTextDelta(delta.content));
            }
        }

        if (modelConfig.showThoughts) {
            if (reasoningStreamMode === "unknown") {
                // Stream ended before we hit our buffering threshold; check for native markup.
                if (detectNativeThinkMarkup(nativeProbe)) {
                    // Has native tags - strip them
                    const { thinking, answer } = stripNativeThinkTags(pendingReasoning);
                    if (thinking) {
                        inReasoning = true;
                        reasoningStartedAtMs = Date.now();
                        onChunk("<think>");
                        onChunk(thinking);
                        closeReasoning();
                    }
                    if (answer) {
                        onChunk(answer);
                    }
                    pendingReasoning = "";
                } else {
                    reasoningStreamMode = "wrapped";
                    if (pendingReasoning) {
                        inReasoning = true;
                        reasoningStartedAtMs = Date.now();
                        onChunk("<think>");
                        onChunk(pendingReasoning);
                        pendingReasoning = "";
                    }
                }
            } else if (pendingReasoning) {
                onChunk(pendingReasoning);
                pendingReasoning = "";
            }
        }

        closeReasoning();

        // Some models / endpoints may stream all text in a reasoning field (with no `content`).
        // In that case, surface the buffered text as the main output too so users aren't left
        // with an empty assistant message. Skip this if we already handled native tags or if we're redacting.
        if (
            modelConfig.showThoughts &&
            !sawContent &&
            !nativeThinkDetected &&
            !shouldRedactReasoning
        ) {
            const fallbackText = reasoningBuffer.trim();
            if (fallbackText) {
                onChunk("\n\n" + sanitizeTextDelta(fallbackText));
            }
        }

        const toolCalls = OpenAICompletionsAPIUtils.convertToolCalls(
            chunks,
            tools ?? [],
        );

        await onComplete(
            undefined,
            toolCalls.length > 0 ? toolCalls : undefined,
        );
    }
}
