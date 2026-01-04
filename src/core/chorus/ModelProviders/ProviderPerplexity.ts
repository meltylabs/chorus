import OpenAI from "openai";
import { StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import _ from "lodash";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";

export class ProviderPerplexity implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        additionalHeaders,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelId = modelConfig.modelId.split("::")[1];

        if (
            modelId !== "llama-3.1-sonar-huge-128k-online" &&
            modelId !== "sonar-pro" &&
            modelId !== "sonar" &&
            modelId !== "r1-1776" &&
            modelId !== "sonar-deep-research" &&
            modelId !== "sonar-reasoning-pro"
        ) {
            throw new Error(`Unsupported model: ${modelId}`);
        }

        const { canProceed, reason } = canProceedWithProvider(
            "perplexity",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Perplexity API key in Settings.",
            );
        }

        // Note: we may need to combine adjacent messages with the same role first. There's a function
        // for this in utilities.ts but it hasn't been updated to work with tool results.

        const messages = await OpenAICompletionsAPIUtils.convertConversation(
            llmConversation,
            {
                imageSupport: false,
                functionSupport: false,
            },
        );

        const baseURL = customBaseUrl || "https://api.perplexity.ai";

        // unset headers that are not supported by the Perplexity API
        // Perplexity's API does not allow x-stainless-* headers added by the OpenAI JS SDK
        const headers = {
            ...(additionalHeaders ?? {}),
            "Content-Type": "application/json",
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
            apiKey: apiKeys.perplexity,
            defaultHeaders: headers,
            dangerouslyAllowBrowser: true,
        });

        const stream = await client.chat.completions.create({
            model: modelId,
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
        });

        let citations: string[] = [];

        for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
                onChunk(chunk.choices[0].delta.content);
            }
            // Store citations if present in the response metadata
            // Extract citations if they exist and are an array
            if (chunk && typeof chunk === "object") {
                const typedChunk = chunk as {
                    citations?: string[];
                };
                if (Array.isArray(typedChunk.citations)) {
                    citations = typedChunk.citations;
                }
            }
        }

        // When the stream ends, if citations exist, append them
        if (citations.length) {
            const sources = citations
                .map((url, i) => `${i + 1}. [${url}](${url})`)
                .join("\n");
            onChunk("\n\nSources:\n" + sources);
        }

        await onComplete();
    }
}
