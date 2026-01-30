import OpenAI from "openai";
import { StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";
import JSON5 from "json5";
import * as Prompts from "@core/chorus/prompts/prompts";

interface ProviderError {
    message: string;
    error?: {
        message?: string;
        metadata?: { raw?: string };
    };
    metadata?: { raw?: string };
}

function isProviderError(error: unknown): error is ProviderError {
    return (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        ("error" in error || "metadata" in error) &&
        error.message === "Provider returned error"
    );
}

export class ProviderGrok implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        additionalHeaders,
        enabledToolsets,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelName = modelConfig.modelId.split("::")[1];

        const { canProceed, reason } = canProceedWithProvider("grok", apiKeys);

        if (!canProceed) {
            throw new Error(
                reason || "Please add your xAI API key in Settings.",
            );
        }

        const baseURL = customBaseUrl || "https://api.x.ai/v1";

        const client = new OpenAI({
            baseURL,
            apiKey: apiKeys.grok,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
            },
            dangerouslyAllowBrowser: true,
        });

        let messages: OpenAI.ChatCompletionMessageParam[] =
            await OpenAICompletionsAPIUtils.convertConversation(
                llmConversation,
                {
                    imageSupport: true,
                    functionSupport: false,
                },
            );

        const systemPrompt = [
            modelConfig.showThoughts
                ? Prompts.THOUGHTS_SYSTEM_PROMPT
                : undefined,
            modelConfig.systemPrompt,
        ]
            .filter(Boolean)
            .join("\n\n");

        if (systemPrompt) {
            messages = [{ role: "system", content: systemPrompt }, ...messages];
        }

        const nativeWebSearchEnabled =
            enabledToolsets?.includes("web") ?? false;
        const supportsNativeWebSearch = modelName.startsWith("grok-4");
        const shouldUseNativeWebSearch =
            nativeWebSearchEnabled && supportsNativeWebSearch;

        if (shouldUseNativeWebSearch) {
            try {
                // Convert chat messages to the OpenAI Responses API input format.
                const input =
                    convertChatCompletionMessagesToResponsesInput(messages);

                const runSearch = async (tools: OpenAI.Responses.Tool[]) => {
                    const stream = client.responses.stream({
                        model: modelName,
                        input,
                        tools,
                        tool_choice: "auto",
                    });

                    for await (const event of stream) {
                        if (
                            isPlainObject(event) &&
                            event["type"] === "response.output_text.delta" &&
                            typeof event["delta"] === "string"
                        ) {
                            onChunk(event["delta"]);
                        }
                    }

                    const finalResponse = await stream.finalResponse();
                    const citations = (
                        finalResponse as unknown as Record<string, unknown>
                    )?.["citations"];
                    if (Array.isArray(citations) && citations.length > 0) {
                        const sourcesText = citations
                            .map((url, index) =>
                                typeof url === "string"
                                    ? `${index + 1}. [${url}](${url})`
                                    : `${index + 1}. ${safeToString(url)}`,
                            )
                            .join("\n");
                        onChunk(`\n\nSources:\n${sourcesText}`);
                    }
                };

                try {
                    const tools: OpenAI.Responses.Tool[] = [
                        { type: "web_search" },
                        // @ts-expect-error xAI supports an additional server-side tool for searching X posts.
                        { type: "x_search" },
                    ];
                    await runSearch(tools);
                } catch (error) {
                    const errorText = safeToString(error).toLowerCase();
                    const xSearchUnsupported =
                        errorText.includes("x_search") &&
                        (errorText.includes("unknown") ||
                            errorText.includes("unsupported") ||
                            errorText.includes("not supported"));
                    if (!xSearchUnsupported) {
                        throw error;
                    }

                    await runSearch([{ type: "web_search" }]);
                }

                await onComplete();
                return;
            } catch (error: unknown) {
                console.error("Raw error:", error);
                console.error(JSON.stringify(error, null, 2));

                if (
                    isProviderError(error) &&
                    error.message === "Provider returned error"
                ) {
                    const errorDetails: ProviderError = JSON5.parse(
                        error.error?.metadata?.raw ||
                            error.metadata?.raw ||
                            "{}",
                    );
                    throw new Error(
                        `Provider returned error: ${errorDetails.error?.message || error.message}`,
                    );
                }
                throw error;
            }
        }

        // Grok 3 Mini is the only model that supports configurable reasoning effort control
        // Per Roo Code docs: "only the Grok 3 Mini models support configurable reasoning effort control"
        // Other models (grok-4, grok-4-fast, grok-4-1-fast, grok-code-fast-1, grok-3, grok-3-fast)
        // are reasoning-capable but don't expose the reasoning_effort parameter
        const isGrok3Mini = modelName.includes("grok-3-mini");

        const streamParams: OpenAI.ChatCompletionCreateParamsStreaming & {
            reasoning_effort?: string;
        } = {
            model: modelName,
            messages,
            stream: true,
        };

        // Only Grok 3 Mini supports reasoning effort control
        if (isGrok3Mini && modelConfig.reasoningEffort) {
            // Map effort levels to supported values
            // Grok 3 Mini only supports: "low" | "high"
            const effortMap: Record<
                string,
                "low" | "medium" | "high" | "xhigh" | "minimal"
            > = {
                low: "low",
                medium: "high" as const, // medium maps to high
                high: "high",
                xhigh: "high" as const, // xhigh maps to high
            };
            streamParams.reasoning_effort =
                effortMap[modelConfig.reasoningEffort] || "low";
        }

        try {
            const stream = await client.chat.completions.create(streamParams);

            let inReasoning = false;
            let reasoningStartedAtMs: number | undefined;

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

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta as unknown as {
                    content?: string;
                    reasoning?: string;
                    reasoning_content?: string;
                };

                const reasoningDelta =
                    typeof delta?.reasoning === "string"
                        ? delta.reasoning
                        : typeof delta?.reasoning_content === "string"
                          ? delta.reasoning_content
                          : undefined;

                if (reasoningDelta) {
                    if (!inReasoning) {
                        inReasoning = true;
                        reasoningStartedAtMs = Date.now();
                        onChunk("<think>");
                    }
                    onChunk(reasoningDelta);
                }

                if (delta?.content) {
                    closeReasoning();
                    onChunk(delta.content);
                }
            }

            closeReasoning();

            await onComplete();
        } catch (error: unknown) {
            console.error("Raw error:", error);
            console.error(JSON.stringify(error, null, 2));

            if (
                isProviderError(error) &&
                error.message === "Provider returned error"
            ) {
                const errorDetails: ProviderError = JSON5.parse(
                    error.error?.metadata?.raw || error.metadata?.raw || "{}",
                );
                throw new Error(
                    `Provider returned error: ${errorDetails.error?.message || error.message}`,
                );
            }
            throw error;
        }
    }
}

function convertChatCompletionMessagesToResponsesInput(
    messages: OpenAI.ChatCompletionMessageParam[],
): OpenAI.Responses.ResponseInputItem[] {
    return messages.map((message) => {
        const role = normalizeResponsesRole(message.role);
        const content = message.content;

        if (typeof content === "string") {
            return { role, content };
        }

        if (Array.isArray(content)) {
            const parts: OpenAI.Responses.ResponseInputContent[] = [];

            for (const part of content) {
                if (!isPlainObject(part) || typeof part["type"] !== "string") {
                    parts.push({
                        type: "input_text",
                        text: safeToString(part),
                    });
                    continue;
                }

                if (part["type"] === "text") {
                    parts.push({
                        type: "input_text",
                        text:
                            typeof part["text"] === "string"
                                ? part["text"]
                                : safeToString(part["text"]),
                    });
                    continue;
                }

                if (part["type"] === "image_url") {
                    const imageUrlValue = part["image_url"];
                    const imageUrl =
                        isPlainObject(imageUrlValue) &&
                        typeof imageUrlValue["url"] === "string"
                            ? imageUrlValue["url"]
                            : null;
                    const detail = isPlainObject(imageUrlValue)
                        ? normalizeImageDetail(imageUrlValue["detail"])
                        : "auto";

                    parts.push({
                        type: "input_image",
                        detail,
                        image_url: imageUrl,
                    });
                    continue;
                }

                parts.push({
                    type: "input_text",
                    text: safeToString(part),
                });
            }

            return { role, content: parts };
        }

        if (content === null || content === undefined) {
            return { role, content: "" };
        }

        return { role, content: safeToString(content) };
    });
}

type ResponsesRole = "user" | "assistant" | "system" | "developer";

function normalizeResponsesRole(
    role: OpenAI.ChatCompletionMessageParam["role"],
): ResponsesRole {
    if (
        role === "user" ||
        role === "assistant" ||
        role === "system" ||
        role === "developer"
    ) {
        return role;
    }
    return "user";
}

function normalizeImageDetail(detail: unknown): "low" | "high" | "auto" {
    if (detail === "low" || detail === "high" || detail === "auto") {
        return detail;
    }
    return "auto";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeToString(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    try {
        const jsonValue = JSON.stringify(value);
        return jsonValue ?? String(value);
    } catch {
        return String(value);
    }
}
