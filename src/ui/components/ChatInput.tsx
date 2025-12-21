import { useCallback, useEffect, useMemo, useState } from "react";
import React from "react";
import { useAppContext } from "@ui/hooks/useAppContext";
import AutoExpandingTextarea from "./AutoExpandingTextarea";
import { AttachmentAddPill, AttachmentDropArea } from "./AttachmentsViews";
import { AttachmentType } from "@core/chorus/Models";
import {
    MANAGE_MODELS_COMPARE_DIALOG_ID,
    ManageModelsBox,
} from "./ManageModelsBox";
import { MessageSetDetail } from "@core/chorus/ChatState";
import * as MessageAPI from "@core/chorus/api/MessageAPI";
import { useSettings } from "./hooks/useSettings";
import { toast } from "sonner";
import { usePostHog } from "posthog-js/react";
import { getVersion } from "@tauri-apps/api/app";
import { createUserMessage } from "@core/chorus/ChatState";
import { MouseTrackingEyeRef } from "./MouseTrackingEye";
import { useWaitForAppMetadata } from "@ui/hooks/useWaitForAppMetadata";
import { ManageModelsButtonCompare } from "./ModelPills";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useMutation } from "@tanstack/react-query";
import ToolsBox from "./ToolsBox";
import { useShortcut } from "@ui/hooks/useShortcut";
import {
    useAttachScreenshotEphemeral,
    useAttachUrl,
    useFileDrop,
    useFilePaste,
    useFileSelect,
} from "@ui/hooks/useAttachments";
import { dialogActions, useDialogStore } from "@core/infra/DialogStore";
import { ChatSuggestions } from "./ChatSuggestions";
import { ArrowUp, ChevronDownIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { EmptyState } from "./EmptyState";
import { handleInputPasteWithAttachments } from "@ui/lib/utils";
import { inputActions, useInputStore } from "@core/infra/InputStore";
import { useSearchParams } from "react-router-dom";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import * as DraftAPI from "@core/chorus/api/DraftAPI";
import * as ModelConfigChatAPI from "@core/chorus/api/ModelConfigChatAPI";
import * as ProjectAPI from "@core/chorus/api/ProjectAPI";

const DEFAULT_CHAT_INPUT_ID = "default-chat-input";
const REPLY_CHAT_INPUT_ID = "reply-chat-input";

function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
    const { isQuickChatWindow } = useAppContext();

    return (
        <button
            onClick={onClick}
            className={`${
                isQuickChatWindow
                    ? "fixed bottom-20 left-1/2 -translate-x-1/2"
                    : "relative"
            } px-4 py-2 bg-background/95 backdrop-blur border rounded-full hover:bg-muted/80 z-50 transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 pointer-events-auto`}
        >
            <ChevronDownIcon className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">Scroll to bottom</span>
        </button>
    );
}

export function ChatInput({
    chatId,
    isNewChat,
    currentMessageSet,
    inputRef,
    eyeRef,
    scrollToLatestMessageSet,
    isReply = false,
    defaultReplyToModel,
    showScrollButton,
    handleScrollToBottom,
}: {
    chatId: string;
    isNewChat: boolean | undefined;
    currentMessageSet: MessageSetDetail | undefined;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    eyeRef: React.RefObject<MouseTrackingEyeRef>;
    scrollToLatestMessageSet: () => void;
    sentAttachmentTypes: AttachmentType[]; // todo: should we bring this back for something?
    isReply?: boolean;
    defaultReplyToModel?: string;
    showScrollButton?: boolean;
    handleScrollToBottom?: () => void;
}) {
    const selectedModelConfigsCompare =
        ModelsAPI.useSelectedModelConfigsCompare();
    const modelConfigs = ModelsAPI.useModelConfigs();
    const appMetadata = useWaitForAppMetadata();
    const cautiousEnter = appMetadata["cautious_enter"] === "true";

    const { draft, setDraft } = DraftAPI.useAutoSyncMessageDraft(chatId);

    const attachmentsQuery = DraftAPI.useDraftAttachments(chatId);
    const convertDraftAttachmentsToMessageAttachments =
        MessageAPI.useConvertDraftAttachmentsToMessageAttachments();
    const removeAttachment = DraftAPI.useDeleteAttachmentFromDraft({ chatId });
    const deleteDraftAttachment = DraftAPI.useDeleteDraftAttachment();
    const fileDrop = useFileDrop({
        association: { type: "draft", chatId },
    });
    const fileSelect = useFileSelect({
        association: { type: "draft", chatId },
    });
    const filePaste = useFilePaste({
        association: { type: "draft", chatId },
    });
    const attachUrl = useAttachUrl({
        association: { type: "draft", chatId },
    });
    const attachScreenshotEphemeral = useAttachScreenshotEphemeral({
        association: { type: "draft", chatId },
    });

    const { isQuickChatWindow } = useAppContext();
    const focusedChatInputId = useInputStore((state) => state.focusedInputId);

    // Create a unique dialog ID for reply model picker
    const MANAGE_MODELS_REPLY_DIALOG_ID = `manage-models-reply-${chatId}`;

    const isManageModelsCompareDialogOpen = useDialogStore(
        (state) => state.activeDialogId === MANAGE_MODELS_COMPARE_DIALOG_ID,
    );
    const isManageModelsReplyDialogOpen = useDialogStore(
        (state) => state.activeDialogId === MANAGE_MODELS_REPLY_DIALOG_ID,
    );
    const isDialogClosed = useDialogStore(
        (state) => state.activeDialogId === null,
    );

    const replyModelConfigQuery =
        ModelConfigChatAPI.useReplyModelConfig(chatId);
    const updateReplyModelConfig =
        ModelConfigChatAPI.useUpdateReplyModelConfig();

    const getReplyToModelConfig = useCallback(
        (modelId: string | undefined) => {
            return modelId
                ? modelConfigs.data?.find((m) => m.modelId === modelId)
                : undefined;
        },
        [modelConfigs.data],
    );

    const replyToModelConfig = isReply
        ? getReplyToModelConfig(
              replyModelConfigQuery.data ?? defaultReplyToModel,
          )
        : undefined;

    const [submitConfirmationGiven, setSubmitConfirmationGiven] =
        useState(false);

    const [isAnimatingToBottom, setIsAnimatingToBottom] = useState(false);

    const placeholderText = isReply ? "Reply..." : "Ask me anything...";

    const settings = useSettings();

    const posthog = usePostHog();

    const addModelToCompareConfigs = MessageAPI.useAddModelToCompareConfigs();
    const updateSelectedModelConfigsCompare =
        MessageAPI.useUpdateSelectedModelConfigsCompare();

    const createMessageSetPair = MessageAPI.useCreateMessageSetPair();
    const createMessage = MessageAPI.useCreateMessage();
    const forceRefreshMessageSets = MessageAPI.useForceRefreshMessageSets();
    const generateChatTitle = MessageAPI.useGenerateChatTitle();
    const markProjectContextSummaryAsStale =
        ProjectAPI.useMarkProjectContextSummaryAsStale();

    const populateBlock = MessageAPI.usePopulateBlock(
        chatId,
        isQuickChatWindow,
    );

    const submit = useMutation({
        mutationKey: ["submitChatInput"] as const,
        mutationFn: async (e: React.FormEvent) => {
            e.preventDefault();

            const BLOCK_TYPE = "tools";

            // 0. early abort in special cases
            if (
                !attachmentsQuery.isSuccess ||
                attachmentsQuery.data.find((a) => a.isLoading)
            ) {
                if (!submitConfirmationGiven) {
                    toast("Web attachments still loading", {
                        description: "Press Enter again to submit without them",
                    });
                    setSubmitConfirmationGiven(true);
                    return;
                }

                // User confirmed - delete loading attachments before proceeding
                const loadingAttachments = (attachmentsQuery.data ?? []).filter(
                    (a) => a.isLoading,
                );
                await Promise.all(
                    loadingAttachments.map((attachment) =>
                        deleteDraftAttachment.mutateAsync({
                            attachmentId: attachment.id,
                            association: { type: "draft", chatId },
                        }),
                    ),
                );
            }

            const loadedAttachments =
                attachmentsQuery.data?.filter((a) => !a.isLoading) ?? [];

            if (!draft.trim() && loadedAttachments.length === 0) {
                console.debug("ignoring submit with no content or attachments");
                return;
            }

            // Clear input immediately
            // (Note that we need to update spacer height in response, which
            // will happen when the message sets change)
            setDraft("");

            // reset submitConfirmationGiven when we do in fact submit
            setSubmitConfirmationGiven(false);

            // Trigger eye blink
            eyeRef.current?.blink();

            // capture screen if needed
            if (
                isQuickChatWindow &&
                appMetadata["vision_mode_enabled"] === "true"
            ) {
                try {
                    await attachScreenshotEphemeral.mutateAsync();
                } catch (error) {
                    toast.error("Error capturing screen", {
                        description:
                            "It's possible that Ripple doesn't have screenshot permissions, which is needed to enable vision mode.",
                        action: {
                            label: "Open Settings",
                            onClick: () => {
                                void invoke("open_screen_recording_settings");
                                void invoke("hide");
                            },
                        },
                    });
                    throw error; // re-throw so we get exception handling from wrapper
                }
            }

            void getVersion().then((version) => {
                posthog?.capture("message_sent", {
                    version,
                    isQuickChat: isQuickChatWindow,
                    blockType: BLOCK_TYPE,
                    isReply,
                });
            });

            const userMessageText = draft.trim();

            // create message sets
            const { userMessageSetId, aiMessageSetId } =
                await createMessageSetPair.mutateAsync({
                    chatId,
                    userMessageSetParent: currentMessageSet,
                    selectedBlockType: BLOCK_TYPE,
                });
            if (!userMessageSetId || !aiMessageSetId) {
                console.error("couldn't insert message set");
                return;
            }
            console.debug(
                "message set pair created",
                userMessageSetId,
                aiMessageSetId,
            );

            // save user's new message
            const userMessageResult = await createMessage.mutateAsync({
                message: createUserMessage({
                    chatId: chatId,
                    messageSetId: userMessageSetId,
                    text: userMessageText,
                }),
                options: {
                    mode: "first",
                },
            });

            if (!userMessageResult) {
                console.error("couldn't insert user message");
                return;
            }

            // Check if this is the first message and trigger animation
            const isFirstMessage = isNewChat && !isQuickChatWindow;
            if (isFirstMessage) {
                setIsAnimatingToBottom(true);
            }

            // Convert attachments
            await convertDraftAttachmentsToMessageAttachments.mutateAsync({
                chatId,
                messageId: userMessageResult.messageId,
            });

            // since we have no optimistic update in createMessageSetPair or createMessage
            // or convertDraftAttachmentsToMessageAttachments, force refetch before
            // generateChatTitle or populateBLock
            await forceRefreshMessageSets(chatId);

            // generate chat title if needed
            void generateChatTitle.mutateAsync({ chatId });

            // mark project context summary as stale
            // we'll do this again when the AI message finishes streaming
            void markProjectContextSummaryAsStale.mutateAsync({
                chatId: chatId,
            });

            // scroll
            requestAnimationFrame(() => {
                scrollToLatestMessageSet();
            });

            // 5. populate selected blocks (await to ensure messages are created)
            // Pass the MCP tools to the API call
            void populateBlock.mutateAsync({
                messageSetId: aiMessageSetId,
                blockType: BLOCK_TYPE,
                replyToModelId: replyToModelConfig?.modelId,
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        submit.mutate(e);
    };

    const handlePaste = async (
        e: React.ClipboardEvent<HTMLTextAreaElement>,
    ) => {
        const { attachUrl: attachUrls, filePaste: files } =
            handleInputPasteWithAttachments(e, attachmentsQuery.data, settings);

        if (attachUrls) {
            for (const url of attachUrls) {
                await attachUrl.mutateAsync({ url });
            }
        }

        if (files) {
            await filePaste.mutateAsync(files);
        }
    };

    // --------------------------------------------------------------------------
    // Model management
    // --------------------------------------------------------------------------

    /**
     * Ensures a model config is selected
     */
    const ensureCompareModelConfigSelected = useCallback(
        async (modelConfigId: string) => {
            await addModelToCompareConfigs.mutateAsync({
                newSelectedModelConfigId: modelConfigId,
            });
        },
        [addModelToCompareConfigs],
    );

    const ensureCompareModelConfigDeselected = useCallback(
        async (modelConfigId: string) => {
            const newModelConfigs = selectedModelConfigsCompare.data?.filter(
                (m) => m.id !== modelConfigId,
            );
            await updateSelectedModelConfigsCompare.mutateAsync({
                modelConfigs: newModelConfigs ?? [],
            });

            posthog.capture("selected_model_configs_updated", {
                selectedModelConfigs: newModelConfigs?.map((m) => m.id) ?? [],
                modelConfigRemoved: modelConfigId,
            });
        },
        [
            selectedModelConfigsCompare,
            posthog,
            updateSelectedModelConfigsCompare,
        ],
    );

    const toggleCompareModelConfig = useCallback(
        async (modelConfigId: string) => {
            console.log("toggleCompareModelConfig", modelConfigId);
            try {
                // Check if model is already selected
                const isSelected = selectedModelConfigsCompare.data?.some(
                    (m) => m.id === modelConfigId,
                );

                if (isSelected) {
                    await ensureCompareModelConfigDeselected(modelConfigId);
                } else {
                    await ensureCompareModelConfigSelected(modelConfigId);
                }
            } catch (error) {
                console.error(error);
                toast.error("Error", {
                    description: "Failed to update model selection",
                });
            }
        },
        [
            selectedModelConfigsCompare,
            ensureCompareModelConfigSelected,
            ensureCompareModelConfigDeselected,
        ],
    );

    const clearCompareModelConfigs = useCallback(() => {
        void (async () => {
            await updateSelectedModelConfigsCompare.mutateAsync({
                modelConfigs: [],
            });
            void posthog.capture("selected_model_configs_updated", {
                selectedModelConfigs: [],
            });
        })();
    }, [posthog, updateSelectedModelConfigsCompare]);

    // Update focus when dialog closes or chat id changes
    useEffect(() => {
        if (isDialogClosed) {
            // Use requestAnimationFrame to ensure DOM is fully rendered
            const focusTimeout = requestAnimationFrame(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            });
            return () => cancelAnimationFrame(focusTimeout);
        }
    }, [inputRef, chatId, isDialogClosed]);

    useShortcut(
        ["meta", "j"],
        () => {
            if (isQuickChatWindow) return;

            if (
                isManageModelsCompareDialogOpen ||
                isManageModelsReplyDialogOpen
            ) {
                dialogActions.closeDialog();
            } else {
                dialogActions.openDialog(MANAGE_MODELS_COMPARE_DIALOG_ID);
            }
        },
        {
            isGlobal: true,
        },
    );
    useShortcut(
        ["meta", "shift", "backspace"],
        () => {
            if (!isQuickChatWindow) {
                clearCompareModelConfigs();
            }
        },
        {
            enableOnDialogIds: [MANAGE_MODELS_COMPARE_DIALOG_ID],
        },
    );

    const [searchParams] = useSearchParams();

    const isNextFocus = useMemo(() => {
        const isReplyDrawerOpen = searchParams.get("replyId");

        if (focusedChatInputId === DEFAULT_CHAT_INPUT_ID) {
            return isReply;
        } else if (focusedChatInputId === REPLY_CHAT_INPUT_ID) {
            return !isReply;
        } else if (isReplyDrawerOpen) {
            return isReply;
        } else return !isReply;
    }, [focusedChatInputId, isReply, searchParams]);

    useShortcut(["meta", "l"], () => {
        if (isNextFocus) {
            inputRef.current?.focus();
        }
    });

    // Reset animation state after animation completes
    useEffect(() => {
        if (isAnimatingToBottom) {
            const timer = setTimeout(() => {
                setIsAnimatingToBottom(false);
            }, 600); // Animation duration + buffer
            return () => clearTimeout(timer);
        }
    }, [isAnimatingToBottom]);

    useEffect(() => {
        if (isQuickChatWindow) {
            // whenever window is refocused, focus the input
            const unlistenPromise = listen("quick-chat-focused", () => {
                inputRef.current?.focus();
                if (!inputRef.current?.selectionStart) {
                    inputRef.current?.setSelectionRange(
                        inputRef.current.value.length,
                        inputRef.current.value.length,
                    );
                }
            });

            return () => {
                void unlistenPromise.then((unlisten) => unlisten());
            };
        }
    }, [inputRef, isQuickChatWindow]);

    const defaultChatComposer = !isQuickChatWindow && (
        <div
            className={
                isReply
                    ? "bg-background mx-4 px-4 pt-1 border shadow-lg rounded-t-lg"
                    : `bg-background border-t @3xl:px-4 px-7 @3xl:mx-auto @3xl:border-l
                 @3xl:border-r @3xl:border-t @3xl:max-w-3xl pt-1 ${
                     isNewChat && !isAnimatingToBottom
                         ? "@3xl:rounded-lg border-t border-b @3xl:shadow-diffuse"
                         : "@3xl:rounded-t-lg @3xl:shadow-lg @3xl:has-[:focus]:shadow-muted-foreground/10"
                 }`
            }
        >
            <AttachmentDropArea
                attachments={attachmentsQuery.data ?? []}
                onFileDrop={fileDrop.mutate}
                onRemove={(attachmentId) =>
                    removeAttachment.mutate({ attachmentId })
                }
            />
            {/* Input form */}
            <form
                onSubmit={handleSubmit}
                className="flex flex-col w-full mx-auto relative"
            >
                <AutoExpandingTextarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                    }}
                    onPaste={(e) => void handlePaste(e)}
                    rows={2}
                    onKeyDown={(e) => {
                        if (cautiousEnter) {
                            // Cautious mode: Cmd+Enter to submit
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        } else {
                            // Normal mode: Enter to submit, Shift+Enter for newline
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }
                    }}
                    placeholder={placeholderText}
                    className="ring-0
                placeholder:text-muted-foreground/50 font-[350] focus:outline-none pt-2 px-1.5 select-text
                max-h-[60vh] overflow-y-auto my-2 rounded-none !p-0"
                    autoFocus
                    onFocus={() =>
                        inputActions.setFocusedInputId(
                            isReply
                                ? REPLY_CHAT_INPUT_ID
                                : DEFAULT_CHAT_INPUT_ID,
                        )
                    }
                    onBlur={() => inputActions.setFocusedInputId(null)}
                />

                {/* Helper text for Cmd+L */}
                {isNextFocus && (
                    <div className="absolute top-1 -right-1 p-1 text-sm text-muted-foreground/50 font-[350] bg-background/90 backdrop-blur-[1px] rounded-full px-2 py-1">
                        ⌘L to focus
                    </div>
                )}
            </form>
            <div className="flex py-3 w-full">
                <div className="flex justify-between w-full mx-auto">
                    <div className="flex items-center gap-2 h-7 overflow-x-auto -mx-1 no-scrollbar overflow-y-hidden relative w-[30rem]">
                        <AttachmentAddPill onSelect={fileSelect.mutate} />
                        {!isReply && (
                            <ManageModelsButtonCompare
                                selectedModelConfigs={
                                    selectedModelConfigsCompare.data ?? []
                                }
                                dialogId={MANAGE_MODELS_COMPARE_DIALOG_ID}
                            />
                        )}
                        {isReply && (
                            <ManageModelsButtonCompare
                                selectedModelConfigs={
                                    replyToModelConfig
                                        ? [replyToModelConfig]
                                        : undefined
                                }
                                dialogId={MANAGE_MODELS_REPLY_DIALOG_ID}
                                showShortcut={false}
                            />
                        )}
                        {!isReply && <ToolsBox />}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 h-7">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className={`flex items-center rounded-full p-1 transition-all duration-300 ease-out ${
                                        !draft?.trim() &&
                                        (attachmentsQuery.data?.filter(
                                            (a) => !a.isLoading,
                                        )?.length ?? 0) === 0
                                            ? "bg-muted text-muted-foreground cursor-not-allowed scale-95 opacity-70"
                                            : "bg-primary text-background hover:scale-110 hover:shadow-lg scale-100 opacity-100 shadow-md hover:shadow-primary/25 active:scale-105"
                                    }`}
                                    onClick={handleSubmit}
                                    type="button"
                                    disabled={
                                        !draft?.trim() &&
                                        (attachmentsQuery.data?.filter(
                                            (a) => !a.isLoading,
                                        )?.length ?? 0) === 0
                                    }
                                >
                                    <ArrowUp
                                        className={`size-4 transition-transform duration-300 ${
                                            !draft?.trim() &&
                                            (attachmentsQuery.data?.filter(
                                                (a) => !a.isLoading,
                                            )?.length ?? 0) === 0
                                                ? "scale-90"
                                                : "scale-100"
                                        }`}
                                        strokeWidth={2.5}
                                    />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {cautiousEnter
                                    ? "Send message ⌘↵"
                                    : "Send message ↵"}
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                {!isReply && (
                    <ManageModelsBox
                        id={MANAGE_MODELS_COMPARE_DIALOG_ID}
                        mode={{
                            type: "default",
                            onToggleModelConfig: (id) =>
                                void toggleCompareModelConfig(id),
                            onClearModelConfigs: clearCompareModelConfigs,
                        }}
                    />
                )}

                {isReply && (
                    <ManageModelsBox
                        id={MANAGE_MODELS_REPLY_DIALOG_ID}
                        mode={{
                            type: "single",
                            onSetModel: (modelId) => {
                                // Find the model config by modelId
                                const modelConfig = modelConfigs.data?.find(
                                    (m) => m.id === modelId,
                                );
                                if (modelConfig) {
                                    // Update the database with the selected model
                                    void updateReplyModelConfig.mutateAsync({
                                        chatId,
                                        modelId: modelConfig.modelId,
                                    });
                                }
                            },
                            selectedModelConfigId: replyToModelConfig?.id ?? "",
                        }}
                    />
                )}
            </div>
        </div>
    );

    // For centered layout when it's a new chat (no messages yet)
    if (!isQuickChatWindow && (isNewChat || isAnimatingToBottom)) {
        return (
            <>
                <div
                    className={`absolute inset-0 flex items-center justify-center @3xl:p-8 transition-all duration-300 ease-in-out ${
                        isAnimatingToBottom
                            ? "transform translate-y-[calc(50vh-8.5px)]" // 8.5px manual adjustment, unknown reason
                            : ""
                    }`}
                >
                    <div className="w-full max-w-3xl -mt-24">
                        {!isAnimatingToBottom && (
                            <div className="mb-6 text-center">
                                <h2 className="text-2xl font-medium text-foreground">
                                    What can Ripple do for you?
                                </h2>
                            </div>
                        )}

                        {/* Chat input box */}
                        {defaultChatComposer}

                        {/* Tip below the input */}
                        {!isAnimatingToBottom && (
                            <div className="mt-8">
                                <ChatSuggestions
                                    chatId={chatId}
                                    inputRef={inputRef}
                                />
                            </div>
                        )}
                    </div>
                </div>
                {!isAnimatingToBottom && <EmptyState />}
            </>
        );
    }

    return isQuickChatWindow ? (
        <div className="absolute bottom-2 left-2 right-2">
            <AttachmentDropArea
                attachments={attachmentsQuery.data ?? []}
                onFileDrop={fileDrop.mutate}
                onRemove={(attachmentId) =>
                    removeAttachment.mutate({ attachmentId })
                }
            />
            <AutoExpandingTextarea
                ref={inputRef}
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                }}
                onPaste={(e) => handlePaste(e)}
                rows={2}
                onKeyDown={(e) => {
                    if (cautiousEnter) {
                        // Cautious mode: Cmd+Enter to submit
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    } else {
                        // Normal mode: Enter to submit, Shift+Enter for newline
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }
                }}
                placeholder={placeholderText}
                className={`ring-0 w-full rounded-xl bg-foreground/5 focus:shadow-sm
                                placeholder:text-foreground/50 px-3 !border-foreground/10 select-text
                                max-h-[70vh] overflow-y-auto !p-2`}
                autoFocus
                onFocus={() =>
                    inputActions.setFocusedInputId(
                        isReply ? REPLY_CHAT_INPUT_ID : DEFAULT_CHAT_INPUT_ID,
                    )
                }
                onBlur={() => inputActions.setFocusedInputId(null)}
                tabIndex={1} // should be first item to get focus
            />

            {/* Helper text for Cmd+L */}
            {isNextFocus && (
                <div className="absolute top-3 right-2 text-sm text-helper">
                    ⌘L to focus
                </div>
            )}
        </div>
    ) : isReply ? (
        // Relative positioning variant for reply drawer
        <div className="w-full">{defaultChatComposer}</div>
    ) : (
        <div
            className={`absolute bottom-0 left-0 max-w-3xl mx-auto right-0 z-[15] transition-opacity duration-300 
                         ${isAnimatingToBottom ? "opacity-0" : "opacity-100"}`}
        >
            {/* Scroll to bottom button */}
            {!isReply && showScrollButton && handleScrollToBottom && (
                <div className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none">
                    <ScrollToBottomButton onClick={handleScrollToBottom} />
                </div>
            )}
            {defaultChatComposer}
        </div>
    );
}
