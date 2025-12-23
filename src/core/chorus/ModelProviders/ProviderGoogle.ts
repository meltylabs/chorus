import OpenAI from "openai";
import _ from "lodash";
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

function getGoogleModelName(modelName: string): string | undefined {
    if (
        [
            "gemini-2.0-flash-exp",
            "gemini-2.0-flash-thinking-exp",
            "gemini-2.0-flash-lite-preview-02-05",
            "gemini-2.0-pro-exp-02-05",
            "gemini-2.5-pro-exp-03-25",
            "gemini-2.0-flash",
            "gemini-2.5-pro-preview-03-25",
            "gemini-2.5-flash",
            "gemini-3-flash-preview",
            "gemini-3-pro-preview",
        ].includes(modelName)
    ) {
        // allowed model names
        return modelName;
    } else if (modelName === "gemini-2.5-pro-latest") {
        // special case: this is not a real google model name, we just map it to latest thing google has available
        return "gemini-2.5-pro-preview-06-05";
    } else if (modelName === "gemini-2.5-flash-preview-04-17") {
        // alias deprecated preview model to stable version
        return "gemini-2.5-flash";
    }
    return undefined;
}

// uses OpenAI provider to format the messages
export class ProviderGoogle implements IProvider {
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
        const googleModelName = getGoogleModelName(modelName);
        if (!googleModelName) {
            throw new Error(`Unsupported model: ${modelName}`);
        }

        const { canProceed, reason } = canProceedWithProvider(
            "google",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Google AI API key in Settings.",
            );
        }

        // Google AI uses the generativelanguage.googleapis.com endpoint with OpenAI compatibility
        const baseURL =
            customBaseUrl ||
            "https://generativelanguage.googleapis.com/v1beta/openai";

        // unset headers that are not supported by the Google API
        // https://discuss.ai.google.dev/t/gemini-api-cors-error-with-openai-compatability/58619/16
        const headers = {
            ...(additionalHeaders ?? {}),
            "x-stainless-arch": null,
            "x-stainless-lang": null,
            "x-stainless-os": null,
            "x-stainless-package-version": null,
            "x-stainless-retry-count": null,
            "x-stainless-runtime": null,
            "x-stainless-runtime-version": null,
            "x-stainless-timeout": null,
        };
        const client = new OpenAI({
            baseURL,
            apiKey: apiKeys.google,
            defaultHeaders: headers,
            dangerouslyAllowBrowser: true,
        });

        let messages: OpenAI.ChatCompletionMessageParam[] =
            await OpenAICompletionsAPIUtils.convertConversation(
                llmConversation,
                {
                    imageSupport: true,
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

        const streamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: googleModelName,
            messages: messages,
            stream: true,
        };

        // Add tools definitions
        if (tools && tools.length > 0) {
            streamParams.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            streamParams.tool_choice = "auto";
        }

        const chunks = [];

        try {
            const stream = await client.chat.completions.create(streamParams);

            for await (const chunk of stream) {
                chunks.push(chunk);
                if (chunk.choices[0]?.delta?.content) {
                    onChunk(chunk.choices[0].delta.content);
                }
            }
        } catch (error: unknown) {
            console.error(
                "Raw error from ProviderGoogle:",
                error,
                modelName,
                messages,
            );
            console.error(JSON.stringify(error, null, 2));

            if (
                isProviderError(error) &&
                error.message === "Provider returned error"
            ) {
                const errorDetails: ProviderError = JSON5.parse(
                    error.error?.metadata?.raw || error.metadata?.raw || "{}",
                );
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

function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        return (error as { message: string }).message;
    } else if (typeof error === "string") {
        return error;
    } else {
        return "Unknown error";
    }
}
