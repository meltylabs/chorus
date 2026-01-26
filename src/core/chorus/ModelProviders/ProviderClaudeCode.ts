import { IProvider } from "./IProvider";
import {
    LLMMessage,
    StreamResponseParams,
    llmMessageToString,
    readTextAttachment,
    readWebpageAttachment,
} from "../Models";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Types for Claude Code stream-json output
interface ClaudeCodeSystemInit {
    type: "system";
    subtype: "init";
    session_id: string;
    model: string;
    tools: string[];
}

interface ClaudeCodeAssistantMessage {
    type: "assistant";
    message: {
        content: Array<{ type: "text"; text: string } | { type: string }>;
    };
    session_id: string;
}

interface ClaudeCodeResult {
    type: "result";
    subtype: "success" | "error";
    result?: string;
    error?: string;
    session_id: string;
}

type ClaudeCodeStreamMessage =
    | ClaudeCodeSystemInit
    | ClaudeCodeAssistantMessage
    | ClaudeCodeResult;

interface TauriStreamEvent {
    type: "data" | "error" | "stderr" | "done";
    data?: string;
    error?: string;
    exitCode?: number;
}

/**
 * Check if Claude Code CLI is available and authenticated
 */
export async function checkClaudeCodeAvailable(): Promise<{
    available: boolean;
    version: string | null;
    authenticated: boolean;
}> {
    try {
        const result = await invoke<{
            available: boolean;
            version: string | null;
            authenticated: boolean;
        }>("check_claude_code_available");
        return result;
    } catch {
        return { available: false, version: null, authenticated: false };
    }
}

export class ProviderClaudeCode implements IProvider {
    async streamResponse({
        llmConversation,
        modelConfig,
        onChunk,
        onComplete,
        onError,
    }: StreamResponseParams): Promise<void> {
        const requestId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
        const prompt = await this.formatConversationAsPrompt(llmConversation);

        // Extract model name from model ID like "claude-code::claude-sonnet-4-5-20250929"
        const modelName = modelConfig.modelId.split("::")[1];
        const model = modelName === "default" ? undefined : modelName;

        let unlisten: UnlistenFn | undefined;
        let stderrContent = "";
        let hasReceivedContent = false;

        // Track what text we've already emitted to compute deltas
        // (Claude Code sends complete messages, not deltas)
        let lastEmittedText = "";

        let resolveStream: () => void;
        let rejectStream: (error: Error) => void;
        const streamingComplete = new Promise<void>((resolve, reject) => {
            resolveStream = resolve;
            rejectStream = reject;
        });

        try {
            unlisten = await listen<TauriStreamEvent>(
                `claude-code-stream-${requestId}`,
                (event) => {
                    const payload = event.payload;

                    if (payload.type === "data" && payload.data) {
                        try {
                            const message = JSON.parse(
                                payload.data,
                            ) as ClaudeCodeStreamMessage;

                            // Handle error results
                            if (
                                message.type === "result" &&
                                message.subtype === "error"
                            ) {
                                rejectStream(
                                    new Error(
                                        message.error ||
                                            "Claude Code returned an error",
                                    ),
                                );
                                return;
                            }

                            // Process assistant messages - extract text and emit deltas
                            if (
                                message.type === "assistant" &&
                                message.message?.content
                            ) {
                                const textParts: string[] = [];
                                for (const block of message.message.content) {
                                    if (
                                        block.type === "text" &&
                                        "text" in block
                                    ) {
                                        textParts.push(block.text);
                                    }
                                }

                                if (textParts.length > 0) {
                                    hasReceivedContent = true;
                                    const fullText = textParts.join("");

                                    // Compute delta - only emit NEW content
                                    if (fullText.startsWith(lastEmittedText)) {
                                        const delta = fullText.slice(
                                            lastEmittedText.length,
                                        );
                                        if (delta) {
                                            onChunk(delta);
                                            lastEmittedText = fullText;
                                        }
                                    } else if (fullText) {
                                        // Text changed completely (rare) - emit full text
                                        onChunk(fullText);
                                        lastEmittedText = fullText;
                                    }
                                }
                            }
                        } catch {
                            // Ignore parse errors for non-JSON lines
                        }
                    } else if (payload.type === "error") {
                        rejectStream(
                            new Error(payload.error || "Unknown error"),
                        );
                    } else if (payload.type === "stderr" && payload.data) {
                        stderrContent += payload.data;
                    } else if (payload.type === "done") {
                        if (
                            payload.exitCode !== undefined &&
                            payload.exitCode !== 0
                        ) {
                            if (stderrContent && !hasReceivedContent) {
                                rejectStream(
                                    new Error(
                                        stderrContent.trim() ||
                                            `Claude Code CLI exited with code ${payload.exitCode}`,
                                    ),
                                );
                            } else if (!hasReceivedContent) {
                                rejectStream(
                                    new Error(
                                        `Claude Code CLI exited with code ${payload.exitCode}`,
                                    ),
                                );
                            } else {
                                resolveStream();
                            }
                        } else {
                            resolveStream();
                        }
                    }
                },
            );

            await invoke("stream_claude_code_response", {
                requestId,
                prompt,
                systemPrompt: modelConfig.systemPrompt || undefined,
                model,
                disableProjectContext: true,
            });

            await streamingComplete;
            void onComplete();
        } catch (error) {
            onError(
                error instanceof Error ? error.message : "Unknown error occurred",
            );
        } finally {
            if (unlisten) {
                unlisten();
            }
        }
    }

    private async formatConversationAsPrompt(
        messages: LLMMessage[],
    ): Promise<string> {
        // For single message, just return the content
        if (messages.length === 1 && messages[0].role === "user") {
            return await this.formatSingleMessage(messages[0]);
        }

        // For multi-turn conversations, format as a transcript
        const parts: string[] = [];

        for (const message of messages) {
            const formatted = await this.formatMessageForTranscript(message);
            parts.push(formatted);
        }

        return parts.join("\n\n");
    }

    private async formatSingleMessage(message: LLMMessage): Promise<string> {
        if (message.role !== "user") {
            return llmMessageToString(message);
        }

        let content = message.content;

        // Append attachment contents
        // Note: The Claude Code CLI in print mode doesn't support direct image/PDF input.
        // Images would require either keeping tools enabled (to use Read tool on files)
        // or using the stream-json input format with base64 data.
        // For now, we only support text and webpage attachments which can be inlined.
        for (const attachment of message.attachments) {
            if (attachment.type === "text") {
                const textContent = await readTextAttachment(attachment);
                content += `\n\n[Attachment: ${attachment.originalName}]\n${textContent}`;
            } else if (attachment.type === "webpage") {
                const webContent = await readWebpageAttachment(attachment);
                content += `\n\n[Webpage: ${attachment.originalName}]\n${webContent}`;
            } else if (
                attachment.type === "image" ||
                attachment.type === "pdf"
            ) {
                // Images and PDFs are not supported in CLI print mode without tools
                content += `\n\n[Attachment: ${attachment.originalName}] (Note: ${attachment.type} attachments are not supported with Claude Code in general assistant mode)`;
            }
        }

        return content;
    }

    private async formatMessageForTranscript(
        message: LLMMessage,
    ): Promise<string> {
        if (message.role === "user") {
            const content = await this.formatSingleMessage(message);
            return `Human: ${content}`;
        } else if (message.role === "assistant") {
            return `Assistant: ${message.content}`;
        } else if (message.role === "tool_results") {
            return `Tool Results: ${llmMessageToString(message)}`;
        }
        return "";
    }
}
