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

        const params: OpenAI.ChatCompletionCreateParamsStreaming & {
            reasoning_effort?: string;
        } = {
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

        const normalizedEffort = (
            effort: "low" | "medium" | "high" | "xhigh" | null | undefined,
        ): "low" | "medium" | "high" => {
            if (effort === "low" || effort === "medium" || effort === "high") {
                return effort;
            }
            if (effort === "xhigh") {
                return "high";
            }
            return "medium";
        };

        const lowerModelName = modelName.toLowerCase();
        const canDisableReasoning =
            !lowerModelName.includes("gpt-oss") &&
            !lowerModelName.includes("minimax") &&
            !lowerModelName.includes("m2");

        if (modelConfig.showThoughts) {
            // Fireworks streams reasoning in `reasoning_content` when enabled.
            // Default to medium when user hasn't set anything.
            params.reasoning_effort = normalizedEffort(
                modelConfig.reasoningEffort,
            );
        } else if (canDisableReasoning) {
            // Best-effort: disable reasoning so we don't pay tokens for it.
            params.reasoning_effort = "none";
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
            // Some Fireworks models reject reasoning_effort="none".
            // If disabling reasoning fails, retry once without the param.
            if (
                !modelConfig.showThoughts &&
                params.reasoning_effort === "none"
            ) {
                delete params.reasoning_effort;
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
