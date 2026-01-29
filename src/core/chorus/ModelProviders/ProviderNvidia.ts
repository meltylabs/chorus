import OpenAI from "openai";
import {
    StreamResponseParams,
    LLMMessage,
    readImageAttachment,
    encodeTextAttachment,
    attachmentMissingFlag,
    encodeWebpageAttachment,
} from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import { UserToolCall, getUserToolNamespacedName } from "@core/chorus/Toolsets";
import { parseToolCallArguments } from "@core/chorus/ToolCallArgs";

export class ProviderNvidia implements IProvider {
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
            "nvidia",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Nvidia API key in Settings.",
            );
        }

        // Convert conversation to OpenAI-compatible format
        const messages = await convertConversationToNvidia(llmConversation);

        // Add system prompt if provided
        if (modelConfig.systemPrompt) {
            messages.unshift({
                role: "system",
                content: modelConfig.systemPrompt,
            });
        }

        // Create OpenAI client with Nvidia base URL
        const client = new OpenAI({
            apiKey: apiKeys.nvidia,
            baseURL: "https://integrate.api.nvidia.com/v1",
            dangerouslyAllowBrowser: true,
        });

        // Build chat completion parameters
        const createParams: OpenAI.Chat.ChatCompletionCreateParams = {
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
                      tool_choice: "auto" as const,
                  }
                : {}),
        };

        const stream = await client.chat.completions.create(createParams);

        let fullContent = "";
        const toolCalls: UserToolCall[] = [];
        const accumulatedToolCalls: Record<
            number,
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
                        const index = toolCall.index;

                        // Initialize tool call if new
                        if (!accumulatedToolCalls[index]) {
                            accumulatedToolCalls[index] = {
                                id: toolCall.id || "",
                                name: toolCall.function?.name || "",
                                arguments: "",
                            };
                        }

                        // Accumulate function arguments
                        if (toolCall.function?.arguments) {
                            accumulatedToolCalls[index].arguments +=
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
            console.error("Nvidia streaming error:", error);
            throw error;
        }
    }
}

/**
 * Converts LLM conversation format to OpenAI-compatible format for Nvidia NIM
 */
async function convertConversationToNvidia(
    messages: LLMMessage[],
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    const nvidiaMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
        if (message.role === "user") {
            const content: Array<
                | OpenAI.Chat.ChatCompletionContentPartText
                | OpenAI.Chat.ChatCompletionContentPartImage
            > = [];

            // Add text and webpage attachments as text content
            let textContent = "";
            for (const attachment of message.attachments) {
                if (attachment.type === "text") {
                    textContent += await encodeTextAttachment(attachment);
                } else if (attachment.type === "webpage") {
                    textContent += await encodeWebpageAttachment(attachment);
                } else if (attachment.type === "image") {
                    // Add image as separate content part
                    const fileExt =
                        attachment.path.split(".").pop()?.toLowerCase() || "";
                    const mimeType = fileExt === "jpg" ? "jpeg" : fileExt;
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: `data:image/${mimeType};base64,${await readImageAttachment(attachment)}`,
                        },
                    });
                } else if (attachment.type === "pdf") {
                    // PDFs not natively supported, add as missing flag
                    textContent += attachmentMissingFlag(attachment);
                }
            }

            // Add text content
            if (textContent || message.content) {
                content.push({
                    type: "text",
                    text: textContent + message.content,
                });
            }

            nvidiaMessages.push({
                role: "user",
                content:
                    content.length === 1 && content[0].type === "text"
                        ? content[0].text
                        : content,
            });
        } else if (message.role === "assistant") {
            const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam =
                {
                    role: "assistant",
                    content: message.content || null,
                };

            // Add tool calls if present
            if (message.toolCalls && message.toolCalls.length > 0) {
                assistantMessage.tool_calls = message.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function" as const,
                    function: {
                        name: tc.namespacedToolName,
                        arguments: JSON.stringify(tc.args),
                    },
                }));
            }

            nvidiaMessages.push(assistantMessage);
        } else if (message.role === "tool_results") {
            // Add tool results
            for (const result of message.toolResults) {
                nvidiaMessages.push({
                    role: "tool",
                    tool_call_id: result.id,
                    content: result.content,
                });
            }
        }
    }

    return nvidiaMessages;
}
