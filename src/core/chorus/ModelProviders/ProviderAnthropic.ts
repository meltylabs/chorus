import Anthropic from "@anthropic-ai/sdk";
import {
    LLMMessage,
    readImageAttachment,
    readPdfAttachment,
    StreamResponseParams,
    readTextAttachment,
    readWebpageAttachment,
} from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import { getUserToolNamespacedName, UserToolCall } from "@core/chorus/Toolsets";

type AcceptedImageType =
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

/**
 * This exists because we need to keep track of which messages have attachments
 * for our prompt caching scheme
 */
type MeltyAnthrMessageParam = {
    content: Array<Anthropic.Messages.ContentBlockParam>;
    role: "user" | "assistant";
    hasAttachments: boolean;
};

type AnthropicModelConfig = {
    inputModelName: string;
    anthropicModelName: string;
    maxTokens: number;
};

const ANTHROPIC_MODELS: AnthropicModelConfig[] = [
    {
        inputModelName: "claude-3-5-sonnet-latest",
        anthropicModelName: "claude-3-5-sonnet-latest",
        maxTokens: 8192,
    },
    {
        inputModelName: "claude-3-7-sonnet-latest",
        anthropicModelName: "claude-3-7-sonnet-latest",
        maxTokens: 20000,
    },
    {
        inputModelName: "claude-3-7-sonnet-latest-thinking",
        anthropicModelName: "claude-3-7-sonnet-latest",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-sonnet-4-latest",
        // https://docs.anthropic.com/en/docs/about-claude/models/overview 0 is the new alias for latest
        anthropicModelName: "claude-sonnet-4-0",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-sonnet-4-5-20250929",
        anthropicModelName: "claude-sonnet-4-5-20250929",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-opus-4-latest",
        anthropicModelName: "claude-opus-4-0",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-opus-4.1-latest",
        anthropicModelName: "claude-opus-4-1-20250805",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-haiku-4-5-20251001",
        anthropicModelName: "claude-haiku-4-5-20251001",
        maxTokens: 20000,
    },
    {
        inputModelName: "claude-opus-4-5-20251101",
        anthropicModelName: "claude-opus-4-5-20251101",
        maxTokens: 20000,
    },
];

function getAnthropicModelName(modelName: string): string | undefined {
    const modelConfig = ANTHROPIC_MODELS.find(
        (m) => m.inputModelName === modelName,
    );
    return modelConfig?.anthropicModelName;
}

export class ProviderAnthropic implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        onError,
        additionalHeaders,
        tools,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelName = modelConfig.modelId.split("::")[1];
        const anthropicModelName = getAnthropicModelName(modelName);
        if (!anthropicModelName) {
            throw new Error(`Unsupported model: ${modelConfig.modelId}`);
        }

        const { canProceed, reason } = canProceedWithProvider(
            "anthropic",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your Anthropic API key in Settings.",
            );
        }

        const messages = await convertConversationToAnthropic(llmConversation);

        const isThinking = modelConfig.budgetTokens !== undefined;

        // Map tools to Claude's tool format
        const anthropicTools: Anthropic.Messages.Tool[] | undefined = tools
            ?.map((tool) => {
                if (tool.inputSchema.type !== "object") {
                    console.warn(
                        `Unsupported input schema type on tool ${JSON.stringify(tool)}`,
                    );
                    return undefined;
                }

                // anthropic doesn't support these fields, so nuke them
                if (
                    tool.inputSchema.oneOf ||
                    tool.inputSchema.anyOf ||
                    tool.inputSchema.allOf
                ) {
                    console.warn(
                        `Unsupported schema field oneOf, anyOf, allOf on tool ${JSON.stringify(tool)}`,
                    );
                    tool.inputSchema.oneOf = undefined;
                }

                return {
                    name: getUserToolNamespacedName(tool),
                    description: tool.description,
                    input_schema: tool.inputSchema as { type: "object" },
                };
            })
            .filter((t) => t !== undefined);

        const createParams: Anthropic.Messages.MessageCreateParamsStreaming = {
            model: anthropicModelName,
            messages,
            system: modelConfig.systemPrompt,
            stream: true,
            max_tokens: getMaxTokens(modelName),
            ...(isThinking && {
                thinking: {
                    type: "enabled",
                    budget_tokens: modelConfig.budgetTokens,
                },
            }),
            ...(tools &&
                tools.length > 0 && {
                    tools: anthropicTools,
                }),
        };

        // Configure headers
        const headers: Record<string, string> = {
            ...(additionalHeaders ?? {}),
        };

        const client = new Anthropic({
            apiKey: apiKeys.anthropic,
            baseURL: customBaseUrl,
            dangerouslyAllowBrowser: true,
            defaultHeaders: headers,
        });

        const stream = client.messages.stream(createParams);

        stream.on("error", (error) => {
            console.error(
                "Error streaming Anthropic response",
                error,
                createParams,
            );
            onError(error.message);
        });

        stream.on("text", (text: string) => {
            onChunk(text);
        });

        // get final message so we can get the tool calls from it
        // (we're building up most of final message ourselves using onChunk, and then
        // at the last moment merging in the tool calls)

        const finalMessage = (await stream.finalMessage()) as Anthropic.Message;

        console.log(
            "Raw tool calls from Anthropic",
            finalMessage.content.filter((item) => item.type === "tool_use"),
        );

        const toolCalls: UserToolCall[] = finalMessage.content
            .filter((item) => item.type === "tool_use")
            .map((tool) => {
                const calledTool = tools?.find(
                    (t) => getUserToolNamespacedName(t) === tool.name,
                );
                return {
                    id: tool.id,
                    namespacedToolName: tool.name,
                    args: tool.input,
                    toolMetadata: {
                        description: calledTool?.description,
                        inputSchema: calledTool?.inputSchema,
                    },
                };
            });

        await onComplete(undefined, toolCalls);
    }
}

async function formatMessageWithAttachments(
    message: LLMMessage,
): Promise<MeltyAnthrMessageParam> {
    if (message.role === "tool_results") {
        // special handling for tool results
        const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] =
            message.toolResults.map((result) => ({
                type: "tool_result" as const,
                tool_use_id: result.id,
                content: result.content,
            }));

        return {
            role: "user",
            content: toolResultBlocks,
            hasAttachments: false,
        };
    }

    const attachmentBlocks: Anthropic.Messages.ContentBlock[] = [];

    const attachments = message.role === "user" ? message.attachments : [];

    for (const attachment of attachments) {
        switch (attachment.type) {
            case "text": {
                attachmentBlocks.push({
                    // @ts-expect-error: Anthropic sdk types are outdated
                    type: "document",
                    source: {
                        type: "text",
                        media_type: "text/plain",
                        data: await readTextAttachment(attachment),
                    },
                    title: attachment.originalName,
                    citations: {
                        enabled: false,
                    },
                });
                break;
            }
            case "webpage": {
                attachmentBlocks.push({
                    // @ts-expect-error: Anthropic sdk types are outdated
                    type: "document",
                    source: {
                        type: "text",
                        media_type: "text/plain",
                        data: await readWebpageAttachment(attachment),
                    },
                    title: attachment.originalName,
                    citations: {
                        enabled: false,
                    },
                });
                break;
            }
            case "image": {
                const fileExtension = attachment.path
                    .split(".")
                    .pop()
                    ?.toLowerCase();

                // Get the image data
                const imageData = await readImageAttachment(attachment);

                // More robust detection of image format from base64 data
                let detectedFormat: AcceptedImageType = "image/jpeg"; // Default assumption

                // Check for image format signatures in base64
                if (imageData.startsWith("/9j/")) {
                    // JPEG signature (FF D8 FF)
                    detectedFormat = "image/jpeg";
                } else if (imageData.startsWith("iVBOR")) {
                    // PNG signature (89 50 4E 47)
                    detectedFormat = "image/png";
                } else if (imageData.startsWith("R0lG")) {
                    // GIF signature (47 49 46 38)
                    detectedFormat = "image/gif";
                } else if (imageData.startsWith("UklGR")) {
                    // WEBP signature (52 49 46 46)
                    detectedFormat = "image/webp";
                }

                // Resized images from Tauri should always be JPEGs
                const isResizedImage =
                    attachment.path.includes("_resized") ||
                    attachment.path.includes("resized.jpg") ||
                    attachment.path.includes("resized2.jpg");

                // Determine final format - trust detection over extension for safety
                const acceptedImageType: AcceptedImageType = isResizedImage
                    ? "image/jpeg"
                    : detectedFormat;

                console.log(
                    `Image ${attachment.path} detected as ${acceptedImageType}, file extension: ${fileExtension}, is resized: ${isResizedImage}`,
                );

                attachmentBlocks.push({
                    // @ts-expect-error: Anthropic sdk types are outdated
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: acceptedImageType,
                        data: imageData,
                    },
                });
                break;
            }
            case "pdf": {
                attachmentBlocks.push({
                    // @ts-expect-error: Anthropic sdk types are outdated
                    type: "document",
                    source: {
                        type: "base64",
                        media_type: "application/pdf",
                        data: await readPdfAttachment(attachment),
                    },
                    title: attachment.originalName,
                    citations: {
                        enabled: false,
                    },
                });
                break;
            }
            default: {
                const exhaustiveCheck: never = attachment.type;
                console.warn(
                    `[ProviderAnthropic] Unhandled attachment type: ${exhaustiveCheck as string}. This case should be handled.`,
                );
            }
        }
    }

    const toolCalls =
        message.role === "assistant" && message.toolCalls
            ? message.toolCalls
            : [];

    const toolCallBlocks: Anthropic.Messages.ToolUseBlockParam[] =
        toolCalls.map((toolCall) => ({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.namespacedToolName,
            input: toolCall.args,
        }));

    const finalText =
        message.role === "user" || message.role === "assistant"
            ? message.content || "..." // ensure there's always some text in the message, so that Anthropic doesn't complain
            : "";

    return {
        role: message.role === "user" ? "user" : "assistant",
        content: [
            ...attachmentBlocks,
            {
                type: "text",
                text: finalText,
            },
            ...toolCallBlocks,
        ],
        hasAttachments: attachmentBlocks.length > 0,
    };
}

const getMaxTokens = (modelId: string) => {
    const modelConfig = ANTHROPIC_MODELS.find(
        (m) => m.inputModelName === modelId,
    );
    if (!modelConfig) {
        throw new Error(`Unsupported model: ${modelId}`);
    }
    return modelConfig.maxTokens;
};

/**
 * Adds cache control block to the last message in `messages`
 * that contains attachments (per the hasAttachments flag).
 * Also removes the hasAttachments flag from all messages.
 *
 * @param messages Array of MeltyAnthrMessageParam messages
 * @returns Array of Anthropic.Messages.MessageParam with added cache control block in the last attachment-containing message.
 */
function addCacheControlToLastAttachment(
    inputMessages: MeltyAnthrMessageParam[],
): Anthropic.Messages.MessageParam[] {
    // find last attachment-containing message
    let lastIndex = -1;
    for (let i = inputMessages.length - 1; i >= 0; i--) {
        if (inputMessages[i].hasAttachments) {
            lastIndex = i;
            break;
        }
    }

    // do copy
    const outputMessages: Anthropic.Messages.MessageParam[] = [];
    for (let i = 0; i < inputMessages.length; i++) {
        // remove hasAttachments flag
        const { hasAttachments, ...outputMessage } = inputMessages[i];

        if (i === lastIndex) {
            // add cache control block to the last attachment-containing message
            const blocks = outputMessage.content;

            blocks[blocks.length - 1]["cache_control"] = {
                type: "ephemeral",
            };

            outputMessages.push({
                ...outputMessage,
                content: blocks,
            });
        } else {
            outputMessages.push(outputMessage);
        }
    }

    return outputMessages;
}

export async function convertConversationToAnthropic(
    messages: LLMMessage[],
): Promise<Anthropic.Messages.MessageParam[]> {
    return addCacheControlToLastAttachment(
        await Promise.all(messages.map(formatMessageWithAttachments)),
    );
}
