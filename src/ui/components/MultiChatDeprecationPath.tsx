import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "./ui/button";
import {
    Maximize2Icon,
    MergeIcon,
    RemoveFormattingIcon,
    StopCircleIcon,
    RefreshCcwIcon,
    CircleAlertIcon,
    CheckCircleIcon,
    ThumbsUpIcon,
    ThumbsDownIcon,
    IterationCcwIcon,
    SplitIcon,
    InfoIcon,
    UndoIcon,
} from "lucide-react";
import { XIcon, PlusIcon } from "lucide-react";
import RetroSpinner from "./ui/retro-spinner";
import { TooltipContent } from "./ui/tooltip";
import { Tooltip } from "./ui/tooltip";
import { TooltipTrigger } from "./ui/tooltip";
import * as Models from "@core/chorus/Models";
import { invoke } from "@tauri-apps/api/core";
import { ProviderLogo } from "@ui/components/ui/provider-logo";
import {
    MANAGE_MODELS_COMPARE_INLINE_DIALOG_ID,
    ManageModelsBox,
} from "./ManageModelsBox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "./ui/dialog";
import { MessageMarkdown } from "./renderers/MessageMarkdown";
import { Toggle } from "./ui/toggle";
import { Separator } from "./ui/separator";
import {
    Message,
    BlockType,
    ChatBlock,
    BrainstormBlock,
    CompareBlock,
} from "@core/chorus/ChatState";
import { Metrics } from "./Metrics";
import * as Reviews from "@core/chorus/reviews";
import * as Brainstorms from "@core/chorus/brainstorm";
import Markdown from "react-markdown";
import { MessageCostDisplay } from "./MessageCostDisplay";
import { Skeleton } from "./ui/skeleton";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import { useWaitForAppMetadata } from "@ui/hooks/useWaitForAppMetadata";
import { ProviderName } from "@core/chorus/Models";
import { dialogActions } from "@core/infra/DialogStore";
import * as MessageAPI from "@core/chorus/api/MessageAPI";
import SimpleCopyButton from "./unused/CopyButton";

function getReviewerLongName(
    model: string,
    allModelConfigs: Models.ModelConfig[],
) {
    if (Object.keys(Reviews.REVIEWERS).includes(model)) {
        const reviewer =
            Reviews.REVIEWERS[model as keyof typeof Reviews.REVIEWERS];
        return reviewer.longName;
    } else {
        return getMessageModelName(model, allModelConfigs);
    }
}

function getBrainstormerLongName(
    model: string,
    allModelConfigs: Models.ModelConfig[],
) {
    if (Object.keys(Brainstorms.BRAINSTORMER_NAMES).includes(model)) {
        return Brainstorms.BRAINSTORMER_NAMES[
            model as keyof typeof Brainstorms.BRAINSTORMER_NAMES
        ].longName;
    }
    return getMessageModelName(model, allModelConfigs);
}

function getReviewerProvider(model: string): ProviderName {
    if (Object.keys(Reviews.REVIEWERS).includes(model)) {
        return Reviews.REVIEWERS[model as keyof typeof Reviews.REVIEWERS]
            .provider;
    }
    throw new Error(`Unknown reviewer model: ${model}`);
}

function getBrainstormerProvider(model: string): ProviderName {
    if (Object.keys(Brainstorms.BRAINSTORMER_NAMES).includes(model)) {
        return Brainstorms.BRAINSTORMER_NAMES[
            model as keyof typeof Brainstorms.BRAINSTORMER_NAMES
        ].provider;
    }
    throw new Error(`Unknown brainstormer model: ${model}`);
}

/**
 * For legacy reasons, the 'model' value in the message row might not always correspond
 * to a valid id in the models table.
 * @param model - a "model" string in a Messages row
 * @param allModelConfigs - all model configs in the database
 * @returns display name for the "model" (model config)
 */
function getMessageModelName(
    model: string,
    allModelConfigs: Models.ModelConfig[],
) {
    const matchingModelConfig = allModelConfigs.find((m) => m.id === model);
    if (matchingModelConfig) {
        return matchingModelConfig.displayName;
    }
    // if it's a legacy model, return the name we inserted on migration
    const [provider, modelId, modelName] = model.split("::");
    if (provider === "unknown_provider" && modelId === "unknown_model") {
        return modelName;
    }
    // final fallback: unknown
    return "Unknown sender";
}

function ReviewMessageView({
    message,
    messageSetId,
    isLastRow,
}: {
    message: Message;
    messageSetId: string;
    isLastRow: boolean;
}) {
    const applyRevision = MessageAPI.useApplyRevision();
    const allModelConfigs = ModelsAPI.useModelConfigs();

    const { decision, explanation, revision } = Reviews.parseReview(
        message.text,
        message.state !== "streaming",
    );

    if (message.state !== "streaming" && decision === undefined) {
        console.warn("No decision found in review message", message);
        return null;
    }

    const explanationErrored =
        message.state !== "streaming" && decision !== "AGREE" && !explanation;
    const revisionErrored =
        message.state !== "streaming" && decision !== "AGREE" && !revision;
    if (explanationErrored) {
        console.warn("No explanation found in message " + message.text);
    }
    if (revisionErrored) {
        // disabled for noise
        // console.warn("No revision found in message " + message.text);
    }

    return (
        <div
            key={message.id}
            className={`w-full border px-3 rounded-lg -ml-[2px] select-none`}
        >
            <div
                // hardcode height to avoid layout shift when loading
                className="flex items-center gap-2 h-10 w-full justify-between text-muted-foreground"
            >
                <div className="inline-flex items-center gap-2 font-mono uppercase text-sm tracking-wider">
                    {decision === "AGREE" ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <>
                                    <div className="bg-muted/50 rounded-full p-1 border flex items-center justify-center">
                                        <ThumbsUpIcon className="w-3 h-3 text-muted-foreground" />{" "}
                                    </div>
                                    Agree
                                </>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>
                                    The assistant's answer is correct and
                                    helpful.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    ) : decision === "INFO" ? (
                        <>
                            <div className="bg-sky-500/10 rounded-full p-1 border !border-sky-500/10 flex items-center justify-center">
                                <InfoIcon className="w-3 h-3 text-sky-800" />{" "}
                            </div>
                            More Info
                        </>
                    ) : decision === "DISAGREE" ? (
                        <>
                            <div className="bg-red-500/10 rounded-full p-1 border !border-red-500/10 flex items-center justify-center">
                                <ThumbsDownIcon className="w-3 h-3 text-red-500" />{" "}
                            </div>
                            Disagree
                        </>
                    ) : (
                        <RetroSpinner className="w-4 h-4" />
                    )}
                </div>
                <div className="flex items-center text-muted-foreground mr-2">
                    <Tooltip>
                        <TooltipTrigger>
                            <ProviderLogo
                                className="w-3 h-3 inline-block"
                                provider={getReviewerProvider(message.model)}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {allModelConfigs.data
                                ? getReviewerLongName(
                                      message.model,
                                      allModelConfigs.data,
                                  )
                                : "Loading..."}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="text-sm">
                {decision === "AGREE" ? (
                    <></>
                ) : explanationErrored ? (
                    <div className="italic mt-2">Error writing explanation</div>
                ) : (
                    <div className="mt-2 mb-2 select-text">{explanation}</div>
                )}
            </div>

            {decision &&
                ["DISAGREE", "INFO"].includes(decision) &&
                explanation && ( // if the explanation isn't in, don't show the button
                    <div className="mt-4 mb-4">
                        <Button
                            className={`w-full hover:bg-badge`}
                            variant="outline"
                            size="sm"
                            disabled={
                                message.state === "streaming" ||
                                message.reviewState === "applied" ||
                                revisionErrored ||
                                !revision ||
                                !isLastRow
                            }
                            onClick={() => {
                                applyRevision.mutate({
                                    chatId: message.chatId,
                                    messageSetId,
                                    reviewMessage: message,
                                });
                            }}
                        >
                            {revisionErrored ? (
                                <>Error writing revision</>
                            ) : message.reviewState === "applied" ? (
                                <>
                                    <CheckCircleIcon className="w-3 h-3" />
                                    Applied
                                </>
                            ) : (
                                <>
                                    {message.state === "streaming" && (
                                        // mb-2 to align base with other icons
                                        <RetroSpinner className="w-3 h-3 mb-2" />
                                    )}
                                    <IterationCcwIcon className="w-3 h-3" />{" "}
                                    Apply
                                </>
                            )}
                        </Button>
                    </div>
                )}
        </div>
    );
}

const fullScreenDialogId = (messageId: string) =>
    `fullscreen-dialog-${messageId}`;

function AIMessageView({
    message,
    blockType,
    shortcutNumber,
    isLastRow,
    isQuickChatWindow,
    isSynthesis,
}: {
    message: Message;
    blockType: BlockType;
    shortcutNumber?: number;
    isLastRow?: boolean;
    isQuickChatWindow?: boolean;
    isSynthesis?: boolean;
}) {
    const [raw, setRaw] = useState(false);
    const [streamStartTime, setStreamStartTime] = useState<Date>();

    const modelConfigsQuery = ModelsAPI.useModelConfigs();
    const modelName =
        message.model === "chorus::synthesize"
            ? "Synthesis"
            : getMessageModelName(message.model, modelConfigsQuery.data ?? []);
    const providerName = Models.getProviderName(
        modelConfigsQuery.data?.find((m) => m.id === message.model)?.modelId ??
            "",
    );

    // Set stream start time when streaming begins
    useEffect(() => {
        if (message.state === "streaming" && !streamStartTime) {
            setStreamStartTime(new Date());
        }
    }, [message.state, streamStartTime]);

    const messageClasses = [
        "relative w-fit", // w-fit so that the header buttons won't go right of the right edge of the message box
        !isQuickChatWindow && "rounded-md border-[0.090rem]",
        blockType === "compare"
            ? message.selected
                ? "!border-border-accent text-foreground-accent"
                : "opacity-90 hover:opacity-100 transition-opacity"
            : "",
        isLastRow && !isQuickChatWindow && !message.selected
            ? "cursor-pointer"
            : "",
    ]
        .filter(Boolean)
        .join(" ");

    const modelConfigQuery = ModelsAPI.useModelConfig(message.model);

    const stopMessage = MessageAPI.useStopMessage();
    const selectMessage = MessageAPI.useSelectMessage();
    const restartMessage = MessageAPI.useRestartMessageLegacy(
        message.chatId,
        message.messageSetId,
        message.id,
    );

    return (
        <div
            id={`message-${message.id}`}
            className={`group/message-set-view ${
                isQuickChatWindow ? "text-sm" : "bg-background"
            }`}
        >
            <div
                onClick={(e) => {
                    if (isSynthesis) return;
                    if (message.selected) return;
                    // Don't trigger selection if user is selecting text
                    if (window.getSelection()?.toString()) {
                        e.stopPropagation();
                        return;
                    }
                    if (isLastRow) {
                        selectMessage.mutate({
                            chatId: message.chatId,
                            messageSetId: message.messageSetId,
                            messageId: message.id,
                            blockType,
                        });
                    }
                }}
                className={messageClasses}
                style={{
                    overflowWrap: "anywhere", // tailwind doesn't support this yet
                }}
            >
                {/* AI message header (model name + buttons) */}
                <div
                    className={`absolute -top-3 left-0 right-0
                            flex items-center justify-between
                            ${blockType === "compare" && message.selected ? "font-medium" : ""}`}
                >
                    {isQuickChatWindow ? (
                        // placeholder to make sure the message buttons go on the right
                        <div></div>
                    ) : blockType !== "compare" ? (
                        // chat mode: model icon on hover
                        <div className="ml-2 px-2 bg-background invisible group-hover/message-set-view:visible text-muted-foreground">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="">
                                        <ProviderLogo
                                            size="sm"
                                            provider={providerName}
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>{modelName}</TooltipContent>
                            </Tooltip>
                        </div>
                    ) : (
                        // compare mode: model name, always visible
                        <div className={`ml-2 px-2.5 bg-background`}>
                            <span className="print-model-name text-sm font-[400] text-gray-800 rounded-full py-1 inline-flex items-center gap-1">
                                {isSynthesis ? (
                                    <MergeIcon className="w-3 h-3 inline-block mb-0.5 mr-1" />
                                ) : (
                                    modelName
                                )}
                            </span>
                            {shortcutNumber !== undefined && isLastRow && (
                                <span
                                    className={`no-print ml-1 text-sm ${
                                        !message.selected
                                            ? "text-muted-foreground/30"
                                            : "text-muted-foreground"
                                    }`}
                                >
                                    ⌘{shortcutNumber}
                                </span>
                            )}
                        </div>
                    )}
                    <div
                        className={`no-print hidden group-hover/message-set-view:flex mr-3 px-2 py-1 gap-2 text-muted-foreground bg-background
                            ${isQuickChatWindow ? "rounded-lg" : ""}
                            `}
                    >
                        {message.state === "streaming" ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className="hover:text-foreground"
                                        onClick={(e) => {
                                            e.stopPropagation(); // prevent message from being selected
                                            stopMessage.mutate({
                                                chatId: message.chatId,
                                                messageId: message.id,
                                            });
                                        }}
                                    >
                                        <StopCircleIcon className="w-3.5 h-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>Stop</TooltipContent>
                            </Tooltip>
                        ) : isLastRow ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        disabled={!modelConfigQuery.isSuccess}
                                        className="hover:text-foreground"
                                        onClick={(e) => {
                                            e.stopPropagation(); // prevent message from being selected
                                            if (modelConfigQuery.data) {
                                                restartMessage.mutate({
                                                    modelConfig:
                                                        modelConfigQuery.data,
                                                });
                                            }
                                        }}
                                    >
                                        <RefreshCcwIcon
                                            strokeWidth={1.5}
                                            className="w-3.5 h-3.5"
                                        />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>Regenerate</TooltipContent>
                            </Tooltip>
                        ) : null}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <SimpleCopyButton
                                    className="hover:text-foreground"
                                    text={message.text}
                                    size="sm"
                                />
                            </TooltipTrigger>
                            <TooltipContent>Copy</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="hover:text-foreground"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        dialogActions.openDialog(
                                            fullScreenDialogId(message.id),
                                        );
                                    }}
                                >
                                    <Maximize2Icon
                                        strokeWidth={1.5}
                                        className="w-3.5 h-3.5"
                                    />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>Open full screen</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                <div className="relative">
                    <div
                        className={`${message.selected ? "" : "overflow-y-auto"}
                    ${isQuickChatWindow ? "py-2.5 border !border-border-accent max-w-full inline-block break-words px-3.5 rounded-xl" : "p-4 pb-6"}`}
                    >
                        {message.text ? (
                            <MessageMarkdown text={message.text} />
                        ) : isSynthesis ? (
                            <SynthesisAnimation />
                        ) : message.state === "streaming" ? (
                            <RetroSpinner />
                        ) : (
                            <div className="text-sm text-muted-foreground/50 uppercase font-[350] font-geist-mono tracking-wider">
                                <CircleAlertIcon className="w-3 h-3 inline-block mr-1 mb-0.5" />
                                Model did not return a response
                            </div>
                        )}
                        {message.errorMessage && (
                            <div className="text-md rounded-md my-1 items-center justify-between font-[350]">
                                <div className="flex items-center text-destructive font-medium">
                                    {message.errorMessage}
                                </div>
                                {isQuickChatWindow && (
                                    <div className="flex flex-col gap-2 mt-4">
                                        <p className="text-red-800">
                                            It's possible that Chorus doesn't
                                            have screenshot permissions, which
                                            is required for vision mode.
                                        </p>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                void invoke(
                                                    "open_screen_recording_settings",
                                                );
                                            }}
                                        >
                                            Allow Chorus to see your screen
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {streamStartTime && !isQuickChatWindow && (
                        <Metrics
                            text={message.text}
                            startTime={streamStartTime}
                            isStreaming={message.state === "streaming"}
                        />
                    )}
                    <MessageCostDisplay
                        costUsd={message.costUsd}
                        promptTokens={message.promptTokens}
                        completionTokens={message.completionTokens}
                        isStreaming={message.state === "streaming"}
                        isQuickChatWindow={isQuickChatWindow ?? false}
                    />
                </div>
            </div>

            <Dialog id={fullScreenDialogId(message.id)}>
                <DialogContent className="max-w-4xl max-h-[95vh] w-full overflow-auto">
                    <DialogTitle className="pt-2 px-3">
                        <div className="flex items-center justify-between">
                            <h1 className="text-lg font-medium">{modelName}</h1>
                            <div className="flex items-center gap-2.5">
                                <Tooltip>
                                    <TooltipTrigger asChild tabIndex={-1}>
                                        <Toggle
                                            pressed={raw}
                                            onPressedChange={() => {
                                                setRaw(!raw);
                                            }}
                                        >
                                            <RemoveFormattingIcon className="w-3 h-3" />
                                        </Toggle>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        className="font-normal"
                                        side="bottom"
                                    >
                                        Toggle raw text
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild tabIndex={-1}>
                                        <SimpleCopyButton text={message.text} />
                                    </TooltipTrigger>
                                    <TooltipContent
                                        className="font-normal"
                                        side="bottom"
                                    >
                                        Copy
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild tabIndex={-1}>
                                        <button
                                            className="w-3 h-3"
                                            onClick={() =>
                                                dialogActions.closeDialog()
                                            }
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        className="font-normal"
                                        side="bottom"
                                    >
                                        Close
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    </DialogTitle>
                    <Separator />
                    <DialogDescription className="px-3 pb-4">
                        {raw ? (
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {message.text}
                            </div>
                        ) : (
                            <MessageMarkdown text={message.text} />
                        )}
                    </DialogDescription>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SynthesisAnimation() {
    return (
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <div className="relative">
                <div className="flex gap-3 mb-4">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="w-3 h-3 rounded-full bg-accent"
                            style={{
                                animationDelay: `${i * 150}ms`,
                                animation: "synthesisPulse 1.5s infinite",
                            }}
                        />
                    ))}
                </div>
                <div
                    className="w-4 h-4 rounded-full bg-foreground-accent absolute left-1/2 -translate-x-1/2 bottom-0"
                    style={{
                        animation: "synthesisMerge 1.5s infinite",
                    }}
                />
            </div>
            <div className="text-sm text-muted-foreground animate-pulse inline-flex items-center gap-2">
                <RetroSpinner />
                Synthesizing responses...
            </div>
        </div>
    );
}

function CompareBlockView({
    messageSetId,
    compareBlock,
    isLastRow = false,
    isQuickChatWindow,
}: {
    messageSetId: string;
    compareBlock: CompareBlock;
    isLastRow: boolean;
    isQuickChatWindow: boolean;
}) {
    const { chatId } = useParams();
    const addMessageToCompareBlock = MessageAPI.useAddMessageToCompareBlock(
        chatId!,
    );
    const addModelToCompareConfigs = MessageAPI.useAddModelToCompareConfigs();

    const aiMessages = compareBlock.messages;
    const synthesisMessage = compareBlock.synthesis;
    const isSynthesisSelected = synthesisMessage?.selected ?? false;
    const aiMessagesToDisplay = [
        ...(synthesisMessage && synthesisMessage.selected
            ? [synthesisMessage]
            : []),
        ...aiMessages,
    ];

    const selectSynthesis = MessageAPI.useSelectSynthesis();
    const deselectSynthesis = MessageAPI.useDeselectSynthesis();

    const handleAddModel = (modelId: string) => {
        // First add the model to the selected models list
        addModelToCompareConfigs.mutate({
            newSelectedModelConfigId: modelId,
        });
        // Then add it to the current message set
        addMessageToCompareBlock.mutate({
            messageSetId,
            modelId,
        });
    };

    function renderMessage(message: Message, index: number) {
        const shortcutNumber = isLastRow ? index + 1 : undefined;

        return (
            <div
                key={message.id}
                className={`mr-2 ${isQuickChatWindow ? "pt-0" : "pt-2"} ${
                    isQuickChatWindow
                        ? ""
                        : "flex-1 w-full min-w-[400px] max-w-[550px]"
                } w-full max-w-prose`}
            >
                <AIMessageView
                    message={message}
                    blockType="compare"
                    shortcutNumber={shortcutNumber}
                    isLastRow={isLastRow}
                    isQuickChatWindow={isQuickChatWindow}
                    isSynthesis={message.model === "chorus::synthesize"}
                />
            </div>
        );
    }

    return (
        <div
            className={`flex w-full h-fit pb-2 ${
                // get horizontal scroll bars, plus hackily disable y scrolling
                // because we're seeing scroll bars when we shouldn't
                "overflow-x-auto scrollbar-only-on-hover overflow-y-hidden"
            }`}
        >
            <div className="flex-none w-10 mt-1">
                {isLastRow && aiMessagesToDisplay.length > 1 && (
                    <Tooltip>
                        {/* synthesis button */}
                        <TooltipTrigger asChild>
                            {isSynthesisSelected ? (
                                <button
                                    className="text-sm h-7 w-7 rounded-full bg-badge hover:bg-accent flex items-center justify-center"
                                    onClick={() => {
                                        deselectSynthesis.mutate({
                                            chatId: chatId!,
                                            messageSetId,
                                        });
                                    }}
                                >
                                    <SplitIcon className="w-3 h-3" />
                                </button>
                            ) : (
                                <button
                                    className="text-sm h-7 w-7 rounded-full bg-badge hover:bg-accent flex items-center justify-center"
                                    onClick={() => {
                                        selectSynthesis.mutate({
                                            chatId: chatId!,
                                            messageSetId,
                                        });
                                    }}
                                >
                                    <MergeIcon className="w-3 h-3" />
                                </button>
                            )}
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start">
                            {isSynthesisSelected
                                ? "Revert to original responses"
                                : "Synthesize replies into a single message (⌘S)"}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
            {aiMessagesToDisplay.map((message, index) => {
                return renderMessage(message, index);
            })}
            {isLastRow && (
                <>
                    <button
                        className="w-14 flex-none text-sm text-muted-foreground rounded-md border-[0.090rem] py-[0.6rem] px-2 mt-2 h-fit hover:bg-accent"
                        onClick={() => {
                            dialogActions.openDialog(
                                MANAGE_MODELS_COMPARE_INLINE_DIALOG_ID,
                            );
                        }}
                    >
                        <div className="flex flex-col items-center gap-1">
                            <PlusIcon className="w-3 h-3" />
                            Add
                        </div>
                    </button>

                    {/* Add Model box (can go basically anywhere, but shouldn't be inside the button) */}
                    <ManageModelsBox
                        id={MANAGE_MODELS_COMPARE_INLINE_DIALOG_ID}
                        mode={{
                            type: "add",
                            checkedModelConfigIds: aiMessages.map(
                                (m) => m.model,
                            ),
                            onAddModel: handleAddModel,
                        }}
                    />
                </>
            )}
        </div>
    );
}

function ChatBlockView({
    messageSetId,
    chatBlock,
    isLastRow = false,
    isQuickChatWindow,
}: {
    messageSetId: string;
    chatBlock: ChatBlock;
    isLastRow: boolean;
    isQuickChatWindow: boolean;
}) {
    const { chatId } = useParams();

    const allModelConfigs = ModelsAPI.useModelConfigs();
    const appMetadata = useWaitForAppMetadata();
    const reviewsEnabled = appMetadata["reviews_enabled"] === "true";
    const setReviewsEnabled = MessageAPI.useSetReviewsEnabled();
    const unapplyRevisions = MessageAPI.useUnapplyRevisions();
    const hardApplyAndDeleteReviews = MessageAPI.useHardApplyAndDeleteReviews();
    const generateReviews = MessageAPI.useGenerateReviews();

    const originalMessage = chatBlock.message;

    const reviewMessages = chatBlock.reviews
        .map((message) => {
            const { decision, explanation, revision } = Reviews.parseReview(
                message.text,
                message.state !== "streaming",
            );
            const displayBig = decision !== "AGREE" && explanation;
            const isLoading = message.state === "streaming";
            return {
                message,
                decision,
                explanation,
                revision,
                displayBig,
                isLoading,
            };
        })
        .sort(
            (a, b) =>
                Reviews.ACTIVE_REVIEWERS_ORDER.indexOf(a.message.model) -
                Reviews.ACTIVE_REVIEWERS_ORDER.indexOf(b.message.model),
        );
    const appliedRevision = reviewMessages.find(
        (r) => r.message.reviewState === "applied",
    )?.revision;
    const message = originalMessage
        ? appliedRevision
            ? {
                  // super hacky
                  ...originalMessage,
                  text: appliedRevision,
              }
            : originalMessage
        : undefined;

    const handleRegenerateReviews = async () => {
        const reviewText = chatBlock.reviews.find(
            (r) => r.reviewState === "applied",
        )?.text;
        const revision = reviewText
            ? Reviews.parseReview(reviewText, true).revision
            : undefined;
        if (!revision) {
            console.error(
                "No revision found when attempting to apply and regenerate reviews",
            );
            return;
        }
        await hardApplyAndDeleteReviews.mutateAsync({
            chatId: chatId!,
            messageSetId,
            revision,
        });
        await generateReviews.mutateAsync({
            chatId: chatId!,
            messageSetId,
        });
    };

    const bigMessages = reviewMessages.filter((r) => r.displayBig);
    const smallMessages = reviewMessages.filter((r) => !r.displayBig);
    return (
        <div
            className={`${isQuickChatWindow ? "" : "ml-10"} flex w-full select-none`}
        >
            <div
                className={`mr-2 ${isQuickChatWindow ? "pt-0" : "pt-2"} w-full max-w-prose`}
            >
                {message && (
                    <AIMessageView
                        message={message}
                        blockType="chat"
                        isLastRow={isLastRow}
                        isQuickChatWindow={isQuickChatWindow}
                        isSynthesis={false}
                    />
                )}
                <div className="flex flex-row gap-4 items-center mt-1">
                    {appliedRevision && isLastRow && (
                        <button
                            className="text-sm text-muted-foreground/70 hover:text-muted-foreground inline-flex items-center gap-1"
                            onClick={() => {
                                unapplyRevisions.mutate({
                                    chatId: chatId!,
                                    messageSetId,
                                });
                            }}
                        >
                            <UndoIcon className="w-3 h-3" />
                            Undo
                        </button>
                    )}
                    {appliedRevision && (
                        <button
                            className="text-sm text-muted-foreground/70 hover:text-muted-foreground inline-flex items-center gap-1"
                            onClick={() => void handleRegenerateReviews()}
                        >
                            <RefreshCcwIcon className="w-3 h-3" />
                            Review again
                        </button>
                    )}
                </div>
            </div>
            {!isQuickChatWindow && (
                <div className="w-64 h-fit flex-none sticky top-0 ml-4 ">
                    {!reviewsEnabled ? (
                        <button
                            className="text-sm text-muted-foreground/70 hover:text-muted-foreground"
                            onClick={() => {
                                setReviewsEnabled.mutate({ enabled: true });
                            }}
                        >
                            <span className="tracking-wider">⌘⇧R</span> Show
                            Reviews
                        </button>
                    ) : (
                        <>
                            <h3 className="text-[0.7rem] flex tracking-wider font-medium uppercase font-mono">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="text-gray-600">
                                            Reviews
                                        </span>
                                    </TooltipTrigger>

                                    <TooltipContent>
                                        A panel of AIs will review each message.
                                        Toggle with{" "}
                                        <kbd>
                                            <span>⌘</span>
                                            <span className="-pl-1 mb-0.5 text-sm">
                                                ⇧
                                            </span>
                                            R
                                        </kbd>
                                    </TooltipContent>
                                </Tooltip>

                                <button
                                    className="ml-4 font-sans font-normal text-muted-foreground/70 hover:text-muted-foreground"
                                    onClick={() => {
                                        setReviewsEnabled.mutate({
                                            enabled: false,
                                        });
                                    }}
                                >
                                    <span className="tracking-wider">⌘⇧R</span>{" "}
                                    Hide
                                </button>
                            </h3>
                            <div className="flex flex-col gap-2">
                                <div className="flex flex-row items-start gap-3">
                                    {smallMessages.map((r) => (
                                        <Tooltip key={r.message.model}>
                                            <TooltipTrigger>
                                                <div className="flex flex-col justify-center items-center gap-2 relative my-2">
                                                    {r.decision == "AGREE" ? (
                                                        <ThumbsUpIcon
                                                            strokeWidth={1.5}
                                                            className="w-4 h-4 text-muted-foreground/80 hover:text-muted-foreground"
                                                        />
                                                    ) : (
                                                        <ProviderLogo
                                                            key={
                                                                r.message.model
                                                            }
                                                            className={` w-4 h-4 ${
                                                                r.isLoading
                                                                    ? "animate-pulse"
                                                                    : "text-muted-foreground/80"
                                                            } 
                                                          
                                                            `}
                                                            provider={getReviewerProvider(
                                                                r.message.model,
                                                            )}
                                                        />
                                                    )}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent className="inline-block max-w-sm">
                                                {r.explanation ?? "Loading..."}{" "}
                                                <br />
                                                <div className="flex items-center gap-1">
                                                    <ProviderLogo
                                                        key={r.message.model}
                                                        className={` w-5 h-5 text-white inline-flex  `}
                                                        provider={getReviewerProvider(
                                                            r.message.model,
                                                        )}
                                                    />
                                                    {allModelConfigs.data
                                                        ? getReviewerLongName(
                                                              r.message.model,
                                                              allModelConfigs.data,
                                                          )
                                                        : "Loading..."}
                                                </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    ))}
                                </div>
                                {bigMessages.map((r) => (
                                    <ReviewMessageView
                                        key={r.message.id}
                                        message={r.message}
                                        messageSetId={messageSetId}
                                        isLastRow={isLastRow}
                                    />
                                ))}
                            </div>
                            {!reviewMessages.length &&
                                (message?.state === "streaming" ? (
                                    <div className="text-sm italic text-muted-foreground">
                                        This message will be reviewed by{" "}
                                        {Reviews.ACTIVE_REVIEWERS_ORDER.length}{" "}
                                        models.
                                    </div>
                                ) : (
                                    <button
                                        className="text-sm text-muted-foreground/70 hover:text-muted-foreground my-2"
                                        onClick={() => {
                                            generateReviews.mutate({
                                                chatId: chatId!,
                                                messageSetId,
                                            });
                                        }}
                                    >
                                        Generate reviews
                                    </button>
                                ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function BrainstormBlockView({
    brainstormBlock,
}: {
    brainstormBlock: BrainstormBlock;
}) {
    const allModelConfigs = ModelsAPI.useModelConfigs();

    const ideas = brainstormBlock.ideaMessages.flatMap((message) =>
        Brainstorms.parseIdeaMessage(message.text).map((idea) => ({
            idea,
            model: message.model,
        })),
    );
    return (
        <div className="columns-1 sm:columns-2 md:columns-3 mx-10 gap-2 space-y-2 overflow-x-auto">
            {ideas.length === 0
                ? Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                          key={index}
                          className="w-[200px] h-[100px] rounded-lg px-3 py-2 break-inside-avoid border flex flex-col overflow-clip space-y-2"
                      />
                  ))
                : ideas.map(({ idea, model }, index) => (
                      <div
                          key={index}
                          className="rounded-lg px-3 py-2 break-inside-avoid w-full border flex flex-col overflow-clip space-y-2"
                      >
                          {idea.advantage && (
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">
                                  <Markdown>{idea.advantage}</Markdown>
                              </span>
                          )}
                          <MessageMarkdown text={idea.idea} />
                          <div className="flex flex-row items-end justify-end w-full">
                              <Tooltip>
                                  <TooltipTrigger>
                                      <ProviderLogo
                                          provider={getBrainstormerProvider(
                                              model,
                                          )}
                                          className="opacity-50"
                                      />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      {allModelConfigs.data
                                          ? getBrainstormerLongName(
                                                model,
                                                allModelConfigs.data,
                                            )
                                          : "Loading..."}
                                  </TooltipContent>
                              </Tooltip>
                          </div>
                      </div>
                  ))}
            {brainstormBlock.ideaMessages.filter((m) => m.state === "streaming")
                .length > 0 && (
                <div className="text-sm italic text-muted-foreground">
                    <RetroSpinner />
                </div>
            )}
        </div>
    );
}

export { CompareBlockView, ChatBlockView, BrainstormBlockView };
