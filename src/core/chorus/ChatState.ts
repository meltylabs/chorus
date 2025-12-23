import type { LLMMessage } from "./Models";
import type { Attachment } from "./api/AttachmentsAPI";
import * as Toolsets from "./Toolsets";
import type { UserToolCall, UserToolResult } from "./Toolsets";
import * as Prompts from "./prompts/prompts";
import * as Reviews from "./reviews";

// ----------------------------------
// Types
// ----------------------------------

export type MessageSet = {
    id: string;
    chatId: string;
    type: "user" | "ai";
    level: number;
    selectedBlockType: BlockType;
    createdAt: string;
};

export type MessageSetDetail = MessageSet & {
    userBlock: UserBlock;
    chatBlock: ChatBlock;
    compareBlock: CompareBlock;
    brainstormBlock: BrainstormBlock;
    toolsBlock: ToolsBlock;
};

export interface Message {
    id: string;
    chatId: string;
    messageSetId: string;
    blockType: BlockType;
    text: string;
    model: string;
    selected: boolean;
    attachments: Attachment[] | undefined;
    isReview: boolean;
    state: "streaming" | "idle";
    streamingToken: string | undefined; // says which stream is updating this message
    errorMessage: string | undefined;
    reviewState: "pending" | "applied" | undefined;
    level: number | undefined;
    parts: MessagePart[];
    replyChatId: string | undefined;
    branchedFromId: string | undefined;
    // Token usage and cost
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
}

export interface MessagePart {
    chatId: string;
    messageId: string;
    level: number;
    content: string;
    toolCalls?: UserToolCall[];
    toolResults?: UserToolResult[];
}

export function createAIMessage({
    chatId,
    messageSetId,
    blockType,
    model,
    selected = false,
    isReview = false,
    level,
}: {
    chatId: string;
    messageSetId: string;
    blockType: BlockType;
    model: string;
    selected?: boolean;
    isReview?: boolean;
    level?: number;
}): Omit<Message, "id" | "streamingToken" | "parts"> {
    return {
        chatId,
        blockType,
        text: "",
        model,
        messageSetId,
        selected,
        attachments: undefined,
        state: "streaming",
        errorMessage: undefined,
        isReview,
        reviewState: undefined,
        level,
        replyChatId: undefined,
        branchedFromId: undefined,
    };
}

export function createUserMessage({
    chatId,
    messageSetId,
    text,
}: {
    messageSetId: string;
    chatId: string;
    text: string;
}): Omit<Message, "id" | "streamingToken" | "parts" | "attachments"> {
    return {
        chatId,
        blockType: "user",
        text,
        model: "user",
        messageSetId,
        selected: true,
        state: "idle",
        errorMessage: undefined,
        isReview: false,
        reviewState: undefined,
        level: undefined,
        replyChatId: undefined,
        branchedFromId: undefined,
    };
}

// a message will have a state of "streaming" or "idle"
// if streaming, it will have a streamingToken
// idle = it finished, user stopped it, or it timed out
// this lets us stop it, retry it, and time it out
// also should there be an "error" state?

export type BlockType = "user" | "chat" | "compare" | "tools" | "brainstorm";
export const SELECTABLE_BLOCK_TYPES: BlockType[] = ["tools", "chat", "compare"];
export const isBlockType = (blockType: string): blockType is BlockType =>
    SELECTABLE_BLOCK_TYPES.includes(blockType as BlockType);
export const getBlockTypeDisplayName = (blockType: BlockType): string =>
    blockType === "tools"
        ? "Default"
        : blockType === "chat"
          ? "Reviews"
          : blockType === "compare"
            ? "Compare"
            : blockType === "brainstorm"
              ? "Brainstorm"
              : blockType;

export type UserBlock = {
    type: "user";
    message: Message | undefined;
};
export type ChatBlock = {
    type: "chat";
    message: Message | undefined;
    reviews: Message[];
};
export type CompareBlock = {
    type: "compare";
    messages: Message[];
    synthesis: Message | undefined;
};
export type ToolsBlock = {
    type: "tools";
    chatMessages: Message[];
};
export type BrainstormBlock = {
    type: "brainstorm";
    ideaMessages: Message[];
};
export type Block =
    | UserBlock
    | ChatBlock
    | BrainstormBlock
    | CompareBlock
    | ToolsBlock;

function encodeToolsBlock(block: ToolsBlock): LLMMessage[] {
    // Build LLMMessages from the sorted chat messages
    const result: LLMMessage[] = [];

    const selectedMessage = block.chatMessages.find((m) => m.selected);
    if (!selectedMessage || !selectedMessage.parts.length) {
        return [];
    }

    for (const part of selectedMessage.parts) {
        if (part.toolResults) {
            // Tool response message
            if (part.toolResults.length === 0) {
                console.warn("Tool response message without toolResults", part);
                continue;
            }
            result.push({
                role: "tool_results",
                toolResults: part.toolResults,
            });
        } else {
            // Assistant message
            result.push({
                role: "assistant",
                content: part.content,
                model: selectedMessage.model,
                toolCalls: part.toolCalls || [],
            });
        }
    }

    const lastPart = selectedMessage.parts[selectedMessage.parts.length - 1];
    if (lastPart.toolCalls) {
        // this is an interrupted tool call
        result.push({
            role: "tool_results",
            toolResults: lastPart.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                namespacedToolName: toolCall.namespacedToolName,
                content: Toolsets.TOOL_CALL_INTERRUPTED_MESSAGE,
            })),
        });
    }

    return result;
}

function encodeChatBlock(block: ChatBlock): LLMMessage[] {
    const appliedReview = block.reviews.find(
        (r) => r.reviewState === "applied",
    );
    const revision = appliedReview
        ? Reviews.parseReview(appliedReview.text, true).revision
        : undefined;
    if (revision) {
        return [
            {
                role: "assistant",
                content: revision,
                toolCalls: [],
            },
        ];
    }

    if (!block.message) {
        return [];
    }

    return [
        {
            role: "assistant",
            content: block.message.text,
            model: block.message.model,
            toolCalls: [],
        },
    ];
}

function encodeUserBlock(block: UserBlock): LLMMessage[] {
    return [
        {
            role: "user",
            content: block.message?.text ?? "",
            attachments: block.message?.attachments || [],
        },
    ];
}

function encodeCompareBlock(block: CompareBlock): LLMMessage[] {
    if (block.synthesis?.selected) {
        return [
            {
                role: "assistant",
                content: block.synthesis.text,
                toolCalls: [],
            },
        ];
    } else {
        const selectedMessages = block.messages.filter((m) => m.selected);
        if (selectedMessages.length === 1) {
            return [
                {
                    role: "assistant",
                    content: selectedMessages[0].text,
                    toolCalls: [],
                },
            ];
        } else {
            return [
                {
                    role: "assistant",
                    content: `${selectedMessages.map((m) => m.text).join("\n\n")}`,
                    toolCalls: [],
                },
            ];
        }
    }
}

function encodeBrainstormBlock(block: BrainstormBlock): LLMMessage[] {
    return [
        {
            role: "assistant",
            content: `${block.ideaMessages
                .map((m) => `<idea>${m.text}</idea>`)
                .join("\n")}`,
            toolCalls: [],
        },
    ];
}

function encodeCompareBlockForSynthesis(block: CompareBlock): LLMMessage[] {
    // include all responses, regardless of whether they're selected
    return [
        {
            role: "user",
            content: `${Prompts.SYNTHESIS_INTERJECTION}

        ${block.messages
            .map(
                (message) =>
                    `<perspective sender="${message.model}">
${message.text}
</perspective>`,
            )
            .join("\n\n")}`,
            attachments: [],
        },
    ];
}

function blockIsEmptyTools(block: ToolsBlock): boolean {
    return block.chatMessages.length === 0;
}

function blockIsEmptyChat(block: ChatBlock): boolean {
    return !block.message && block.reviews.length === 0;
}

function blockIsEmptyCompare(block: CompareBlock): boolean {
    return block.messages.length === 0;
}

function blockIsEmptyBrainstorm(block: BrainstormBlock): boolean {
    return block.ideaMessages.length === 0;
}

export function blockIsEmpty(
    messageSet: MessageSetDetail,
    blockType: BlockType,
): boolean {
    switch (blockType) {
        case "chat":
            return blockIsEmptyChat(messageSet.chatBlock);
        case "brainstorm":
            return blockIsEmptyBrainstorm(messageSet.brainstormBlock);
        case "compare":
            return blockIsEmptyCompare(messageSet.compareBlock);
        case "tools":
            return blockIsEmptyTools(messageSet.toolsBlock);
        default:
            throw new Error(
                `Unexpected block type for blockIsEmpty: ${blockType}`,
            );
    }
}

/**
 * Returns the index of the last user message set, or -1 if there are no user message sets.
 * This is used to determine whether to include ephemeral attachments in the LLM conversation.
 * The last message set in the list is not always a user message set, since tools messages
 * can be multi-part (meaning an AI message can be created before reaching llmConversation).
 */
function getLastUserMessageSetIndex(messageSets: MessageSetDetail[]): number {
    for (let i = messageSets.length - 1; i >= 0; i--) {
        if (messageSets[i].selectedBlockType === "user") {
            return i;
        }
    }
    return -1;
}

/**
 * This is the conversation that will be sent to the LLM.
 */
export function llmConversation(messageSets: MessageSetDetail[]): LLMMessage[] {
    const conversation: LLMMessage[] = [];

    const lastUserMessageSetIndex = getLastUserMessageSetIndex(messageSets);

    messageSets.forEach((messageSet, index) => {
        function removeEphemeralAttachments(llmMessages: LLMMessage[]) {
            if (index === lastUserMessageSetIndex) {
                return llmMessages;
            }
            return llmMessages.map((llmMessage) => {
                if (llmMessage.role !== "user") {
                    return llmMessage;
                }
                return {
                    ...llmMessage,
                    attachments: llmMessage.attachments.filter(
                        (a) => !a.ephemeral,
                    ),
                };
            });
        }

        switch (messageSet.selectedBlockType) {
            case "user": {
                if (messageSet.userBlock) {
                    conversation.push(
                        ...removeEphemeralAttachments(
                            encodeUserBlock(messageSet.userBlock),
                        ),
                    );
                }
                break;
            }
            case "chat": {
                if (messageSet.chatBlock) {
                    conversation.push(
                        ...removeEphemeralAttachments(
                            encodeChatBlock(messageSet.chatBlock),
                        ),
                    );
                }
                break;
            }
            case "brainstorm": {
                conversation.push(
                    ...removeEphemeralAttachments(
                        encodeBrainstormBlock(messageSet.brainstormBlock),
                    ),
                );
                break;
            }
            case "compare": {
                if (messageSet.compareBlock) {
                    conversation.push(
                        ...removeEphemeralAttachments(
                            encodeCompareBlock(messageSet.compareBlock),
                        ),
                    );
                }
                break;
            }
            case "tools": {
                if (messageSet.toolsBlock) {
                    conversation.push(
                        ...removeEphemeralAttachments(
                            encodeToolsBlock(messageSet.toolsBlock),
                        ),
                    );
                }
                break;
            }
            default: {
                console.warn(
                    "unknown block type",
                    messageSet.selectedBlockType,
                );
                break;
            }
        }
    });

    return conversation;
}

export function llmConversationForSynthesis(
    messageSets: MessageSetDetail[],
): LLMMessage[] {
    const finalCompareBlock = messageSets[messageSets.length - 1].compareBlock;

    const synthesisMessages = finalCompareBlock
        ? encodeCompareBlockForSynthesis(finalCompareBlock)
        : [];

    return [...llmConversation(messageSets.slice(0, -1)), ...synthesisMessages];
}
