import OpenAI from "openai";
import { StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";
import JSON5 from "json5";
import _ from "lodash";

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

        if (modelConfig.systemPrompt) {
            messages = [
                {
                    role: "system",
                    content: modelConfig.systemPrompt,
                },
                ...messages,
            ];
        }

        const streamParams: OpenAI.ChatCompletionCreateParamsStreaming & {
            include_reasoning: boolean;
            reasoning_effort?: string;
        } = {
            model: modelName,
            messages,
            stream: true,
            include_reasoning: true,
        };

        // Add reasoning_effort for Grok 3 Mini models
        const isGrok3Mini = modelName.includes("grok-3-mini");
        if (isGrok3Mini && modelConfig.reasoningEffort) {
            streamParams.reasoning_effort = modelConfig.reasoningEffort;
        }

        // Debug: Log reasoning parameters
        console.log(`[ProviderGrok] Model: ${modelName}`);
        console.log(`[ProviderGrok] isGrok3Mini: ${isGrok3Mini}`);
        console.log(`[ProviderGrok] modelConfig.reasoningEffort: ${modelConfig.reasoningEffort}`);
        console.log(`[ProviderGrok] streamParams.reasoning_effort:`, streamParams.reasoning_effort);

        try {
            const stream = await client.chat.completions.create(streamParams);

            for await (const chunk of stream) {
                if (chunk.choices[0]?.delta?.content) {
                    onChunk(chunk.choices[0].delta.content);
                }
            }

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
