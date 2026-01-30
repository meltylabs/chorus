import Anthropic from "@anthropic-ai/sdk";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
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
import * as Prompts from "@core/chorus/prompts/prompts";
import {
    clampAnthropicThinkingBudgetTokens,
    getAnthropicMaxTokens,
    getAnthropicModelName,
} from "./anthropicModels";

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
        enabledToolsets,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelName = modelConfig.modelId.split("::")[1];
        const anthropicModelName = getAnthropicModelName(modelName);

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

        const systemPrompt = [
            modelConfig.showThoughts
                ? Prompts.THOUGHTS_SYSTEM_PROMPT
                : undefined,
            modelConfig.systemPrompt,
        ]
            .filter(Boolean)
            .join("\n\n");

        const maxTokens = getAnthropicMaxTokens(modelName);
        const thinkingBudgetTokens =
            modelConfig.budgetTokens !== undefined
                ? clampAnthropicThinkingBudgetTokens({
                      budgetTokens: modelConfig.budgetTokens,
                      maxTokens,
                  })
                : undefined;

        const isThinking = thinkingBudgetTokens !== undefined;
        const nativeWebSearchEnabled =
            enabledToolsets?.includes("web") ?? false;
        const shouldUseNativeWebSearch = nativeWebSearchEnabled;

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
            system: systemPrompt,
            stream: true,
            max_tokens: maxTokens,
            ...(thinkingBudgetTokens !== undefined && {
                thinking: {
                    type: "enabled",
                    budget_tokens: thinkingBudgetTokens,
                },
            }),
        };

        const requestTools: Anthropic.Messages.Tool[] = [];
        if (shouldUseNativeWebSearch) {
            requestTools.push({
                type: "web_search_20250305",
                name: "web_search",
            } as unknown as Anthropic.Messages.Tool);
        }
        if (anthropicTools && anthropicTools.length > 0) {
            requestTools.push(...anthropicTools);
        }
        if (requestTools.length > 0) {
            createParams.tools = requestTools;
        }

        // Debug: Log thinking parameters
        console.log(`[ProviderAnthropic] Model: ${anthropicModelName}`);
        console.log(`[ProviderAnthropic] isThinking: ${isThinking}`);
        console.log(
            `[ProviderAnthropic] modelConfig.budgetTokens: ${modelConfig.budgetTokens}`,
        );
        if (
            modelConfig.budgetTokens !== undefined &&
            thinkingBudgetTokens !== undefined &&
            modelConfig.budgetTokens !== thinkingBudgetTokens
        ) {
            console.warn(
                `[ProviderAnthropic] Clamped thinking budget_tokens from ${modelConfig.budgetTokens} to ${thinkingBudgetTokens} (max_tokens=${maxTokens}).`,
            );
        }
        console.log(
            `[ProviderAnthropic] createParams.thinking:`,
            (createParams as unknown as Record<string, unknown>).thinking,
        );

        // Configure headers
        const headers: Record<string, string> = {
            ...(additionalHeaders ?? {}),
        };

        // Anthropic blocks browser-originated requests unless this header is set.
        // Our app runs in a WebView, so always include it for compatibility.
        headers["anthropic-dangerous-direct-browser-access"] = "true";

        const anthropicBetaHeaderValue = shouldUseNativeWebSearch
            ? mergeAnthropicBetaHeader(
                  headers["anthropic-beta"],
                  "web-search-2025-03-05",
              )
            : undefined;

        const client = new Anthropic({
            apiKey: apiKeys.anthropic,
            baseURL: customBaseUrl,
            fetch: tauriFetch,
            dangerouslyAllowBrowser: true,
            defaultHeaders: headers,
        });

        const stream = client.messages.stream(
            createParams,
            anthropicBetaHeaderValue
                ? {
                      headers: {
                          "anthropic-beta": anthropicBetaHeaderValue,
                      },
                  }
                : undefined,
        );

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

        // Extended thinking support:
        // Some Claude models stream reasoning as separate content blocks (e.g. type: "thinking").
        // When we detect these blocks, we wrap them in <think>...</think> so the UI can render
        // them as a collapsible ThinkBlock.
        const contentBlockTypesByIndex = new Map<number, string>();
        let inThinkingBlock = false;
        let sawThinkingContent = false;
        let wroteRedactedPlaceholder = false;
        let thinkingStartedAtMs: number | undefined;

        const closeThinkingBlock = () => {
            if (!inThinkingBlock) return;
            inThinkingBlock = false;
            onChunk("</think>");
            if (thinkingStartedAtMs !== undefined) {
                const seconds = Math.max(
                    1,
                    Math.round((Date.now() - thinkingStartedAtMs) / 1000),
                );
                onChunk(`<thinkmeta seconds="${seconds}"/>`);
            }
            thinkingStartedAtMs = undefined;
            wroteRedactedPlaceholder = false;
        };

        stream.on("streamEvent", (event: unknown, messageSnapshot: unknown) => {
            const ev = event as {
                type?: string;
                index?: number;
                content_block?: { type?: string };
                delta?: { type?: string; text?: string };
            };

            if (ev.type === "content_block_start") {
                const idx = typeof ev.index === "number" ? ev.index : null;
                const blockType = ev.content_block?.type;
                if (idx !== null && typeof blockType === "string") {
                    contentBlockTypesByIndex.set(idx, blockType);
                }
            }

            if (ev.type === "content_block_delta") {
                const idx = typeof ev.index === "number" ? ev.index : null;
                if (idx === null) return;

                const snapshot = messageSnapshot as {
                    content?: Array<{ type?: string }>;
                };
                const snapshotBlockType =
                    snapshot?.content?.[idx]?.type ?? undefined;
                const blockType =
                    snapshotBlockType ?? contentBlockTypesByIndex.get(idx);

                if (
                    blockType === "thinking" ||
                    blockType === "redacted_thinking"
                ) {
                    const deltaText =
                        typeof ev.delta?.text === "string" ? ev.delta.text : "";

                    if (!inThinkingBlock) {
                        inThinkingBlock = true;
                        sawThinkingContent = true;
                        thinkingStartedAtMs = Date.now();
                        wroteRedactedPlaceholder = false;
                        onChunk("<think>");
                    }

                    // redacted_thinking is not human-readable; skip content.
                    if (blockType === "thinking") {
                        onChunk(deltaText);
                    } else if (!wroteRedactedPlaceholder) {
                        wroteRedactedPlaceholder = true;
                        onChunk("[redacted]");
                    }
                }
            }

            if (ev.type === "content_block_stop") {
                closeThinkingBlock();
            }
        });

        // get final message so we can get the tool calls from it
        // (we're building up most of final message ourselves using onChunk, and then
        // at the last moment merging in the tool calls)

        const finalMessage = (await stream.finalMessage()) as Anthropic.Message;

        if (inThinkingBlock) {
            closeThinkingBlock();
        } else if (sawThinkingContent) {
            // If we saw thinking blocks, ensure a trailing newline so markdown layout is clean.
            onChunk("\n\n");
        }

        console.log(
            "Raw tool calls from Anthropic",
            finalMessage.content.filter((item) => item.type === "tool_use"),
        );

        // Only surface tool calls that correspond to user-configured tools.
        // This prevents server-side tools (e.g., Anthropic web search) from being routed
        // through our MCP/custom tool execution loop.
        const allowedToolNames = new Set(
            (tools ?? []).map((t) => getUserToolNamespacedName(t)),
        );

        const toolCalls: UserToolCall[] = finalMessage.content
            .filter((item) => item.type === "tool_use")
            .filter((tool) => allowedToolNames.has(tool.name))
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

function mergeAnthropicBetaHeader(
    existingValue: string | undefined,
    betaToAdd: string,
): string {
    const betas = (existingValue ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    if (!betas.includes(betaToAdd)) {
        betas.push(betaToAdd);
    }
    return betas.join(", ");
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
