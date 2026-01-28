import OpenAI from "openai";
import {
    LLMMessage,
    readImageAttachment,
    encodeTextAttachment,
    attachmentMissingFlag,
    encodeWebpageAttachment,
} from "@core/chorus/Models";
import {
    getUserToolNamespacedName,
    UserTool,
    UserToolCall,
} from "@core/chorus/Toolsets";
import { parseToolCallArguments } from "@core/chorus/ToolCallArgs";
import _ from "lodash";
import { convertPdfToPng } from "@core/chorus/AttachmentsHelpers";
import { v4 as uuidv4 } from "uuid";

function convertToolDefinitions(
    tools: UserTool[],
): OpenAI.ChatCompletionTool[] {
    return (
        tools?.map((tool) => ({
            type: "function" as const,
            function: {
                name: getUserToolNamespacedName(tool),
                description: tool.description,
                parameters: tool.inputSchema,
            },
        })) ?? []
    );
}

function ensureNonEmptyTextParameter(text: string): string {
    return text.trim() === "" ? "..." : text;
}

async function convertMessage(
    message: LLMMessage,
    options?: {
        imageSupport?: boolean;
        functionSupport?: boolean;
    },
): Promise<OpenAI.ChatCompletionMessageParam[]> {
    const { imageSupport = true, functionSupport = true } = options ?? {};
    if (message.role === "tool_results") {
        if (!functionSupport) {
            return [
                {
                    role: "user",
                    content: message.toolResults
                        .map(
                            (result) =>
                                `<tool_result>\n${result.content}\n</tool_result>`,
                        )
                        .join("\n"),
                },
            ];
        }
        return message.toolResults.map((result) => ({
            role: "tool",
            tool_call_id: result.id,
            content: ensureNonEmptyTextParameter(result.content),
        }));
    } else if (message.role === "assistant") {
        const toolCalls =
            functionSupport && message.toolCalls.length > 0
                ? message.toolCalls.map((toolCall) => ({
                      type: "function" as const,
                      function: {
                          name: toolCall.namespacedToolName,
                          arguments: JSON.stringify(toolCall.args),
                      },
                      id: toolCall.id,
                  }))
                : undefined;
        return [
            {
                role: "assistant",
                content: ensureNonEmptyTextParameter(message.content),
                ...(toolCalls && { tool_calls: toolCalls }),
            },
        ];
    } else {
        let attachmentTexts = "";
        const imageContents: OpenAI.ChatCompletionContentPart[] = [];

        for (const attachment of message.attachments) {
            switch (attachment.type) {
                case "text": {
                    attachmentTexts += await encodeTextAttachment(attachment);
                    break;
                }
                case "webpage": {
                    attachmentTexts +=
                        await encodeWebpageAttachment(attachment);
                    break;
                }
                case "image": {
                    if (!imageSupport) {
                        attachmentTexts += attachmentMissingFlag(attachment);
                    } else {
                        const fileExt =
                            attachment.path.split(".").pop()?.toLowerCase() ||
                            "";
                        const mimeType = fileExt === "jpg" ? "jpeg" : fileExt;
                        imageContents.push({
                            type: "image_url",
                            image_url: {
                                url: `data:image/${mimeType};base64,${await readImageAttachment(attachment)}`,
                            },
                        });
                    }
                    break;
                }
                case "pdf": {
                    try {
                        console.log("Converting PDF to PNG:", attachment.path);
                        const pngUrls = await convertPdfToPng(attachment.path);
                        console.log("Conversion successful, got URLs");

                        // Add each PNG as a separate image
                        for (const pngUrl of pngUrls) {
                            imageContents.push({
                                type: "image_url",
                                image_url: {
                                    url: pngUrl,
                                },
                            });
                            console.log("Added image to contents");
                        }
                    } catch (error) {
                        console.error("Failed to convert PDF to PNG:", error);
                        console.error("PDF path was:", attachment.path);
                    }
                    break;
                }
                default: {
                    const exhaustiveCheck: never = attachment.type;
                    console.warn(
                        `[ProviderOpenAI] Unhandled attachment type: ${exhaustiveCheck as string}. This case should be handled.`,
                    );
                }
            }
        }

        if (imageContents.length > 0) {
            // Text content is placed before images to comply with OpenRouter's documentation:
            // "Due to how the content is parsed, we recommend sending the text prompt first, then the images."
            // See: https://openrouter.ai/docs/guides/overview/multimodal/images
            return [
                {
                    role: message.role,
                    content: [
                        {
                            type: "text",
                            text: ensureNonEmptyTextParameter(
                                attachmentTexts + message.content,
                            ),
                        },
                        ...imageContents,
                    ],
                },
            ];
        } else {
            return [
                {
                    role: message.role,
                    content: ensureNonEmptyTextParameter(
                        attachmentTexts + message.content,
                    ),
                },
            ];
        }
    }
}

async function convertConversation(
    messages: LLMMessage[],
    options?: {
        imageSupport?: boolean;
        functionSupport?: boolean;
    },
): Promise<OpenAI.ChatCompletionMessageParam[]> {
    return _.flatten(
        await Promise.all(messages.map((msg) => convertMessage(msg, options))),
    );
}

function convertToolCalls(
    chunks: OpenAI.ChatCompletionChunk[],
    toolDefinitions: UserTool[], // needed to enrich the tool calls with metadata
): UserToolCall[] {
    // Track tool calls in the streamed response
    const oaiToolCalls: Record<
        number,
        OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall
    > = {};

    // adapted from a snippet on https://platform.openai.com/docs/guides/function-calling?api-mode=chat&lang=javascript
    // which appears to be severely buggy (lol)
    for (const chunk of chunks) {
        const toolCallDeltas = chunk.choices[0].delta.tool_calls || [];
        for (const toolCallDelta of toolCallDeltas) {
            const index = toolCallDelta.index ?? 0;

            if (!oaiToolCalls[index]) {
                oaiToolCalls[index] = toolCallDelta;
            } else {
                if (!toolCallDelta.function) {
                    console.warn(
                        "Unexpected: tool call delta has no function",
                        toolCallDelta,
                    );
                    continue;
                }
                if (!oaiToolCalls[index].function) {
                    console.warn(
                        "Unexpected: tool call delta has function but no function arguments",
                        toolCallDelta,
                    );
                    continue;
                }
                oaiToolCalls[index].function.arguments +=
                    toolCallDelta.function.arguments ?? "";
            }
        }
    }

    return Object.values(oaiToolCalls)
        .map((toolCall) => {
            if (!toolCall.function?.name) {
                console.warn(
                    "Unexpected: tool call has no function name",
                    toolCall,
                );
                return undefined;
            }
            const { args, parseError } = parseToolCallArguments(
                toolCall.function?.arguments,
            );
            if (parseError) {
                console.warn(
                    "Failed to parse tool call arguments",
                    parseError,
                    toolCall.function?.name,
                );
            }

            const toolDefinition = toolDefinitions.find(
                (toolDef) =>
                    getUserToolNamespacedName(toolDef) ===
                    toolCall.function?.name,
            );

            return {
                // sometimes Gemini provides empty id (""). if there's no id, we make one up
                id: toolCall.id || uuidv4().slice(0, 8),
                namespacedToolName: toolCall.function?.name,
                args,
                toolMetadata: {
                    description: toolDefinition?.description,
                    inputSchema: toolDefinition?.inputSchema,
                    ...(parseError ? { parseError } : {}),
                },
            };
        })
        .filter((toolCall) => toolCall !== undefined);
}

export default {
    convertToolDefinitions,
    convertConversation,
    convertToolCalls,
};
