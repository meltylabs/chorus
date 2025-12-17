import _ from "lodash";
import OpenAI from "openai";
import { StreamResponseParams } from "../Models";
import { IProvider, ModelDisabled } from "./IProvider";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import JSON5 from "json5";

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

// uses OpenAI provider to format the messages
export class ProviderOpenRouter implements IProvider {
    async streamResponse({
        llmConversation,
        modelConfig,
        onChunk,
        onComplete,
        apiKeys,
        additionalHeaders,
        tools,
        onError,
        customBaseUrl,
    }: StreamResponseParams): Promise<ModelDisabled | void> {
        const modelName = modelConfig.modelId.split("::")[1];
        // Use the model's supportedAttachmentTypes from the database instead of hardcoded list
        // Add null safety check in case supportedAttachmentTypes is undefined or null
        const supportsImages =
            modelConfig.supportedAttachmentTypes?.includes("image") ?? false;

        const { canProceed, reason } = canProceedWithProvider(
            "openrouter",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your OpenRouter API key in Settings.",
            );
        }

        const baseURL = customBaseUrl || "https://openrouter.ai/api/v1";

        const client = new OpenAI({
            baseURL,
            apiKey: apiKeys.openrouter,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
                "HTTP-Referer": "https://chorus.sh",
                "X-Title": "Chorus",
            },
            dangerouslyAllowBrowser: true,
        });

        let messages: OpenAI.ChatCompletionMessageParam[] =
            await OpenAICompletionsAPIUtils.convertConversation(
                llmConversation,
                {
                    imageSupport: supportsImages,
                    functionSupport: true,
                },
            );

        if (modelConfig.systemPrompt) {
            messages = [
                {
                    role: "system",
                    content: modelConfig.systemPrompt,
                },
                ...messages,
            ];
        }

        const params: OpenAI.ChatCompletionCreateParamsStreaming & {
            include_reasoning: boolean;
        } = {
            model: modelName,
            messages,
            stream: true,
            include_reasoning: true,
        };

        // Add tools definitions
        if (tools && tools.length > 0) {
            params.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            params.tool_choice = "auto";
        }

        const chunks: OpenAI.ChatCompletionChunk[] = [];
        let generationId: string | undefined;

        try {
            const stream = await client.chat.completions.create(params);

            for await (const chunk of stream) {
                chunks.push(chunk);
                // Capture the generation ID from the first chunk
                if (!generationId && chunk.id) {
                    generationId = chunk.id;
                }
                if (chunk.choices[0]?.delta?.content) {
                    onChunk(chunk.choices[0].delta.content);
                }
            }
        } catch (error: unknown) {
            console.error(
                "Raw error from ProviderOpenRouter:",
                error,
                modelName,
                messages,
            );
            console.error(JSON.stringify(error, null, 2));

            if (
                isProviderError(error) &&
                error.message === "Provider returned error"
            ) {
                let errorDetails: ProviderError;
                try {
                    errorDetails = JSON5.parse(
                        error.error?.metadata?.raw ||
                            error.metadata?.raw ||
                            "{}",
                    );
                } catch {
                    errorDetails = {
                        message: "Failed to parse error details",
                        error: { message: "Failed to parse error details" },
                    };
                }
                const errorMessage = `Provider returned error: ${errorDetails.error?.message || error.message}`;
                if (onError) {
                    onError(errorMessage);
                } else {
                    throw new Error(errorMessage);
                }
            } else {
                if (onError) {
                    onError(getErrorMessage(error));
                } else {
                    throw error;
                }
            }
            return undefined;
        }

        // Extract usage data from the last chunk
        const lastChunk = chunks[chunks.length - 1];
        let usageData:
            | {
                  prompt_tokens?: number;
                  completion_tokens?: number;
                  total_tokens?: number;
                  generation_id?: string;
              }
            | undefined;

        if (lastChunk?.usage) {
            usageData = {
                prompt_tokens: lastChunk.usage.prompt_tokens,
                completion_tokens: lastChunk.usage.completion_tokens,
                total_tokens: lastChunk.usage.total_tokens,
                generation_id: generationId,
            };
        } else if (generationId) {
            // Even if no usage data in chunks, pass the generation ID
            usageData = {
                generation_id: generationId,
            };
        }

        const toolCalls = OpenAICompletionsAPIUtils.convertToolCalls(
            chunks,
            tools ?? [],
        );

        await onComplete(
            undefined,
            toolCalls.length > 0 ? toolCalls : undefined,
            usageData,
        );
    }
}

function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        return (error as { message: string }).message;
    } else if (typeof error === "string") {
        return error;
    } else {
        return "Unknown error";
    }
}
