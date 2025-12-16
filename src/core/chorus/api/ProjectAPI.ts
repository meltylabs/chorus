import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useReactQueryAutoSync } from "use-react-query-auto-sync";
import { LLMMessage } from "../Models";
import { Chat, chatQueries, useCacheUpdateChat } from "./ChatAPI";
import * as Prompts from "../prompts/prompts";
import { produce } from "immer";
import { useGetMessageSets } from "./MessageAPI";
import { llmConversation } from "../ChatState";
import { simpleLLM } from "../simpleLLM";
import { SimpleCompletionMode } from "../ModelProviders/simple/ISimpleCompletionProvider";
import _ from "lodash";
import { useNavigate } from "react-router-dom";
import { db } from "../DB";
import { Attachment, AttachmentDBRow, readAttachment } from "./AttachmentsAPI";

export const projectKeys = {
    all: () => ["project"] as const,
    allDetails: () => [...projectKeys.all(), "detail"] as const,
};

export const projectQueries = {
    list: () => ({
        queryKey: [...projectKeys.all(), "list"] as const,
        queryFn: () => fetchProjects(),
    }),
    detail: (projectId: string | undefined) => ({
        queryKey: [...projectKeys.allDetails(), projectId] as const,
        queryFn: () => fetchProject(projectId!),
        enabled: projectId !== undefined,
    }),
};

const projectContextQueryKeys = {
    all: () => ["projectContext"] as const,
};

export type Project = {
    id: string;
    name: string;
    updatedAt: string;
    createdAt: string;
    isCollapsed: boolean;
    contextText?: string;
    magicProjectsEnabled: boolean;
    isImported: boolean;
    // Cost tracking
    totalCostUsd?: number;
};

export type Projects = {
    projects: Project[];
    chatsByProject: Record<string, Chat[]>;
    chatsById: Record<string, Chat>;
};

type ProjectDBRow = {
    id: string;
    name: string;
    updated_at: string;
    created_at: string;
    is_collapsed: number;
    magic_projects_enabled: number;
    context_text?: string;
    is_imported: number;
    total_cost_usd: number | null;
};

function readProject(row: ProjectDBRow): Project {
    return {
        id: row.id,
        name: row.name,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        isCollapsed: row.is_collapsed === 1,
        contextText: row.context_text,
        magicProjectsEnabled: row.magic_projects_enabled === 1,
        isImported: row.is_imported === 1,
        totalCostUsd: row.total_cost_usd ?? undefined,
    };
}

export async function fetchProjects(): Promise<Project[]> {
    return await db
        .select<ProjectDBRow[]>(
            `SELECT id, name, updated_at, created_at, is_collapsed, magic_projects_enabled, is_imported, total_cost_usd
            FROM projects
            ORDER BY updated_at DESC`,
        )
        .then((rows) => rows.map(readProject));
}

export async function fetchProjectContextText(
    projectId: string,
): Promise<string> {
    const result = await db.select<{ context_text: string | null }[]>(
        "SELECT context_text FROM projects WHERE id = ?",
        [projectId],
    );
    return result?.[0]?.context_text || "";
}

export async function fetchProjectContextAttachments(
    projectId: string,
): Promise<Attachment[]> {
    const result = await db.select<AttachmentDBRow[]>(
        `SELECT attachments.id, attachments.type, attachments.original_name, attachments.path, attachments.is_loading, attachments.ephemeral
        FROM project_attachments
        JOIN attachments ON project_attachments.attachment_id = attachments.id
        WHERE project_attachments.project_id = ?
        ORDER BY attachments.created_at`,
        [projectId],
    );
    return result.map(readAttachment);
}

export async function fetchProject(projectId: string) {
    const rows = await db.select<ProjectDBRow[]>(
        "SELECT * FROM projects WHERE id = ?",
        [projectId],
    );
    if (rows.length === 0) {
        throw new Error(`Project not found: ${projectId}`);
    }
    return readProject(rows[0]);
}

export const projectContextQueries = {
    text: (projectId: string) => ({
        queryKey: [
            ...projectContextQueryKeys.all(),
            projectId,
            "text",
        ] as const,
        queryFn: () => fetchProjectContextText(projectId),
    }),
    attachments: (projectId: string) => ({
        queryKey: [
            ...projectContextQueryKeys.all(),
            projectId,
            "attachments",
        ] as const,
        queryFn: () => fetchProjectContextAttachments(projectId),
    }),
};

export function useAutoSyncProjectContextText(projectId: string) {
    const queryClient = useQueryClient();

    // Mutation function to update project context
    const updateProjectContext = async (contextText: string) => {
        await db.execute("UPDATE projects SET context_text = ? WHERE id = ?", [
            contextText,
            projectId,
        ]);
        return contextText;
    };

    return useReactQueryAutoSync({
        queryOptions: projectContextQueries.text(projectId),
        mutationOptions: {
            mutationFn: updateProjectContext,
            onSuccess: async () => {
                await queryClient.invalidateQueries(
                    projectContextQueries.text(projectId),
                );
            },
        },
        autoSaveOptions: { wait: 500 }, // update in db every 500ms
    });
}

export function useGetProjectContextLLMMessage(): (
    projectId: string,
    chatId: string,
) => Promise<LLMMessage[]> {
    const queryClient = useQueryClient();
    return async (projectId: string, chatId: string) => {
        if (projectId === "default" || projectId === "quick-chat") return [];

        const [project, chats, text, attachments] = await Promise.all([
            queryClient.ensureQueryData(projectQueries.detail(projectId)),
            queryClient.ensureQueryData(chatQueries.list()),
            queryClient.ensureQueryData(projectContextQueries.text(projectId)),
            queryClient.ensureQueryData(
                projectContextQueries.attachments(projectId),
            ),
        ]);

        // exclude this project's summary
        const projectChats = chats.filter((c) => c.projectId === projectId);
        const filteredSummaryTexts = projectChats
            .filter((chat) => chat.id !== chatId)
            .map((chat) => chat.projectContextSummary)
            .filter((chat) => chat !== undefined)
            .filter((chat) => chat !== "");

        const messages: LLMMessage[] = [
            {
                role: "user",
                content: Prompts.PROJECTS_CONTEXT_PROMPT(
                    text,
                    project.magicProjectsEnabled ? filteredSummaryTexts : [],
                ),
                attachments,
            },
            {
                role: "assistant",
                content: "Okay.",
                toolCalls: [],
            },
        ];

        return messages;
    };
}

export function useSetMagicProjectsEnabled() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["setMagicProjectsEnabled"] as const,
        mutationFn: async ({
            projectId,
            enabled,
        }: {
            projectId: string;
            enabled: boolean;
        }) => {
            await db.execute(
                "UPDATE projects SET magic_projects_enabled = ? WHERE id = ?",
                [enabled ? 1 : 0, projectId],
            );
        },
        onSuccess: (_data, variables) => {
            queryClient.setQueryData(
                projectQueries.detail(variables.projectId).queryKey,
                (project: Project | undefined) =>
                    produce(project, (draft) => {
                        if (draft === undefined) return;
                        draft.magicProjectsEnabled = variables.enabled;
                    }),
            );
            queryClient.setQueryData(
                projectQueries.list().queryKey,
                (projects: Project[] | undefined) =>
                    produce(projects, (draft) => {
                        if (draft === undefined) return;
                        const project = draft.find(
                            (p) => p.id === variables.projectId,
                        );
                        if (project) {
                            project.magicProjectsEnabled = variables.enabled;
                        }
                    }),
            );
        },
    });
}

export function useMarkProjectContextSummaryAsStale() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["markProjectContextSummaryAsStale"] as const,
        mutationFn: async ({ chatId }: { chatId: string }) => {
            console.debug(
                "invalidating project context summary for chat",
                chatId,
            );
            await db.execute(
                "UPDATE chats SET project_context_summary_is_stale = 1 WHERE id = ?",
                [chatId],
            );
        },
        onSuccess: (_data, variables) => {
            queryClient.setQueryData(
                chatQueries.detail(variables.chatId).queryKey,
                (chat: Chat | undefined) =>
                    produce(chat, (draft) => {
                        if (draft === undefined) return;
                        draft.projectContextSummaryIsStale = true;
                    }),
            );
            queryClient.setQueryData(
                chatQueries.list().queryKey,
                (chats: Chat[] | undefined) =>
                    produce(chats, (draft) => {
                        if (draft === undefined) return;
                        const chat = draft.find(
                            (c) => c.id === variables.chatId,
                        );
                        if (chat) {
                            chat.projectContextSummaryIsStale = true;
                        }
                    }),
            );
        },
        onError: (error, variables) => {
            console.error(
                "error invalidating project context summaries",
                error,
                variables,
            );
        },
    });
}

/**
 * this should be run whenever we switch to a chat
 * only runs if the chat is part of a project
 * only regenerates summaries for chats whose summaries are stale
 */
export function useRegenerateProjectContextSummaries() {
    const queryClient = useQueryClient();
    const regenerateProjectContextSummary =
        useRegenerateProjectContextSummary();

    return useMutation({
        mutationKey: ["regenerateProjectContextSummaries"] as const,
        mutationFn: async ({ chatId }: { chatId: string }) => {
            const chat = await queryClient.ensureQueryData(
                chatQueries.detail(chatId),
            );
            await queryClient.refetchQueries(
                // force refresh project
                // TODOJDC can we get rid of this now?
                projectQueries.detail(chat.projectId),
            );
            const project = await queryClient.ensureQueryData(
                projectQueries.detail(chat.projectId),
            );
            const chats = await queryClient.ensureQueryData(chatQueries.list()); // i.e., getChats
            if (project.id === "default" || project.id === "quick-chat") {
                return { skipped: true, projectId: project.id };
            }
            if (!project.magicProjectsEnabled) {
                return { skipped: true, projectId: project.id };
            }

            console.log(
                "regenerating project summaries for project",
                project.name,
            );
            const otherChatsInProject = chats
                .filter((otherChat) => otherChat.projectId === project.id)
                .filter((otherChat) => otherChat.id !== chatId);

            const results = await Promise.all(
                otherChatsInProject.map(async (chat) => {
                    if (!chat.projectContextSummaryIsStale) {
                        console.debug(
                            "Skipping project summary regeneration for chat",
                            chat.title,
                            chat.projectContextSummaryIsStale,
                        );
                        return;
                    }
                    console.log(
                        "regenerating project summary for chat",
                        chat.title,
                    );
                    return regenerateProjectContextSummary.mutateAsync({
                        chatId: chat.id,
                    });
                }),
            );
            return {
                skipped: _.every(
                    results,
                    (result) => result === undefined || result.skipped === true,
                ),
                projectName: project.name,
            };
        },
        onSuccess: (data) => {
            if (data.skipped) {
                return;
            }
        },
    });
}

// todo-gc: we'll need to update this to work with group chats
function useRegenerateProjectContextSummary() {
    const cacheUpdateChat = useCacheUpdateChat();
    const getMessageSets = useGetMessageSets();

    return useMutation({
        mutationKey: ["regenerateProjectContextSummary"] as const,
        mutationFn: async ({ chatId }: { chatId: string }) => {
            // immediately mark non-stale
            await db.execute(
                "UPDATE chats SET project_context_summary_is_stale = 0 WHERE id = ?",
                [chatId],
            );
            cacheUpdateChat(chatId, (chat) => {
                chat.projectContextSummaryIsStale = false;
            });

            const messageSets = await getMessageSets(chatId);

            if (messageSets.length === 0) {
                return { skipped: true };
            }

            const conversationText = llmConversation(messageSets)
                .filter((m) => m.role === "user" || m.role === "assistant") // TODO include tools?
                .map((m) => `${m.role}: ${m.content}`)
                .join("\n\n");

            const summary = await simpleLLM(
                Prompts.PROJECT_CONTEXT_SUMMARY_PROMPT(conversationText),
                {
                    model: SimpleCompletionMode.SUMMARIZER,
                    maxTokens: 8192,
                },
            );

            await db.execute(
                "UPDATE chats SET project_context_summary = ? WHERE id = ?",
                [summary, chatId],
            );

            return { skipped: false, summary };
        },
        onSuccess: (data, variables) => {
            if (data.skipped) {
                console.debug(
                    "regeneration skipped because there are no messages",
                    variables.chatId,
                );
                return;
            }

            console.debug("regeneration succeeded", variables.chatId);

            // update data directly in cache
            cacheUpdateChat(variables.chatId, (chat) => {
                chat.projectContextSummary = data.summary;
            });
        },
    });
}

export function useSetChatProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["setChatProject"] as const,
        mutationFn: async ({
            chatId,
            projectId,
        }: {
            chatId: string;
            projectId: string;
        }) => {
            await db.execute("UPDATE chats SET project_id = ? WHERE id = ?", [
                projectId,
                chatId,
            ]);
        },
        onMutate: async ({ chatId, projectId }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries(chatQueries.detail(chatId));
            await queryClient.cancelQueries(chatQueries.list());

            // Snapshot the previous values
            const previousChat = queryClient.getQueryData(
                chatQueries.detail(chatId).queryKey,
            );
            const previousChatList = queryClient.getQueryData(
                chatQueries.list().queryKey,
            );

            // Optimistically update the chat detail
            queryClient.setQueryData(
                chatQueries.detail(chatId).queryKey,
                produce(previousChat, (draft: Chat | undefined) => {
                    if (draft === undefined) return;
                    draft.projectId = projectId;
                }),
            );

            // Optimistically update the chat in the list
            queryClient.setQueryData(
                chatQueries.list().queryKey,
                produce(previousChatList, (draft: Chat[] | undefined) => {
                    if (draft === undefined) return;
                    const chat = draft.find((c) => c.id === chatId);
                    if (chat) {
                        chat.projectId = projectId;
                    }
                }),
            );

            // Return a context object with the snapshotted values
            return { previousChat, previousChatList };
        },
        onError: (_error, { chatId }, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousChat) {
                queryClient.setQueryData(
                    chatQueries.detail(chatId).queryKey,
                    context.previousChat,
                );
            }
            if (context?.previousChatList) {
                queryClient.setQueryData(
                    chatQueries.list().queryKey,
                    context.previousChatList,
                );
            }
        },
        onSettled: async (_data, _error, variables) => {
            // Always refetch after error or success
            await queryClient.invalidateQueries(
                chatQueries.detail(variables.chatId),
            );
            await queryClient.invalidateQueries(chatQueries.list());
        },
    });
}

export function useDeleteAttachmentFromProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["deleteAttachmentFromProject"] as const,
        mutationFn: async ({
            attachmentId,
        }: {
            attachmentId: string;
            projectId: string;
        }) => {
            await db.execute(
                "DELETE FROM project_attachments WHERE attachment_id = ?",
                [attachmentId],
            );
            await db.execute("DELETE FROM attachments WHERE id = ?", [
                attachmentId,
            ]);
        },
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries(
                projectContextQueries.attachments(variables.projectId),
            );
        },
    });
}

export function useCreateProject() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation({
        mutationKey: ["createProject"] as const,
        mutationFn: async () => {
            // Create a new project with magic projects enabled by default (uses database default value of 1)
            const result = await db.select<{ id: string }[]>(
                "INSERT INTO projects (id, name) VALUES (lower(hex(randomblob(16))), '') RETURNING id",
            );
            if (result.length === 0) {
                throw new Error("Failed to create project");
            }
            return result[0].id;
        },
        onSuccess: async (projectId) => {
            await queryClient.invalidateQueries(projectQueries.list());
            navigate(`/projects/${projectId}`);
        },
    });
}

export function useRenameProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["renameProject"] as const,
        mutationFn: async ({
            projectId,
            newName,
        }: {
            projectId: string;
            newName: string;
        }) => {
            await db.execute("UPDATE projects SET name = $1 WHERE id = $2", [
                newName,
                projectId,
            ]);
        },
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries(projectQueries.list());
            await queryClient.invalidateQueries(
                projectQueries.detail(variables.projectId),
            );
        },
    });
}

export function useDeleteProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["deleteProject"] as const,
        mutationFn: async ({ projectId }: { projectId: string }) => {
            // Note: Delete trigger will cascade to delete chats
            await db.execute("DELETE FROM projects WHERE id = $1", [projectId]);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(projectQueries.list());
        },
    });
}

export function useFinalizeAttachmentForProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["finalizeAttachmentForProject"] as const,
        mutationFn: async ({
            attachmentId,
            storedPath,
            type,
        }: {
            projectId: string;
            attachmentId: string;
            storedPath: string;
            type?: string;
        }) => {
            if (type) {
                await db.execute(
                    "UPDATE attachments SET is_loading = 0, path = ?, type = ? WHERE id = ?",
                    [storedPath, type, attachmentId],
                );
            } else {
                await db.execute(
                    "UPDATE attachments SET is_loading = 0, path = ? WHERE id = ?",
                    [storedPath, attachmentId],
                );
            }
        },
        onSuccess: async (_data, variables) => {
            // TODOJDC do an optimistic update instead
            await queryClient.invalidateQueries(
                projectContextQueries.attachments(variables.projectId),
            );
        },
    });
}

export function useToggleProjectIsCollapsed() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["toggleProjectIsCollapsed"] as const,
        mutationFn: async ({ projectId }: { projectId: string }) => {
            await db.execute(
                "UPDATE projects SET is_collapsed = NOT is_collapsed WHERE id = $1",
                [projectId],
            );
        },
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries(projectQueries.list());
            await queryClient.invalidateQueries(
                projectQueries.detail(variables.projectId),
            );
        },
    });
}
