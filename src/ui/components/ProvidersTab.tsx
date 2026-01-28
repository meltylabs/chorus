import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { fetch } from "@tauri-apps/plugin-http";
import { useQueryClient } from "@tanstack/react-query";
import {
    CustomProviderSettings,
    ProviderModelDefinition,
    Settings,
    SettingsManager,
    VertexAISettings,
} from "@core/utilities/Settings";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import {
    Trash2,
    Plus,
    RefreshCcwIcon,
    ChevronLeft,
    Pencil,
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";

const EMPTY_VERTEX: VertexAISettings = {
    projectId: "",
    location: "global",
    serviceAccountClientEmail: "",
    serviceAccountPrivateKey: "",
    models: [],
};

function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/g, "");
}

type ProvidersTabScreen =
    | { type: "list" }
    | { type: "vertex" }
    | { type: "custom"; providerId: string };

function getCustomProviderTypeLabel(kind: CustomProviderSettings["kind"]) {
    return kind === "openai"
        ? "OpenAI-compatible provider"
        : "Anthropic-compatible provider";
}

function hasVertexCredentials(vertex: VertexAISettings) {
    return Boolean(
        vertex.projectId.trim() &&
            vertex.location.trim() &&
            vertex.serviceAccountClientEmail.trim() &&
            vertex.serviceAccountPrivateKey.trim(),
    );
}

function ModelsEditor({
    models,
    onChange,
    newLabel = "New",
}: {
    models: ProviderModelDefinition[];
    onChange: (models: ProviderModelDefinition[]) => void;
    newLabel?: string;
}) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-[1fr_2fr_auto] gap-2 text-xs text-muted-foreground">
                <div>Nick name</div>
                <div>Model ID</div>
                <div />
            </div>

            {models.length === 0 && (
                <div className="text-sm text-muted-foreground">
                    No models added yet.
                </div>
            )}

            {models.map((m, idx) => (
                <div
                    key={`${m.modelId}-${idx}`}
                    className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center"
                >
                    <Input
                        value={m.nickname ?? ""}
                        placeholder="optional"
                        onChange={(e) => {
                            const next = [...models];
                            next[idx] = {
                                ...next[idx],
                                nickname: e.target.value,
                            };
                            onChange(next);
                        }}
                    />
                    <Input
                        value={m.modelId}
                        placeholder="gpt-4o-mini"
                        onChange={(e) => {
                            const next = [...models];
                            next[idx] = {
                                ...next[idx],
                                modelId: e.target.value,
                            };
                            onChange(next);
                        }}
                        className="font-mono"
                    />
                    <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => {
                            const next = models.filter((_, i) => i !== idx);
                            onChange(next);
                        }}
                        title="Delete"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}

            <div className="flex justify-end gap-2 pt-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([])}
                    disabled={models.length === 0}
                >
                    Delete all
                </Button>
                <Button
                    size="sm"
                    onClick={() =>
                        onChange([...models, { nickname: "", modelId: "" }])
                    }
                >
                    <Plus className="h-4 w-4" /> {newLabel}
                </Button>
            </div>
        </div>
    );
}

export function ProvidersTab() {
    const queryClient = useQueryClient();
    const settingsManager = useMemo(() => SettingsManager.getInstance(), []);

    const [vertexAI, setVertexAI] = useState<VertexAISettings>(EMPTY_VERTEX);
    const [customProviders, setCustomProviders] = useState<
        CustomProviderSettings[]
    >([]);
    const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(
        null,
    );
    const [screen, setScreen] = useState<ProvidersTabScreen>({ type: "list" });

    const invalidateModels = async () => {
        await queryClient.invalidateQueries(ModelsAPI.modelQueries.list());
        await queryClient.invalidateQueries(
            ModelsAPI.modelConfigQueries.listConfigs(),
        );
    };

    const persistSettings = async (
        partial: Pick<Settings, "vertexAI" | "customProviders">,
    ) => {
        const current = await settingsManager.get();
        await settingsManager.set({
            ...current,
            ...partial,
        });
        await invalidateModels();
    };

    useEffect(() => {
        const load = async () => {
            const settings = await settingsManager.get();
            setVertexAI(settings.vertexAI ?? EMPTY_VERTEX);
            setCustomProviders(settings.customProviders ?? []);
        };
        void load();
    }, [settingsManager]);

    useEffect(() => {
        if (screen.type !== "custom") return;
        const exists = customProviders.some((p) => p.id === screen.providerId);
        if (!exists) {
            setScreen({ type: "list" });
        }
    }, [customProviders, screen]);

    const updateVertex = async (next: VertexAISettings) => {
        setVertexAI(next);
        await persistSettings({ vertexAI: next, customProviders });
    };

    const updateCustomProviders = async (next: CustomProviderSettings[]) => {
        setCustomProviders(next);
        await persistSettings({ vertexAI, customProviders: next });
    };

    const addCustomProvider = async () => {
        const id = uuidv4();
        const next: CustomProviderSettings = {
            id,
            kind: "openai",
            name: `Custom Provider ${customProviders.length + 1}`,
            apiBaseUrl: "https://api.openai.com/v1",
            apiKey: "",
            models: [],
        };
        await updateCustomProviders([...customProviders, next]);
        setScreen({ type: "custom", providerId: id });
    };

    const fetchModelsForProvider = async (provider: CustomProviderSettings) => {
        if (provider.kind !== "openai") return;
        if (!provider.apiBaseUrl.trim()) {
            toast.error("Missing API Base URL");
            return;
        }

        setFetchingProviderId(provider.id);
        try {
            const modelsUrl = `${normalizeBaseUrl(provider.apiBaseUrl)}/models`;
            const headers: Record<string, string> = {};
            if (provider.apiKey.trim()) {
                headers.Authorization = `Bearer ${provider.apiKey}`;
            }

            const response = await fetch(modelsUrl, { headers });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    errorText ||
                        `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const data = (await response.json()) as unknown;
            const candidates = (() => {
                if (
                    typeof data === "object" &&
                    data !== null &&
                    "data" in data &&
                    Array.isArray((data as { data?: unknown }).data)
                ) {
                    return (data as { data: unknown[] }).data;
                }
                if (
                    typeof data === "object" &&
                    data !== null &&
                    "models" in data &&
                    Array.isArray((data as { models?: unknown }).models)
                ) {
                    return (data as { models: unknown[] }).models;
                }
                return [];
            })();

            const modelIds = candidates
                .map((m) => {
                    if (typeof m === "object" && m !== null && "id" in m) {
                        const value = (m as { id?: unknown }).id;
                        return typeof value === "string" ? value : undefined;
                    }
                    return undefined;
                })
                .filter((v): v is string => Boolean(v));

            const nextProviders = customProviders.map((p) =>
                p.id === provider.id
                    ? {
                          ...p,
                          models: modelIds.map((id) => ({
                              nickname: "",
                              modelId: id,
                          })),
                      }
                    : p,
            );
            await updateCustomProviders(nextProviders);
            toast.success("Models fetched", {
                description: `Added ${modelIds.length} models.`,
            });
        } catch (error) {
            console.error("Failed to fetch models:", error);
            toast.error("Failed to fetch models", {
                description:
                    error instanceof Error ? error.message : String(error),
            });
        } finally {
            setFetchingProviderId(null);
        }
    };

    const vertexHasCredentials = hasVertexCredentials(vertexAI);

    const upsertCustomProvider = async (
        providerId: string,
        updater: (provider: CustomProviderSettings) => CustomProviderSettings,
    ) => {
        const next = customProviders.map((p) =>
            p.id === providerId ? updater(p) : p,
        );
        await updateCustomProviders(next);
    };

    const deleteCustomProvider = async (providerId: string) => {
        await updateCustomProviders(
            customProviders.filter((p) => p.id !== providerId),
        );
        setScreen({ type: "list" });
    };

    if (screen.type === "vertex") {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setScreen({ type: "list" })}
                    >
                        <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                </div>

                <div>
                    <h3 className="text-lg font-semibold">Vertex AI</h3>
                    <p className="text-sm text-muted-foreground">
                        Create a service account in Google Cloud Console and
                        paste the credentials below.
                    </p>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="font-semibold">Project ID</label>
                        <Input
                            value={vertexAI.projectId}
                            onChange={(e) =>
                                void updateVertex({
                                    ...vertexAI,
                                    projectId: e.target.value,
                                })
                            }
                            placeholder="my-gcp-project"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="font-semibold">Location</label>
                        <Input
                            value={vertexAI.location}
                            onChange={(e) =>
                                void updateVertex({
                                    ...vertexAI,
                                    location: e.target.value,
                                })
                            }
                            placeholder="us-central1 (or global)"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="font-semibold">
                            Service Account Client Email
                        </label>
                        <Input
                            value={vertexAI.serviceAccountClientEmail}
                            onChange={(e) =>
                                void updateVertex({
                                    ...vertexAI,
                                    serviceAccountClientEmail: e.target.value,
                                })
                            }
                            placeholder="my-sa@my-gcp-project.iam.gserviceaccount.com"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="font-semibold">
                            Service Account Private Key
                        </label>
                        <Textarea
                            value={vertexAI.serviceAccountPrivateKey}
                            onChange={(e) =>
                                void updateVertex({
                                    ...vertexAI,
                                    serviceAccountPrivateKey: e.target.value,
                                })
                            }
                            placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                            className="font-mono min-h-[140px]"
                            spellCheck={false}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Models</h4>
                    </div>
                    <ModelsEditor
                        models={vertexAI.models}
                        onChange={(models) =>
                            void updateVertex({ ...vertexAI, models })
                        }
                    />
                    <p className="text-xs text-muted-foreground">
                        Vertex expects a <code>{"<publisher>/<model>"}</code>{" "}
                        model ID (e.g.{" "}
                        <code>google/gemini-3-flash-preview</code>). If you
                        enter just <code>gemini-...</code>, Chorus will prefix{" "}
                        <code>google/</code> automatically.
                    </p>
                </div>
            </div>
        );
    }

    if (screen.type === "custom") {
        const provider = customProviders.find(
            (p) => p.id === screen.providerId,
        );

        if (!provider) {
            return (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setScreen({ type: "list" })}
                        >
                            <ChevronLeft className="h-4 w-4" /> Back
                        </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Provider not found.
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setScreen({ type: "list" })}
                    >
                        <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteCustomProvider(provider.id)}
                        className="text-destructive hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                </div>

                <div>
                    <h3 className="text-lg font-semibold">{provider.name}</h3>
                    <p className="text-sm text-muted-foreground">
                        {getCustomProviderTypeLabel(provider.kind)}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="font-semibold">Provider name</label>
                    <Input
                        value={provider.name}
                        onChange={(e) =>
                            void upsertCustomProvider(provider.id, (p) => ({
                                ...p,
                                name: e.target.value,
                            }))
                        }
                    />
                </div>

                <div className="space-y-2">
                    <label className="font-semibold">Provider type</label>
                    <Select
                        value={provider.kind}
                        onValueChange={(value) =>
                            void upsertCustomProvider(provider.id, (p) => ({
                                ...p,
                                kind: value as CustomProviderSettings["kind"],
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="openai">
                                OpenAI-compatible
                            </SelectItem>
                            <SelectItem value="anthropic">
                                Anthropic-compatible
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="font-semibold">API Base URL</label>
                    <Input
                        value={provider.apiBaseUrl}
                        onChange={(e) =>
                            void upsertCustomProvider(provider.id, (p) => ({
                                ...p,
                                apiBaseUrl: e.target.value,
                            }))
                        }
                        placeholder={
                            provider.kind === "openai"
                                ? "https://api.openai.com/v1"
                                : "https://api.anthropic.com"
                        }
                        className="font-mono"
                    />
                    {provider.kind === "openai" ? (
                        <p className="text-xs text-muted-foreground">
                            Do NOT include <code>/chat/completions</code> in the
                            URL.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Do NOT include <code>/v1/messages</code> in the URL.
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="font-semibold">API Key</label>
                    <Input
                        value={provider.apiKey}
                        onChange={(e) =>
                            void upsertCustomProvider(provider.id, (p) => ({
                                ...p,
                                apiKey: e.target.value,
                            }))
                        }
                        type="password"
                        placeholder="..."
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="font-semibold">Models</label>
                        {provider.kind === "openai" && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    void fetchModelsForProvider(provider)
                                }
                                disabled={fetchingProviderId === provider.id}
                            >
                                <RefreshCcwIcon
                                    className={`h-4 w-4 ${fetchingProviderId === provider.id ? "animate-spin" : ""}`}
                                />
                                Fetch Models
                            </Button>
                        )}
                    </div>
                    <ModelsEditor
                        models={provider.models}
                        onChange={(models) =>
                            void upsertCustomProvider(provider.id, (p) => ({
                                ...p,
                                models,
                            }))
                        }
                        newLabel="New model"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">Vertex AI</h3>
                        <p className="text-sm text-muted-foreground">
                            {vertexHasCredentials
                                ? "Configured"
                                : "Not configured"}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setScreen({ type: "vertex" })}
                    >
                        <Pencil className="h-4 w-4" />{" "}
                        {vertexHasCredentials ? "Edit" : "Configure"}
                    </Button>
                </div>

                {vertexAI.models.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                        {vertexAI.models.length} model
                        {vertexAI.models.length === 1 ? "" : "s"} configured.
                    </div>
                )}
            </div>

            <Separator />

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">
                            Custom Providers
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Add OpenAI/Anthropic-compatible third-party
                            endpoints.
                        </p>
                    </div>
                    <Button size="sm" onClick={() => void addCustomProvider()}>
                        <Plus className="h-4 w-4" /> New
                    </Button>
                </div>

                {customProviders.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                        No custom providers added yet.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {customProviders.map((provider) => (
                            <div
                                key={provider.id}
                                className="border rounded-md p-4 flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <div className="font-semibold truncate">
                                        {provider.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {getCustomProviderTypeLabel(
                                            provider.kind,
                                        )}
                                    </div>
                                    {provider.apiBaseUrl.trim() && (
                                        <div className="text-xs text-muted-foreground truncate font-mono">
                                            {provider.apiBaseUrl}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setScreen({
                                                type: "custom",
                                                providerId: provider.id,
                                            })
                                        }
                                    >
                                        <Pencil className="h-4 w-4" /> Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="iconSm"
                                        onClick={() =>
                                            void deleteCustomProvider(
                                                provider.id,
                                            )
                                        }
                                        title="Delete provider"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
