import { List, PlugIcon, PlusIcon } from "lucide-react";
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandInput,
    CommandList,
} from "./ui/command";

import { Switch } from "@ui/components/ui/switch";
import { Button } from "./ui/button";
import { ArrowRightIcon, Loader2 } from "lucide-react";
import { getToolsetIcon } from "@core/chorus/Toolsets";
import { ToolsetConfig, Toolset } from "@core/chorus/Toolsets";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DotFilledIcon } from "@radix-ui/react-icons";
import { CommandGroup, CommandItem } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { emit } from "@tauri-apps/api/event";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useShortcut } from "@ui/hooks/useShortcut";
import { dialogActions, useDialogStore } from "@core/infra/DialogStore";
import * as ToolsetsAPI from "@core/chorus/api/ToolsetsAPI";
import { useAppContext } from "@ui/hooks/useAppContext";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import {
    getModelName,
    getProviderName,
    ModelConfig,
} from "@core/chorus/Models";

export const TOOLS_BOX_DIALOG_ID = "tools-box";

function parseEnabledToolIds(
    value: string | undefined,
): Set<string> | undefined {
    if (value === undefined || value.trim() === "") {
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return undefined;
        }

        const ids: string[] = [];
        for (const item of parsed) {
            if (typeof item === "string") {
                ids.push(item);
            }
        }

        return new Set(ids);
    } catch {
        return undefined;
    }
}

function normalizeVertexPublisherModelNameForWebSearch(modelName: string) {
    const trimmed = modelName.trim();
    if (!trimmed) return trimmed;

    const publishersMatch = trimmed.match(
        /^publishers\/([^/]+)\/models\/(.+)$/,
    );
    if (publishersMatch) {
        return `${publishersMatch[1]}/${publishersMatch[2]}`;
    }

    const fullMatch = trimmed.match(
        /^projects\/[^/]+\/locations\/[^/]+\/publishers\/([^/]+)\/models\/(.+)$/,
    );
    if (fullMatch) {
        return `${fullMatch[1]}/${fullMatch[2]}`;
    }

    const modelsMatch = trimmed.match(/^models\/(.+)$/);
    if (modelsMatch) {
        return `google/${modelsMatch[1]}`;
    }

    if (trimmed.includes("/")) {
        return trimmed;
    }

    return `google/${trimmed}`;
}

function supportsNativeWebSearch(model: ModelConfig): boolean {
    const provider = getProviderName(model.modelId);
    const modelName = getModelName(model.modelId);

    switch (provider) {
        case "openai":
            return (
                modelName.startsWith("o") ||
                modelName.startsWith("gpt-4o") ||
                modelName.startsWith("gpt-4.1") ||
                modelName.startsWith("gpt-5")
            );
        case "google":
            return true;
        case "vertex": {
            const normalized =
                normalizeVertexPublisherModelNameForWebSearch(modelName);
            return (
                normalized.startsWith("google/") &&
                normalized.includes("gemini")
            );
        }
        case "anthropic":
            return true;
        case "grok":
            return modelName.startsWith("grok-4");
        default:
            return false;
    }
}

type ToolsetAvailability = {
    canEnable: boolean;
    note?: string;
};

function ToolsetRow({
    toolset,
    config,
    availability,
}: {
    toolset: Toolset;
    config: ToolsetConfig | undefined;
    availability?: ToolsetAvailability;
}) {
    const updateMCPConfig = ToolsetsAPI.useUpdateToolsetsConfig();

    const isEnabled = config?.[toolset.name]?.["enabled"] === "true";
    const canEnable = availability?.canEnable ?? true;
    const isEffectivelyEnabled =
        toolset.name === "web" && availability
            ? isEnabled && availability.canEnable
            : isEnabled;

    const enabledToolIds = parseEnabledToolIds(
        config?.[toolset.name]?.["enabled_tools"],
    );
    const availableTools = toolset.availableTools;
    const allAvailableToolIds = availableTools.map((t) => t.id);

    const toggleToolset = () => {
        if (!canEnable && !isEnabled) {
            return;
        }
        if (toolset.areRequiredParamsFilled(config)) {
            updateMCPConfig.mutate({
                toolsetName: toolset.name,
                parameterId: "enabled",
                value: isEnabled ? "false" : "true",
            });
        } else if (toolset.link) {
            void openUrl(toolset.link);
        }
    };

    return (
        <CommandItem
            className="flex items-center justify-between py-2 px-2"
            onSelect={toggleToolset}
        >
            <div className="flex items-center gap-4 flex-1">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        {getToolsetIcon(toolset.name)}
                        <span className="font-medium">
                            {toolset.displayName}
                        </span>
                        {toolset.status.status === "stopped" ? (
                            <div className="flex items-center gap-1">
                                <DotFilledIcon className="w-3 h-3 text-gray-500" />
                            </div>
                        ) : toolset.status.status === "starting" ? (
                            <div className="flex items-center gap-1 text-gray-500 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-sm">Starting...</span>
                            </div>
                        ) : toolset.status.status === "running" ? (
                            <div className="flex items-center gap-1">
                                <DotFilledIcon className="w-3 h-3 text-green-500" />
                            </div>
                        ) : null}

                        {isEnabled && !toolset.isBuiltIn && (
                            <Popover>
                                <PopoverTrigger
                                    asChild
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        aria-label="View tools"
                                    >
                                        <List className="w-3 h-3" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-96"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="grid gap-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-medium leading-none">
                                                Tools
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        updateMCPConfig.mutate({
                                                            toolsetName:
                                                                toolset.name,
                                                            parameterId:
                                                                "enabled_tools",
                                                            value: "",
                                                        });
                                                    }}
                                                >
                                                    All
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        updateMCPConfig.mutate({
                                                            toolsetName:
                                                                toolset.name,
                                                            parameterId:
                                                                "enabled_tools",
                                                            value: "[]",
                                                        });
                                                    }}
                                                >
                                                    None
                                                </Button>
                                            </div>
                                        </div>

                                        {toolset.status.status !== "running" ? (
                                            <p className="text-sm text-muted-foreground">
                                                Enable this MCP to discover and
                                                configure tools.
                                            </p>
                                        ) : availableTools.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">
                                                No tools discovered yet.
                                            </p>
                                        ) : (
                                            <div className="max-h-64 overflow-y-auto space-y-2">
                                                {availableTools.map((t) => {
                                                    const checked =
                                                        enabledToolIds ===
                                                            undefined ||
                                                        enabledToolIds.has(
                                                            t.id,
                                                        );

                                                    return (
                                                        <div
                                                            key={t.id}
                                                            className="flex items-start justify-between gap-3"
                                                        >
                                                            <div className="flex-1">
                                                                <div className="font-geist-mono text-sm break-all">
                                                                    {t.id}
                                                                </div>
                                                                {t.description && (
                                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                                        {
                                                                            t.description
                                                                        }
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <Switch
                                                                checked={
                                                                    checked
                                                                }
                                                                onCheckedChange={(
                                                                    enabled,
                                                                ) => {
                                                                    const current =
                                                                        enabledToolIds ===
                                                                        undefined
                                                                            ? new Set(
                                                                                  allAvailableToolIds,
                                                                              )
                                                                            : new Set(
                                                                                  enabledToolIds,
                                                                              );

                                                                    if (
                                                                        enabled
                                                                    ) {
                                                                        current.add(
                                                                            t.id,
                                                                        );
                                                                    } else {
                                                                        current.delete(
                                                                            t.id,
                                                                        );
                                                                    }

                                                                    const nextValue =
                                                                        current.size ===
                                                                        allAvailableToolIds.length
                                                                            ? ""
                                                                            : JSON.stringify(
                                                                                  Array.from(
                                                                                      current,
                                                                                  ).sort(),
                                                                              );

                                                                    updateMCPConfig.mutate(
                                                                        {
                                                                            toolsetName:
                                                                                toolset.name,
                                                                            parameterId:
                                                                                "enabled_tools",
                                                                            value: nextValue,
                                                                        },
                                                                    );
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        {toolset.description}
                    </p>
                    {availability?.note && (
                        <p className="text-xs text-muted-foreground">
                            {availability.note}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3 ml-2">
                {toolset.areRequiredParamsFilled(config) ? (
                    <Switch
                        disabled={toolset.name === "web" ? !canEnable : false}
                        checked={isEffectivelyEnabled}
                        onCheckedChange={(enabled) =>
                            updateMCPConfig.mutate({
                                toolsetName: toolset.name,
                                parameterId: "enabled",
                                value: enabled ? "true" : "false",
                            })
                        }
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : toolset.link ? (
                    <Button
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            if (toolset.link) {
                                void openUrl(toolset.link);
                            }
                        }}
                        variant="ghost"
                        size={"sm"}
                    >
                        Set up <ArrowRightIcon className="w-3 h-3" />
                    </Button>
                ) : (
                    <>Set up not yet implemented</>
                )}
            </div>
        </CommandItem>
    );
}

function ToolsBoxContent() {
    const toolsetConfigs = ToolsetsAPI.useToolsetsConfig();
    const toolsets = ToolsetsAPI.useToolsets();
    const { isQuickChatWindow } = useAppContext();
    const selectedModelConfigsCompare =
        ModelsAPI.useSelectedModelConfigsCompare();
    const selectedModelConfigQuickChat =
        ModelsAPI.useSelectedModelConfigQuickChat();

    if (toolsetConfigs.isError || toolsets.isError) {
        return (
            <div>
                Error loading connections: {toolsetConfigs.error?.message}
                {toolsets.error?.message}
            </div>
        );
    }

    if (
        (toolsetConfigs.isLoading && toolsetConfigs.data === undefined) ||
        (toolsets.isLoading && toolsets.data === undefined)
    ) {
        return (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        );
    }

    const selectedModels: ModelConfig[] = isQuickChatWindow
        ? selectedModelConfigQuickChat.data
            ? [selectedModelConfigQuickChat.data]
            : []
        : (selectedModelConfigsCompare.data ?? []);

    const webSupport = selectedModels.map(supportsNativeWebSearch);
    const webSupportAll = webSupport.length > 0 && webSupport.every(Boolean);
    const webSupportAny = webSupport.some(Boolean);

    const webToolsetAvailability: ToolsetAvailability = (() => {
        if (selectedModels.length === 0) {
            return { canEnable: true };
        }
        if (webSupportAll) {
            return { canEnable: true };
        }
        if (webSupportAny) {
            return {
                canEnable: true,
                note: "Some selected models don't support Web Search and will ignore it.",
            };
        }
        return { canEnable: false, note: "Not supported by current model." };
    })();

    return (
        <Command>
            <CommandInput placeholder="Search connections..." autoFocus />
            <CommandList>
                <CommandEmpty>No connections found.</CommandEmpty>
                <CommandGroup heading="Built-in">
                    {toolsets.data
                        ?.filter((toolset) => toolset.isBuiltIn)
                        .map((toolset) => (
                            <ToolsetRow
                                key={toolset.name}
                                toolset={toolset}
                                config={toolsetConfigs.data}
                                availability={
                                    toolset.name === "web"
                                        ? webToolsetAvailability
                                        : undefined
                                }
                            />
                        ))}
                </CommandGroup>
                <CommandGroup
                    heading={
                        <div className="flex items-center justify-between w-full">
                            <span>Custom</span>

                            <button
                                className="text-sm p-1 hover:bg-gray-100 rounded flex items-center gap-1 uppercase tracking-wider font-geist-mono"
                                onClick={(e) => {
                                    e.preventDefault();
                                    // Emit an event to open settings with connections tab
                                    void emit("open_settings", {
                                        tab: "connections",
                                    });
                                }}
                            >
                                <PlusIcon className="w-3 h-3" />
                                <span>Add</span>
                            </button>
                        </div>
                    }
                >
                    {toolsets.data
                        ?.filter((toolset) => !toolset.isBuiltIn)
                        .map((toolset) => (
                            <ToolsetRow
                                key={toolset.name}
                                toolset={toolset}
                                config={toolsetConfigs.data}
                            />
                        ))}

                    <CommandItem
                        onSelect={() => {
                            // Emit an event to open settings with connections tab
                            void emit("open_settings", {
                                tab: "connections",
                            });
                        }}
                    >
                        <div className="flex justify-between w-full items-center gap-1">
                            <div className="flex items-center gap-1">
                                <PlusIcon className="w-3 h-3 mr-1 text-muted-foreground" />
                                <span className="font-medium">
                                    Add MCP server
                                </span>
                            </div>
                            <ArrowRightIcon className="w-3 h-3 text-muted-foreground" />
                        </div>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </Command>
    );
}

function ToolsBox() {
    const toolsets = ToolsetsAPI.useToolsets();
    const { isQuickChatWindow } = useAppContext();
    const selectedModelConfigsCompare =
        ModelsAPI.useSelectedModelConfigsCompare();
    const selectedModelConfigQuickChat =
        ModelsAPI.useSelectedModelConfigQuickChat();
    const toolsBoxIsOpen = useDialogStore(
        (state) => state.activeDialogId === TOOLS_BOX_DIALOG_ID,
    );

    useShortcut(
        ["meta", "t"],
        () => {
            if (toolsBoxIsOpen) {
                dialogActions.closeDialog();
            } else {
                dialogActions.openDialog(TOOLS_BOX_DIALOG_ID);
            }
        },
        {
            isGlobal: true,
        },
    );

    const selectedModels: ModelConfig[] = isQuickChatWindow
        ? selectedModelConfigQuickChat.data
            ? [selectedModelConfigQuickChat.data]
            : []
        : (selectedModelConfigsCompare.data ?? []);

    const webCanEnable =
        selectedModels.length === 0
            ? true
            : selectedModels.some(supportsNativeWebSearch);

    const enabledToolsets =
        toolsets.data
            ?.filter((toolset) => toolset.status.status === "running")
            .filter((toolset) =>
                toolset.name === "web" ? webCanEnable : true,
            ) || [];

    return (
        <>
            <button
                className="inline-flex bg-muted items-center justify-center rounded-full h-7 pl-2 text-sm hover:bg-muted/80 px-3 py-1 ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 flex-shrink-0"
                aria-label="Manage tools"
                onClick={() => dialogActions.openDialog(TOOLS_BOX_DIALOG_ID)}
            >
                <div className="flex items-center gap-0.5">
                    <PlugIcon className="w-3 h-3 text-muted-foreground mr-0.5" />
                    <div className="flex items-center">
                        {enabledToolsets.slice(0, 4).map((toolset, index) => (
                            <Tooltip key={toolset.name}>
                                <TooltipTrigger asChild>
                                    <div
                                        key={toolset.name}
                                        className={`w-5 h-5 rounded-full bg-background flex items-center justify-center -ml-1.5 first:ml-0 border border-border shadow-sm ${
                                            toolset.status.status !== "running"
                                                ? "opacity-50"
                                                : ""
                                        }`}
                                        style={{
                                            zIndex:
                                                enabledToolsets.length - index,
                                        }}
                                    >
                                        <div className="w-3 h-3">
                                            {getToolsetIcon(toolset.name)}
                                        </div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{toolset.displayName}</p>

                                    <div className="flex items-center gap-1">
                                        {toolset.status.status === "running" ? (
                                            <DotFilledIcon className="w-3 h-3 text-green-500" />
                                        ) : (
                                            <DotFilledIcon className="w-3 h-3 text-red-500" />
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                    <span className="pl-0.5">Tools</span>
                    <span className="ml-1 text-muted-foreground font-light">
                        ⌘T
                    </span>
                </div>
            </button>

            <CommandDialog id={TOOLS_BOX_DIALOG_ID}>
                <ToolsBoxContent />
            </CommandDialog>
        </>
    );
}

export default ToolsBox;
