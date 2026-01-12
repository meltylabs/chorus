import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ProviderName } from "@core/chorus/Models";
import { ProviderLogo } from "./ui/provider-logo";
import { Card } from "./ui/card";
import { CheckIcon, FlameIcon, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Switch } from "./ui/switch";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";

interface ApiKeysFormProps {
    apiKeys: Record<string, string>;
    onApiKeyChange: (provider: string, value: string) => void;
}

// Providers that support model visibility settings (they have dynamic models from API)
const PROVIDERS_WITH_MODEL_SETTINGS = [
    "openrouter",
    "kimi",
    "anthropic",
    "openai",
    "google",
    "perplexity",
    "grok",
];

export default function ApiKeysForm({
    apiKeys,
    onApiKeyChange,
}: ApiKeysFormProps) {
    const [selectedProvider, setSelectedProvider] = useState<string | null>(
        null,
    );

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
            id: "kimi",
            name: "Moonshot AI (Kimi)",
            placeholder: "sk-...",
            url: "https://platform.moonshot.ai/console/api-keys",
        },
        {
            id: "firecrawl",
            name: "Firecrawl",
            placeholder: "fc-...",
            url: "https://www.firecrawl.dev/app/api-keys",
        },
    ];

    const showModelSettings =
        selectedProvider &&
        PROVIDERS_WITH_MODEL_SETTINGS.includes(selectedProvider) &&
        apiKeys[selectedProvider];

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
                            {provider.id === "firecrawl" ? (
                                <FlameIcon className="w-4 h-4" />
                            ) : (
                                <ProviderLogo
                                    provider={provider.id as ProviderName}
                                    size="lg"
                                />
                            )}
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

            {selectedProvider && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="space-y-2">
                        <Label htmlFor={`${selectedProvider}-key`}>
                            {
                                providers.find((p) => p.id === selectedProvider)
                                    ?.name
                            }{" "}
                            API Key
                        </Label>
                        <Input
                            id={`${selectedProvider}-key`}
                            type="password"
                            placeholder={
                                providers.find((p) => p.id === selectedProvider)
                                    ?.placeholder
                            }
                            value={apiKeys[selectedProvider] || ""}
                            onChange={(e) =>
                                onApiKeyChange(selectedProvider, e.target.value)
                            }
                        />
                        <p className="text-sm text-muted-foreground">
                            <a
                                href={
                                    providers.find(
                                        (p) => p.id === selectedProvider,
                                    )?.url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Get{" "}
                                {
                                    providers.find(
                                        (p) => p.id === selectedProvider,
                                    )?.name
                                }{" "}
                                API key
                            </a>
                            .
                        </p>
                    </div>

                    {showModelSettings && (
                        <ModelVisibilitySettings provider={selectedProvider} />
                    )}
                </div>
            )}
        </div>
    );
}

function ModelVisibilitySettings({ provider }: { provider: string }) {
    const modelsQuery = ModelsAPI.useModels();
    const toggleVisibility = ModelsAPI.useToggleModelVisibility();
    const [searchQuery, setSearchQuery] = useState("");

    const providerModels = useMemo(() => {
        if (!modelsQuery.data) return [];
        return modelsQuery.data
            .filter((m) => m.id.startsWith(`${provider}::`))
            .filter((m) => !m.isInternal)
            .sort((a, b) => {
                // Sort enabled models first, then alphabetically by display name
                if (a.isEnabled !== b.isEnabled) {
                    return a.isEnabled ? -1 : 1;
                }
                return a.displayName.localeCompare(b.displayName);
            });
    }, [modelsQuery.data, provider]);

    const filteredModels = useMemo(() => {
        if (!searchQuery) return providerModels;
        const query = searchQuery.toLowerCase();
        return providerModels.filter(
            (m) =>
                m.displayName.toLowerCase().includes(query) ||
                m.id.toLowerCase().includes(query),
        );
    }, [providerModels, searchQuery]);

    const enabledCount = providerModels.filter((m) => m.isEnabled).length;

    if (modelsQuery.isLoading) {
        return (
            <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">
                    Loading models...
                </span>
            </div>
        );
    }

    if (providerModels.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                    Model Visibility
                </Label>
                <span className="text-sm text-muted-foreground">
                    {enabledCount} of {providerModels.length} enabled
                </span>
            </div>
            <p className="text-sm text-muted-foreground">
                Choose which models to show in the model picker. Hidden models
                won&apos;t appear in your model selection.
            </p>

            {providerModels.length > 5 && (
                <Input
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mb-2"
                />
            )}

            <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                {filteredModels.map((model) => (
                    <div
                        key={model.id}
                        className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50"
                    >
                        <div className="flex-1 min-w-0 mr-3">
                            <p className="text-sm font-medium truncate">
                                {model.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                                {model.id.split("::")[1]}
                            </p>
                        </div>
                        <Switch
                            checked={model.isEnabled}
                            onCheckedChange={(checked) => {
                                toggleVisibility.mutate({
                                    modelId: model.id,
                                    isEnabled: checked,
                                });
                            }}
                            disabled={toggleVisibility.isPending}
                        />
                    </div>
                ))}
            </div>

            {providerModels.length > 3 && (
                <div className="flex gap-2 pt-2">
                    <button
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                            providerModels.forEach((model) => {
                                if (!model.isEnabled) {
                                    toggleVisibility.mutate({
                                        modelId: model.id,
                                        isEnabled: true,
                                    });
                                }
                            });
                        }}
                    >
                        Enable all
                    </button>
                    <span className="text-xs text-muted-foreground">•</span>
                    <button
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                            providerModels.forEach((model) => {
                                if (model.isEnabled) {
                                    toggleVisibility.mutate({
                                        modelId: model.id,
                                        isEnabled: false,
                                    });
                                }
                            });
                        }}
                    >
                        Disable all
                    </button>
                </div>
            )}
        </div>
    );
}
