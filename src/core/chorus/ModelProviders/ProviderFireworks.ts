import OpenAI from "openai";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";

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
        const messages = await OpenAICompletionsAPIUtils.convertConversation(
            llmConversation,
            { imageSupport: true, functionSupport },
        );

        const params: OpenAI.ChatCompletionCreateParamsStreaming = {
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

        if (tools && tools.length > 0) {
            params.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            params.tool_choice = "auto";
        }

        const chunks: OpenAI.ChatCompletionChunk[] = [];
        const stream = await client.chat.completions.create(params);

        for await (const chunk of stream) {
            chunks.push(chunk);
            if (chunk.choices[0]?.delta?.content) {
                onChunk(chunk.choices[0].delta.content);
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
