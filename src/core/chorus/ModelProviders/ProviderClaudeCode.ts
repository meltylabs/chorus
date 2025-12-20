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

        // Always use undefined to let Claude Code CLI use its configured default model
        const model = undefined;

        let unlisten: UnlistenFn | undefined;
        let hasCompleted = false;
        let stderrContent = "";
        let hasReceivedContent = false;

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
                            const hadContent = this.handleStreamMessage(
                                message,
                                onChunk,
                                onError,
                            );
                            if (hadContent) {
                                hasReceivedContent = true;
                            }
                        } catch {
                            // Not valid JSON, might be partial output
                            console.warn(
                                "Failed to parse Claude Code stream data:",
                                payload.data,
                            );
                        }
                    } else if (payload.type === "error") {
                        if (!hasCompleted) {
                            hasCompleted = true;
                            onError(payload.error || "Unknown error");
                        }
                    } else if (payload.type === "stderr" && payload.data) {
                        stderrContent += payload.data;
                    } else if (payload.type === "done") {
                        if (!hasCompleted) {
                            hasCompleted = true;

                            if (
                                payload.exitCode !== undefined &&
                                payload.exitCode !== 0
                            ) {
                                if (stderrContent && !hasReceivedContent) {
                                    onError(
                                        stderrContent.trim() ||
                                            `Claude Code CLI exited with code ${payload.exitCode}`,
                                    );
                                } else if (!hasReceivedContent) {
                                    onError(
                                        `Claude Code CLI exited with code ${payload.exitCode}`,
                                    );
                                } else {
                                    void onComplete();
                                }
                            } else {
                                void onComplete();
                            }
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

            await new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                    if (hasCompleted) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);

                // Timeout after 5 minutes
                setTimeout(() => {
                    if (!hasCompleted) {
                        hasCompleted = true;
                        clearInterval(checkInterval);
                        onError("Request timed out after 5 minutes");
                        resolve();
                    }
                }, 5 * 60 * 1000);
            });
        } finally {
            // Clean up the event listener
            if (unlisten) {
                unlisten();
            }
        }
    }

    private handleStreamMessage(
        message: ClaudeCodeStreamMessage,
        onChunk: (chunk: string) => void,
        onError: (errorMessage: string) => void,
    ): boolean {
        if (message.type === "assistant" && message.message?.content) {
            let hadContent = false;

            for (const block of message.message.content) {
                if (block.type === "text" && "text" in block) {
                    onChunk(block.text);
                    hadContent = true;
                } else if (block.type === "tool_use" && "name" in block) {
                    // Emit tool calls immediately as custom tags
                    const toolBlock = block as {
                        type: "tool_use";
                        name: string;
                        input?: Record<string, unknown>;
                    };
                    const input = toolBlock.input
                        ? JSON.stringify(toolBlock.input, null, 2)
                        : "";

                    // Base64 encode the content to avoid HTML parsing issues
                    const encodedInput = Buffer.from(input).toString('base64');

                    const toolTag = `\n<tool-call name="${toolBlock.name}" data-input="${encodedInput}"></tool-call>\n`;

                    // Emit as a tool-call tag that will be grouped by MessageMarkdown
                    onChunk(toolTag);
                    hadContent = true;
                }
            }
            return hadContent;
        }

        if (message.type === "result" && message.subtype === "error") {
            onError(message.error || "Claude Code returned an error");
            return false;
        }

        return false;
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
            } else if (attachment.type === "image" || attachment.type === "pdf") {
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
