import { ProviderLogo } from "./ui/provider-logo";
import { CheckIcon } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@ui/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@ui/components/ui/command";
import { getProviderName, ModelConfig } from "@core/chorus/Models";
import { useCallback, useState } from "react";
import { usePostHog } from "posthog-js/react";
import { hasApiKey } from "@core/utilities/ProxyUtils";
import { useMemo } from "react";
import { ALLOWED_MODEL_IDS_FOR_QUICK_CHAT } from "@ui/lib/models";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import * as AppMetadataAPI from "@core/chorus/api/AppMetadataAPI";

interface ModelSelectorProps {
    onModelSelect: (modelId: string) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function QuickChatModelSelector({
    onModelSelect,
    open,
    onOpenChange,
}: ModelSelectorProps) {
    const posthog = usePostHog();
    const [isOpen, setIsOpen] = useState(false);
    const { data: apiKeys } = AppMetadataAPI.useApiKeys();

    const onChangeOpen = useCallback(
        (newOpen: boolean) => {
            console.log("Popover onOpenChange called", newOpen);
            setIsOpen(newOpen);
            onOpenChange?.(newOpen);
        },
        [onOpenChange],
    );

    // Use the Quick Chat model hook to keep track of the selected model
    const { data: selectedModelConfigQuickChat } =
        ModelsAPI.useSelectedModelConfigQuickChat();
    const modelConfigsQuery = ModelsAPI.useModelConfigs();

    // Determine if a model should be allowed based on whether user has the API key
    const isModelAllowed = useCallback(
        (model: ModelConfig) => {
            // Get the provider for this model
            const provider = getProviderName(model.modelId);

            // Local models (ollama, lmstudio) don't require API keys
            if (provider === "ollama" || provider === "lmstudio") {
                return true;
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
                return true;
            }

            return false;
        },
        [apiKeys],
    );

    const quickChatSelectableModelConfigs = useMemo(
        () =>
            modelConfigsQuery?.data?.filter(
                (config) =>
                    config.isEnabled &&
                    !config.id.includes("chorus") &&
                    !config.displayName.includes("Deprecated") &&
                    (config.modelId.startsWith("openrouter::") ||
                        ALLOWED_MODEL_IDS_FOR_QUICK_CHAT.includes(config.id)) &&
                    isModelAllowed(config),
            ) ?? [],
        [modelConfigsQuery, isModelAllowed],
    );

    const handleModelSelect = useCallback(
        (modelId: string) => {
            onModelSelect(modelId);
            posthog?.capture("quick_chat_model_selected", {
                modelId,
            });
        },
        [onModelSelect, posthog],
    );

    return (
        <Popover
            open={open !== undefined ? open : isOpen}
            onOpenChange={onChangeOpen}
        >
            <PopoverTrigger asChild>
                <button
                    tabIndex={-1}
                    type="button"
                    onClick={() => onChangeOpen(true)}
                    className="text-sm text-foreground/75 inline-flex items-center gap-1 hover:bg-foreground/5 rounded-md px-1.5 py-0.5"
                >
                    {selectedModelConfigQuickChat ? (
                        <div className="flex items-center gap-1">
                            <ProviderLogo
                                provider={getProviderName(
                                    selectedModelConfigQuickChat.modelId,
                                )}
                                size="sm"
                            />
                            <span>
                                {selectedModelConfigQuickChat.displayName}
                            </span>
                        </div>
                    ) : (
                        <span>Select model</span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="p-0 ml-6 bg-background rounded-lg text-foreground"
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                    }
                }}
            >
                <Command>
                    <CommandInput placeholder="Choose an ambient chat model..." />
                    <CommandEmpty>No models found</CommandEmpty>
                    <CommandList className="max-h-[300px] overflow-y-auto">
                        {quickChatSelectableModelConfigs.map((config) => (
                            <CommandItem
                                key={config.id}
                                onSelect={() => {
                                    console.log(
                                        "CommandItem onSelect called",
                                        config.id,
                                    );
                                    handleModelSelect(config.id);
                                    onChangeOpen(false); // Close after selection
                                }}
                                disabled={!isModelAllowed(config)}
                            >
                                <div className="flex items-center gap-2">
                                    <ProviderLogo
                                        provider={getProviderName(
                                            config.modelId,
                                        )}
                                        size="sm"
                                    />
                                    {config.displayName}
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        {config.id ===
                                            selectedModelConfigQuickChat?.id && (
                                            <CheckIcon className="w-4 h-4 ml-2" />
                                        )}
                                    </div>
                                </div>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
