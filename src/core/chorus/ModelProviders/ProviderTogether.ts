import Together from "together-ai";
import type {
    CompletionCreateParamsStreaming,
} from "together-ai/resources/chat/completions";
import {
    StreamResponseParams,
    LLMMessage,
    encodeTextAttachment,
    attachmentMissingFlag,
    encodeWebpageAttachment,
} from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import { UserToolCall, getUserToolNamespacedName } from "@core/chorus/Toolsets";
import { parseToolCallArguments } from "@core/chorus/ToolCallArgs";

export class ProviderTogether implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        tools,
    }: StreamResponseParams) {
        const modelId = modelConfig.modelId.split("::")[1];

        const { canProceed, reason } = canProceedWithProvider(
            "together",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Together.ai API key in Settings.",
            );
        }

        // Convert conversation to Together.ai format
        const messages = await convertConversationToTogether(llmConversation);

        // Add system prompt if provided
        if (modelConfig.systemPrompt) {
            messages.unshift({
                role: "system",
                content: modelConfig.systemPrompt,
            });
        }

        const client = new Together({
            apiKey: apiKeys.together,
        });

        // Build Together.ai chat completion parameters
        const createParams: CompletionCreateParamsStreaming = {
            model: modelId,
            messages,
            stream: true,
            ...(tools && tools.length > 0
                ? {
                      tools: tools.map((tool) => ({
                          type: "function" as const,
                          function: {
                              name: getUserToolNamespacedName(tool),
                              description: tool.description,
                              parameters: tool.inputSchema,
                          },
                      })),
                      tool_choice: "auto",
                  }
                : {}),
        };

        const stream = await client.chat.completions.create(createParams);

        let fullContent = "";
        const toolCalls: UserToolCall[] = [];
        const accumulatedToolCalls: Record<
            string,
            {
                id: string;
                name: string;
                arguments: string;
            }
        > = {};

        try {
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;

                if (!delta) continue;

                // Handle text content
                if (delta.content) {
                    fullContent += delta.content;
                    onChunk(delta.content);
                }

                // Handle tool calls
                if (delta.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                        // Use tool call ID as key to handle multiple concurrent tool calls
                        const toolId = toolCall.id || "";
                        if (!toolId) continue;

                        // Initialize tool call if new
                        if (!accumulatedToolCalls[toolId]) {
                            accumulatedToolCalls[toolId] = {
                                id: toolId,
                                name: toolCall.function?.name || "",
                                arguments: "",
                            };
                        }

                        // Accumulate function arguments
                        if (toolCall.function?.arguments) {
                            accumulatedToolCalls[toolId].arguments +=
                                toolCall.function.arguments;
                        }
                    }
                }
            }

            // Process completed tool calls
            for (const accumulated of Object.values(accumulatedToolCalls)) {
                const calledTool = tools?.find(
                    (t) => getUserToolNamespacedName(t) === accumulated.name,
                );
                const { args, parseError } = parseToolCallArguments(
                    accumulated.arguments,
                );

                toolCalls.push({
                    id: accumulated.id,
                    namespacedToolName: accumulated.name,
                    args,
                    toolMetadata: {
                        description: calledTool?.description,
                        inputSchema: calledTool?.inputSchema,
                        ...(parseError ? { parseError } : {}),
                    },
                });
            }

            await onComplete(
                fullContent || undefined,
                toolCalls.length > 0 ? toolCalls : undefined,
            );
        } catch (error) {
            console.error("Together.ai streaming error:", error);
            throw error;
        }
    }
}

/**
 * Converts LLM conversation format to Together.ai's chat completion format
 */
async function convertConversationToTogether(
    messages: LLMMessage[],
): Promise<CompletionCreateParamsStreaming["messages"]> {
    const togetherMessages: CompletionCreateParamsStreaming["messages"] = [];

    for (const message of messages) {
        if (message.role === "user") {
            // Build text content from attachments
            let textContent = "";
            for (const attachment of message.attachments) {
                if (attachment.type === "text") {
                    textContent += await encodeTextAttachment(attachment);
                } else if (attachment.type === "webpage") {
                    textContent += await encodeWebpageAttachment(attachment);
                } else if (attachment.type === "image") {
                    // Together AI doesn't support image URLs in the same way as OpenAI
                    // We'll encode as a note for now
                    textContent += attachmentMissingFlag(attachment);
                } else if (attachment.type === "pdf") {
                    textContent += attachmentMissingFlag(attachment);
                }
            }

            togetherMessages.push({
                role: "user",
                content: textContent + message.content,
            });
        } else if (message.role === "assistant") {
            // For now, Together AI doesn't support tool calls in the same format
            // Just send the content
            togetherMessages.push({
                role: "assistant",
                content: message.content || "",
            });
        } else if (message.role === "tool_results") {
            // Add tool results as tool messages
            for (const result of message.toolResults) {
                togetherMessages.push({
                    role: "tool",
                    content: result.content || "",
                    tool_call_id: result.id,
                });
            }
        }
    }

    return togetherMessages;
}
