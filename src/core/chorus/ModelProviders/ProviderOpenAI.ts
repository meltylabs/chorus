import OpenAI from "openai";
import {
    StreamResponseParams,
    LLMMessage,
    readImageAttachment,
    encodeTextAttachment,
    attachmentMissingFlag,
    encodeWebpageAttachment,
    readPdfAttachment,
    LLMMessageUser,
    LLMMessageAssistant,
} from "../Models";
import { IProvider } from "./IProvider";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import { UserToolCall, getUserToolNamespacedName } from "@core/chorus/Toolsets";
import { O3_DEEP_RESEARCH_SYSTEM_PROMPT } from "@core/chorus/prompts/prompts";
import { parseToolCallArguments } from "@core/chorus/ToolCallArgs";

export class ProviderOpenAI implements IProvider {
    async streamResponse({
        modelConfig,
        llmConversation,
        apiKeys,
        onChunk,
        onComplete,
        additionalHeaders,
        tools,
        enabledToolsets,
        customBaseUrl,
    }: StreamResponseParams) {
        const modelId = modelConfig.modelId.split("::")[1];

        // Determine image support based on model naming patterns
        const imageSupport =
            modelId.includes("gpt-4") ||
            modelId.includes("gpt-5") ||
            (modelId.startsWith("o") &&
                !modelId.includes("mini") &&
                modelId !== "o1");

        const { canProceed, reason } = canProceedWithProvider(
            "openai",
            apiKeys,
        );

        if (!canProceed) {
            throw new Error(
                reason || "Please add your OpenAI API key in Settings.",
            );
        }

        // Process the conversation with a dedicated converter
        let messages = await convertConversationToOpenAI(
            llmConversation,
            imageSupport,
        );
        const isReasoningModel =
            modelId === "o1" ||
            modelId === "o1-pro" ||
            modelId === "o3-mini" ||
            modelId === "o3" ||
            modelId === "o3-pro" ||
            modelId === "o4-mini" ||
            modelId === "o3-deep-research" ||
            modelId.startsWith("gpt-5") || // All GPT-5 models support reasoning
            modelId.startsWith("o"); // All o-series models support reasoning

        const shouldRequestReasoningSummary =
            Boolean(modelConfig.showThoughts) && isReasoningModel;

        // Add system message if needed
        let systemContent = "";

        // OpenAI does not reliably support returning full chain-of-thought for non-reasoning models.
        // When showThoughts is enabled, we only request server-provided reasoning summaries for
        // reasoning-capable models (o-series / GPT-5) rather than prompting for <think> tags.

        // Always add formatting message for reasoning models
        if (isReasoningModel) {
            systemContent = systemContent
                ? systemContent + "\n\nMarkdown formatting re-enabled."
                : "Markdown formatting re-enabled.";
        }

        // Add special system prompt for o3-deep-research
        if (modelId === "o3-deep-research") {
            if (systemContent) {
                systemContent += "\n" + O3_DEEP_RESEARCH_SYSTEM_PROMPT;
            } else {
                systemContent = O3_DEEP_RESEARCH_SYSTEM_PROMPT;
            }
        }

        // Append system prompt if provided
        if (modelConfig.systemPrompt) {
            if (systemContent) {
                systemContent += `\n ${modelConfig.systemPrompt}`;
            } else {
                systemContent = modelConfig.systemPrompt;
            }
        }

        if (systemContent) {
            messages = [
                { role: "developer", content: systemContent },
                ...messages,
            ];
        }

        const nativeWebSearchEnabled =
            enabledToolsets?.includes("web") ?? false;

        const supportsNativeWebSearch =
            modelId.startsWith("o") ||
            modelId.startsWith("gpt-4o") ||
            modelId.startsWith("gpt-4.1") ||
            modelId.startsWith("gpt-5");

        const shouldUseNativeWebSearch =
            nativeWebSearchEnabled && supportsNativeWebSearch;

        const openaiTools: Array<OpenAI.Responses.FunctionTool> | undefined =
            tools?.map((tool) => ({
                type: "function",
                name: getUserToolNamespacedName(tool), // name goes at this level for OpenAI
                description: tool.description,
                parameters: tool.inputSchema,
                // TODOJDC: we should use strict mode (so that we can get structured outputs) where possible
                // we can turn on strict mode if
                // (A) all fields are required, and
                // (B) additionalProperties is false at all levels (need to do a recursive check)
                strict: false,
            }));

        const nativeWebSearchTools = shouldUseNativeWebSearch
            ? [
                  {
                      type: "web_search_preview",
                      search_context_size: "medium",
                  } as const,
              ]
            : [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createParams: any = {
            model: modelId,
            input: messages,
            tools: [...nativeWebSearchTools, ...(openaiTools || [])],
            tool_choice:
                nativeWebSearchTools.length > 0 || (tools && tools.length > 0)
                    ? ("auto" as const)
                    : ("none" as const),
            stream: true as const,
            ...(nativeWebSearchTools.length > 0 && {
                include: ["web_search_call.action.sources"],
            }),
            ...(isReasoningModel && {
                reasoning: {
                    effort: modelConfig.reasoningEffort || "medium",
                    ...(shouldRequestReasoningSummary && { summary: "auto" }),
                },
            }),
        };

        // Debug: Log reasoning parameters
        console.log(`[ProviderOpenAI] Model: ${modelId}`);
        console.log(`[ProviderOpenAI] Is reasoning model: ${isReasoningModel}`);
        console.log(
            `[ProviderOpenAI] modelConfig.reasoningEffort: ${modelConfig.reasoningEffort}`,
        );
        console.log(
            `[ProviderOpenAI] createParams.reasoning:`,
            (createParams as { reasoning?: unknown }).reasoning,
        );

        // Add special tools for o3-deep-research
        if (modelId === "o3-deep-research") {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            createParams.reasoning = {
                effort: modelConfig.reasoningEffort || "medium",
                summary: "auto",
            };
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            createParams.tools = [
                {
                    type: "web_search_preview",
                },
                {
                    type: "code_interpreter",
                    container: {
                        type: "auto",
                        file_ids: [],
                    },
                },
                ...(openaiTools || []),
            ];
            // o3-deep-research requires tool_choice to be "auto" when using code_interpreter
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            createParams.tool_choice = "auto";
            // Include sources so we can surface citations/URLs when available
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            createParams.include = ["web_search_call.action.sources"];
        }

        const client = new OpenAI({
            apiKey: apiKeys.openai,
            baseURL: customBaseUrl,
            dangerouslyAllowBrowser: true,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
                "Content-Type": "application/json",
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const stream = await client.responses.create(createParams);

        /**
         * OpenAI response streaming event types
         */
        type OpenAIStreamEvent =
            | {
                  // Text delta event
                  type: "response.output_text.delta";
                  delta: string;
              }
            | {
                  // Tool call started event
                  type: "response.output_item.added";
                  item: {
                      type: "function_call";
                      id: string;
                      call_id: string;
                      name: string;
                      arguments: string;
                  };
              }
            | {
                  // Tool call arguments being streamed
                  type: "response.function_call_arguments.delta";
                  item_id: string;
                  delta: string;
              }
            | {
                  // Tool call arguments completed
                  type: "response.function_call_arguments.done";
                  item_id: string;
                  arguments: string;
              }
            | {
                  // Tool call fully completed
                  type: "response.output_item.done";
                  item: {
                      type: "function_call";
                      id: string;
                      call_id: string;
                      name: string;
                      arguments: string;
                  };
              }
            | {
                  // Response completed with annotations
                  type: "response.done";
                  output?: Array<{
                      content?: Array<{
                          text?: string;
                          annotations?: Array<{
                              title: string;
                              url: string;
                              start_index: number;
                              end_index: number;
                          }>;
                      }>;
                  }>;
              }
            | {
                  type: "response.reasoning_summary_text.delta";
                  delta: string;
                  item_id?: string;
                  output_index?: number;
                  summary_index?: number;
              }
            | {
                  type: "response.reasoning_summary_text.done";
                  text: string;
                  item_id?: string;
                  output_index?: number;
                  summary_index?: number;
              }
            | {
                  // Some SDKs emit this alternate event name.
                  type: "response.reasoning_summary.delta";
                  delta: string;
              };

        // Track tool calls in the streamed response
        const toolCalls: UserToolCall[] = [];
        const accumulatedToolCalls: Record<
            string,
            {
                id: string;
                call_id: string;
                name: string;
                arguments: string;
            }
        > = {};

        let inReasoningSummary = false;
        let reasoningSummaryText = "";
        let reasoningSummaryStartedAtMs: number | undefined;
        let sawOutputText = false;

        const closeReasoningSummary = () => {
            if (!inReasoningSummary) return;
            inReasoningSummary = false;
            onChunk("</think>");
            if (reasoningSummaryStartedAtMs !== undefined) {
                const seconds = Math.max(
                    1,
                    Math.round(
                        (Date.now() - reasoningSummaryStartedAtMs) / 1000,
                    ),
                );
                onChunk(`<thinkmeta seconds="${seconds}"/>`);
            }
            onChunk("\n\n");
            reasoningSummaryStartedAtMs = undefined;
        };

        try {
            // Process the streaming response
            for await (const event of stream as unknown as AsyncIterable<OpenAIStreamEvent>) {
                if (
                    shouldRequestReasoningSummary &&
                    !sawOutputText &&
                    (event.type === "response.reasoning_summary_text.delta" ||
                        event.type === "response.reasoning_summary.delta")
                ) {
                    if (!inReasoningSummary) {
                        inReasoningSummary = true;
                        reasoningSummaryText = "";
                        reasoningSummaryStartedAtMs = Date.now();
                        onChunk("<think>");
                    }
                    reasoningSummaryText += event.delta;
                    onChunk(event.delta);
                } else if (
                    shouldRequestReasoningSummary &&
                    !sawOutputText &&
                    event.type === "response.reasoning_summary_text.done"
                ) {
                    if (!inReasoningSummary) {
                        inReasoningSummary = true;
                        reasoningSummaryText = "";
                        reasoningSummaryStartedAtMs = Date.now();
                        onChunk("<think>");
                    }
                    if (!reasoningSummaryText && event.text) {
                        onChunk(event.text);
                    }
                    closeReasoningSummary();
                }
                // Handle text streaming
                else if (event.type === "response.output_text.delta") {
                    sawOutputText = true;
                    if (inReasoningSummary) {
                        closeReasoningSummary();
                    }
                    const deltaText =
                        shouldRequestReasoningSummary &&
                        (event.delta.includes("<think") ||
                            event.delta.includes("</think") ||
                            event.delta.includes("<thought") ||
                            event.delta.includes("</thought"))
                            ? event.delta
                                  .replace(/<think/g, "&lt;think")
                                  .replace(/<\/think/g, "&lt;/think")
                                  .replace(/<thought/g, "&lt;thought")
                                  .replace(/<\/thought/g, "&lt;/thought")
                            : event.delta;

                    onChunk(deltaText);
                }
                // TOOL CALL HANDLING - OpenAI streams tool calls in multiple events:
                // 1. Tool call initialization
                else if (
                    event.type === "response.output_item.added" &&
                    event.item.type === "function_call"
                ) {
                    // Initialize the tool call structure when first encountered
                    accumulatedToolCalls[event.item.id] = {
                        id: event.item.id,
                        call_id: event.item.call_id,
                        name: event.item.name,
                        arguments: event.item.arguments || "",
                    };
                }
                // 2. Tool call arguments streaming (may come in multiple chunks)
                else if (
                    event.type === "response.function_call_arguments.delta"
                ) {
                    // Accumulate argument JSON as it streams in
                    if (accumulatedToolCalls[event.item_id]) {
                        accumulatedToolCalls[event.item_id].arguments +=
                            event.delta;
                    }
                }
                // 3. Tool call arguments complete (contains full arguments)
                else if (
                    event.type === "response.function_call_arguments.done"
                ) {
                    // Use the complete arguments
                    if (accumulatedToolCalls[event.item_id]) {
                        accumulatedToolCalls[event.item_id].arguments =
                            event.arguments;
                    }
                }
                // 4. Tool call fully complete
                else if (
                    event.type === "response.output_item.done" &&
                    event.item.type === "function_call"
                ) {
                    // Convert completed tool call to our internal ToolCall format
                    const namespacedToolName = event.item.name;
                    const calledTool = tools?.find(
                        (t) =>
                            getUserToolNamespacedName(t) === namespacedToolName,
                    );
                    const { args, parseError } = parseToolCallArguments(
                        event.item.arguments,
                    );

                    // Add to our collection of tool calls
                    toolCalls.push({
                        id: event.item.call_id,
                        namespacedToolName,
                        args,
                        toolMetadata: {
                            description: calledTool?.description,
                            inputSchema: calledTool?.inputSchema,
                            ...(parseError ? { parseError } : {}),
                        },
                    });
                }
                // 5. Handle response.done event for citations
                else if (event.type === "response.done" && event.output) {
                    if (inReasoningSummary) {
                        closeReasoningSummary();
                    }
                    // Process citations from o3-deep-research
                    for (const output of event.output) {
                        if (output.content) {
                            for (const content of output.content) {
                                if (
                                    content.annotations &&
                                    content.annotations.length > 0
                                ) {
                                    // Format citations as plain text
                                    let citationText =
                                        "\n\n---\n**Citations:**\n";

                                    for (const citation of content.annotations) {
                                        citationText += `\n- **${citation.title}**\n`;
                                        citationText += `  URL: ${citation.url}\n`;

                                        // Extract the cited text if we have the full text
                                        if (content.text) {
                                            const citedText =
                                                content.text.substring(
                                                    citation.start_index,
                                                    citation.end_index,
                                                );
                                            citationText += `  Cited text: "${citedText}"\n`;
                                        }
                                    }

                                    // Send the citations as a text chunk
                                    onChunk(citationText);
                                }
                            }
                        }
                    }
                }
            }
        } finally {
            closeReasoningSummary();
        }

        await onComplete(
            undefined,
            toolCalls.length > 0 ? toolCalls : undefined,
        );
    }
}

/**
 * Processes a single message with attachments, converting to the OpenAI format.
 * This simpler function just handles basic user/assistant messages with attachments,
 * and doesn't try to handle the complexity of tool calls or tool results.
 *
 * @param message - The LLM message to format
 * @param imageSupport - Whether the model supports image attachments
 * @returns A properly formatted message for the OpenAI Responses API
 */
async function formatBasicMessage(
    message: LLMMessageUser | LLMMessageAssistant,
    imageSupport: boolean,
): Promise<OpenAI.Responses.ResponseInputItem> {
    if (message.role === "user") {
        return formamtUserMessageWithAttachments(message, imageSupport);
    } else {
        return {
            role: message.role,
            content: stripThinkBlocks(message.content || ""),
        };
    }
}

function stripThinkBlocks(text: string): string {
    return text
        .replace(/<think(?:\s+[^>]*?)?>[\s\S]*?<\/think\s*>/g, "")
        .replace(/<thought(?:\s+[^>]*?)?>[\s\S]*?<\/thought\s*>/g, "")
        .replace(/<thinkmeta\s+seconds="\d+"\s*\/>/g, "")
        .trim();
}

async function formamtUserMessageWithAttachments(
    message: LLMMessageUser,
    imageSupport: boolean,
): Promise<OpenAI.Responses.ResponseInputItem> {
    // Handle regular user and assistant messages with attachments
    let attachmentTexts = "";
    const attachmentBlocks: OpenAI.Responses.ResponseInputContent[] = [];

    const attachments = message.role === "user" ? message.attachments : [];

    for (const attachment of attachments) {
        switch (attachment.type) {
            case "text": {
                attachmentTexts += await encodeTextAttachment(attachment);
                break;
            }
            case "webpage": {
                attachmentTexts += await encodeWebpageAttachment(attachment);
                break;
            }
            case "image": {
                if (!imageSupport) {
                    attachmentTexts += attachmentMissingFlag(attachment);
                } else {
                    const fileExt =
                        attachment.path.split(".").pop()?.toLowerCase() || "";
                    const mimeType = fileExt === "jpg" ? "jpeg" : fileExt;
                    attachmentBlocks.push({
                        type: "input_image",
                        image_url: `data:image/${mimeType};base64,${await readImageAttachment(attachment)}`,
                        detail: "auto",
                    });
                }
                break;
            }
            case "pdf": {
                try {
                    const base64Pdf = await readPdfAttachment(attachment);
                    attachmentBlocks.push({
                        type: "input_file",
                        filename: attachment.path,
                        file_data: `data:application/pdf;base64,${base64Pdf}`,
                    });
                } catch (error) {
                    console.error("Failed to read PDF:", error);
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

    return {
        role: message.role,
        content: [
            ...attachmentBlocks,
            { type: "input_text", text: attachmentTexts + message.content },
        ],
    };
}

/**
 * Converts the entire conversation to the OpenAI format, handling tool calls and results
 * properly according to OpenAI's Responses API format.
 *
 * This maintains proper sequencing of:
 * 1. Assistant sends message
 * 2. Assistant makes tool calls
 * 3. Tool results are returned
 *
 * For more details on OpenAI's tool call format, see:
 * https://platform.openai.com/docs/guides/function-calling
 */
async function convertConversationToOpenAI(
    messages: LLMMessage[],
    imageSupport: boolean,
): Promise<OpenAI.Responses.ResponseInputItem[]> {
    const openaiMessages: OpenAI.Responses.ResponseInputItem[] = [];

    for (const message of messages) {
        if (message.role === "tool_results") {
            // Handle tool results - convert each result to a separate function_call_output message
            for (const result of message.toolResults) {
                openaiMessages.push({
                    type: "function_call_output" as const,
                    call_id: result.id,
                    output: result.content,
                });
            }
        } else if (message.role === "assistant" && message.toolCalls?.length) {
            // First add the assistant message with content
            openaiMessages.push({
                role: "assistant",
                content: stripThinkBlocks(message.content || ""),
            });

            // Then add each tool call as a separate message in OpenAI format
            for (const toolCall of message.toolCalls) {
                openaiMessages.push({
                    type: "function_call" as const,
                    call_id: toolCall.id,
                    name: toolCall.namespacedToolName,
                    arguments: JSON.stringify(toolCall.args),
                });
            }
        } else {
            // For standard user/assistant messages, just add them with attachments
            openaiMessages.push(
                await formatBasicMessage(message, imageSupport),
            );
        }
    }

    return openaiMessages;
}
