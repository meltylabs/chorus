import {
    Message,
    BlockType,
    MessageSetDetail,
    MessageSet,
    llmConversation,
    createAIMessage,
    blockIsEmpty,
    llmConversationForSynthesis,
    MessagePart,
    BrainstormBlock,
    ToolsBlock,
    CompareBlock,
    ChatBlock,
    UserBlock,
} from "@core/chorus/ChatState";
import * as Reviews from "../reviews";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LLMMessage, ModelConfig, UsageData } from "../Models";
import * as Models from "../Models";
import { UpdateQueue } from "../UpdateQueue";
import posthog from "posthog-js";
import { v4 as uuidv4 } from "uuid";
import { simpleLLM } from "../simpleLLM";
import { SimpleCompletionMode } from "../ModelProviders/simple/ISimpleCompletionProvider";
import * as Prompts from "../prompts/prompts";
import { useNavigate } from "react-router-dom";
import { ToolsetsManager } from "../ToolsetsManager";
import { UserTool, UserToolCall, UserToolResult } from "../Toolsets";
import { produce } from "immer";
import _ from "lodash";
import { useAppContext } from "@ui/hooks/useAppContext";
import { db } from "../DB";
import { draftKeys } from "./DraftAPI";
import { updateSavedModelConfigChat } from "./ModelConfigChatAPI";
import { chatIsLoadingQueries, chatQueries } from "./ChatAPI";
import {
    appMetadataKeys,
    getApiKeys,
    getCustomBaseUrl,
} from "./AppMetadataAPI";
import {
    calculateCost,
    updateChatAndProjectCosts,
    fetchOpenRouterCost,
} from "./CostAPI";
import {
    projectQueries,
    useGetProjectContextLLMMessage,
    useMarkProjectContextSummaryAsStale,
} from "./ProjectAPI";
import { useGetToolsets } from "./ToolsetsAPI";
import { fetchAppMetadata } from "./AppMetadataAPI";
import {
    modelConfigQueries,
    useModelConfigs,
    useModelConfigsPromise,
    fetchModelConfigById,
} from "./ModelsAPI";
import { Attachment, AttachmentDBRow, readAttachment } from "./AttachmentsAPI";

// Query keys objects are based on https://tkdodo.eu/blog/effective-react-query-keys
// although also consider this approach: https://tkdodo.eu/blog/leveraging-the-query-function-context

const messageKeys = {
    // VERY IMPORTANT: use ... to ensure all keys have return type string[] !!!
    // otherwise, we'll get nested arrays and the query keys won't invalidate properly

    // messages
    messageSets: (chatId: string) =>
        ["chats", chatId, "messageSets", "list"] as const,

    // message attachments
    messageAttachments: (messageId: string) =>
        ["messages", messageId, "attachments"] as const,
};

export type MessageSetDBRow = {
    id: string;
    chat_id: string;
    type: "user" | "ai";
    level: number;
    selected_block_type: BlockType;
    created_at: string;
};

export function readMessageSet(row: MessageSetDBRow): MessageSet {
    return {
        id: row.id,
        chatId: row.chat_id,
        type: row.type,
        level: row.level,
        selectedBlockType: row.selected_block_type,
        createdAt: row.created_at,
    };
}

export interface MessageDBRow {
    id: string;
    chat_id: string;
    message_set_id: string;
    text: string;
    model: string;
    selected: number;
    state: "streaming" | "idle";
    streaming_token: string | null;
    error_message: string | null;
    is_review: number;
    review_state: "applied" | null;
    block_type: BlockType;
    level: number | null;
    reply_chat_id: string | null;
    branched_from_id: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    cost_usd: number | null;
}

export interface MessagePartDBRow {
    chat_id: string;
    message_id: string;
    level: number;
    content: string;
    tool_calls: string | null;
    tool_results: string | null;
}

export function readMessage(
    row: MessageDBRow,
    messagePartsRows: MessagePartDBRow[],
    attachmentsRows: AttachmentDBRow[],
): Message {
    return {
        id: row.id,
        chatId: row.chat_id,
        messageSetId: row.message_set_id,
        text: row.text,
        model: row.model,
        blockType: row.block_type,
        selected: Boolean(row.selected),
        attachments: attachmentsRows.map(readAttachment),
        state: row.state,
        streamingToken: row.streaming_token ?? undefined,
        errorMessage: row.error_message ?? undefined,
        isReview: Boolean(row.is_review),
        reviewState: row.review_state ?? undefined,
        level: row.level ?? undefined,
        parts: messagePartsRows.map(readMessagePart),
        replyChatId: row.reply_chat_id ?? undefined,
        branchedFromId: row.branched_from_id ?? undefined,
        promptTokens: row.prompt_tokens ?? undefined,
        completionTokens: row.completion_tokens ?? undefined,
        totalTokens: row.total_tokens ?? undefined,
        costUsd: row.cost_usd ?? undefined,
    };
}

function readMessagePart(row: MessagePartDBRow): MessagePart {
    return {
        chatId: row.chat_id,
        messageId: row.message_id,
        level: row.level,
        content: row.content,
        toolCalls: row.tool_calls
            ? (JSON.parse(row.tool_calls) as UserToolCall[])
            : undefined,
        toolResults: row.tool_results
            ? (JSON.parse(row.tool_results) as UserToolResult[])
            : undefined,
    };
}

export async function fetchMessageSets(chatId: string) {
    const [messageSets, messagesDbRows, messagePartsMap, attachmentsMap] =
        await Promise.all([
            db
                .select<MessageSetDBRow[]>(
                    `SELECT id, chat_id, type, selected_block_type, level, created_at
                 FROM message_sets
                 WHERE chat_id = ?
                 ORDER BY level, id`,
                    [chatId],
                )
                .then((rows) => rows.map(readMessageSet)),
            db.select<MessageDBRow[]>(
                "SELECT * FROM messages WHERE chat_id = ?",
                [chatId],
            ),
            db
                .select<
                    MessagePartDBRow[]
                >(`SELECT * FROM message_parts WHERE chat_id = ?`, [chatId])
                .then((rows) =>
                    rows.reduce((acc, mp) => {
                        // put the message parts into a map by message_id
                        if (!acc.has(mp.message_id)) acc.set(mp.message_id, []);
                        acc.get(mp.message_id)!.push(mp);
                        return acc;
                    }, new Map<string, MessagePartDBRow[]>()),
                ),
            db
                .select<(AttachmentDBRow & { message_id: string })[]>(
                    `SELECT message_id, attachments.id, type, original_name, path, is_loading, ephemeral FROM message_attachments
                JOIN attachments ON message_attachments.attachment_id = attachments.id
                WHERE message_id in (select id from messages where chat_id = ?)`,
                    [chatId],
                )
                .then((rows) =>
                    rows.reduce((acc, a) => {
                        if (!acc.has(a.message_id)) acc.set(a.message_id, []);
                        acc.get(a.message_id)!.push(a);
                        return acc;
                    }, new Map<string, AttachmentDBRow[]>()),
                ),
        ]);

    const messages = messagesDbRows.map((m) =>
        readMessage(
            m,
            messagePartsMap.get(m.id) || [],
            attachmentsMap.get(m.id) || [],
        ),
    );

    const messageSetsContents = messageSets.map((set) => {
        const messageSetMessages = messages.filter(
            (m) => m.messageSetId === set.id,
        );

        const userBlockMessages = messageSetMessages.filter(
            (m) => m.blockType === "user",
        );
        const chatBlockMessages = messageSetMessages.filter(
            (m) => m.blockType === "chat",
        );
        const compareBlockMessages = messageSetMessages.filter(
            (m) => m.blockType === "compare",
        );
        const brainstormBlockMessages = messageSetMessages.filter(
            (m) => m.blockType === "brainstorm",
        );
        const toolsBlockMessages = messageSetMessages
            .filter((m) => m.blockType === "tools")
            .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

        const userBlock: UserBlock = {
            type: "user",
            message:
                userBlockMessages.length > 0 ? userBlockMessages[0] : undefined,
        };

        // chat blocks are deprecated
        const chatBlock: ChatBlock = {
            type: "chat",
            message: chatBlockMessages.find((m) => !m.isReview),
            reviews: chatBlockMessages.filter((m) => m.isReview),
        };

        // compare blocks are deprecated
        const compareBlock: CompareBlock = {
            type: "compare",
            synthesis: compareBlockMessages.find(
                (m) => m.model === "chorus::synthesize",
            ),
            messages: compareBlockMessages
                .filter((m) => m.model !== "chorus::synthesize")
                .sort((a, b) => a.model.localeCompare(b.model)),
        };

        // brainstorm blocks are deprecated
        const brainstormBlock: BrainstormBlock = {
            type: "brainstorm",
            ideaMessages: brainstormBlockMessages,
        };

        const toolsBlock: ToolsBlock = {
            type: "tools",
            chatMessages: toolsBlockMessages,
        };

        const messageSetContent: MessageSetDetail = {
            ...set,
            userBlock,
            chatBlock,
            compareBlock,
            brainstormBlock,
            toolsBlock,
        };
        return messageSetContent;
    });

    return messageSetsContents;
}

export async function fetchMessage(messageId: string): Promise<Message | null> {
    const [messageRow, messageParts, attachments] = await Promise.all([
        db
            .select<
                MessageDBRow[]
            >("SELECT * FROM messages WHERE id = ?", [messageId])
            .then((rows) => rows[0] || null),
        db.select<MessagePartDBRow[]>(
            "SELECT * FROM message_parts WHERE message_id = ?",
            [messageId],
        ),
        db.select<AttachmentDBRow[]>(
            `SELECT attachments.id, type, original_name, path, is_loading, ephemeral 
             FROM message_attachments
             JOIN attachments ON message_attachments.attachment_id = attachments.id
             WHERE message_id = ?`,
            [messageId],
        ),
    ]);

    if (!messageRow) {
        return null;
    }

    return readMessage(messageRow, messageParts, attachments);
}

export async function fetchMessageDraft(
    chatId: string,
): Promise<string | undefined> {
    const drafts = await db.select<{ content: string }[]>(
        "SELECT content FROM message_drafts WHERE chat_id = ?",
        [chatId],
    );
    return drafts[0]?.content ?? "";
}

export async function fetchMessageReplyId(
    messageId: string,
): Promise<string | null> {
    const existingReply = await db.select<{ id: string }[]>(
        `SELECT id
         FROM chats
         WHERE reply_to_id = ?`,
        [messageId],
    );
    return existingReply.length > 0 ? existingReply[0].id : null;
}

/**
 * Duplicates a message set and all its messages to a new chat
 * @param sourceMessageSetId The ID of the message set to duplicate
 * @param targetChatId The ID of the target chat
 * @returns The ID of the newly created message set
 */
export async function duplicateMessageSet(
    sourceMessageSetId: string,
    targetChatId: string,
): Promise<{
    messageSetIdMap: Record<string, string>;
    messageIdMap: Record<string, string>;
}> {
    // Create a new message set in the target chat
    const sourceMessageSet = await db.select<MessageSetDBRow[]>(
        "SELECT * FROM message_sets WHERE id = ?",
        [sourceMessageSetId],
    );

    if (sourceMessageSet.length === 0) {
        throw new Error(`Message set not found: ${sourceMessageSetId}`);
    }

    const newMessageSetId = uuidv4().toLowerCase();

    // Insert the new message set
    await db.execute(
        `INSERT INTO message_sets (
            id,
            chat_id,
            level,
            type,
            selected_block_type
        ) VALUES (?, ?, ?, ?, ?)`,
        [
            newMessageSetId,
            targetChatId,
            sourceMessageSet[0].level,
            sourceMessageSet[0].type,
            sourceMessageSet[0].selected_block_type,
        ],
    );

    // Copy all messages from the source message set to the new one
    const messageIdMap = await duplicateMessagesForMessageSet(
        sourceMessageSetId,
        newMessageSetId,
        targetChatId,
    );

    return {
        messageSetIdMap: { [sourceMessageSetId]: newMessageSetId },
        messageIdMap,
    };
}

/**
 * Duplicates message parts from one message to another
 * @param sourceMessageId The ID of the source message
 * @param targetMessageId The ID of the target message
 * @param targetChatId The ID of the target chat
 */
export async function duplicateMessagePartsForMessage(
    sourceMessageId: string,
    targetMessageId: string,
    targetChatId: string,
): Promise<void> {
    // Get all message parts for the source message
    const sourceMessageParts = await db.select<MessagePartDBRow[]>(
        `SELECT * FROM message_parts WHERE message_id = ?`,
        [sourceMessageId],
    );

    // Insert message parts for the new message
    for (const part of sourceMessageParts) {
        await db.execute(
            `INSERT INTO message_parts (
                chat_id,
                message_id,
                level,
                content,
                tool_calls,
                tool_results
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                targetChatId,
                targetMessageId,
                part.level,
                part.content,
                part.tool_calls,
                part.tool_results,
            ],
        );
    }
}

/**
 * Duplicates attachments from one message to another
 * @param sourceMessageId The ID of the source message
 * @param targetMessageId The ID of the target message
 * @param targetChatId The ID of the target chat
 */
export async function duplicateAttachmentsForMessage(
    sourceMessageId: string,
    targetMessageId: string,
): Promise<void> {
    // Get all attachments for the source message
    const sourceAttachmentIds = await db
        .select<
            {
                attachment_id: string;
            }[]
        >(
            `SELECT attachment_id FROM message_attachments WHERE message_id = ?`,
            [sourceMessageId],
        )
        .then((rows) => rows.map((row) => row.attachment_id));

    // Insert attachments for the new message
    for (const attachmentId of sourceAttachmentIds) {
        await db.execute(
            `INSERT INTO message_attachments (message_id, attachment_id) VALUES (?, ?)`,
            [targetMessageId, attachmentId],
        );
    }
}

/**
 * Duplicates all messages from one message set to another
 * @param sourceMessageSetId The ID of the source message set
 * @param targetMessageSetId The ID of the target message set
 * @param targetChatId The ID of the target chat
 * @returns A map of source message IDs to target message IDs
 */
export async function duplicateMessagesForMessageSet(
    sourceMessageSetId: string,
    targetMessageSetId: string,
    targetChatId: string,
): Promise<Record<string, string>> {
    // Get all messages from the source message set
    const sourceMessages = await db.select<MessageDBRow[]>(
        // order by selected so that we'll copy the selected ones first so that
        // the trigger that ensures one message is always selected will not fire
        // *nervous laugh*
        "SELECT * FROM messages WHERE message_set_id = ? ORDER BY selected DESC",
        [sourceMessageSetId],
    );

    const messageIdMap: Record<string, string> = {};

    // Insert each message into the target message set
    for (const message of sourceMessages) {
        const newMessageId = uuidv4().toLowerCase();

        const result = await db.select<{ id: string }[]>(
            `INSERT INTO messages (
                id,
                chat_id,
                message_set_id,
                text,
                model,
                selected,
                streaming_token,
                is_review,
                review_state,
                block_type,
                state,
                level,
                branched_from_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING id`,
            [
                newMessageId,
                targetChatId,
                targetMessageSetId,
                message.text,
                message.model,
                message.selected,
                null, // Reset streaming token
                message.is_review,
                message.review_state,
                message.block_type,
                "idle", // Reset state to idle
                message.level,
                message.id,
            ],
        );

        messageIdMap[message.id] = result[0].id;

        // Duplicate attachments for this message
        await duplicateAttachmentsForMessage(message.id, newMessageId);

        // Duplicate message parts for this message
        await duplicateMessagePartsForMessage(
            message.id,
            newMessageId,
            targetChatId,
        );
    }

    return messageIdMap;
}

export async function fetchMessageAttachments(
    messageId: string,
): Promise<Attachment[]> {
    const result = await db.select<AttachmentDBRow[]>(
        `SELECT attachments.id, attachments.type, attachments.original_name, attachments.path, attachments.is_loading, attachments.ephemeral
        FROM message_attachments
        JOIN attachments ON message_attachments.attachment_id = attachments.id
        WHERE message_attachments.message_id = ?
        ORDER BY attachments.created_at`,
        [messageId],
    );
    console.log("fetchMessageAttachments", result);
    return result.map(readAttachment);
}

export async function stopAllStreamingMessages() {
    await db.execute(
        `UPDATE messages SET streaming_token = NULL, state = 'idle' 
         WHERE state = 'streaming'`,
    );
}

/// ------------------------------------------------------------------------------------------------
/// Queries
/// ------------------------------------------------------------------------------------------------

/*
 * note: currently unused
 */
export function useMessageAttachments(messageId: string) {
    return useQuery({
        queryKey: messageKeys.messageAttachments(messageId),
        queryFn: () => fetchMessageAttachments(messageId),
    });
}

export function useMessageSet(chatId: string, messageSetId: string) {
    // BTBL: should we write this as a separate query using initialData?
    return useMessageSets(chatId, (data) => {
        const set = data.find((m) => m.id === messageSetId);
        if (!set) {
            return [];
        }
        return [set];
    });
}

export function useMessageSets(
    chatId: string,
    select?: (data: MessageSetDetail[]) => MessageSetDetail[],
) {
    return useQuery({
        select,
        queryKey: messageKeys.messageSets(chatId),
        queryFn: () => fetchMessageSets(chatId),
    });
}

/// ------------------------------------------------------------------------------------------------
/// Mutations
/// ------------------------------------------------------------------------------------------------

export function useConvertDraftAttachmentsToMessageAttachments() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["convertDraftAttachmentsToMessageAttachments"] as const,
        mutationFn: async ({
            chatId,
            messageId,
        }: {
            chatId: string;
            messageId: string;
        }) => {
            await db.execute(
                `INSERT INTO message_attachments (message_id, attachment_id)
                        SELECT $1, draft_attachments.attachment_id
                        FROM draft_attachments
                        WHERE draft_attachments.chat_id = $2`,
                [messageId, chatId],
            );
            await db.execute(
                "DELETE FROM draft_attachments WHERE chat_id = $1",
                [chatId],
            );
        },
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: draftKeys.messageDraftAttachments(variables.chatId),
            });
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageAttachments(variables.messageId),
            });
        },
    });
}

/**
 * Branch at a target AI (tools) message
 * - Chat is equivalent up to the target message
 * - Target message is the last message in the new chat
 * - Target message becomes selected, siblings are deselected
 */
export function useBranchChat({
    chatId,
    messageSetId,
    messageId,
    replyToId = null,
}: {
    chatId: string;
    messageSetId: string;
    messageId: string;
    // a reminder that we only expect to branch on tools messages
    // for other block types, we'd need to figure out how to handle selecting the message
    blockType: "tools";
    replyToId?: string | null;
}) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const selectMessage = useSelectMessage();

    return useMutation({
        mutationKey: ["branchChat"] as const,
        mutationFn: async () => {
            console.log("branching on message", messageId);

            // Create a new chat with the same metadata
            const result = await db.select<{ id: string }[]>(
                `WITH source_chat AS (
                    SELECT * FROM chats WHERE id = ?
                )
                INSERT INTO chats (
                    id,
                    created_at,
                    project_id,
                    title,
                    quick_chat,
                    parent_chat_id,
                    reply_to_id
                )
                SELECT
                    lower(hex(randomblob(16))),
                    CURRENT_TIMESTAMP,
                    project_id,
                    title,
                    0, -- never a quick chat
                    id, -- set parent_chat_id to the source chat's id
                    ? -- reply_to_id parameter
                FROM source_chat
                RETURNING id`,
                [chatId, replyToId],
            );

            const newChatId = result[0].id;

            // Get message sets to duplicate
            const messageSets = await db.select<{ id: string }[]>(
                `SELECT id FROM message_sets
                WHERE chat_id = ? AND level <= (
                    SELECT level FROM message_sets WHERE id = ?
                )
                ORDER BY level`,
                [chatId, messageSetId],
            );

            let messageSetIdMap: Record<string, string> = {};
            let messageIdMap: Record<string, string> = {};

            // Duplicate each message set and its messages
            for (const { id: messageSetId } of messageSets) {
                const {
                    messageSetIdMap: localMessageSetIdMap,
                    messageIdMap: localMessageIdMap,
                } = await duplicateMessageSet(messageSetId, newChatId);
                messageSetIdMap = {
                    ...messageSetIdMap,
                    ...localMessageSetIdMap,
                };
                messageIdMap = { ...messageIdMap, ...localMessageIdMap };
            }

            // last step: select the target message
            await selectMessage.mutateAsync({
                chatId: newChatId,
                messageSetId: messageSetIdMap[messageSetId],
                messageId: messageIdMap[messageId],
                blockType: "tools",
            });

            if (replyToId) {
                await db.execute(
                    "UPDATE messages SET reply_chat_id = ? WHERE id = ?",
                    [newChatId, messageId],
                );

                // Set the reply model config to the model of the message being replied to
                const replyMessage = await db.select<{ model: string }[]>(
                    "SELECT model FROM messages WHERE id = ?",
                    [replyToId],
                );

                if (replyMessage.length > 0) {
                    await updateSavedModelConfigChat(newChatId, [
                        replyMessage[0].model,
                    ]);
                }
            }

            return newChatId;
        },
        onSuccess: async (newChatId: string) => {
            if (replyToId) {
                posthog.capture("reply_created", {
                    chatId,
                    newChatId,
                    messageId,
                    replyToId,
                });
                // Navigate to the parent chat with the replyId query parameter
                navigate(`/chat/${chatId}?replyId=${newChatId}`);
            } else {
                // Normal branch navigation
                navigate(`/chat/${newChatId}`);
            }
            await queryClient.invalidateQueries(chatQueries.list());
        },
    });
}

export function useSetReviewsEnabled() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["setReviewsEnabled"] as const,
        mutationFn: async ({ enabled }: { enabled: boolean }) => {
            await db.execute(
                "UPDATE app_metadata SET value = $1 WHERE key = 'reviews_enabled'",
                [enabled ? "true" : "false"],
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: appMetadataKeys.appMetadata(),
            });
        },
    });
}

/**
 * Specifically for message parts (tools) messages
 */
export function useRestartMessage(
    chatId: string,
    messageSetId: string,
    messageId: string,
) {
    const queryClient = useQueryClient();
    const streamToolsMessage = useStreamToolsMessage();

    return useMutation({
        mutationKey: ["restartMessage"] as const,
        mutationFn: async ({
            modelConfig,
        }: {
            modelConfig: Models.ModelConfig;
        }) => {
            const streamingToken = uuidv4();
            const lockResult = await db.execute(
                `UPDATE messages
                SET text = '', error_message = NULL, streaming_token = $1, state = 'streaming'
                WHERE id = $2 AND state = 'idle' AND streaming_token IS NULL`,
                [streamingToken, messageId],
            );
            if (lockResult.rowsAffected === 0) {
                console.log(
                    "Not restarting because lock could not be acquired",
                );
                return undefined;
            }
            const deleteResult = await db.execute(
                `DELETE FROM message_parts
                WHERE message_id IN (
                    SELECT id
                    FROM messages
                    WHERE id = $1 AND state = 'streaming' AND streaming_token = $2
                )`,
                [messageId, streamingToken],
            );
            if (deleteResult.rowsAffected === 0) {
                console.log(
                    "Restart interrupted because streaming lock was lost",
                );
                return undefined;
            }

            // invalidate to show empty text + streaming state
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(chatId),
            });

            await streamToolsMessage.mutateAsync({
                chatId,
                messageSetId,
                messageId,
                streamingToken,
                modelConfig,
            });

            return streamingToken;
        },
        onSuccess: async () => {
            // defensive: invalidate message set
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(chatId),
            });

            // defensive: invalidate chatIsLoading
            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(chatId),
            );
        },
    });
}

/**
 * Uses the old message text field rather than message parts
 */
export function useRestartMessageLegacy(
    chatId: string,
    messageSetId: string,
    messageId: string,
) {
    const queryClient = useQueryClient();
    const streamMessageText = useStreamMessageLegacy();
    const getMessageSets = useGetMessageSets();
    const deleteReviews = useDeleteReviews();
    const generateReviews = useGenerateReviews();

    return useMutation({
        mutationKey: ["restartMessageLegacy"] as const,
        mutationFn: async ({
            modelConfig,
        }: {
            modelConfig: Models.ModelConfig;
        }) => {
            const streamingToken = uuidv4();
            const result = await db.execute(
                `UPDATE messages
                SET text = '', error_message = NULL, streaming_token = $1, state = 'streaming'
                WHERE id = $2 AND state = 'idle' AND streaming_token IS NULL`,
                [streamingToken, messageId],
            );

            if (result.rowsAffected === 0) {
                console.warn(
                    "failed to restart message - lock may have been unavailable for messageId:",
                    messageId,
                );
                return;
            }

            // Delete any existing reviews (if applicable)
            await deleteReviews.mutateAsync({
                chatId,
                messageSetId,
            });

            // invalidate to show empty text + streaming state
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(chatId),
            });

            const messageSets = await getMessageSets(chatId);

            // assume this is the last message set
            const previousMessageSets = messageSets?.slice(0, -1);
            const conversation = llmConversation(previousMessageSets);

            await streamMessageText.mutateAsync({
                chatId,
                messageSetId,
                messageId,
                conversation,
                modelConfig,
                streamingToken,
                messageType: "vanilla",
            });

            await generateReviews.mutateAsync({
                chatId,
                messageSetId,
            });

            return streamingToken;
        },
        onSuccess: async () => {
            // defensive: invalidate message set
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(chatId),
            });

            // defensive: invalidate projects
            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(chatId),
            );
        },
    });
}

/**
 * Stops ALL streaming on a message
 */
export function useStopMessage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["stopMessage"] as const,
        mutationFn: async ({
            messageId,
        }: {
            chatId: string;
            messageId: string;
        }) => {
            await db.execute(
                "UPDATE messages SET streaming_token = NULL, state = 'idle' WHERE id = $1",
                [messageId],
            );
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });

            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(variables.chatId),
            );
        },
    });
}

type PartStreamResult =
    | {
          result: "success";
          toolCalls?: UserToolCall[];
      }
    | {
          result: "error";
          errorMessage: string;
      };

export function useStreamMessagePart() {
    const queryClient = useQueryClient();
    const getToolsets = useGetToolsets();

    return useMutation({
        mutationKey: ["streamMessagePart"] as const,
        mutationFn: async ({
            chatId,
            messageSetId,
            messageId,
            partLevel,
            conversation,
            modelConfig: modelConfigRaw,
            streamingToken,
            tools,
        }: {
            chatId: string;
            messageSetId: string;
            messageId: string;
            partLevel: number;
            conversation: LLMMessage[];
            modelConfig: Models.ModelConfig;
            streamingToken: string;
            tools: UserTool[];
        }): Promise<PartStreamResult> => {
            // get api keys
            const apiKeys = await getApiKeys();
            const chat = await queryClient.ensureQueryData(
                chatQueries.detail(chatId),
            );
            console.log(chat);
            const project = await queryClient.ensureQueryData(
                projectQueries.detail(chat.projectId),
            );

            // streamPromise will be resolved when streaming completes
            let resolveStreamPromise: (
                value: PartStreamResult | PromiseLike<PartStreamResult>,
            ) => void;
            const streamPromise = new Promise<PartStreamResult>((resolve) => {
                resolveStreamPromise = resolve;
            });

            let partialResponse = "";
            let priority = 0;
            const streamKey = UpdateQueue.getInstance().startUpdateStream();

            const updateMessagePartInCache = (
                text: string,
                streamingToken: string,
            ) => {
                queryClient.setQueryData(
                    messageKeys.messageSets(chatId),
                    (old: MessageSetDetail[] | undefined) =>
                        produce(old, (draft) => {
                            if (draft === undefined) return;
                            const messageSet = draft.find(
                                (ms) => ms.id === messageSetId,
                            );
                            if (!messageSet) {
                                return;
                            }
                            const message =
                                messageSet.toolsBlock.chatMessages.find(
                                    (m) =>
                                        m.id === messageId &&
                                        m.streamingToken === streamingToken,
                                );
                            if (!message) {
                                return;
                            }
                            const part = message.parts.find(
                                (p) => p.level === partLevel,
                            );
                            if (!part) {
                                return;
                            }
                            part.content = text;
                        }),
                );
            };

            const onChunk = (chunk: string) => {
                partialResponse += chunk;
                priority += 1;

                // optimistic update
                updateMessagePartInCache(partialResponse, streamingToken);

                UpdateQueue.getInstance().addUpdate(
                    streamKey,
                    priority,
                    async () => {
                        const res = await db.execute(
                            `UPDATE message_parts SET content = $1
                            FROM messages
                            WHERE message_parts.message_id = messages.id
                            AND message_parts.chat_id = $2
                            AND message_parts.message_id = $3
                            AND message_parts.level = $4
                            AND messages.streaming_token = $5`,
                            [
                                partialResponse,
                                chatId,
                                messageId,
                                partLevel,
                                streamingToken,
                            ],
                        );
                        if (!res) {
                            console.debug(
                                "Skipped message part update. This could be because the user hit the stop button.",
                            );
                        }
                    },
                );
            };

            const onComplete = async (
                finalText: string | undefined,
                toolCalls?: UserToolCall[],
                usageData?: UsageData,
            ) => {
                // if the provider didn't give us final text, then we use the
                // one we've been accumulating
                finalText = finalText ?? partialResponse;

                // optimistic update
                updateMessagePartInCache(finalText, streamingToken);

                const hasToolCalls = toolCalls && toolCalls.length > 0;

                // Calculate cost - use OpenRouter's actual cost when available
                let costUsd: number | undefined;
                let actualPromptTokens = usageData?.prompt_tokens;
                let actualCompletionTokens = usageData?.completion_tokens;

                // For OpenRouter models with generation ID, fetch actual costs
                if (
                    usageData?.generation_id &&
                    modelConfig.modelId.startsWith("openrouter::") &&
                    apiKeys.openrouter
                ) {
                    const openRouterCost = await fetchOpenRouterCost(
                        usageData.generation_id,
                        apiKeys.openrouter,
                    );
                    if (openRouterCost) {
                        costUsd = openRouterCost.cost;
                        // Use native token counts from OpenRouter
                        actualPromptTokens = openRouterCost.promptTokens;
                        actualCompletionTokens =
                            openRouterCost.completionTokens;
                    }
                }

                // Fallback to calculated cost for non-OpenRouter or if fetch failed
                if (
                    costUsd === undefined &&
                    usageData?.prompt_tokens !== undefined &&
                    usageData?.completion_tokens !== undefined &&
                    modelConfig.promptPricePerToken !== undefined &&
                    modelConfig.completionPricePerToken !== undefined
                ) {
                    costUsd = calculateCost(
                        usageData.prompt_tokens,
                        usageData.completion_tokens,
                        modelConfig.promptPricePerToken,
                        modelConfig.completionPricePerToken,
                    );
                }

                // Update message part in the db
                const res = await db.execute(
                    `UPDATE message_parts
                    SET content = $1, tool_calls = $2
                    FROM messages
                    WHERE message_parts.message_id = messages.id
                    AND message_parts.chat_id = $3
                    AND message_parts.message_id = $4
                    AND message_parts.level = $5
                    AND messages.streaming_token = $6`,
                    [
                        finalText,
                        hasToolCalls ? JSON.stringify(toolCalls) : null,
                        chatId,
                        messageId,
                        partLevel,
                        streamingToken,
                    ],
                );
                if (!res) {
                    console.debug(
                        "Skipped message part update. This could be because the user hit the stop button.",
                    );
                }

                // Update message with usage and cost data
                // Accumulate costs across multiple message parts (e.g., tool call rounds)
                // Only update fields when we have actual values - preserve NULL for unknown costs
                if (usageData) {
                    const hasTokens =
                        actualPromptTokens !== undefined &&
                        actualCompletionTokens !== undefined;
                    const hasCost = costUsd !== undefined;

                    if (hasTokens || hasCost) {
                        // Build SET clause dynamically to avoid writing 0 for unknown values
                        // Use a helper to track the next parameter index (1-based for SQL)
                        let paramIndex = 1;
                        const setClauses: string[] = [];
                        const params: (number | string)[] = [];

                        if (
                            actualPromptTokens !== undefined &&
                            actualCompletionTokens !== undefined
                        ) {
                            setClauses.push(
                                `prompt_tokens = COALESCE(prompt_tokens, 0) + $${paramIndex++}`,
                            );
                            params.push(actualPromptTokens);
                            setClauses.push(
                                `completion_tokens = COALESCE(completion_tokens, 0) + $${paramIndex++}`,
                            );
                            params.push(actualCompletionTokens);
                            setClauses.push(
                                `total_tokens = COALESCE(total_tokens, 0) + $${paramIndex++}`,
                            );
                            params.push(
                                actualPromptTokens + actualCompletionTokens,
                            );
                        }

                        if (costUsd !== undefined) {
                            setClauses.push(
                                `cost_usd = COALESCE(cost_usd, 0) + $${paramIndex++}`,
                            );
                            params.push(costUsd);
                        }

                        // Add WHERE clause parameters (increment both for consistency, even though
                        // paramIndex isn't used after this - makes the code more obviously correct)
                        const messageIdParamIndex = paramIndex++;
                        const streamingTokenParamIndex = paramIndex++;
                        params.push(messageId, streamingToken);

                        await db.execute(
                            `UPDATE messages
                            SET ${setClauses.join(", ")}
                            WHERE id = $${messageIdParamIndex} AND streaming_token = $${streamingTokenParamIndex}`,
                            params,
                        );
                    }

                    // Update chat and project costs efficiently
                    const projectId = await updateChatAndProjectCosts(chatId);

                    // Invalidate queries to refresh UI with updated costs
                    await queryClient.invalidateQueries(chatQueries.list());
                    await queryClient.invalidateQueries(
                        chatQueries.detail(chatId),
                    );
                    if (projectId) {
                        await queryClient.invalidateQueries(
                            projectQueries.list(),
                        );
                    }
                }

                // do not set message to idle, since we may stream more parts later
                UpdateQueue.getInstance().closeUpdateStream(streamKey);

                // Resolve with tool calls if we have them
                resolveStreamPromise({ result: "success", toolCalls });
            };

            const onError = (errorMessage: string) => {
                console.log(
                    `streaming for ${messageId} ${partLevel} ending with error`,
                    errorMessage,
                );

                UpdateQueue.getInstance().closeUpdateStream(streamKey);
                resolveStreamPromise({ result: "error", errorMessage });
            };

            // inject system prompts
            const toolsets = await getToolsets();
            const appMetadata = await queryClient.ensureQueryData({
                queryKey: appMetadataKeys.appMetadata(),
                queryFn: () => fetchAppMetadata(),
            });
            const modelConfig = Prompts.injectSystemPrompts(modelConfigRaw, {
                toolsetInfo: toolsets.map((toolset) => ({
                    displayName: toolset.displayName,
                    description: toolset.description,
                    status: toolset.status,
                })),
                isInProject: project.id !== "default",
                universalSystemPrompt: appMetadata["universal_system_prompt"],
            });

            const customBaseUrl = await getCustomBaseUrl();

            const params: Models.StreamResponseParams = {
                modelConfig,
                llmConversation: conversation,
                tools,
                onChunk,
                onComplete,
                onError,
                apiKeys,
                customBaseUrl,
            };

            void Models.streamResponse(params);
            return streamPromise;
        },
        onSettled: async (_data, _error, variables, _context) => {
            // invalidate the message set to trigger a re-fetch
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

/**
 * Uses the old message text field rather than message parts
 */
export function useStreamMessageLegacy() {
    const queryClient = useQueryClient();
    const getProjectContext = useGetProjectContextLLMMessage();

    // overall strategy: mutation is long-running, handles the entire stream
    // it makes optimistic cache updates along the way
    // when it resolves (success or error), it invalidates the message set

    return useMutation({
        mutationKey: ["streamMessageLegacy"] as const,
        mutationFn: async ({
            chatId,
            messageSetId,
            messageId,
            conversation: conversationRaw,
            modelConfig: modelConfigRaw,
            streamingToken,
            messageType,
        }: {
            chatId: string;
            messageSetId: string;
            messageId: string;
            conversation: LLMMessage[];
            modelConfig: Models.ModelConfig;
            streamingToken: string;
            messageType: "vanilla" | "review" | "brainstorm";
        }): Promise<void> => {
            // get api keys and tools
            const apiKeys = await getApiKeys();

            const chat = await queryClient.ensureQueryData(
                chatQueries.detail(chatId),
            );
            const project = await queryClient.ensureQueryData(
                projectQueries.detail(chat.projectId),
            );

            const appMetadata = await queryClient.ensureQueryData({
                queryKey: appMetadataKeys.appMetadata(),
                queryFn: () => fetchAppMetadata(),
            });
            const modelConfig = Prompts.injectSystemPrompts(modelConfigRaw, {
                isInProject: project.id !== "default",
                universalSystemPrompt: appMetadata["universal_system_prompt"],
            });

            const projectContext = await getProjectContext(project.id, chatId);
            const llmConversation = [...projectContext, ...conversationRaw];

            // streamPromise will be resolved when streaming completes
            let resolveStreamPromise: () => void;
            let rejectStreamPromise: (reason?: unknown) => void;
            const streamPromise = new Promise<void>((resolve, reject) => {
                resolveStreamPromise = resolve;
                rejectStreamPromise = reject;
            });

            // see https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates for template
            let partialResponse = "";
            let priority = 0;
            const streamKey = UpdateQueue.getInstance().startUpdateStream();

            const optimisticUpdateMessageText = (
                messageId: string,
                text: string,
                streamingToken: string,
            ) => {
                queryClient.setQueryData(
                    messageKeys.messageSets(chatId),
                    (old: MessageSetDetail[]) =>
                        updateMessageSets({
                            messageSets: old,
                            predicate: (ms) => ms.id === messageSetId,
                            update: (ms) =>
                                updateMessageText({
                                    messageSet: ms,
                                    predicate: (message) =>
                                        message.id === messageId &&
                                        message.streamingToken ===
                                            streamingToken,
                                    update: (message) => ({ ...message, text }),
                                }),
                        }),
                );
            };

            const onChunk = (chunk: string) => {
                partialResponse += chunk;
                priority += 1;

                // optimistic update
                optimisticUpdateMessageText(
                    messageId,
                    partialResponse,
                    streamingToken,
                );

                UpdateQueue.getInstance().addUpdate(
                    streamKey,
                    priority,
                    async () =>
                        await db.execute(
                            "UPDATE messages SET text = $1 WHERE id = $2 AND streaming_token = $3",
                            [partialResponse, messageId, streamingToken],
                        ),
                );
            };

            const onComplete = async (
                finalText: string | undefined,
                toolCalls?: UserToolCall[],
                usageData?: UsageData,
            ) => {
                if (toolCalls && toolCalls.length > 0) {
                    console.error("Dropping unexpected tool calls", toolCalls);
                }
                // if the provider didn't give us final text, then we use the
                // one we've been accumulating
                finalText = finalText ?? partialResponse;

                // optimistic update
                optimisticUpdateMessageText(
                    messageId,
                    finalText,
                    streamingToken,
                );

                // Calculate cost - use OpenRouter's actual cost when available
                let costUsd: number | undefined;
                let actualPromptTokens = usageData?.prompt_tokens;
                let actualCompletionTokens = usageData?.completion_tokens;

                // For OpenRouter models with generation ID, fetch actual costs
                if (
                    usageData?.generation_id &&
                    modelConfig.modelId.startsWith("openrouter::") &&
                    apiKeys.openrouter
                ) {
                    const openRouterCost = await fetchOpenRouterCost(
                        usageData.generation_id,
                        apiKeys.openrouter,
                    );
                    if (openRouterCost) {
                        costUsd = openRouterCost.cost;
                        // Use native token counts from OpenRouter
                        actualPromptTokens = openRouterCost.promptTokens;
                        actualCompletionTokens =
                            openRouterCost.completionTokens;
                    }
                }

                // Fallback to calculated cost for non-OpenRouter or if fetch failed
                if (
                    costUsd === undefined &&
                    usageData?.prompt_tokens !== undefined &&
                    usageData?.completion_tokens !== undefined &&
                    modelConfig.promptPricePerToken !== undefined &&
                    modelConfig.completionPricePerToken !== undefined
                ) {
                    costUsd = calculateCost(
                        usageData.prompt_tokens,
                        usageData.completion_tokens,
                        modelConfig.promptPricePerToken,
                        modelConfig.completionPricePerToken,
                    );
                }

                // Update the message in the database including tool calls if present
                // Use actual token counts (from OpenRouter when available, otherwise from usage data)
                const totalTokens =
                    actualPromptTokens !== undefined &&
                    actualCompletionTokens !== undefined
                        ? actualPromptTokens + actualCompletionTokens
                        : (usageData?.total_tokens ?? null);

                await db.execute(
                    `UPDATE messages
                    SET streaming_token = NULL, state = 'idle', text = ?,
                        prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, cost_usd = ?
                    WHERE id = ? AND streaming_token = ?`,
                    [
                        finalText,
                        actualPromptTokens ?? null,
                        actualCompletionTokens ?? null,
                        totalTokens,
                        costUsd ?? null,
                        messageId,
                        streamingToken,
                    ],
                );

                // Update chat and project costs if we have usage data
                if (usageData) {
                    const projectId = await updateChatAndProjectCosts(chatId);

                    // Invalidate queries to refresh UI with updated costs
                    await queryClient.invalidateQueries(chatQueries.list());
                    await queryClient.invalidateQueries(
                        chatQueries.detail(chatId),
                    );
                    if (projectId) {
                        await queryClient.invalidateQueries(
                            projectQueries.list(),
                        );
                    }
                }

                UpdateQueue.getInstance().closeUpdateStream(streamKey);

                // invalidate to ensure consistency
                await queryClient.invalidateQueries({
                    queryKey: messageKeys.messageSets(chatId),
                });

                resolveStreamPromise();
            };

            const onError = async (errorMessage: string) => {
                console.warn(
                    "streaming error (will be saved in db)",
                    errorMessage,
                );
                await db.execute(
                    `UPDATE messages
                    SET streaming_token = NULL, state = 'idle', error_message = $1
                        WHERE id = $2 AND streaming_token = $3`,
                    [errorMessage, messageId, streamingToken],
                );
                UpdateQueue.getInstance().closeUpdateStream(streamKey);

                // invalidate to ensure consistency
                await queryClient.invalidateQueries({
                    queryKey: messageKeys.messageSets(chatId),
                });
                rejectStreamPromise(errorMessage);
            };

            const customBaseUrl = await getCustomBaseUrl();

            const params: Models.StreamResponseParams = {
                modelConfig,
                llmConversation,
                tools: [],
                onChunk,
                onComplete,
                onError: (errorMessage) => void onError(errorMessage),
                apiKeys,
                customBaseUrl,
            };

            switch (messageType) {
                case "review":
                case "brainstorm":
                case "vanilla": {
                    void Models.streamResponse(params);
                    break;
                }
                default: {
                    const unknownType: never = messageType;
                    throw new Error(
                        `Unknown message type: ${JSON.stringify(unknownType)}`,
                    );
                }
            }

            return streamPromise;
        },
        onMutate: async (variables) => {
            // invalidate to show loading state
            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(variables.chatId),
            );
        },
        onSuccess: async (_data, variables, _context) => {
            // invalidate the message set to trigger a re-fetch
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });

            // invalidate to stop showing loading state
            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(variables.chatId),
            );
        },
    });
}

export function useCreateMessageSetPair() {
    return useMutation({
        mutationKey: ["createMessageSetPair"] as const,
        mutationFn: async ({
            chatId,
            userMessageSetParent,
            selectedBlockType,
        }: {
            chatId: string;
            userMessageSetParent: MessageSet | undefined;
            selectedBlockType: BlockType;
        }) => {
            const userMessageSetId = uuidv4();
            const aiMessageSetId = uuidv4();

            // possible (but extremely hypothetical) race condition here because this is not in a transaction

            // stop streaming on all previous messages (except review messages)
            await db.execute(
                `UPDATE messages SET streaming_token = NULL, state = 'idle'
                    WHERE chat_id = $1 AND state = 'streaming' AND is_review <> 1`,
                [chatId],
            );

            // Calculate user message set level based on parent
            const userLevel = userMessageSetParent
                ? userMessageSetParent.level + 1
                : 0;

            await db.execute(
                "INSERT INTO message_sets (id, chat_id, level, type, selected_block_type) VALUES ($1, $2, $3, $4, $5)",
                [userMessageSetId, chatId, userLevel, "user", "user"],
            );

            // AI message is always one level after the user message
            const aiLevel = userLevel + 1;

            await db.execute(
                "INSERT INTO message_sets (id, chat_id, level, type, selected_block_type) VALUES ($1, $2, $3, $4, $5)",
                [aiMessageSetId, chatId, aiLevel, "ai", selectedBlockType],
            );

            return { userMessageSetId, aiMessageSetId };
        },
    });
}

export function useCreateMessagePart() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["createMessagePart"] as const,
        mutationFn: async ({
            messagePart,
            streamingToken,
        }: {
            messagePart: MessagePart;
            messageSetId: string;
            streamingToken: string;
        }) => {
            await db.execute(
                `INSERT INTO message_parts (
                    chat_id,
                    message_id,
                    level,
                    content,
                    tool_calls,
                    tool_results
                )
                SELECT $1, $2, $3, $4, $5, $6
                WHERE EXISTS (SELECT 1 FROM messages WHERE streaming_token = $7);`,
                [
                    messagePart.chatId,
                    messagePart.messageId,
                    messagePart.level,
                    messagePart.content,
                    messagePart.toolCalls,
                    messagePart.toolResults,
                    streamingToken,
                ],
            );
        },
        onSuccess: (_data, variables, _context) => {
            // keep cache in sync
            queryClient.setQueryData(
                messageKeys.messageSets(variables.messagePart.chatId),
                (old: MessageSetDetail[] | undefined) =>
                    produce(old, (draft) => {
                        if (draft === undefined) return;
                        const messageSet = draft.find(
                            (ms) => ms.id === variables.messageSetId,
                        );
                        if (!messageSet) {
                            console.warn(
                                "[createMessagePart] message set not found",
                                variables.messageSetId,
                            );
                            return;
                        }
                        const message = messageSet.toolsBlock.chatMessages.find(
                            (m) => m.id === variables.messagePart.messageId,
                        );
                        if (!message) {
                            console.warn(
                                "[createMessagePart] message not found",
                                variables.messagePart.messageId,
                            );
                            return;
                        }
                        message.parts.push(variables.messagePart);
                    }),
            );
        },
    });
}

export function useCreateMessage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["createMessage"] as const,
        mutationFn: async ({
            message,
            options,
        }: {
            message: Omit<
                Message,
                "id" | "streamingToken" | "parts" | "attachments"
            >;
            options?: {
                // always: create regardless of other messages in the set
                // first: create only if this is the first message in the set
                // unique_model: create only if there's no other message in the set from the same model
                mode: "always" | "first" | "unique_model";
            };
        }) => {
            options = {
                mode: "unique_model",
                ...options,
            };

            const messageId = uuidv4();
            const state = "streaming";
            const streamingToken = uuidv4();

            const result = await db.execute(
                `INSERT INTO messages (
                    id,
                    chat_id,
                    message_set_id,
                    text,
                    model,
                    selected,
                    state,
                    streaming_token,
                    is_review,
                    review_state,
                    block_type,
                    level
                ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${
                    message.level !== undefined
                        ? `$12` // use provided level
                        : `(
                            -- automatically set level
                            SELECT COALESCE(MAX(level), -1) + 1
                            FROM messages
                            WHERE message_set_id = $3 AND block_type = $11
                          )`
                }
                ${
                    options.mode === "first"
                        ? `WHERE NOT EXISTS (
                                SELECT 1 FROM messages 
                                WHERE message_set_id = $3 AND block_type = $11
                            )`
                        : options.mode === "unique_model"
                          ? `WHERE NOT EXISTS (
                                SELECT 1 FROM messages 
                                WHERE message_set_id = $3 AND block_type = $11 AND model = $5
                            )`
                          : ""
                }`,
                [
                    messageId,
                    message.chatId,
                    message.messageSetId,
                    message.text,
                    message.model,
                    message.selected ? 1 : 0,
                    state,
                    streamingToken,
                    message.isReview ? 1 : 0,
                    message.reviewState ?? null,
                    message.blockType,
                    message.level,
                ],
            );

            // Return null if no insert happened (message already exists)
            return result.rowsAffected > 0
                ? { messageId, streamingToken }
                : undefined;
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.message.chatId),
            });
        },
    });
}

/**
 * Stops streaming for a particular streaming token
 */
function useStopMessageStreaming() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["stopMessageStreaming"] as const,
        mutationFn: async ({
            messageId,
            streamingToken,
            errorMessage,
        }: {
            chatId: string;
            messageId: string;
            streamingToken: string;
            errorMessage?: string;
        }) => {
            if (errorMessage) {
                await db.execute(
                    `UPDATE messages
                    SET streaming_token = NULL, state = 'idle', error_message = $1
                        WHERE id = $2 AND streaming_token = $3`,
                    [errorMessage, messageId, streamingToken],
                );
            } else {
                await db.execute(
                    `UPDATE messages
                    SET streaming_token = NULL, state = 'idle'
                        WHERE id = $1 AND streaming_token = $2`,
                    [messageId, streamingToken],
                );
            }
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.messageId),
            });
            // invalidate to stop showing loading state
            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(variables.chatId),
            );
        },
    });
}

/**
 * Selects the given message and deselects all other messages in the block.
 * Can be used with both compare blocks and connections/tools blocks.
 */
export function useSelectMessage() {
    const queryClient = useQueryClient();
    const markProjectContextSummaryAsStale =
        useMarkProjectContextSummaryAsStale();

    return useMutation({
        mutationKey: ["selectMessage"] as const,
        mutationFn: async ({
            messageSetId,
            messageId,
            blockType,
        }: {
            chatId: string;
            messageSetId: string;
            messageId: string;
            blockType: BlockType;
        }) => {
            if (!["compare", "tools"].includes(blockType)) {
                console.warn(
                    "selectMessage used with unexpected block type",
                    blockType,
                );
            }

            await db.execute(
                "UPDATE messages SET selected = (CASE WHEN id = ? THEN 1 ELSE 0 END) WHERE message_set_id = ? AND block_type = ?",
                [messageId, messageSetId, blockType],
            );
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });

            await markProjectContextSummaryAsStale.mutateAsync({
                chatId: variables.chatId,
            });
        },
    });
}

/**
 * Updates the selected_block_type field in a message set,
 * and also the current_block_type field in app_metadata
 */
export function useSelectBlock() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["selectBlock"] as const,
        mutationFn: async ({
            blockType,
            messageSetId,
        }: {
            chatId: string;
            blockType: BlockType;
            messageSetId: string;
        }) => {
            // Update both the message set and the app metadata
            await db.execute(
                `UPDATE message_sets SET selected_block_type = $1 WHERE id = $2;
            UPDATE app_metadata SET value = $1 WHERE key = 'current_block_type'`,
                [blockType, messageSetId],
            );
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });

            posthog?.capture("block_selected", {
                blockType: variables.blockType,
            });
        },
    });
}

export function useSelectAndPopulateBlock(
    chatId: string,
    isQuickChatWindow: boolean,
) {
    const selectBlock = useSelectBlock();
    const populateBlock = usePopulateBlock(chatId, isQuickChatWindow);

    return useMutation({
        mutationKey: ["selectAndPopulateBlock"] as const,
        mutationFn: async ({
            messageSetId,
            blockType,
        }: {
            messageSetId: string;
            blockType: BlockType;
        }) => {
            await selectBlock.mutateAsync({
                chatId,
                blockType,
                messageSetId,
            });

            await populateBlock.mutateAsync({
                messageSetId,
                blockType,
            });
        },
        // no need to invalidate because useSelectBlock and usePopulateBlock will do it
    });
}

/**
 * Precondition: no other messages are selected
 */
export function useStreamSynthesis() {
    const queryClient = useQueryClient();
    const getMessageSets = useGetMessageSets();
    const createMessage = useCreateMessage();
    const streamMessageText = useStreamMessageLegacy();

    return useMutation({
        mutationKey: ["streamSynthesis"] as const,
        mutationFn: async ({
            chatId,
            messageSetId,
        }: {
            chatId: string;
            messageSetId: string;
        }) => {
            const messageSets = await getMessageSets(chatId);
            if (
                messageSets
                    .find((m) => m.id === messageSetId)
                    ?.compareBlock?.messages.some(
                        (m) => m.model === "chorus::synthesize",
                    )
            ) {
                console.debug(
                    "Skipping synthesis because it already exists",
                    messageSetId,
                );
                return;
            }

            const modelConfig = (
                await queryClient.ensureQueryData(
                    modelConfigQueries.listConfigs(),
                )
            ).find((m) => m.id === "chorus::synthesize")!;
            if (!modelConfig) {
                throw new Error("Synthesis model config not found");
            }

            posthog.capture("synthesize_created");

            const result = await createMessage.mutateAsync({
                message: createAIMessage({
                    chatId,
                    messageSetId,
                    blockType: "compare",
                    model: "chorus::synthesize",
                    selected: true, // auto-select the synthesis response
                }),
                options: {
                    mode: "unique_model",
                },
            });
            const { messageId, streamingToken } = result!;

            const conversation = llmConversationForSynthesis(messageSets);

            await streamMessageText.mutateAsync({
                chatId,
                messageSetId,
                messageId,
                conversation,
                modelConfig,
                streamingToken,
                messageType: "vanilla",
            });
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

export function useSelectSynthesis() {
    const queryClient = useQueryClient();
    const streamSynthesis = useStreamSynthesis();

    return useMutation({
        mutationKey: ["selectSynthesis"] as const,
        mutationFn: async ({
            messageSetId,
        }: {
            chatId: string;
            messageSetId: string;
        }) => {
            await db.execute(
                `UPDATE messages SET selected = (
                    CASE WHEN model = $2 THEN 1 ELSE 0 END
                ) WHERE message_set_id = $1 AND block_type = 'compare'`,
                [messageSetId, "chorus::synthesize"],
            );
        },
        onSuccess: async (_data, variables, _context) => {
            // invalidate to trigger re-fetch
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });

            // invoke synthesis
            await streamSynthesis.mutateAsync({
                chatId: variables.chatId,
                messageSetId: variables.messageSetId,
            });
        },
    });
}

export function useApplyRevision() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["applyRevision"] as const,
        mutationFn: async ({
            messageSetId,
            reviewMessage,
        }: {
            chatId: string;
            messageSetId: string;
            reviewMessage: Message;
        }) => {
            // set this revision to applied, and all other revisions to NULL state
            await db.execute(
                "UPDATE messages SET review_state = (CASE WHEN id = $1 THEN 'applied' ELSE NULL END) WHERE message_set_id = $2 AND block_type = 'chat'",
                [reviewMessage.id, messageSetId],
            );
        },
        onSuccess: async (_data, variables, _context) => {
            posthog?.capture("revision_applied", {
                reviewer: variables.reviewMessage.model,
            });

            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

export function useEditMessage(chatId: string, isQuickChatWindow: boolean) {
    const queryClient = useQueryClient();
    const populateBlock = usePopulateBlock(chatId, isQuickChatWindow);

    const forceRefreshMessageSets = useForceRefreshMessageSets();

    return useMutation({
        mutationKey: ["editMessage"] as const,
        mutationFn: async ({
            messageId,
            messageSetId,
            newText,
        }: {
            messageId: string;
            messageSetId: string;
            newText: string;
        }) => {
            // 1. Update the user message text
            await db.execute("UPDATE messages SET text = ? WHERE id = ?", [
                newText,
                messageId,
            ]);

            // 2. Get message sets from the cache
            const messageSets = await queryClient.ensureQueryData({
                queryKey: messageKeys.messageSets(chatId),
                queryFn: () => fetchMessageSets(chatId),
            });

            // Find the next message set (if any)
            const messageSet = messageSets.find((ms) => ms.id === messageSetId);
            if (!messageSet) {
                return;
            }
            const nextMessageSet = messageSets.find(
                (ms) => ms.level === messageSet.level + 1,
            );
            if (!nextMessageSet) {
                return;
            }

            // Delete all messages in next AI message set
            await db.execute("DELETE FROM messages WHERE message_set_id = ?", [
                nextMessageSet.id,
            ]);

            // 4a. Delete all messages beyond next AI message set
            await db.execute(
                `DELETE FROM messages
                 WHERE message_set_id IN (
                     SELECT id FROM message_sets WHERE chat_id = ? AND level > ?
                 )`,
                [chatId, messageSet.level + 1],
            );

            // 4b. Delete all message sets beyond next AI message set
            await db.execute(
                "DELETE FROM message_sets WHERE chat_id = ? AND level > ?",
                [chatId, messageSet.level + 1],
            );

            // force refresh so that UI will update and populateBlock will work
            await forceRefreshMessageSets(chatId);

            // 5. Re-populate the next AI message set selected block
            await populateBlock.mutateAsync({
                messageSetId: nextMessageSet.id,
                blockType: nextMessageSet.selectedBlockType,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(chatId),
            });
        },
    });
}

export function useUnapplyRevisions() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["unapplyRevisions"] as const,
        mutationFn: async ({
            messageSetId,
        }: {
            chatId: string;
            messageSetId: string;
        }) => {
            await db.execute(
                "UPDATE messages SET review_state = NULL WHERE message_set_id = $1 AND block_type = 'chat'",
                [messageSetId],
            );
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

/**
 * Deletes all reviews for a message set
 * Can be used to set up a message set for reviews to be freshly generated
 */
export function useDeleteReviews() {
    const queryClient = useQueryClient();
    const { isQuickChatWindow } = useAppContext();

    return useMutation({
        mutationKey: ["deleteReviews"] as const,
        mutationFn: async ({
            chatId: _chatId,
            messageSetId,
        }: {
            chatId: string;
            messageSetId: string;
        }) => {
            if (isQuickChatWindow) return { skipped: true };

            await db.execute(
                "DELETE FROM messages WHERE message_set_id = $1 AND is_review = 1 AND block_type = 'chat'",
                [messageSetId],
            );
        },
        onSuccess: async (data, variables, _context) => {
            if (data?.skipped) return;

            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

/**
 * Apply a revision in a destructive way (overwriting original text) and delete all reviews
 * Can be used to set up a message set for reviews to be freshly generated
 */
export function useHardApplyAndDeleteReviews() {
    const deleteReviews = useDeleteReviews();

    return useMutation({
        mutationKey: ["hardApplyAndDeleteReviews"] as const,
        mutationFn: async ({
            chatId,
            messageSetId,
            revision,
        }: {
            chatId: string;
            messageSetId: string;
            revision: string;
        }) => {
            // overwrite the main chat message with the revision text
            await db.execute(
                `UPDATE messages SET text = $1 WHERE message_set_id = $2 AND is_review = 0 AND block_type = 'chat'`,
                [revision, messageSetId],
            );

            // delete all reviews
            await deleteReviews.mutateAsync({
                chatId,
                messageSetId,
            });
        },
    });
}

export function useDeselectSynthesis() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["deselectSynthesis"] as const,
        mutationFn: async ({
            messageSetId,
        }: {
            chatId: string;
            messageSetId: string;
        }) => {
            const result = await db.execute(
                `
        WITH to_select AS (
            SELECT id
            FROM messages
            WHERE message_set_id = $1 AND model <> $2
            LIMIT 1
        )
        UPDATE messages SET selected = (
            CASE WHEN id = (SELECT id FROM to_select) THEN 1 ELSE 0 END
        ) WHERE message_set_id = $1 AND block_type = 'compare'
        `,
                [messageSetId, "chorus::synthesize"],
            );
            return result.rowsAffected > 0;
        },
        onSuccess: async (_data, variables, _context) => {
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

export function useSummarizeChat() {
    const queryClient = useQueryClient();
    const getMessageSets = useGetMessageSets();

    return useMutation({
        mutationKey: ["summarizeChat"] as const,
        mutationFn: async ({
            chatId,
            forceRefresh,
            source,
        }: {
            chatId: string;
            forceRefresh?: boolean;
            source: "user" | "out_of_context";
        }) => {
            // check if there's already a summary
            const chat = await queryClient.ensureQueryData(
                chatQueries.detail(chatId),
            );
            if (chat?.summary && !forceRefresh) {
                console.log("Skipping summary generation for chat", chatId);
                return { summary: chat.summary };
            }

            const messageSets = await getMessageSets(chatId);
            const conversationText = llmConversation(messageSets)
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => `${m.role}: ${m.content}`)
                .join("\n\n");

            const prompt =
                source === "user"
                    ? Prompts.getUserSummarizePrompt(
                          chat?.title || "Chat Summary",
                          conversationText,
                      )
                    : Prompts.getOutOfContextSummarizePrompt(
                          chat?.title || "Chat Summary",
                          conversationText,
                      );

            const summary = await simpleLLM(prompt, {
                model: SimpleCompletionMode.SUMMARIZER,
                maxTokens: 8192,
            });

            await db.execute("UPDATE chats SET summary = $1 WHERE id = $2", [
                summary,
                chatId,
            ]);
            return { summary };
        },
    });
}

// ------------------------------------------------------------------------------------------------
// Populate functions
// ------------------------------------------------------------------------------------------------

export function useGenerateReviews() {
    const queryClient = useQueryClient();
    const getMessageSets = useGetMessageSets();
    const streamMessageText = useStreamMessageLegacy();
    const modelConfigsPromise = useModelConfigsPromise();
    const createMessage = useCreateMessage();
    const { isQuickChatWindow } = useAppContext();

    return useMutation({
        mutationKey: ["generateReviews"] as const,
        mutationFn: async ({
            chatId,
            messageSetId,
        }: {
            chatId: string;
            messageSetId: string;
        }) => {
            if (isQuickChatWindow) return { skipped: true };

            const appMetadata = await queryClient.ensureQueryData({
                queryKey: appMetadataKeys.appMetadata(),
                queryFn: () => fetchAppMetadata(),
            });
            if (appMetadata["reviews_enabled"] !== "true") {
                // abort
                console.debug(
                    "Skipping reviews generation because reviews are disabled",
                    appMetadata,
                );
                return;
            }

            const messageSets = await getMessageSets(chatId);
            const messageSet = messageSets.find((m) => m.id === messageSetId);

            if (!messageSet) {
                throw new Error(`Message set not found: ${messageSetId}`);
            }

            const message = messageSet.chatBlock?.message;
            if (!message) {
                throw new Error(
                    `Message not found in message set: ${messageSetId}`,
                );
            }

            const modelConfigs = await modelConfigsPromise;

            const reviewConfigs: ModelConfig[] =
                Reviews.ACTIVE_REVIEWERS_ORDER.map((key) => {
                    const modelConfig = modelConfigs.find((m) => m.id === key)!;
                    return modelConfig;
                }).filter((m) => m !== undefined);

            const conversation = llmConversation(messageSets);

            await Promise.all(
                reviewConfigs.map(async (reviewConfig) => {
                    const message = await createMessage.mutateAsync({
                        message: createAIMessage({
                            chatId,
                            messageSetId,
                            blockType: "chat",
                            model: reviewConfig.id,
                            selected: false, // review messages are not selected
                            isReview: true,
                        }),
                        options: {
                            mode: "always",
                        },
                    });
                    if (!message) {
                        throw new Error(
                            `Failed to create message for review: ${reviewConfig.id}`,
                        );
                    }

                    const { messageId, streamingToken } = message;

                    await streamMessageText.mutateAsync({
                        chatId,
                        messageSetId,
                        messageId,
                        conversation,
                        modelConfig: reviewConfig,
                        streamingToken,
                        messageType: "review",
                    });
                }),
            );
        },
        onSuccess: async (data, variables, _context) => {
            if (data?.skipped) return;

            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });

            posthog?.capture("reviews_generated");
        },
    });
}

/**
 * Creates a new-style, message-parts-based (tools) message and streams its message parts
 */
function useStreamToolsMessage() {
    const queryClient = useQueryClient();
    const createMessagePart = useCreateMessagePart();
    const streamMessagePart = useStreamMessagePart();
    const forceRefreshMessageSets = useForceRefreshMessageSets();
    const stopMessageStreaming = useStopMessageStreaming();
    const getToolsets = useGetToolsets();
    const getProjectContext = useGetProjectContextLLMMessage();

    return useMutation({
        mutationKey: ["streamToolsMessage"] as const,
        mutationFn: async ({
            chatId,
            messageSetId,
            messageId,
            streamingToken,
            modelConfig,
        }: {
            chatId: string;
            messageSetId: string;
            messageId: string;
            streamingToken: string;
            modelConfig: ModelConfig;
        }) => {
            const projectId = (
                await queryClient.ensureQueryData(chatQueries.detail(chatId))
            ).projectId;
            const projectContext = await getProjectContext(projectId, chatId);

            // this loop adds all MessageParts
            const MAX_AI_TURNS = 40;
            let level = 0; // message part level
            let errorMessage;
            while (level < MAX_AI_TURNS) {
                const messageSets = await forceRefreshMessageSets(chatId);

                // assume, as usual, that we're dealing with the last message set
                if (messageSets[messageSets.length - 1].id !== messageSetId) {
                    console.warn(
                        "Unexpectedly trying to stream on non-final message set",
                    );
                }

                // we need to pretend as if, in the last message set, THIS message
                // (not some other message) is selected
                const previousMessageSets = messageSets.slice(0, -1);
                const messageIndex = messageSets[
                    messageSets.length - 1
                ].toolsBlock.chatMessages.findIndex((m) => {
                    return m.id === messageId;
                });
                const augmentedLastMessageSet = produce(
                    messageSets[messageSets.length - 1],
                    (draft) => {
                        for (const [
                            index,
                            m,
                        ] of draft.toolsBlock.chatMessages.entries()) {
                            m.selected = index === messageIndex;
                        }
                    },
                );
                const previousMessageSetsPlusThisMessage = [
                    ...previousMessageSets,
                    augmentedLastMessageSet,
                ];

                const conversation: LLMMessage[] = [
                    ...projectContext,
                    ...llmConversation(previousMessageSetsPlusThisMessage),
                ];

                console.log(`[level ${level}] streaming ai message`);
                await createMessagePart.mutateAsync({
                    messagePart: {
                        chatId,
                        messageId,
                        level,
                        content: "",
                        toolCalls: [],
                        toolResults: undefined, // important!
                    },
                    messageSetId,
                    streamingToken,
                });

                const toolsets = await getToolsets();
                const tools = toolsets.flatMap((toolset) => {
                    return toolset.listTools();
                });

                const streamResult = await streamMessagePart.mutateAsync({
                    chatId,
                    messageSetId,
                    messageId,
                    partLevel: level,
                    conversation,
                    modelConfig,
                    streamingToken,
                    tools,
                });

                if (streamResult.result === "error") {
                    errorMessage = streamResult.errorMessage;
                    break;
                }

                console.log("completed stream. processing tool calls.");
                level += 1;

                // If no tool calls, we're done
                if (
                    !streamResult.toolCalls ||
                    streamResult.toolCalls.length === 0
                ) {
                    console.log("No tool calls, done with loop");
                    break;
                }

                console.log(
                    `[level ${level}] handling tool calls`,
                    streamResult.toolCalls,
                );

                const toolResults: UserToolResult[] = [];
                toolResults.push(
                    ...(await Promise.all(
                        streamResult.toolCalls.map((toolCall) =>
                            // this is probably chill, but to separate concerns a bit better
                            // we should move this into an executeToolCall mutation
                            ToolsetsManager.instance.executeToolCall(
                                toolCall,
                                modelConfig.displayName,
                            ),
                        ),
                    )),
                );

                // Insert the tool response message
                await createMessagePart.mutateAsync({
                    messagePart: {
                        chatId,
                        messageId,
                        level,
                        content: "",
                        toolCalls: [],
                        toolResults,
                    },
                    messageSetId,
                    streamingToken,
                });
                level += 1;

                // report tool call to posthog
                streamResult.toolCalls.forEach((toolCall, _index) => {
                    posthog?.capture("tool_called", {
                        modelConfigId: modelConfig.id,
                        namespacedToolName: toolCall.namespacedToolName,
                    });
                });

                // Invalidate to ensure the UI shows the messages
                await queryClient.invalidateQueries({
                    queryKey: messageKeys.messageSets(chatId),
                });
            }

            // stop the message
            await stopMessageStreaming.mutateAsync({
                chatId,
                messageId,
                streamingToken,
                errorMessage,
            });
        },
        onMutate: async (variables) => {
            await queryClient.invalidateQueries(
                chatIsLoadingQueries.detail(variables.chatId),
            );
        },
        onSuccess: async (_data, variables, _context) => {
            // defensive: invalidate message set
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(variables.chatId),
            });
        },
    });
}

/**
 * Assumes tools block is in last message set
 */
function usePopulateToolsBlock(chatId: string) {
    const queryClient = useQueryClient();
    const createMessage = useCreateMessage();
    const streamToolsMessage = useStreamToolsMessage();
    const getSelectedModelConfigs = useGetSelectedModelConfigs();

    return useMutation({
        mutationKey: ["populateToolsBlock"] as const,
        mutationFn: async ({
            messageSetId,
            isQuickChatWindow,
            replyToModelId,
        }: {
            messageSetId: string;
            previousMessageSets: MessageSetDetail[];
            isQuickChatWindow: boolean;
            replyToModelId?: string;
        }) => {
            // BTBL: do we need to protect against double-population here by ensuring
            // it's empty before we populate?

            let modelConfigs: ModelConfig[];

            if (replyToModelId) {
                // For replies, use only the model being replied to
                const modelConfig = await fetchModelConfigById(replyToModelId);
                if (!modelConfig) {
                    console.error(
                        `Model config not found for reply: ${replyToModelId}`,
                    );
                    return { skipped: true };
                }
                modelConfigs = [modelConfig];
            } else {
                // Normal flow: use selected model configs
                modelConfigs = await getSelectedModelConfigs(isQuickChatWindow);
            }

            if (modelConfigs.length === 0) {
                return { skipped: true };
            }

            // we do this in two phases so that we can ensure that if the tools block
            // contains any message, it always contains a selected message

            // phase 1: create the first message (which will be selected)
            const firstModelConfig = modelConfigs[0];
            const firstCreateMessageResult = await createMessage.mutateAsync({
                message: createAIMessage({
                    chatId,
                    messageSetId,
                    blockType: "tools",
                    model: firstModelConfig.id,
                    selected: true,
                    level: 0, // explicitly set level for first message
                }),
            });

            // phase 2: create the rest of the messages and stream all
            await Promise.all(
                modelConfigs.map(async (modelConfig, index) => {
                    const createMessageResult =
                        index === 0
                            ? firstCreateMessageResult
                            : await createMessage.mutateAsync({
                                  message: createAIMessage({
                                      chatId,
                                      messageSetId,
                                      blockType: "tools",
                                      model: modelConfig.id,
                                      selected: false,
                                      level: index, // explicitly set level to preserve model order
                                  }),
                                  options: {
                                      mode: "unique_model",
                                  },
                              });

                    if (!createMessageResult) {
                        console.warn(
                            "Did not acquire lock. Not populating tools block.",
                            messageSetId,
                        );
                        return;
                    }
                    await streamToolsMessage.mutateAsync({
                        chatId,
                        messageSetId,
                        messageId: createMessageResult.messageId,
                        modelConfig,
                        streamingToken: createMessageResult.streamingToken,
                    });
                }),
            );

            return { skipped: false };
        },
        onSuccess: async (data) => {
            if (data.skipped) {
                return;
            }

            // defensive: invalidate message set
            await queryClient.invalidateQueries({
                queryKey: messageKeys.messageSets(chatId),
            });
        },
    });
}

/**
 * Populates a block in the LAST message set.
 * Wrapper around
 * - usePopulateChatBlock
 * - usePopulateBrainstormBlock
 * - usePopulateCompareBlock
 */
export function usePopulateBlock(chatId: string, isQuickChatWindow: boolean) {
    const populateToolsBlock = usePopulateToolsBlock(chatId);
    const getMessageSets = useGetMessageSets();

    return useMutation({
        mutationKey: ["populateBlock"] as const,
        mutationFn: async ({
            messageSetId,
            blockType,
            replyToModelId,
        }: {
            messageSetId: string;
            blockType: BlockType;
            replyToModelId?: string;
        }) => {
            const messageSets = await getMessageSets(chatId);
            const messageSet = messageSets.find((m) => m.id === messageSetId);

            if (!messageSet) {
                throw new Error(`Message set not found: ${messageSetId}`);
            }
            if (!blockIsEmpty(messageSet, blockType)) {
                console.debug(
                    "Skipping population for nonempty block",
                    messageSetId,
                    blockType,
                );
                return;
            }

            const previousMessageSets = messageSets.slice(0, -1);

            switch (blockType) {
                case "tools": {
                    return populateToolsBlock.mutateAsync({
                        messageSetId,
                        previousMessageSets,
                        isQuickChatWindow,
                        replyToModelId,
                    });
                }
                default: {
                    throw new Error(`Unsupported block type: ${blockType}`);
                }
            }
        },
    });
}

/**
 * Use message sets, but not as a query. Suitable for async.
 */
export function useGetMessageSets(): (
    chatId: string,
) => Promise<MessageSetDetail[]> {
    const queryClient = useQueryClient();

    return async (chatId: string) => {
        return await queryClient.ensureQueryData<MessageSetDetail[]>({
            queryKey: messageKeys.messageSets(chatId),
            queryFn: () => fetchMessageSets(chatId),
        });
    };
}

/**
 * Adds a message to the compare block in the LAST message set.
 */
export function useAddMessageToToolsBlock(chatId: string) {
    const modelConfigsQuery = useModelConfigs();
    const createMessage = useCreateMessage();
    const streamToolsMessage = useStreamToolsMessage();
    const markProjectContextSummaryAsStale =
        useMarkProjectContextSummaryAsStale();

    return useMutation({
        mutationKey: ["addMessageToToolsBlock"] as const,
        mutationFn: async ({
            messageSetId,
            modelId,
        }: {
            messageSetId: string;
            modelId: string;
        }) => {
            const modelConfig = modelConfigsQuery.data?.find(
                (m: Models.ModelConfig) => m.id === modelId,
            );
            if (!modelConfig) {
                throw new Error(`model config not found ${modelId}`);
            }

            const createResult = await createMessage.mutateAsync({
                message: createAIMessage({
                    chatId,
                    messageSetId,
                    blockType: "tools",
                    model: modelConfig.id,
                    selected: false,
                }),
                options: {
                    mode: "always",
                },
            });
            if (!createResult) {
                throw new Error("Failed to create tools message");
            }
            const { messageId, streamingToken } = createResult;

            await streamToolsMessage.mutateAsync({
                chatId,
                messageSetId,
                messageId,
                streamingToken,
                modelConfig,
            });
        },
        onSuccess: async (_data, variables) => {
            posthog.capture("model_config_added_to_message_set", {
                modelConfigAdded: variables.modelId,
            });

            await markProjectContextSummaryAsStale.mutateAsync({
                chatId,
            });
        },
    });
}

/**
 * Adds a message to the compare block in the LAST message set.
 */
export function useAddMessageToCompareBlock(chatId: string) {
    const createMessage = useCreateMessage();
    const streamMessageText = useStreamMessageLegacy();
    const getMessageSets = useGetMessageSets();
    const modelConfigsQuery = useModelConfigs();

    return useMutation({
        mutationKey: ["addMessageToCompareBlock"] as const,
        mutationFn: async ({
            messageSetId,
            modelId,
        }: {
            messageSetId: string;
            modelId: string;
        }) => {
            const modelConfig = modelConfigsQuery.data?.find(
                (m: Models.ModelConfig) => m.id === modelId,
            );
            if (!modelConfig) {
                console.warn("model config not found ", modelId);
                return { skipped: true };
            }

            const previousMessageSets = (await getMessageSets(chatId)).slice(
                0,
                -1,
            ); // assume this is the last set
            const conversation = llmConversation(previousMessageSets);

            const result = await createMessage.mutateAsync({
                message: createAIMessage({
                    chatId,
                    messageSetId,
                    blockType: "compare",
                    model: modelConfig.id,
                    selected: false, // Don't auto-select the new message
                }),
                options: {
                    mode: "unique_model",
                },
            });

            if (!result) {
                console.error("Failed to create message for compare block");
                return;
            }

            const { messageId, streamingToken } = result;

            await streamMessageText.mutateAsync({
                chatId,
                messageSetId,
                messageId,
                conversation,
                modelConfig,
                streamingToken,
                messageType: "vanilla",
            });
        },
        onSuccess: (data, variables, _context) => {
            if (data?.skipped) return;

            posthog.capture("model_config_added_to_message_set", {
                modelConfigAdded: variables.modelId,
            });
        },
        // no need to invalidate because it's done by the streamMessageText and createMessage
    });
}

export function useForceRefreshMessageSets() {
    const queryClient = useQueryClient();
    return async (chatId: string) => {
        await queryClient.refetchQueries({
            queryKey: messageKeys.messageSets(chatId),
        });

        return await queryClient.ensureQueryData({
            queryKey: messageKeys.messageSets(chatId),
            queryFn: () => fetchMessageSets(chatId),
        });
    };
}

// ------------------------------------------------------------------------------------------------
// Helpers for making optimistic updates
// ------------------------------------------------------------------------------------------------

/**
 * This function MUST be updated whenever blocks change!!!
 */
function updateMessageText({
    messageSet,
    predicate,
    update,
}: {
    messageSet: MessageSetDetail;
    predicate: (message: Message) => boolean;
    update: (message: Message) => Message;
}): MessageSetDetail {
    const tryUpdateMessage = (message: Message) => {
        if (predicate(message)) {
            return update(message);
        }
        return message;
    };

    const tryUpdateMessageOption = (message: Message | undefined) => {
        if (message) {
            return tryUpdateMessage(message);
        }
        return message;
    };

    return {
        ...messageSet,
        userBlock: {
            ...messageSet.userBlock,
            message: tryUpdateMessageOption(messageSet.userBlock.message),
        },
        chatBlock: {
            ...messageSet.chatBlock,
            message: tryUpdateMessageOption(messageSet.chatBlock.message),
            reviews: messageSet.chatBlock.reviews.map(tryUpdateMessage),
        },
        compareBlock: {
            ...messageSet.compareBlock,
            messages: messageSet.compareBlock.messages.map(tryUpdateMessage),
            synthesis: tryUpdateMessageOption(
                messageSet.compareBlock.synthesis,
            ),
        },
        brainstormBlock: {
            ...messageSet.brainstormBlock,
            ideaMessages:
                messageSet.brainstormBlock.ideaMessages.map(tryUpdateMessage),
        },
        toolsBlock: {
            ...messageSet.toolsBlock,
            chatMessages:
                messageSet.toolsBlock.chatMessages.map(tryUpdateMessage),
        },
    };
}

function updateMessageSets({
    messageSets,
    predicate,
    update,
}: {
    messageSets: MessageSetDetail[];
    predicate: (messageSet: MessageSetDetail) => boolean;
    update: (messageSet: MessageSetDetail) => MessageSetDetail;
}) {
    return messageSets.map((ms) => (predicate(ms) ? update(ms) : ms));
}

// TODO-GC: this relies on getUserMessageSets
export function useGenerateChatTitle() {
    const queryClient = useQueryClient();
    const getMessageSets = useGetMessageSets();

    return useMutation({
        mutationKey: ["generateChatTitle"] as const,
        mutationFn: async ({ chatId }: { chatId: string }) => {
            // check if there's already a title
            const chat = await queryClient.ensureQueryData(
                chatQueries.detail(chatId),
            );
            if (
                chat?.title &&
                // if the previous title was "Untitled Chat", might as well try to regenerate it
                chat.title !== "Untitled Chat"
            ) {
                console.log("Skipping title generation for chat", chatId);
                return { skipped: true };
            }

            const messageSets = await getMessageSets(chatId);
            const userMessageText = Array.from(messageSets) // copy so we can reverse
                .reverse()
                .map((ms) => ms.userBlock?.message?.text)
                .find((m) => m !== undefined);

            if (!userMessageText) {
                console.log("Skipping title generation for chat", chatId);
                return { skipped: true };
            }

            const fullResponse = await simpleLLM(
                `Based on this first message, write a 1-5 word title for the conversation. Try to put the most important words first. Format your response as <title>YOUR TITLE HERE</title>.
If there's no information in the message, just return "Untitled Chat".
<message>
${userMessageText}
</message>`,
                {
                    maxTokens: 100,
                },
            );
            // Extract title from XML tags and clean it up
            const match = fullResponse.match(/<title>(.*?)<\/title>/s);
            if (!match || !match[1]) {
                console.warn("No title found in response:", fullResponse);
                return;
            }
            const cleanTitle = match[1]
                .trim()
                .slice(0, 40)
                .replace(/["']/g, "");
            if (cleanTitle) {
                console.log("Setting chat title to:", cleanTitle);
                await db.execute("UPDATE chats SET title = $1 WHERE id = $2", [
                    cleanTitle,
                    chatId,
                ]);
            }
        },
        onSuccess: async (data, variables) => {
            if (!data?.skipped) {
                await queryClient.invalidateQueries(chatQueries.list());
                await queryClient.invalidateQueries(
                    chatQueries.detail(variables.chatId),
                );
            }
        },
    });
}

// TODO-GC: remove after migration to GC
export function useAddModelToCompareConfigs() {
    const queryClient = useQueryClient();
    const modelConfigsQuery = useModelConfigs();

    return useMutation({
        mutationKey: ["addModelToCompareConfigs"] as const,
        mutationFn: async ({
            newSelectedModelConfigId,
        }: {
            newSelectedModelConfigId: string;
        }) => {
            const selectedModelConfigsCompare =
                await queryClient.ensureQueryData(modelConfigQueries.compare());

            if (
                selectedModelConfigsCompare.some(
                    (m: ModelConfig) => m.id === newSelectedModelConfigId,
                )
            ) {
                return { skipped: true };
            }

            const newSelectedModelConfig = modelConfigsQuery.data?.find(
                (m: ModelConfig) => m.id === newSelectedModelConfigId,
            );
            if (!newSelectedModelConfig) {
                console.warn(
                    "model config not found ",
                    newSelectedModelConfigId,
                );
                return { skipped: true };
            }

            const newConfigIds = [
                ...selectedModelConfigsCompare,
                newSelectedModelConfig,
            ].map((m) => m.id);

            await db.execute(
                "UPDATE app_metadata SET value = ? WHERE key = 'selected_model_configs_compare'",
                [JSON.stringify(newConfigIds)],
            );

            return { newConfigIds };
        },
        onSuccess: async (data, variables) => {
            if (data?.skipped) return;

            await queryClient.invalidateQueries(modelConfigQueries.compare());

            posthog.capture("selected_model_configs_updated", {
                selectedModelConfigs: data.newConfigIds as string[],
                modelConfigAdded: variables.newSelectedModelConfigId,
            });
        },
    });
}

// TODO-GC: remove after migration to GC
/**
 * Updates the list of selected model configs for comparing model output
 */
export function useUpdateSelectedModelConfigsCompare() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["updateSelectedModelConfigsCompare"] as const,
        mutationFn: async ({
            modelConfigs,
        }: {
            modelConfigs: ModelConfig[];
        }) => {
            await db.execute(
                "UPDATE app_metadata SET value = ? WHERE key = 'selected_model_configs_compare'",
                [JSON.stringify(modelConfigs.map((m) => m.id))],
            );
        },
        onMutate: async ({ modelConfigs }) => {
            // optimistic update, as prescribed by TSQuery docs
            await queryClient.cancelQueries(modelConfigQueries.compare());
            const previousModelConfigs = queryClient.getQueryData(
                modelConfigQueries.compare().queryKey,
            );
            queryClient.setQueryData(
                modelConfigQueries.compare().queryKey,
                modelConfigs,
            );
            return {
                previousModelConfigs,
            };
        },
        onError: async (_error, _variables, context) => {
            await queryClient.setQueryData(
                modelConfigQueries.compare().queryKey,
                context?.previousModelConfigs,
            );
        },
        onSettled: async () => {
            await queryClient.invalidateQueries(modelConfigQueries.compare());
        },
    });
}

// TODO-GC: remove after migration to GC
export function useUpdateSelectedModelConfigQuickChat() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["updateSelectedModelConfigQuickChat"] as const,
        mutationFn: async ({ modelConfig }: { modelConfig: ModelConfig }) => {
            console.log("Updating quick chat model config to:", modelConfig.id);
            await db.execute(
                "UPDATE app_metadata SET value = ? WHERE key = 'quick_chat_model_config_id'",
                [modelConfig.id],
            );

            // Return the model config for use in onSuccess
            return modelConfig;
        },
        onSuccess: async (modelConfig) => {
            // Invalidate both app metadata and the specific quick chat model config
            await queryClient.invalidateQueries({
                queryKey: appMetadataKeys.appMetadata(),
            });

            // Directly update the cache for the quick chat model config query
            queryClient.setQueryData(
                modelConfigQueries.quickChat().queryKey,
                modelConfig,
            );
        },
    });
}

// TODO-GC: remove after migration to GC
/**
 * Gets the selected model configs for the current chat type (quick chat or compare).
 */
export function useGetSelectedModelConfigs() {
    const queryClient = useQueryClient();

    return async (isQuickChatWindow: boolean) => {
        if (isQuickChatWindow) {
            const quickChatModelConfig = await queryClient.ensureQueryData(
                modelConfigQueries.quickChat(),
            );
            return quickChatModelConfig ? [quickChatModelConfig] : [];
        } else {
            return await queryClient.ensureQueryData(
                modelConfigQueries.compare(),
            );
        }
    };
}
