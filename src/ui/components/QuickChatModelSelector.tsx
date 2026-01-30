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
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import * as AppMetadataAPI from "@core/chorus/api/AppMetadataAPI";
import { useSettings } from "./hooks/useSettings";

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
    const settings = useSettings();

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
            const provider = getProviderName(model.modelId);

            // Vertex models require Vertex AI settings (credentials).
            if (provider === "vertex") {
                const vertex = settings?.vertexAI;
                if (!vertex) return false;
                return Boolean(
                    vertex.projectId.trim() &&
                        vertex.location.trim() &&
                        vertex.serviceAccountClientEmail.trim() &&
                        vertex.serviceAccountPrivateKey.trim(),
                );
            }

            // Custom provider models require the custom provider to exist and have credentials.
            if (
                provider === "custom_openai" ||
                provider === "custom_anthropic"
            ) {
                const providerId = model.modelId.split("::")[1] || "";
                const kind =
                    provider === "custom_anthropic" ? "anthropic" : "openai";
                const customProvider = (settings?.customProviders ?? []).find(
                    (p) => p.id === providerId && p.kind === kind,
                );
                if (!customProvider) return false;
                return Boolean(
                    customProvider.apiBaseUrl.trim() &&
                        customProvider.apiKey.trim(),
                );
            }

            if (!apiKeys) return false;

            return hasApiKey(
                provider.toLowerCase() as keyof typeof apiKeys,
                apiKeys,
            );
        },
        [apiKeys, settings],
    );

    const quickChatSelectableModelConfigs = useMemo(
        () =>
            modelConfigsQuery?.data?.filter(
                (config) =>
                    config.isEnabled &&
                    !config.isInternal &&
                    !config.isDeprecated &&
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
