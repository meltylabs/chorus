import OpenAI from "openai";
import { fetch } from "@tauri-apps/plugin-http";
import { StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";

export class ProviderKimi implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        onError,
        additionalHeaders,
        tools,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelName = modelConfig.modelId.split("::")[1];

        const { canProceed, reason } = canProceedWithProvider("kimi", apiKeys);

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Moonshot AI API key in Settings.",
            );
        }

        const baseURL = customBaseUrl || "https://api.moonshot.cn/v1";

        // Kimi supports images for the k2 models
        const imageSupport = modelName.includes("vision");

        // Kimi supports tool calls (but tool_choice doesn't support "required")
        const functionSupport = true;

        let messages: OpenAI.ChatCompletionMessageParam[] =
            await OpenAICompletionsAPIUtils.convertConversation(
                llmConversation,
                {
                    imageSupport,
                    functionSupport,
                },
            );

        // Add system prompt if provided
        if (modelConfig.systemPrompt) {
            messages = [
                {
                    role: "system",
                    content: modelConfig.systemPrompt,
                },
                ...messages,
            ];
        }

        const streamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: modelName,
            messages,
            stream: true,
        };

        // Add tools definitions using the utility function
        if (tools && tools.length > 0) {
            streamParams.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            // Kimi doesn't support tool_choice: "required", only "auto" or "none"
            streamParams.tool_choice = "auto";
        }

        const chunks: OpenAI.ChatCompletionChunk[] = [];

        try {
            // Use Tauri's HTTP plugin to avoid browser CORS for Moonshot.
            // NOTE: this expects the endpoint to support SSE streaming when `stream: true`.
            const response = await fetch(`${baseURL}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKeys.kimi}`,
                    "Content-Type": "application/json",
                    ...(additionalHeaders ?? {}),
                },
                body: JSON.stringify(streamParams),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(
                    `Kimi API error: HTTP ${response.status} ${response.statusText} - ${text}`,
                );
            }

            // Read server-sent events stream and emit text deltas.
            // We keep a minimal "chunk-like" structure for existing tool-call parsing.
            if (!response.body) {
                const text = await response.text();
                throw new Error(
                    `Kimi API error: missing response body for streaming request - ${text}`,
                );
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // SSE events are separated by blank lines
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const lines = part
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean);

                    for (const line of lines) {
                        if (!line.startsWith("data:")) {
                            continue;
                        }

                        const data = line.slice("data:".length).trim();
                        if (data === "[DONE]") {
                            break;
                        }

                        let parsed: OpenAI.ChatCompletionChunk | undefined;
                        try {
                            parsed = JSON.parse(
                                data,
                            ) as OpenAI.ChatCompletionChunk;
                        } catch {
                            // Ignore non-JSON data lines
                            continue;
                        }

                        chunks.push(parsed);

                        const delta = parsed.choices?.[0]?.delta;
                        if (delta?.content) {
                            onChunk(delta.content);
                        }
                    }
                }
            }

            // Convert tool calls using the utility function
            const toolCalls = OpenAICompletionsAPIUtils.convertToolCalls(
                chunks,
                tools ?? [],
            );

            // Extract usage data from the last chunk if available
            const lastChunk = chunks[chunks.length - 1];
            const usageData = lastChunk?.usage
                ? {
                      prompt_tokens: lastChunk.usage.prompt_tokens,
                      completion_tokens: lastChunk.usage.completion_tokens,
                      total_tokens: lastChunk.usage.total_tokens,
                  }
                : undefined;

            await onComplete(
                undefined,
                toolCalls.length > 0 ? toolCalls : undefined,
                usageData,
            );
        } catch (error: unknown) {
            console.error("[ProviderKimi] Error:", error);

            if (error instanceof Error) {
                // Handle specific Kimi API errors
                const errorMessage = error.message;

                if (
                    errorMessage.includes("context_length_exceeded") ||
                    errorMessage.includes("maximum context length")
                ) {
                    onError(
                        "The conversation is too long for this model's context window. Please start a new chat or use a model with a larger context window.",
                    );
                    return;
                }

                if (
                    errorMessage.includes("invalid_api_key") ||
                    errorMessage.includes("Unauthorized")
                ) {
                    onError(
                        "Invalid Moonshot AI API key. Please check your API key in Settings.",
                    );
                    return;
                }

                if (errorMessage.includes("rate_limit")) {
                    onError(
                        "Rate limit exceeded. Please wait a moment and try again.",
                    );
                    return;
                }
            }

            throw error;
        }
    }
}
