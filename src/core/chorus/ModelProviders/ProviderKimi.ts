import OpenAI from "openai";
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

        // Validate supported models
        const supportedModels = [
            "kimi-k2",
            "kimi-k2-thinking",
            "moonshot-v1-8k",
            "moonshot-v1-32k",
            "moonshot-v1-128k",
        ];

        if (!supportedModels.includes(modelName)) {
            throw new Error(`Unsupported Kimi model: ${modelName}`);
        }

        const { canProceed, reason } = canProceedWithProvider("kimi", apiKeys);

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Moonshot AI API key in Settings.",
            );
        }

        const baseURL = customBaseUrl || "https://api.moonshot.ai/v1";

        const client = new OpenAI({
            baseURL,
            apiKey: apiKeys.kimi,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
            },
            dangerouslyAllowBrowser: true,
        });

        // Kimi supports images for the k2 models
        const imageSupport =
            modelName === "kimi-k2" || modelName === "kimi-k2-thinking";

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

        // Convert tools to OpenAI format
        const openaiTools: OpenAI.ChatCompletionTool[] | undefined =
            tools?.map((tool) => ({
                type: "function" as const,
                function: {
                    name: `${tool.toolsetName}__${tool.name}`,
                    description: tool.description,
                    parameters: tool.inputSchema,
                },
            }));

        const streamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: modelName,
            messages,
            stream: true,
            // Kimi doesn't support tool_choice: "required", only "auto" or "none"
            ...(openaiTools &&
                openaiTools.length > 0 && {
                    tools: openaiTools,
                    tool_choice: "auto" as const,
                }),
        };

        try {
            const stream = await client.chat.completions.create(streamParams);

            let fullContent = "";
            const toolCalls: Array<{
                id: string;
                name: string;
                arguments: string;
            }> = [];

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;

                // Handle content chunks
                if (delta?.content) {
                    fullContent += delta.content;
                    onChunk(delta.content);
                }

                // Handle tool call chunks
                if (delta?.tool_calls) {
                    for (const toolCallDelta of delta.tool_calls) {
                        const index = toolCallDelta.index;

                        // Initialize tool call if needed
                        if (!toolCalls[index]) {
                            toolCalls[index] = {
                                id: toolCallDelta.id || "",
                                name: toolCallDelta.function?.name || "",
                                arguments: "",
                            };
                        }

                        // Accumulate tool call data
                        if (toolCallDelta.id) {
                            toolCalls[index].id = toolCallDelta.id;
                        }
                        if (toolCallDelta.function?.name) {
                            toolCalls[index].name = toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function?.arguments) {
                            toolCalls[index].arguments +=
                                toolCallDelta.function.arguments;
                        }
                    }
                }
            }

            // Convert tool calls to UserToolCall format
            const userToolCalls =
                toolCalls.length > 0
                    ? toolCalls.map((tc) => {
                          const [toolsetName, toolName] = tc.name.split("__");
                          return {
                              id: tc.id,
                              toolsetName: toolsetName || "",
                              toolName: toolName || tc.name,
                              input: tc.arguments,
                          };
                      })
                    : undefined;

            await onComplete(
                fullContent || undefined,
                userToolCalls,
                undefined,
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
