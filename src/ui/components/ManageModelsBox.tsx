import {
    useState,
    useCallback,
    useMemo,
    useRef,
    useLayoutEffect,
    useEffect,
} from "react";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
    DraggableProvided,
    DraggableStateSnapshot,
    DraggableRubric,
} from "@hello-pangea/dnd";
import { useNavigate } from "react-router-dom";
import {
    ModelConfig,
    getProviderLabel,
    getProviderName,
} from "@core/chorus/Models";
import {
    PlusIcon,
    XIcon,
    ArrowBigUpIcon,
    CircleCheckIcon,
} from "lucide-react";
import { ProviderLogo } from "./ui/provider-logo";
import {
    CommandDialog,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandEmpty,
} from "./ui/command";
import { Button } from "./ui/button";
import { emit } from "@tauri-apps/api/event";
import { Badge } from "./ui/badge";
import { dialogActions, useDialogStore } from "@core/infra/DialogStore";
import * as AppMetadataAPI from "@core/chorus/api/AppMetadataAPI";
import { hasApiKey } from "@core/utilities/ProxyUtils";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import * as MessageAPI from "@core/chorus/api/MessageAPI";

// Helper function to filter models by search terms
const filterBySearch = (models: ModelConfig[], searchTerms: string[]) => {
    if (searchTerms.length === 0) return models;
    return models.filter((m) => {
        const providerLabel = getProviderLabel(m.modelId);

        return searchTerms.every(
            (term) =>
                m.displayName.toLowerCase().includes(term) ||
                providerLabel.toLowerCase().includes(term),
        );
    });
};

// Helper function to check if a model is still considered "new"
const isNewModel = (newUntil: string | undefined): boolean => {
    if (!newUntil) return false;

    const newUntilDate = new Date(newUntil);
    const now = new Date();

    return newUntilDate > now;
};

type ModelPickerMode =
    | {
          type: "default"; // multiselect for updating selectedModelConfigs (deprecated)
          onToggleModelConfig: (id: string) => void;
          onClearModelConfigs: () => void;
      }
    | {
          type: "add"; // used for adding to an existing set
          checkedModelConfigIds: string[];
          onAddModel: (id: string) => void;
      }
    | {
          type: "single"; // single select for updating selectedModelConfig
          onSetModel: (id: string) => void;
          selectedModelConfigId: string;
      };

/** A component to render a draggable model pill */
function ModelPill({
    modelConfig,
    handleRemoveModelConfig,
    isDragging,
}: {
    modelConfig: ModelConfig;
    handleRemoveModelConfig: (id: string) => void;
    isDragging: boolean;
}) {
    return (
        <Badge
            variant="secondary"
            className={`${isDragging ? "opacity-75" : ""} flex-shrink-0 max-w-[200px] h-7 font-sans normal-case`}
        >
            <div className="flex items-center gap-2 overflow-hidden">
                <div className="flex-shrink-0">
                    <ProviderLogo modelId={modelConfig.modelId} size="sm" />
                </div>
                <span className="truncate text-sm">
                    {modelConfig.displayName}
                </span>
            </div>
            <button
                onClick={() => handleRemoveModelConfig(modelConfig.id)}
                className="ml-1 rounded-full text-badge-foreground/50 border-none text-sm p-1 hover:text-badge-foreground flex-shrink-0"
            >
                <XIcon className="w-3 h-3" />
            </button>
        </Badge>
    );
}

/** A component to render a group of models with a heading */
function ModelGroup({
    heading,
    models,
    checkedModelConfigIds,
    mode,
    onToggleModelConfig,
    refreshButton,
    emptyState,
    onAddApiKey,
    groupId,
    claudeCodeAvailable,
}: {
    heading: React.ReactNode;
    models: ModelConfig[];
    checkedModelConfigIds: string[];
    mode: ModelPickerMode;
    onToggleModelConfig: (id: string) => void;
    refreshButton?: React.ReactNode;
    emptyState?: React.ReactNode;
    onAddApiKey: () => void;
    groupId?: string;
    claudeCodeAvailable?: boolean;
}) {
    const { data: apiKeys } = AppMetadataAPI.useApiKeys();

    // Determine if a model should be disabled (no API key for the provider)
    const isModelNotAllowed = useCallback(
        (model: ModelConfig) => {
            const provider = getProviderName(model.modelId);

            // Claude Code requires the CLI to be installed
            if (provider === "claude-code") {
                return !claudeCodeAvailable;
            }

            // If user has API key for this provider, allow it
            if (
                apiKeys &&
                provider &&
                hasApiKey(
                    provider.toLowerCase() as keyof typeof apiKeys,
                    apiKeys,
                )
            ) {
                return false;
            }

            // No API key for this provider - model is not allowed
            return true;
        },
        [apiKeys, claudeCodeAvailable],
    );

    return (
        <CommandGroup
            heading={
                <div className="flex items-center justify-between w-full">
                    {heading}
                    {refreshButton}
                </div>
            }
        >
            {emptyState ||
                models.map((m) => (
                    <CommandItem
                        key={m.id}
                        value={groupId ? `${groupId}-${m.id}` : m.id}
                        onSelect={() => {
                            if (!isModelNotAllowed(m)) {
                                onToggleModelConfig(m.id);
                            } else {
                                onAddApiKey();
                            }
                        }}
                        disabled={
                            !m.isEnabled ||
                            (mode.type === "add" &&
                                checkedModelConfigIds.includes(m.id))
                        }
                        className={`group ${isModelNotAllowed(m) ? "opacity-60" : ""}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                                <ProviderLogo modelId={m.modelId} size="sm" />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <p>{m.displayName}</p>
                                        {isNewModel(m.newUntil) && (
                                            <Badge variant="secondary">
                                                <p className="text-muted-foreground text-xs">
                                                    NEW
                                                </p>
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {isModelNotAllowed(m) ? (
                                    getProviderName(m.modelId) === "claude-code" ? (
                                        <span className="text-sm text-muted-foreground">
                                            Install Claude Code CLI
                                        </span>
                                    ) : (
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="text-accent-foreground h-auto p-0 px-1.5"
                                            onClick={(
                                                e: React.MouseEvent<HTMLButtonElement>,
                                            ) => {
                                                e.stopPropagation();
                                                onAddApiKey();
                                            }}
                                        >
                                            Add API Key
                                        </Button>
                                    )
                                ) : (
                                    <>
                                        <p className="text-sm text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 transition-opacity">
                                            ⤶ to{" "}
                                            {mode.type === "single"
                                                ? "select"
                                                : checkedModelConfigIds.includes(
                                                        m.id,
                                                    )
                                                  ? "remove"
                                                  : "add"}
                                        </p>
                                        {checkedModelConfigIds.includes(
                                            m.id,
                                        ) && (
                                            <CircleCheckIcon className="!w-5 !h-5 ml-2 fill-primary text-primary-foreground" />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </CommandItem>
                ))}
        </CommandGroup>
    );
}

export const MANAGE_MODELS_CHAT_DIALOG_ID = "manage-models-chat";
export const MANAGE_MODELS_COMPARE_DIALOG_ID = "manage-models-compare";
export const MANAGE_MODELS_COMPARE_INLINE_DIALOG_ID =
    "manage-models-compare-inline"; // dialog for the inline add model button

/** Main component that handles all model grouping and UI. */
export function ManageModelsBox({
    mode,
    id,
}: {
    mode: ModelPickerMode;
    id: string; // Allow any string ID for flexibility
}) {
    const navigate = useNavigate();
    const isDialogClosed = useDialogStore(
        (state) => state.activeDialogId === null,
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const [showMoreIndicator, setShowMoreIndicator] = useState(false);

    function handleToggleModelConfig(id: string) {
        if (mode.type === "default") {
            mode.onToggleModelConfig(id);
        } else if (mode.type === "add") {
            mode.onAddModel(id);
            dialogActions.closeDialog();
        } else if (mode.type === "single") {
            mode.onSetModel(id);
            dialogActions.closeDialog();
        }
    }

    const handleAddApiKey = () => {
        void emit("open_settings", { tab: "api-keys" });
        dialogActions.closeDialog();
    };

    const selectedModelConfigsCompareResult =
        ModelsAPI.useSelectedModelConfigsCompare();
    const selectedModelConfigsCompare = useMemo(
        () => selectedModelConfigsCompareResult.data ?? [],
        [selectedModelConfigsCompareResult.data],
    );

    const updateSelectedModelConfigsCompare =
        MessageAPI.useUpdateSelectedModelConfigsCompare();
    const modelConfigs = ModelsAPI.useModelConfigs();
    const claudeCodeAvailableQuery = ModelsAPI.useClaudeCodeAvailable();
    const claudeCodeAvailable = claudeCodeAvailableQuery.data?.available ?? false;

    const selectedSingleModelConfig = useMemo(() => {
        if (mode.type === "single") {
            return modelConfigs.data?.find(
                (m) => m.id === mode.selectedModelConfigId,
            );
        }
        return undefined;
    }, [mode, modelConfigs.data]);

    const [searchQuery, setSearchQuery] = useState("");
    const listRef = useRef<HTMLDivElement>(null);

    // model configs that will show a check mark
    const checkedModelConfigIds =
        mode.type === "default"
            ? selectedModelConfigsCompare.map((m) => m.id)
            : mode.type === "single"
              ? selectedSingleModelConfig?.id
                  ? [selectedSingleModelConfig.id]
                  : []
              : mode.checkedModelConfigIds;

    // clear query when dropdown closes
    useEffect(() => {
        if (isDialogClosed) {
            setSearchQuery("");
        }
    }, [isDialogClosed]);

    // Drag and drop handlers
    async function onDragEnd(result: DropResult) {
        if (!result.destination) return;

        const items = [...selectedModelConfigsCompare];
        const [moved] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, moved);
        await updateSelectedModelConfigsCompare.mutateAsync({
            modelConfigs: items,
        });
    }

    // Helper function to render model pills for dragging
    const renderModelPill = (
        provided: DraggableProvided,
        snapshot: DraggableStateSnapshot,
        rubric: DraggableRubric,
    ) => {
        const modelConfig = selectedModelConfigsCompare[rubric.source.index];
        return (
            <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
            >
                <ModelPill
                    modelConfig={modelConfig}
                    handleRemoveModelConfig={() =>
                        mode.type === "default" &&
                        mode.onToggleModelConfig(modelConfig.id)
                    }
                    isDragging={snapshot.isDragging}
                />
            </div>
        );
    };

    // Check if scrolled to end for gradient overlay
    const checkScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const isScrolledToEnd =
            Math.abs(
                container.scrollWidth -
                    container.scrollLeft -
                    container.clientWidth,
            ) < 10; // Small tolerance for rounding errors

        setShowMoreIndicator(
            !isScrolledToEnd && selectedModelConfigsCompare.length >= 3,
        );
    }, [selectedModelConfigsCompare.length]);

    // Check on mount and when model configs change
    useEffect(() => {
        checkScroll();
    }, [selectedModelConfigsCompare, checkScroll]);

    const handleScroll = useCallback(() => {
        checkScroll();
    }, [checkScroll]);

    // Model refresh hooks removed - only Anthropic models are supported now

    // Helper to add a new custom model
    const handleAddCustomModel = useCallback(() => {
        navigate("/new-prompt");
    }, [navigate]);

    // Compute filtered model groups based on search
    const modelGroups = useMemo(() => {
        const searchTerms = searchQuery
            .toLowerCase()
            .split(" ")
            .filter(Boolean);

        const nonInternalModelConfigs =
            modelConfigs.data?.filter((m) => !m.isInternal) ?? [];
        const systemModels = nonInternalModelConfigs.filter(
            (m) => m.author === "system",
        );
        const userModels = nonInternalModelConfigs.filter(
            (m) => m.author === "user",
        );

        // Claude Code models use the local Claude Code CLI subscription
        const claudeCodeModels = systemModels.filter(
            (m) => getProviderName(m.modelId) === "claude-code",
        );

        // Direct provider models - only Anthropic
        const anthropicModels = systemModels.filter(
            (m) => getProviderName(m.modelId) === "anthropic",
        );

        return {
            custom: filterBySearch(userModels, searchTerms),
            claudeCode: filterBySearch(claudeCodeModels, searchTerms),
            anthropic: filterBySearch(anthropicModels, searchTerms),
        };
    }, [modelConfigs.data, searchQuery]);

    useLayoutEffect(() => {
        if (!listRef.current) return;

        requestAnimationFrame(() => {
            if (!listRef.current) {
                console.error("Can't find the scroll container");
                return;
            }
            console.log("resetting scroll on", listRef.current.scrollTop);
            listRef.current.scrollTop = 0;
        });
    }, [searchQuery]);

    return (
        <>
            <CommandDialog
                id={id}
                commandProps={{
                    shouldFilter: false,
                }}
            >
                <div>
                    {mode.type === "default" &&
                        selectedModelConfigsCompare.length > 0 && (
                            <div className="px-3 py-2 relative overflow-hidden border-b border-border">
                                <div
                                    className="overflow-x-auto no-scrollbar flex-grow"
                                    ref={containerRef}
                                    onScroll={handleScroll}
                                >
                                    <DragDropContext
                                        onDragEnd={(result) =>
                                            void onDragEnd(result)
                                        }
                                    >
                                        <Droppable
                                            droppableId="model-pills"
                                            direction="horizontal"
                                            getContainerForClone={() =>
                                                document.body
                                            }
                                            renderClone={renderModelPill}
                                        >
                                            {(provided) => (
                                                <div
                                                    className="flex items-center gap-2 whitespace-nowrap pr-8"
                                                    ref={provided.innerRef}
                                                    {...provided.droppableProps}
                                                >
                                                    {selectedModelConfigsCompare.map(
                                                        (
                                                            modelConfig,
                                                            index,
                                                        ) => (
                                                            <Draggable
                                                                key={
                                                                    modelConfig.id
                                                                }
                                                                draggableId={
                                                                    modelConfig.id
                                                                }
                                                                index={index}
                                                            >
                                                                {
                                                                    renderModelPill
                                                                }
                                                            </Draggable>
                                                        ),
                                                    )}
                                                    {provided.placeholder}
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            mode.onClearModelConfigs();
                                                        }}
                                                        className="text-sm text-muted-foreground hover:text-foreground flex-shrink-0"
                                                        title="Clear all models"
                                                    >
                                                        Clear{" "}
                                                        <span className="text-[10px] inline-flex items-center gap-0.5 bg-muted-foreground/10 rounded px-1 py-0.5">
                                                            <span>⌘</span>
                                                            <ArrowBigUpIcon className="w-2.5 h-2.5 -mt-0.5" />
                                                            <span>⌫</span>
                                                        </span>
                                                    </button>
                                                </div>
                                            )}
                                        </Droppable>
                                    </DragDropContext>
                                </div>
                                {/* Gradient overlay */}
                                {showMoreIndicator && (
                                    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent to-background pointer-events-none"></div>
                                )}
                            </div>
                        )}
                    <CommandInput
                        placeholder="Search models..."
                        value={searchQuery}
                        onValueChange={(value) => {
                            setSearchQuery(value);
                        }}
                        autoFocus
                    />
                </div>
                <CommandList ref={listRef}>
                    <CommandEmpty>No models found</CommandEmpty>

                    {/* Anthropic Models */}
                    {modelGroups.anthropic.length > 0 && (
                        <ModelGroup
                            heading="Anthropic"
                            models={modelGroups.anthropic}
                            checkedModelConfigIds={checkedModelConfigIds}
                            mode={mode}
                            onToggleModelConfig={handleToggleModelConfig}
                            onAddApiKey={handleAddApiKey}
                            groupId="anthropic"
                        />
                    )}

                    {/* Claude Code Models - uses local Claude Code subscription */}
                    {modelGroups.claudeCode.length > 0 && (
                        <ModelGroup
                            heading={
                                <div className="flex items-center justify-between w-full">
                                    <span>Claude Code Subscription</span>
                                </div>
                            }
                            models={modelGroups.claudeCode}
                            checkedModelConfigIds={checkedModelConfigIds}
                            mode={mode}
                            onToggleModelConfig={handleToggleModelConfig}
                            onAddApiKey={handleAddApiKey}
                            groupId="claude-code"
                            claudeCodeAvailable={claudeCodeAvailable}
                        />
                    )}

                    {/* Custom Models */}
                    {modelGroups.custom.length > 0 && (
                        <ModelGroup
                            heading={
                                <div className="flex items-center justify-between w-full">
                                    <span>Custom</span>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleAddCustomModel();
                                        }}
                                        className="p-1.5 hover:bg-accent text-muted-foreground/50 rounded-md flex items-center gap-1"
                                        title="Add custom model"
                                    >
                                        <PlusIcon className="w-3 h-3" />
                                        <span className="text-sm">Add</span>
                                    </button>
                                </div>
                            }
                            models={modelGroups.custom}
                            checkedModelConfigIds={checkedModelConfigIds}
                            mode={mode}
                            onToggleModelConfig={handleToggleModelConfig}
                            onAddApiKey={handleAddApiKey}
                            groupId="custom"
                        />
                    )}

                </CommandList>
            </CommandDialog>
        </>
    );
}
