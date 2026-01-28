import OpenAI from "openai";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { StreamResponseParams } from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";
import * as Prompts from "@core/chorus/prompts/prompts";

export class ProviderCerebras implements IProvider {
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
            "cerebras",
            apiKeys,
        );
        if (!canProceed) {
            throw new Error(
                reason || "Please add your Cerebras API key in Settings.",
            );
        }

        const client = new OpenAI({
            baseURL: customBaseUrl || "https://api.cerebras.ai/v1",
            apiKey: apiKeys.cerebras,
            fetch: tauriFetch,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
            },
            dangerouslyAllowBrowser: true,
        });

        const functionSupport = (tools?.length ?? 0) > 0;
        const messages = await OpenAICompletionsAPIUtils.convertConversation(
            llmConversation,
            {
                imageSupport: false,
                functionSupport,
            },
        );

        const lowerModelName = modelName.toLowerCase();
        const isZaiGlm = lowerModelName.includes("glm");
        const canSafelyEnableNativeReasoning = isZaiGlm && !functionSupport; // Cerebras docs: tool calling + reasoning streaming may be unsupported.

        const systemPrompt = [
            modelConfig.showThoughts && !canSafelyEnableNativeReasoning
                ? Prompts.THOUGHTS_SYSTEM_PROMPT
                : undefined,
            modelConfig.systemPrompt,
        ]
            .filter(Boolean)
            .join("\n\n");

        const params: OpenAI.ChatCompletionCreateParamsStreaming & {
            disable_reasoning?: boolean;
            clear_thinking?: boolean;
        } = {
            model: modelName,
            messages: [
                ...(systemPrompt
                    ? [
                          {
                              role: "system" as const,
                              content: systemPrompt,
                          },
                      ]
                    : []),
                ...messages,
            ],
            stream: true,
        };

        if (isZaiGlm) {
            // Cerebras GLM supports non-standard flags (OpenAI-compatible endpoints differ here).
            // When showThoughts is off, disable reasoning to avoid token spend.
            // When showThoughts is on, explicitly enable reasoning (when safe).
            if (!modelConfig.showThoughts || canSafelyEnableNativeReasoning) {
                params.disable_reasoning = !modelConfig.showThoughts;
                params.clear_thinking = !modelConfig.showThoughts;
            }
        }

        if (tools && tools.length > 0) {
            params.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            params.tool_choice = "auto";
        }

        const chunks: OpenAI.ChatCompletionChunk[] = [];
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
        let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
        try {
            stream = await client.chat.completions.create(params);
        } catch (error) {
            // Some OpenAI-compatible endpoints reject non-standard flags.
            // If that happens, retry once without them.
            if (
                isZaiGlm &&
                (params.disable_reasoning !== undefined ||
                    params.clear_thinking !== undefined)
            ) {
                delete params.disable_reasoning;
                delete params.clear_thinking;
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
                if (!inReasoning) {
                    inReasoning = true;
                    reasoningStartedAtMs = Date.now();
                    onChunk("<think>");
                }
                onChunk(reasoningDelta);
            }

            if (typeof delta?.content === "string" && delta.content) {
                closeReasoning();
                onChunk(delta.content);
            }
        }

        closeReasoning();

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
