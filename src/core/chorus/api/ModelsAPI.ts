import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Models from "../Models";
import { db } from "../DB";
import { ModelConfig } from "../Models";
import { getApiKeys } from "./AppMetadataAPI";

// all
// --> list models
//     --> list model configs
// --> model details
//     --> [individual model detail]
//         --> [individual model config detail]

const modelKeys = {
    all: () => ["models"] as const,
};

export const modelQueries = {
    list: () => ({
        queryKey: [...modelKeys.all(), "list"] as const,
        queryFn: () => fetchModels(),
    }),
};

const modelConfigKeys = {
    all: () => ["modelConfigs"] as const,
};

export const modelConfigQueries = {
    listConfigs: () => ({
        queryKey: [...modelConfigKeys.all(), "list"] as const,
        queryFn: () => fetchModelConfigs(),
    }),
    detail: (modelConfigId: string) => ({
        queryKey: [...modelConfigKeys.all(), "detail", modelConfigId] as const,
        queryFn: () => fetchModelConfigById(modelConfigId),
    }),
    quickChat: () => ({
        queryKey: [...modelConfigKeys.all(), "quickChat"] as const,
        queryFn: () => fetchModelConfigQuickChat(),
    }),
    compare: () => ({
        queryKey: [...modelConfigKeys.all(), "compare"] as const,
        queryFn: () => fetchModelConfigsCompare(),
    }),
};

type ModelDBRow = {
    id: string;
    display_name: string;
    is_enabled: boolean;
    supported_attachment_types: string;
    is_internal: boolean;
};

type ModelConfigDBRow = {
    id: string;
    display_name: string;
    author: "user" | "system";
    model_id: string;
    system_prompt: string;
    is_enabled: boolean;
    supported_attachment_types: string;
    is_default: boolean;
    is_internal: boolean;
    is_deprecated: boolean;
    budget_tokens: number | null;
    reasoning_effort: "low" | "medium" | "high" | "xhigh" | null;
    thinking_level: "LOW" | "HIGH" | null;
    new_until?: string;
    prompt_price_per_token: number | null;
    completion_price_per_token: number | null;
};

// Track whether we've attempted to refresh models within
// the current session, and store the promise if a download is in progress.
let openRouterDownloadPromise: Promise<number> | null = null;
let openAIDownloadPromise: Promise<void> | null = null;
let anthropicDownloadPromise: Promise<void> | null = null;
let googleDownloadPromise: Promise<void> | null = null;
let grokDownloadPromise: Promise<void> | null = null;
let groqDownloadPromise: Promise<void> | null = null;
let mistralDownloadPromise: Promise<void> | null = null;
let cerebrasDownloadPromise: Promise<void> | null = null;
let fireworksDownloadPromise: Promise<void> | null = null;

/**
 * Reset download promises for a specific provider so models can be re-fetched.
 */
export function resetProviderDownloadPromise(provider: string) {
    switch (provider) {
        case "openrouter":
            openRouterDownloadPromise = null;
            break;
        case "openai":
            openAIDownloadPromise = null;
            break;
        case "anthropic":
            anthropicDownloadPromise = null;
            break;
        case "google":
            googleDownloadPromise = null;
            break;
        case "grok":
            grokDownloadPromise = null;
            break;
        case "groq":
            groqDownloadPromise = null;
            break;
        case "mistral":
            mistralDownloadPromise = null;
            break;
        case "cerebras":
            cerebrasDownloadPromise = null;
            break;
        case "fireworks":
            fireworksDownloadPromise = null;
            break;
    }
}

function readModel(row: ModelDBRow): Models.Model {
    return {
        id: row.id,
        displayName: row.display_name,
        isEnabled: row.is_enabled,
        supportedAttachmentTypes: JSON.parse(
            row.supported_attachment_types,
        ) as Models.AttachmentType[],
        isInternal: row.is_internal,
    };
}

function readModelConfig(row: ModelConfigDBRow): ModelConfig {
    return {
        id: row.id,
        displayName: row.display_name,
        author: row.author,
        modelId: row.model_id,
        systemPrompt: row.system_prompt,
        isEnabled: row.is_enabled,
        supportedAttachmentTypes: JSON.parse(
            row.supported_attachment_types,
        ) as Models.AttachmentType[],
        isDefault: row.is_default,
        isInternal: row.is_internal,
        isDeprecated: row.is_deprecated,
        budgetTokens: row.budget_tokens ?? undefined,
        reasoningEffort: row.reasoning_effort ?? undefined,
        thinkingLevel: row.thinking_level ?? undefined,
        newUntil: row.new_until ?? undefined,
        promptPricePerToken: row.prompt_price_per_token ?? undefined,
        completionPricePerToken: row.completion_price_per_token ?? undefined,
    };
}

export async function fetchModelConfigs() {
    // Keep user-configured providers (Vertex / custom endpoints) in sync with the DB.
    await Models.syncVertexModels(db);
    await Models.syncCustomProviderModels(db);

    const apiKeys = await getApiKeys();

    // Fetch models from various providers if we haven't already and the user has the API key.
    // OpenRouter
    if (apiKeys.openrouter) {
        if (openRouterDownloadPromise) {
            await openRouterDownloadPromise;
        } else {
            openRouterDownloadPromise = Models.downloadOpenRouterModels(db);
            await openRouterDownloadPromise;
        }
    }

    // OpenAI
    if (apiKeys.openai) {
        if (openAIDownloadPromise) {
            await openAIDownloadPromise;
        } else {
            openAIDownloadPromise = Models.downloadOpenAIModels(db, apiKeys);
            await openAIDownloadPromise;
        }
    }

    // Anthropic
    if (apiKeys.anthropic) {
        if (anthropicDownloadPromise) {
            await anthropicDownloadPromise;
        } else {
            anthropicDownloadPromise = Models.downloadAnthropicModels(
                db,
                apiKeys,
            );
            await anthropicDownloadPromise;
        }
    }

    // Google
    if (apiKeys.google) {
        if (googleDownloadPromise) {
            await googleDownloadPromise;
        } else {
            googleDownloadPromise = Models.downloadGoogleModels(db, apiKeys);
            await googleDownloadPromise;
        }
    }

    // Grok
    if (apiKeys.grok) {
        if (grokDownloadPromise) {
            await grokDownloadPromise;
        } else {
            grokDownloadPromise = Models.downloadGrokModels(db, apiKeys);
            await grokDownloadPromise;
        }
    }

    // Groq
    if (apiKeys.groq) {
        if (groqDownloadPromise) {
            await groqDownloadPromise;
        } else {
            groqDownloadPromise = Models.downloadGroqModels(db, apiKeys);
            await groqDownloadPromise;
        }
    }

    // Mistral
    if (apiKeys.mistral) {
        if (mistralDownloadPromise) {
            await mistralDownloadPromise;
        } else {
            mistralDownloadPromise = Models.downloadMistralModels(db, apiKeys);
            await mistralDownloadPromise;
        }
    }

    // Cerebras
    if (apiKeys.cerebras) {
        if (cerebrasDownloadPromise) {
            await cerebrasDownloadPromise;
        } else {
            cerebrasDownloadPromise = Models.downloadCerebrasModels(
                db,
                apiKeys,
            );
            await cerebrasDownloadPromise;
        }
    }

    // Fireworks
    if (apiKeys.fireworks) {
        if (fireworksDownloadPromise) {
            await fireworksDownloadPromise;
        } else {
            fireworksDownloadPromise = Models.downloadFireworksModels(
                db,
                apiKeys,
            );
            await fireworksDownloadPromise;
        }
    }

    return (
        await db.select<ModelConfigDBRow[]>(
            `SELECT model_configs.id, model_configs.display_name, model_configs.author,
                        model_configs.model_id, model_configs.system_prompt, models.is_enabled,
                        models.is_internal, models.supported_attachment_types, model_configs.is_default,
                        models.is_deprecated, model_configs.budget_tokens, model_configs.reasoning_effort, model_configs.thinking_level, model_configs.new_until,
                        models.prompt_price_per_token, models.completion_price_per_token
                 FROM model_configs
                 JOIN models ON model_configs.model_id = models.id
                 ORDER BY models.is_enabled DESC`,
        )
    ).map(readModelConfig);
}

export async function fetchModels() {
    return (await db.select<ModelDBRow[]>(`SELECT * FROM models`)).map(
        readModel,
    );
}

export async function fetchModelConfigsCompare(): Promise<ModelConfig[]> {
    return (
        await db.select<ModelConfigDBRow[]>(
            `WITH extracted_models AS (
  SELECT
    json_each.value AS model_config_id,
    CAST(json_each.key AS INTEGER) AS original_order
  FROM
    app_metadata,
    json_each(app_metadata.value)
  WHERE
    app_metadata.key = 'selected_model_configs_compare'
)

SELECT
  mc.id,
  mc.display_name,
  mc.author,
  mc.model_id,
  mc.system_prompt,
  m.is_enabled,
  m.is_internal,
  m.supported_attachment_types,
  mc.is_default,
  m.is_deprecated,
  mc.budget_tokens,
  mc.reasoning_effort,
  mc.thinking_level,
  em.original_order,
  m.prompt_price_per_token,
  m.completion_price_per_token
FROM
  extracted_models em
JOIN
  model_configs mc ON mc.id = em.model_config_id
JOIN
  models m ON mc.model_id = m.id
ORDER BY
  em.original_order;`,
        )
    ).map(readModelConfig);
}

export async function fetchModelConfigChat() {
    const modelConfigChat = (
        await db.select<ModelConfigDBRow[]>(
            `WITH selected_config AS (
  SELECT
    value AS model_config_id
  FROM
    app_metadata
  WHERE
    key = 'selected_model_config_chat'
)

SELECT
  mc.id,
  mc.display_name,
  mc.author,
  mc.model_id,
  mc.system_prompt,
  m.is_enabled,
  m.is_internal,
  m.supported_attachment_types,
  mc.is_default,
  m.is_deprecated,
  mc.budget_tokens,
  mc.reasoning_effort,
  mc.thinking_level,
  m.prompt_price_per_token,
  m.completion_price_per_token
FROM
  selected_config sc
JOIN
  model_configs mc ON mc.id = sc.model_config_id
JOIN
  models m ON mc.model_id = m.id;`,
        )
    ).map(readModelConfig);
    return modelConfigChat;
}

export async function fetchModelConfigQuickChat() {
    const modelConfigs = await db
        .select<ModelConfigDBRow[]>(
            `WITH selected_config AS (
  SELECT
    value AS model_config_id
  FROM
    app_metadata
  WHERE
    key = 'quick_chat_model_config_id'
)

SELECT
  mc.id,
  mc.display_name,
  mc.author,
  mc.model_id,
  mc.system_prompt,
  m.is_enabled,
  m.is_internal,
  m.supported_attachment_types,
  mc.is_default,
  m.is_deprecated,
  mc.budget_tokens,
  mc.reasoning_effort,
  mc.thinking_level,
  m.prompt_price_per_token,
  m.completion_price_per_token
FROM
  selected_config sc
JOIN
  model_configs mc ON mc.id = sc.model_config_id
JOIN
  models m ON mc.model_id = m.id;`,
        )
        .then((rows) => rows.map(readModelConfig));
    return modelConfigs.length > 0 ? modelConfigs[0] : null;
}

export async function fetchModelConfigById(
    modelConfigId: string,
): Promise<ModelConfig | null> {
    const rows = await db.select<ModelConfigDBRow[]>(
        `SELECT model_configs.id, model_configs.display_name, model_configs.author,
                    model_configs.model_id, model_configs.system_prompt, models.is_enabled,
                    models.is_internal, models.supported_attachment_types, model_configs.is_default,
                    models.is_deprecated, model_configs.budget_tokens, model_configs.reasoning_effort, model_configs.thinking_level, model_configs.new_until,
                    models.prompt_price_per_token, models.completion_price_per_token
             FROM model_configs
             JOIN models ON model_configs.model_id = models.id
             WHERE model_configs.id = ?`,
        [modelConfigId],
    );

    if (rows.length === 0) {
        return null;
    }

    return readModelConfig(rows[0]);
}

export function useModelConfigs() {
    return useQuery(modelConfigQueries.listConfigs());
}

export function useModelConfigsPromise() {
    const queryClient = useQueryClient();
    return queryClient.ensureQueryData(modelConfigQueries.listConfigs());
}

export function useModels() {
    return useQuery(modelQueries.list());
}

export function useModelConfig(modelConfigId: string) {
    return useQuery(modelConfigQueries.detail(modelConfigId));
}

export function useSelectedModelConfigsCompare() {
    return useQuery(modelConfigQueries.compare());
}

export function useSelectedModelConfigQuickChat() {
    return useQuery(modelConfigQueries.quickChat());
}

export function useRefreshOpenRouterModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshOpenRouterModels"] as const,
        mutationFn: async () => {
            await Models.downloadOpenRouterModels(db);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshOllamaModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshOllamaModels"] as const,
        mutationFn: async () => {
            await Models.downloadOllamaModels(db);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshLMStudioModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshLMStudioModels"] as const,
        mutationFn: async () => {
            await Models.downloadLMStudioModels(db);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshOpenAIModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshOpenAIModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadOpenAIModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshAnthropicModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshAnthropicModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadAnthropicModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshGoogleModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshGoogleModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadGoogleModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshGrokModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshGrokModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadGrokModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshGroqModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshGroqModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadGroqModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshMistralModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshMistralModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadMistralModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshCerebrasModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshCerebrasModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadCerebrasModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshFireworksModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshFireworksModels"] as const,
        mutationFn: async () => {
            const apiKeys = await getApiKeys();
            await Models.downloadFireworksModels(db, apiKeys);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useToggleModelEnabled() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["toggleModelEnabled"] as const,
        mutationFn: async ({
            modelId,
            enabled,
        }: {
            modelId: string;
            enabled: boolean;
        }) => {
            await db.execute("UPDATE models SET is_enabled = ? WHERE id = ?", [
                enabled ? 1 : 0,
                modelId,
            ]);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["models"] });
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useSetProviderModelsEnabled() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["setProviderModelsEnabled"] as const,
        mutationFn: async ({
            providerId,
            enabled,
        }: {
            providerId: string;
            enabled: boolean;
        }) => {
            await db.execute(
                "UPDATE models SET is_enabled = ? WHERE id LIKE ?",
                [enabled ? 1 : 0, `${providerId}::%`],
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["models"] });
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useRefreshModels() {
    const refreshOpenRouterModels = useRefreshOpenRouterModels();
    const refreshOllamaModels = useRefreshOllamaModels();
    const refreshLMStudioModels = useRefreshLMStudioModels();
    const refreshOpenAIModels = useRefreshOpenAIModels();
    const refreshAnthropicModels = useRefreshAnthropicModels();
    const refreshGoogleModels = useRefreshGoogleModels();
    const refreshGrokModels = useRefreshGrokModels();
    return useMutation({
        mutationKey: ["refreshAllModels"] as const,
        mutationFn: async () => {
            await Promise.all([
                refreshOpenRouterModels.mutateAsync(),
                refreshOllamaModels.mutateAsync(),
                refreshLMStudioModels.mutateAsync(),
                refreshOpenAIModels.mutateAsync(),
                refreshAnthropicModels.mutateAsync(),
                refreshGoogleModels.mutateAsync(),
                refreshGrokModels.mutateAsync(),
            ]);
        },
    });
}

export function useDeleteModelConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["deleteModelConfig"] as const,
        mutationFn: async ({ modelConfigId }: { modelConfigId: string }) => {
            await db.execute("DELETE FROM model_configs WHERE id = $1", [
                modelConfigId,
            ]);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useUpdateModelConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["updateModelConfig"] as const,
        mutationFn: async ({
            modelConfigId,
            displayName,
            systemPrompt,
        }: {
            modelConfigId: string;
            displayName: string;
            systemPrompt: string;
        }) => {
            await db.execute(
                "UPDATE model_configs SET display_name = $1, system_prompt = $2 WHERE id = $3",
                [displayName, systemPrompt, modelConfigId],
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}

export function useUpdateThinkingParams() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["updateThinkingParams"] as const,
        mutationFn: async ({
            modelConfigId,
            budgetTokens,
            reasoningEffort,
            thinkingLevel,
        }: {
            modelConfigId: string;
            budgetTokens?: number | null;
            reasoningEffort?: "low" | "medium" | "high" | "xhigh" | null;
            thinkingLevel?: "LOW" | "HIGH" | null;
        }) => {
            // Build dynamic SQL to only update fields that are provided
            // This avoids the stale closure issue where other params get overwritten
            const updates: string[] = [];
            const params: (string | number | null)[] = [];
            let paramIndex = 1;

            if (budgetTokens !== undefined) {
                updates.push(`budget_tokens = $${paramIndex}`);
                params.push(budgetTokens);
                paramIndex++;
            }

            if (reasoningEffort !== undefined) {
                updates.push(`reasoning_effort = $${paramIndex}`);
                params.push(reasoningEffort);
                paramIndex++;
            }

            if (thinkingLevel !== undefined) {
                updates.push(`thinking_level = $${paramIndex}`);
                params.push(thinkingLevel);
                paramIndex++;
            }

            if (updates.length === 0) {
                return; // Nothing to update
            }

            params.push(modelConfigId);

            await db.execute(
                `UPDATE model_configs SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
                params,
            );
        },
        onSuccess: async () => {
            // Invalidate ALL model config queries so UI updates everywhere
            await queryClient.invalidateQueries({
                queryKey: modelConfigKeys.all(),
            });
        },
    });
}

export function useCreateModelConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["createModelConfig"] as const,
        mutationFn: async ({
            configId,
            baseModel,
            displayName,
            systemPrompt,
        }: {
            configId: string;
            baseModel: string;
            displayName: string;
            systemPrompt: string;
        }) => {
            await db.execute(
                `INSERT INTO model_configs (id, model_id, display_name, author, system_prompt)
                 VALUES (?, ?, ?, ?, ?)`,
                [configId, baseModel, displayName, "user", systemPrompt],
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(
                modelConfigQueries.listConfigs(),
            );
        },
    });
}
