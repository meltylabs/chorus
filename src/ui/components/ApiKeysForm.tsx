import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ProviderName } from "@core/chorus/Models";
import { ProviderLogo } from "./ui/provider-logo";
import { Card } from "./ui/card";
import {
    CheckIcon,
    Loader2Icon,
    RefreshCcwIcon,
    SearchIcon,
    XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@ui/lib/utils";
import { ScrollArea } from "./ui/scroll-area";
import { toast } from "sonner";

interface ApiKeysFormProps {
    apiKeys: Record<string, string>;
    onApiKeyChange: (provider: string, value: string) => void;
}

const providers = [
    {
        id: "anthropic",
        name: "Anthropic",
        placeholder: "sk-ant-...",
        url: "https://console.anthropic.com/settings/keys",
    },
    {
        id: "openai",
        name: "OpenAI",
        placeholder: "sk-...",
        url: "https://platform.openai.com/api-keys",
    },
    {
        id: "google",
        name: "Google AI (Gemini)",
        placeholder: "AI...",
        url: "https://aistudio.google.com/apikey",
    },
    {
        id: "perplexity",
        name: "Perplexity",
        placeholder: "pplx-...",
        url: "https://www.perplexity.ai/account/api/keys",
    },
    {
        id: "openrouter",
        name: "OpenRouter",
        placeholder: "sk-or-...",
        url: "https://openrouter.ai/keys",
    },
    {
        id: "grok",
        name: "xAI",
        placeholder: "xai-...",
        url: "https://console.x.ai/settings/keys",
    },
    {
        id: "groq",
        name: "Groq",
        placeholder: "gsk_...",
        url: "https://console.groq.com/keys",
    },
    {
        id: "mistral",
        name: "Mistral",
        placeholder: "...",
        url: "https://console.mistral.ai/api-keys",
    },
    {
        id: "cerebras",
        name: "Cerebras",
        placeholder: "csk-...",
        url: "https://cloud.cerebras.ai/platform",
    },
    {
        id: "fireworks",
        name: "Fireworks",
        placeholder: "fw_...",
        url: "https://fireworks.ai/account/api-keys",
    },
    {
        id: "together",
        name: "Together.ai",
        placeholder: "...",
        url: "https://api.together.xyz/settings/api-keys",
    },
    {
        id: "nvidia",
        name: "Nvidia",
        placeholder: "nvapi-...",
        url: "https://build.nvidia.com/explore/discover",
    },
];

export default function ApiKeysForm({
    apiKeys,
    onApiKeyChange,
}: ApiKeysFormProps) {
    const [selectedProvider, setSelectedProvider] = useState<string | null>(
        null,
    );
    const [fetching, setFetching] = useState(false);
    const [modelSearchQuery, setModelSearchQuery] = useState("");
    const [bulkUpdating, setBulkUpdating] = useState<
        "enable" | "disable" | null
    >(null);
    const queryClient = useQueryClient();

    const { data: models } = useQuery(ModelsAPI.modelQueries.list());

    const refreshOpenAI = ModelsAPI.useRefreshOpenAIModels();
    const refreshAnthropic = ModelsAPI.useRefreshAnthropicModels();
    const refreshGoogle = ModelsAPI.useRefreshGoogleModels();
    const refreshGrok = ModelsAPI.useRefreshGrokModels();
    const refreshGroq = ModelsAPI.useRefreshGroqModels();
    const refreshMistral = ModelsAPI.useRefreshMistralModels();
    const refreshCerebras = ModelsAPI.useRefreshCerebrasModels();
    const refreshFireworks = ModelsAPI.useRefreshFireworksModels();
    const refreshTogether = ModelsAPI.useRefreshTogetherModels();
    const refreshNvidia = ModelsAPI.useRefreshNvidiaModels();
    const refreshOpenRouter = ModelsAPI.useRefreshOpenRouterModels();

    const toggleModel = ModelsAPI.useToggleModelEnabled();
    const setProviderModelsEnabled = ModelsAPI.useSetProviderModelsEnabled();

    const handleFetchModels = async (providerId: string) => {
        setFetching(true);
        try {
            switch (providerId) {
                case "openai":
                    await refreshOpenAI.mutateAsync();
                    break;
                case "anthropic":
                    await refreshAnthropic.mutateAsync();
                    break;
                case "google":
                    await refreshGoogle.mutateAsync();
                    break;
                case "grok":
                    await refreshGrok.mutateAsync();
                    break;
                case "groq":
                    await refreshGroq.mutateAsync();
                    break;
                case "mistral":
                    await refreshMistral.mutateAsync();
                    break;
                case "cerebras":
                    await refreshCerebras.mutateAsync();
                    break;
                case "fireworks":
                    await refreshFireworks.mutateAsync();
                    break;
                case "together":
                    await refreshTogether.mutateAsync();
                    break;
                case "nvidia":
                    await refreshNvidia.mutateAsync();
                    break;
                case "openrouter":
                    await refreshOpenRouter.mutateAsync();
                    break;
            }
            await queryClient.invalidateQueries({ queryKey: ["models"] });
        } catch (error) {
            console.error("Failed to fetch models:", error);
            const providerName =
                providers.find((p) => p.id === providerId)?.name ?? providerId;
            toast.error(`Failed to fetch ${providerName} models`, {
                description:
                    error instanceof Error ? error.message : String(error),
            });
        } finally {
            setFetching(false);
        }
    };

    const handleToggleModel = async (modelId: string, enabled: boolean) => {
        await toggleModel.mutateAsync({ modelId, enabled });
    };

    const providerModels = useMemo(() => {
        if (!selectedProvider) return [];
        return (
            models?.filter((m) => m.id.startsWith(`${selectedProvider}::`)) ||
            []
        );
    }, [models, selectedProvider]);

    const enabledCount = providerModels.filter((m) => m.isEnabled).length;

    const filteredProviderModels = useMemo(() => {
        const query = modelSearchQuery.trim().toLowerCase();
        if (!query) return providerModels;
        return providerModels.filter((model) => {
            const haystack = `${model.displayName} ${model.id}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [providerModels, modelSearchQuery]);

    const enabledCountFiltered = filteredProviderModels.filter(
        (m) => m.isEnabled,
    ).length;

    const providerInfo = providers.find((p) => p.id === selectedProvider);

    const handleEnableAll = async () => {
        if (!selectedProvider) return;
        setBulkUpdating("enable");
        try {
            await setProviderModelsEnabled.mutateAsync({
                providerId: selectedProvider,
                enabled: true,
            });
        } finally {
            setBulkUpdating(null);
        }
    };

    const handleDisableAll = async () => {
        if (!selectedProvider) return;
        setBulkUpdating("disable");
        try {
            await setProviderModelsEnabled.mutateAsync({
                providerId: selectedProvider,
                enabled: false,
            });
        } finally {
            setBulkUpdating(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
                {providers.map((provider) => (
                    <Card
                        key={provider.id}
                        className={`relative p-6 cursor-pointer hover:bg-muted transition-colors ${
                            selectedProvider === provider.id
                                ? "ring-2 ring-primary"
                                : ""
                        }`}
                        onClick={() => setSelectedProvider(provider.id)}
                    >
                        <div className="flex flex-col items-center gap-2 text-center">
                            <ProviderLogo
                                provider={provider.id as ProviderName}
                                size="lg"
                            />
                            <span className="font-medium">{provider.name}</span>
                        </div>
                        {apiKeys[provider.id] && (
                            <div className="absolute top-2 right-2">
                                <CheckIcon className="w-4 h-4 text-green-500" />
                            </div>
                        )}
                    </Card>
                ))}
            </div>

            {selectedProvider && providerInfo && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="space-y-2">
                        <Label htmlFor={`${selectedProvider}-key`}>
                            {providerInfo.name} API Key
                        </Label>
                        <Input
                            id={`${selectedProvider}-key`}
                            type="password"
                            placeholder={providerInfo.placeholder}
                            value={apiKeys[selectedProvider] || ""}
                            onChange={(e) =>
                                onApiKeyChange(selectedProvider, e.target.value)
                            }
                        />
                        <p className="text-sm text-muted-foreground">
                            <a
                                href={providerInfo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Get {providerInfo.name} API key
                            </a>
                        </p>
                    </div>

                    {apiKeys[selectedProvider] &&
                        selectedProvider !== "perplexity" && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Models</Label>
                                    <div className="flex items-center gap-2">
                                        <div className="relative w-[260px]">
                                            <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                value={modelSearchQuery}
                                                onChange={(e) =>
                                                    setModelSearchQuery(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Search models…"
                                                className="h-9 pl-8 pr-8"
                                            />
                                            {modelSearchQuery.trim() !== "" && (
                                                <button
                                                    type="button"
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                                                    onClick={() =>
                                                        setModelSearchQuery("")
                                                    }
                                                    title="Clear search"
                                                >
                                                    <XIcon className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                handleFetchModels(
                                                    selectedProvider,
                                                )
                                            }
                                            disabled={fetching}
                                        >
                                            <RefreshCcwIcon
                                                className={cn(
                                                    "h-4 w-4",
                                                    fetching
                                                        ? "animate-spin"
                                                        : "",
                                                )}
                                            />
                                            Fetch Models
                                        </Button>
                                    </div>
                                </div>

                                {providerModels.length > 0 ? (
                                    <div className="rounded-lg border bg-card overflow-hidden">
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-b sticky top-0 z-10">
                                            <div>Model ID</div>
                                            <div className="justify-self-end">
                                                Status
                                            </div>
                                        </div>

                                        <ScrollArea className="h-72">
                                            <div className="divide-y">
                                                {filteredProviderModels.length ===
                                                0 ? (
                                                    <div className="px-3 py-8 text-sm text-muted-foreground">
                                                        No models match your
                                                        search.
                                                    </div>
                                                ) : (
                                                    filteredProviderModels.map(
                                                        (model) => (
                                                            <div
                                                                key={model.id}
                                                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 items-center hover:bg-muted/20"
                                                            >
                                                                <span
                                                                    className="text-sm font-mono truncate"
                                                                    title={
                                                                        model.displayName
                                                                    }
                                                                >
                                                                    {
                                                                        model.displayName
                                                                    }
                                                                </span>

                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="xs"
                                                                    aria-pressed={
                                                                        model.isEnabled
                                                                    }
                                                                    onClick={() =>
                                                                        handleToggleModel(
                                                                            model.id,
                                                                            !model.isEnabled,
                                                                        )
                                                                    }
                                                                    className={cn(
                                                                        "justify-self-end rounded-full font-geist-mono tracking-wider uppercase",
                                                                        model.isEnabled
                                                                            ? "border-green-500/30 bg-green-500/10 text-green-700 hover:bg-green-500/15 dark:text-green-400"
                                                                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                                                                    )}
                                                                    title="Toggle enabled/disabled"
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            "h-2 w-2 rounded-full",
                                                                            model.isEnabled
                                                                                ? "bg-green-500"
                                                                                : "bg-muted-foreground/40",
                                                                        )}
                                                                    />
                                                                    {model.isEnabled
                                                                        ? "Enabled"
                                                                        : "Disabled"}
                                                                </Button>
                                                            </div>
                                                        ),
                                                    )
                                                )}
                                            </div>
                                        </ScrollArea>

                                        <div className="flex flex-wrap justify-between gap-2 px-3 py-2 border-t bg-background/60">
                                            <div className="text-sm text-muted-foreground">
                                                {modelSearchQuery.trim()
                                                    ? `${enabledCountFiltered} of ${filteredProviderModels.length} shown enabled · ${enabledCount} of ${providerModels.length} total enabled`
                                                    : `${enabledCount} of ${providerModels.length} enabled`}
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleDisableAll}
                                                    disabled={
                                                        enabledCount === 0 ||
                                                        bulkUpdating !== null
                                                    }
                                                >
                                                    {bulkUpdating ===
                                                    "disable" ? (
                                                        <>
                                                            <Loader2Icon className="h-4 w-4 animate-spin" />
                                                            Disabling…
                                                        </>
                                                    ) : (
                                                        "Disable all"
                                                    )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={handleEnableAll}
                                                    disabled={
                                                        enabledCount ===
                                                            providerModels.length ||
                                                        bulkUpdating !== null
                                                    }
                                                >
                                                    {bulkUpdating ===
                                                    "enable" ? (
                                                        <>
                                                            <Loader2Icon className="h-4 w-4 animate-spin" />
                                                            Enabling…
                                                        </>
                                                    ) : (
                                                        "Enable all"
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No models found. Click "Fetch Models" to
                                        load available models.
                                    </p>
                                )}
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}
