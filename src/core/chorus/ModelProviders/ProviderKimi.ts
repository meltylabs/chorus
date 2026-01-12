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

        const { canProceed, reason } = canProceedWithProvider("kimi", apiKeys);

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Moonshot AI API key in Settings.",
            );
        }

        const baseURL = customBaseUrl || "https://api.moonshot.cn/v1";

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
            const stream = await client.chat.completions.create(streamParams);

            for await (const chunk of stream) {
                chunks.push(chunk);

                // Handle content chunks
                if (chunk.choices[0]?.delta?.content) {
                    onChunk(chunk.choices[0].delta.content);
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
