// Explanation:
// - "Model" is roughly an LLM. It's a function that generates text.
// - "ModelConfig" is a user-defined configuration that includes a model id and a system prompt.
//   This is what the user is selecting in the UI. The user can also create their own configs
//   on top of the default models.
// - Every model comes with a default config that shares its id and has no system prompt.

import { ProviderOpenAI } from "./ModelProviders/ProviderOpenAI";
import { ProviderAnthropic } from "./ModelProviders/ProviderAnthropic";
import { ProviderOpenRouter } from "./ModelProviders/ProviderOpenRouter";
import { ProviderPerplexity } from "./ModelProviders/ProviderPerplexity";
import { IProvider } from "./ModelProviders/IProvider";
import Database from "@tauri-apps/plugin-sql";
import { readFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { ProviderGoogle } from "./ModelProviders/ProviderGoogle";
import { ProviderGrok } from "./ModelProviders/ProviderGrok";
import { ProviderVertex } from "./ModelProviders/ProviderVertex";
import { ProviderCustomOpenAI } from "./ModelProviders/ProviderCustomOpenAI";
import { ProviderCustomAnthropic } from "./ModelProviders/ProviderCustomAnthropic";
import { ProviderGroq } from "./ModelProviders/ProviderGroq";
import { ProviderMistral } from "./ModelProviders/ProviderMistral";
import { ProviderCerebras } from "./ModelProviders/ProviderCerebras";
import { ProviderFireworks } from "./ModelProviders/ProviderFireworks";
import { ProviderTogether } from "./ModelProviders/ProviderTogether";
import { ProviderNvidia } from "./ModelProviders/ProviderNvidia";
import posthog from "posthog-js";
import { UserTool, UserToolCall, UserToolResult } from "./Toolsets";
import { Attachment } from "./api/AttachmentsAPI";
import {
    CustomProviderSettings,
    SettingsManager,
    VertexAISettings,
} from "@core/utilities/Settings";

/// ------------------------------------------------------------------------------------------------
/// Basic Types
/// ------------------------------------------------------------------------------------------------

export type AttachmentType = "image" | "pdf" | "text" | "webpage";

export const allowedExtensions: Record<AttachmentType, string[]> = {
    image: ["png", "jpg", "jpeg", "gif", "webp"],
    pdf: ["pdf"],
    text: [
        // Documentation
        "txt",
        "md",
        "rst",
        "org",
        "wiki",
        // Web
        "html",
        "htm",
        "css",
        "scss",
        "less",
        "js",
        "jsx",
        "ts",
        "tsx",
        "json",
        // Programming
        "py",
        "java",
        "cpp",
        "c",
        "h",
        "cs",
        "go",
        "rs",
        "rb",
        "php",
        "sql",
        "swift",
        "kt",
        "scala",
        "lua",
        "pl",
        "r",
        "dart",
        "ex",
        "exs",
        "erl",
        // Data/Config
        "csv",
        "yml",
        "yaml",
        "xml",
        "ini",
        "env",
        "conf",
        "toml",
        "lock",
        "properties",
        // Shell
        "sh",
        "bash",
        "zsh",
        "bat",
        "ps1",
        "env",
    ],
    webpage: [],
};

/**
 * LEGACY -- TODO get rid of this one when we deprecate old-style tools
 */
export interface ToolConfig {
    name: string; // "Web Search"
    generic_tool_name: string; //  a generic name for the tool, e.g. "web_search"
    provider_tool_id: string; // provider specific id for the tool, e.g. "web_search_preview" for OpenAI
    description: string; // "Search the web for information"
    default_enabled: boolean; // whether the tool should be enabled by default
    toggleable: boolean; // whether the tool should be toggleable by the user
}

export type LLMMessageUser = {
    role: "user";
    content: string;
    attachments: Attachment[];
};

export type LLMMessageAssistant = {
    role: "assistant";
    content: string;
    model?: string;
    toolCalls: UserToolCall[];
};

export type LLMMessageToolResults = {
    role: "tool_results";
    toolResults: UserToolResult[];
};

export type LLMMessage =
    | LLMMessageUser
    | LLMMessageAssistant
    | LLMMessageToolResults;

/**
 * Converts an LLM message to a string. Does not include attachments. Uses XML for tool results.
 * Do not use for anything too serious!
 */
export function llmMessageToString(message: LLMMessage): string {
    switch (message.role) {
        case "user":
            return message.content;
        case "assistant":
            return message.content;
        case "tool_results":
            return message.toolResults
                .map((t) => `<tool_result>${t.content}</tool_result>`)
                .join("\n");
        default: {
            const exhaustiveCheck: never = message;
            throw new Error(
                `Unknown role on message: ${JSON.stringify(exhaustiveCheck)}`,
            );
        }
    }
}

export type ApiKeys = {
    anthropic?: string;
    openai?: string;
    perplexity?: string;
    openrouter?: string;
    google?: string;
    grok?: string;
    groq?: string;
    mistral?: string;
    cerebras?: string;
    fireworks?: string;
    together?: string;
    nvidia?: string;
};

export type Model = {
    id: string;
    displayName: string;
    // use this to archive old models or models that disappear from OpenRouter
    // TODO: implement handling for this
    isEnabled: boolean;
    supportedAttachmentTypes: AttachmentType[];
    isInternal: boolean; // internal models are never shown to users
};

/** Data for staff picks, used only for UI treatment */
export interface StaffPickModel {
    id: string;
    label: string;
    description: string;
    author: string;
}

export type ModelConfig = {
    id: string;
    displayName: string;
    author: "user" | "system";

    // optional data for UI treatment
    newUntil?: string; // the ISO datetime string when this model is not considered "new" in UI treatment anymore
    staffPickData?: StaffPickModel; // optional data for staff pick models

    // derived from models table -- if model is disabled, so is the config
    // TODO: implement handling for this
    isEnabled: boolean;
    // derived from models table
    supportedAttachmentTypes: AttachmentType[];
    isInternal: boolean; // internal model configs are never shown to users
    isDeprecated: boolean; // deprecated models are filtered out from the UI

    // controls the actual behavior
    modelId: string;
    systemPrompt?: string;
    isDefault: boolean;
    budgetTokens?: number; // optional token budget for thinking mode (Anthropic, Gemini 2.5)
    reasoningEffort?: "low" | "medium" | "high" | "xhigh"; // OpenAI o1/o3/GPT-5, xAI Grok
    thinkingLevel?: "LOW" | "HIGH"; // Google Gemini 3 thinking level
    showThoughts?: boolean; // request a collapsible <think> block in the output (persisted)

    // pricing (from models table)
    promptPricePerToken?: number;
    completionPricePerToken?: number;
};

export type UsageData = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    generation_id?: string; // OpenRouter generation ID for fetching actual costs
};

export type StreamResponseParams = {
    modelConfig: ModelConfig;
    llmConversation: LLMMessage[];
    tools?: UserTool[];
    /**
     * Names of enabled toolsets (e.g. ["web", "terminal"]).
     * Useful when a toolset influences provider behavior without exposing function tools.
     */
    enabledToolsets?: string[];
    apiKeys: ApiKeys;
    onChunk: (chunk: string) => void;
    onComplete: (
        finalMessage?: string,
        toolCalls?: UserToolCall[],
        usageData?: UsageData,
    ) => Promise<void>;
    onError: (errorMessage: string) => void;
    additionalHeaders?: Record<string, string>;
    customBaseUrl?: string;
};

/// ------------------------------------------------------------------------------------------------
/// Model resolution
/// ------------------------------------------------------------------------------------------------

export type ProviderName =
    | "anthropic"
    | "openai"
    | "google"
    | "perplexity"
    | "openrouter"
    | "grok"
    | "vertex"
    | "custom_openai"
    | "custom_anthropic"
    | "meta"
    | "groq"
    | "mistral"
    | "cerebras"
    | "fireworks"
    | "together"
    | "nvidia";

/**
 * Returns a human readable label for the provider
 * This is necessary since meta models go through openrouter
 * But users will want to search by "Meta" in the UI
 */
export function getProviderLabel(modelId: string): string {
    const providerParts = modelId.split("::");

    // Expected openrouter ID format is "openrouter::meta-llama/llama-4-scout"
    if (providerParts.length > 1 && providerParts[0] === "openrouter") {
        const providerLabel = providerParts[1].split("/")[0];
        if (providerLabel) return providerLabel;
    }
    return getProviderName(modelId);
}

/**
 * Returns the provider name from a model id
 * Ex: "openrouter::meta-llama/llama-4-scout" -> "openrouter"
 * Ex: "openai/gpt-4o" -> "openai"
 */
export function getProviderName(modelId: string): ProviderName {
    if (!modelId) {
        throw new Error("couldn't get provider name for empty modelId");
    }
    const providerName = modelId.split("::")[0];
    if (!providerName) {
        console.error(
            `Invalid modelId - ${modelId} does not have a valid provider name`,
        );
    }
    return providerName as ProviderName;
}

/**
 * Returns the model name from a model id.
 * Ex: "openrouter::meta-llama/llama-4-scout" -> "meta-llama/llama-4-scout"
 * Ex: "custom_openai::<providerId>::gpt-4o-mini" -> "gpt-4o-mini"
 */
export function getModelName(modelId: string): string {
    const parts = modelId.split("::");
    if (parts.length <= 1) {
        return modelId;
    }

    const provider = parts[0];
    if (provider === "custom_openai" || provider === "custom_anthropic") {
        return parts.slice(2).join("::");
    }

    return parts.slice(1).join("::");
}

function getProvider(providerName: string): IProvider {
    switch (providerName) {
        case "openai":
            return new ProviderOpenAI();
        case "anthropic":
            return new ProviderAnthropic();
        case "google":
            return new ProviderGoogle();
        case "openrouter":
            return new ProviderOpenRouter();
        case "perplexity":
            return new ProviderPerplexity();
        case "grok":
            return new ProviderGrok();
        case "vertex":
            return new ProviderVertex();
        case "custom_openai":
            return new ProviderCustomOpenAI();
        case "custom_anthropic":
            return new ProviderCustomAnthropic();
        case "groq":
            return new ProviderGroq();
        case "mistral":
            return new ProviderMistral();
        case "cerebras":
            return new ProviderCerebras();
        case "fireworks":
            return new ProviderFireworks();
        case "together":
            return new ProviderTogether();
        case "nvidia":
            return new ProviderNvidia();
        default:
            throw new Error(`Unknown provider: ${providerName}`);
    }
}

export async function streamResponse(
    params: StreamResponseParams,
): Promise<void> {
    const providerName = getProviderName(params.modelConfig.modelId);
    const provider = getProvider(providerName);
    await provider.streamResponse(params).catch((error: unknown) => {
        console.error(error);
        const errorMessage = getErrorMessage(error);
        void params.onError(errorMessage);
        posthog.capture("response_errored", {
            modelProvider: providerName,
            modelId: params.modelConfig.modelId,
            errorMessage,
        });
    });
}

/// ------------------------------------------------------------------------------------------------
/// Model initialization
/// ------------------------------------------------------------------------------------------------
export async function saveModelAndDefaultConfig(
    db: Database,
    model: Model,
    modelConfigDisplayName: string,
    pricing?: {
        promptPricePerToken?: number;
        completionPricePerToken?: number;
    },
): Promise<void> {
    // For remote providers, preserve user-controlled enable/disable state across refreshes.
    // For local/curated providers (Vertex/Custom Providers), treat refresh as
    // authoritative and overwrite is_enabled.
    const providerId = model.id.split("::")[0] ?? "";
    const shouldOverwriteIsEnabled =
        providerId === "vertex" ||
        providerId === "custom_openai" ||
        providerId === "custom_anthropic";

    await db.execute(
        `INSERT INTO models (
            id,
            display_name,
            is_enabled,
            supported_attachment_types,
            is_internal,
            prompt_price_per_token,
            completion_price_per_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name,
            supported_attachment_types = excluded.supported_attachment_types,
            is_internal = excluded.is_internal,
            prompt_price_per_token = excluded.prompt_price_per_token,
            completion_price_per_token = excluded.completion_price_per_token
            ${shouldOverwriteIsEnabled ? ", is_enabled = excluded.is_enabled" : ""}`,
        [
            model.id,
            model.displayName,
            model.isEnabled ? 1 : 0,
            model.supportedAttachmentTypes,
            model.isInternal ? 1 : 0,
            pricing?.promptPricePerToken ?? null,
            pricing?.completionPricePerToken ?? null,
        ],
    );

    // Create the default model_config row if missing; on refresh, only update the display name
    // and linkage, preserving user-controlled fields (system_prompt, thinking params, etc).
    await db.execute(
        `INSERT INTO model_configs (id, display_name, author, model_id, system_prompt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
             display_name = excluded.display_name,
             author = excluded.author,
             model_id = excluded.model_id`,
        [model.id, modelConfigDisplayName, "system", model.id, ""],
    );
}

/**
 * Deletes all models and model configs for a specific provider.
 * This should be called when an API key changes to clear old models.
 */
export async function deleteProviderModels(
    db: Database,
    provider: string,
): Promise<void> {
    // Delete from model_configs first (child table)
    await db.execute(
        `DELETE FROM model_configs WHERE model_id LIKE ?`,
        [`${provider}::%`],
    );
    // Then delete from models (parent table)
    await db.execute(`DELETE FROM models WHERE id LIKE ?`, [
        `${provider}::%`,
    ]);
}

function hasVertexCredentials(vertex: VertexAISettings): boolean {
    return Boolean(
        vertex.projectId.trim() &&
            vertex.location.trim() &&
            vertex.serviceAccountClientEmail.trim() &&
            vertex.serviceAccountPrivateKey.trim(),
    );
}

export async function syncVertexModels(db: Database): Promise<void> {
    await db.execute(
        "UPDATE models SET is_enabled = 0 WHERE id LIKE 'vertex::%'",
    );

    const settings = await SettingsManager.getInstance().get();
    const vertex = settings.vertexAI;

    if (
        !vertex ||
        !hasVertexCredentials(vertex) ||
        vertex.models.length === 0
    ) {
        return;
    }

    await Promise.all(
        vertex.models
            .filter((model) => model.modelId.trim() !== "")
            .map((model) => {
                const modelId = model.modelId.trim();
                const displayName = model.nickname?.trim() || modelId;
                return saveModelAndDefaultConfig(
                    db,
                    {
                        id: `vertex::${modelId}`,
                        displayName,
                        supportedAttachmentTypes: ["text", "image", "webpage"],
                        isEnabled: true,
                        isInternal: false,
                    },
                    displayName,
                );
            }),
    );
}

export async function syncCustomProviderModels(db: Database): Promise<void> {
    await db.execute(
        "UPDATE models SET is_enabled = 0 WHERE id LIKE 'custom_openai::%' OR id LIKE 'custom_anthropic::%'",
    );

    const settings = await SettingsManager.getInstance().get();
    const customProviders = settings.customProviders ?? [];

    await Promise.all(
        customProviders.flatMap((provider: CustomProviderSettings) => {
            const prefix =
                provider.kind === "anthropic"
                    ? "custom_anthropic"
                    : "custom_openai";

            const supportedAttachmentTypes: AttachmentType[] =
                provider.kind === "anthropic"
                    ? ["text", "image", "pdf", "webpage"]
                    : ["text", "image", "webpage"];

            return provider.models
                .filter((model) => model.modelId.trim() !== "")
                .map((model) => {
                    const modelId = model.modelId.trim();
                    const displayName = model.nickname?.trim() || modelId;
                    return saveModelAndDefaultConfig(
                        db,
                        {
                            id: `${prefix}::${provider.id}::${modelId}`,
                            displayName,
                            supportedAttachmentTypes,
                            isEnabled: true,
                            isInternal: false,
                        },
                        displayName,
                    );
                });
        }),
    );
}

/**
 * Downloads models from external sources to refresh the database.
 */
export async function DEPRECATED_USE_HOOK_INSTEAD_downloadModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<number> {
    await downloadOpenRouterModels(db);
    await downloadOpenAIModels(db, apiKeys);
    await downloadAnthropicModels(db, apiKeys);
    await downloadGoogleModels(db, apiKeys);
    await downloadGrokModels(db, apiKeys);
    await downloadGroqModels(db, apiKeys);
    await downloadMistralModels(db, apiKeys);
    await downloadCerebrasModels(db, apiKeys);
    await downloadFireworksModels(db, apiKeys);
    await downloadTogetherModels(db, apiKeys);
    await downloadNvidiaModels(db, apiKeys);
    return 0;
}

/**
 * Downloads models from OpenRouter to refresh the database.
 */
export async function downloadOpenRouterModels(db: Database): Promise<number> {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) {
        console.error("Failed to fetch OpenRouter models");
        return 0;
    }
    const { data: openRouterModels } = (await response.json()) as {
        data: {
            id: string;
            name: string;
            architecture?: {
                input_modalities?: string[];
            };
            pricing: {
                prompt: string;
                completion: string;
                request?: string;
                image?: string;
            };
        }[];
    };

    await Promise.all(
        openRouterModels.map((model) => {
            // Check if the model supports images based on API metadata
            // Use Array.isArray check to ensure input_modalities is an array before calling includes
            const supportsImages =
                Array.isArray(model.architecture?.input_modalities) &&
                model.architecture.input_modalities.includes("image");

            // Parse and validate pricing data
            const promptPrice = parseFloat(model.pricing.prompt);
            const completionPrice = parseFloat(model.pricing.completion);
            const hasPricing =
                !isNaN(promptPrice) &&
                !isNaN(completionPrice) &&
                isFinite(promptPrice) &&
                isFinite(completionPrice);

            return saveModelAndDefaultConfig(
                db,
                {
                    id: `openrouter::${model.id}`,
                    displayName: `${model.name}`,
                    supportedAttachmentTypes: supportsImages
                        ? ["text", "image", "webpage"]
                        : ["text", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                `${model.name}`,
                hasPricing
                    ? {
                          promptPricePerToken: promptPrice,
                          completionPricePerToken: completionPrice,
                      }
                    : undefined,
            );
        }),
    );

    return openRouterModels.length;
}

/**
 * Downloads models from OpenAI to refresh the database.
 * Uses OpenAI's native /v1/models API
 */
export async function downloadOpenAIModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.openai) {
            console.log(
                "No OpenAI API key configured, skipping model download",
            );
            return;
        }

        const response = await fetch("https://api.openai.com/v1/models", {
            headers: {
                Authorization: `Bearer ${apiKeys.openai}`,
            },
        });

        if (!response.ok) {
            console.error("Failed to fetch OpenAI models");
            return;
        }

        const { data: models } = (await response.json()) as {
            data: {
                id: string;
                object: string;
                created: number;
                owned_by: string;
            }[];
        };

        // Filter for chat completion models only
        const chatModels = models.filter(
            (model) =>
                model.id.startsWith("gpt-") ||
                model.id.startsWith("o1") ||
                model.id.startsWith("o3") ||
                model.id.startsWith("o4"),
        );

        for (const model of chatModels) {
            // Determine image support based on model name
            const supportsImages =
                model.id.includes("gpt-4") ||
                model.id.includes("gpt-5") ||
                (model.id.includes("o") && !model.id.includes("mini"));

            await saveModelAndDefaultConfig(
                db,
                {
                    id: `openai::${model.id}`,
                    displayName: model.id,
                    supportedAttachmentTypes: supportsImages
                        ? ["text", "image", "webpage"]
                        : ["text", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading OpenAI models:", error);
    }
}

/**
 * Downloads models from Anthropic to refresh the database.
 * Uses Anthropic's native /v1/models API
 */
export async function downloadAnthropicModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.anthropic) {
            console.log(
                "No Anthropic API key configured, skipping model download",
            );
            return;
        }

        const response = await fetch("https://api.anthropic.com/v1/models", {
            headers: {
                "anthropic-version": "2023-06-01",
                "x-api-key": apiKeys.anthropic,
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error(
                "Failed to fetch Anthropic models",
                response.status,
                response.statusText,
                errorText,
            );

            // If the key is invalid, disable Anthropic models so they can't be selected.
            // For transient failures, preserve existing models' is_enabled state (user preference).
            if (response.status === 401 || response.status === 403) {
                await db.execute(
                    "UPDATE models SET is_enabled = 0 WHERE id LIKE 'anthropic::%'",
                );
            }
            // For other failures, do nothing - preserve user's enable/disable preferences
            return;
        }

        // Don't overwrite user preferences for enabled/disabled models
        // New models will be enabled via saveModelAndDefaultConfig

        const { data: models } = (await response.json()) as {
            data: {
                id: string;
                created_at: string;
                display_name: string;
                type: string;
            }[];
            has_more: boolean;
            first_id: string;
            last_id: string;
        };

        for (const model of models) {
            // All Claude models support images and PDFs
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `anthropic::${model.id}`,
                    displayName: model.display_name,
                    supportedAttachmentTypes: [
                        "text",
                        "image",
                        "pdf",
                        "webpage",
                    ],
                    isEnabled: true,
                    isInternal: false,
                },
                model.display_name,
            );
        }
    } catch (error) {
        console.error("Error downloading Anthropic models:", error);
        // Preserve existing models' is_enabled state (user preference)
        // New models will be enabled when they're successfully fetched
    }
}

/**
 * Downloads models from Google Gemini to refresh the database.
 * Uses Google's native /v1beta/models API
 */
export async function downloadGoogleModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.google) {
            console.log(
                "No Google API key configured, skipping model download",
            );
            return;
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeys.google}`,
        );

        if (!response.ok) {
            console.error("Failed to fetch Google models");
            return;
        }

        const { models } = (await response.json()) as {
            models: {
                name: string;
                baseModelId: string;
                version: string;
                displayName: string;
                description: string;
                inputTokenLimit: number;
                outputTokenLimit: number;
                supportedGenerationMethods: string[];
                thinking?: boolean;
            }[];
            nextPageToken?: string;
        };

        // Filter for models that support generateContent
        const chatModels = models.filter((model) =>
            model.supportedGenerationMethods?.includes("generateContent"),
        );

        for (const model of chatModels) {
            // Extract model ID from name (format: "models/gemini-...")
            const modelId = model.name.replace("models/", "");

            // Gemini models support text, image, and webpage
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `google::${modelId}`,
                    displayName: model.displayName || modelId,
                    supportedAttachmentTypes: ["text", "image", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.displayName || modelId,
            );
        }
    } catch (error) {
        console.error("Error downloading Google models:", error);
    }
}

/**
 * Downloads models from xAI Grok to refresh the database.
 * Uses xAI's native /v1/models API
 */
export async function downloadGrokModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.grok) {
            console.log("No Grok API key configured, skipping model download");
            return;
        }

        const response = await fetch("https://api.x.ai/v1/models", {
            headers: {
                Authorization: `Bearer ${apiKeys.grok}`,
            },
        });

        if (!response.ok) {
            console.error("Failed to fetch xAI Grok models");
            return;
        }

        const { data: models } = (await response.json()) as {
            data: {
                id: string;
                object: string;
                created: number;
                owned_by: string;
            }[];
        };

        for (const model of models) {
            // Grok models support text and image
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `grok::${model.id}`,
                    displayName: model.id,
                    supportedAttachmentTypes: ["text", "image", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading xAI Grok models:", error);
    }
}

/// ------------------------------------------------------------------------------------------------
/// Helpers
/// ------------------------------------------------------------------------------------------------

export async function readTextAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "text") {
        throw new Error("Attachment is not a text file");
    }
    const fileContent = await readFile(attachment.path);
    return new TextDecoder().decode(fileContent);
}

export async function readWebpageAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "webpage") {
        throw new Error("Attachment is not a webpage");
    }
    const fileContent = await readFile(attachment.path);
    return new TextDecoder().decode(fileContent);
}

/**
 * to base64 array
 */
export async function readImageAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "image") {
        throw new Error("Attachment is not an image file");
    }
    const fileContent = await readFile(attachment.path);
    const base64Data = btoa(
        new Uint8Array(fileContent).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
        ),
    );
    return base64Data;
}

export async function readPdfAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "pdf") {
        throw new Error("Attachment is not a PDF file");
    }
    const fileContent = await readFile(attachment.path);
    const base64Data = btoa(
        new Uint8Array(fileContent).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
        ),
    );
    return base64Data;
}

export async function encodeWebpageAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "webpage") {
        throw new Error("Attachment is not a webpage");
    }
    return `<attachment url="${attachment.originalName}">\n${await readWebpageAttachment(attachment)}\n</attachment>\n\n`;
}

export async function encodeTextAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "text") {
        throw new Error("Attachment is not a text file");
    }
    return `<attachment name="${attachment.originalName}">\n${await readTextAttachment(attachment)}\n</attachment>\n\n`;
}

export function attachmentMissingFlag(attachment: Attachment): string {
    return `<attachment name="${attachment.originalName}" type="${attachment.type}">
[This attachment type is not supported by the model. Respond anyway if you can.]
</attachment>\n\n`;
}

function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        return (error as { message: string }).message;
    } else if (typeof error === "string") {
        return error;
    } else {
        return "Unknown error";
    }
}

// Provider-specific context limit error messages
// this is pretty hacky, but works for now - we just take an easily identifiable substring from each provider's error message
const CONTEXT_LIMIT_PATTERNS: Record<ProviderName, string> = {
    anthropic: "prompt is too long",
    openai: "context window",
    google: "token count",
    grok: "maximum prompt length",
    openrouter: "context length",
    meta: "context window", // best guess
    perplexity: "context window", // best guess
    vertex: "context window", // best guess
    custom_openai: "context window", // best guess
    custom_anthropic: "prompt is too long", // best guess
    groq: "context window",
    mistral: "context window",
    cerebras: "context window",
    fireworks: "context window",
    together: "context window",
    nvidia: "context window",
};

/**
 * Detects if an error message indicates that the model ran out of context.
 * Each provider has different error messages for context limit errors.
 */
export function detectContextLimitError(
    errorMessage: string,
    modelId: string,
): boolean {
    if (!errorMessage) {
        return false;
    }

    const lowerMessage = errorMessage.toLowerCase();

    const providerName = getProviderName(modelId);
    const pattern = CONTEXT_LIMIT_PATTERNS[providerName];

    if (pattern) {
        if (lowerMessage.includes(pattern)) {
            return true;
        }
    }

    return false;
}

/**
 * Downloads models from Groq to refresh the database.
 */
export async function downloadGroqModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.groq) {
            return;
        }

        const response = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${apiKeys.groq}` },
        });

        if (!response.ok) return;

        const { data: models } = (await response.json()) as {
            data: { id: string; owned_by: string }[];
        };

        for (const model of models) {
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `groq::${model.id}`,
                    displayName: model.id,
                    supportedAttachmentTypes: ["text", "image", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading Groq models:", error);
    }
}

/**
 * Downloads models from Mistral to refresh the database.
 */
export async function downloadMistralModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.mistral) {
            return;
        }

        const response = await fetch("https://api.mistral.ai/v1/models", {
            headers: { Authorization: `Bearer ${apiKeys.mistral}` },
        });

        if (!response.ok) return;

        const { data: models } = (await response.json()) as {
            data: { id: string; name?: string }[];
        };

        for (const model of models) {
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `mistral::${model.id}`,
                    displayName: model.name || model.id,
                    supportedAttachmentTypes: ["text", "image", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.name || model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading Mistral models:", error);
    }
}

/**
 * Downloads models from Cerebras to refresh the database.
 */
export async function downloadCerebrasModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.cerebras) {
            return;
        }

        const response = await fetch("https://api.cerebras.ai/v1/models", {
            headers: { Authorization: `Bearer ${apiKeys.cerebras}` },
        });

        if (!response.ok) return;

        const { data: models } = (await response.json()) as {
            data: { id: string }[];
        };

        for (const model of models) {
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `cerebras::${model.id}`,
                    displayName: model.id,
                    supportedAttachmentTypes: ["text", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading Cerebras models:", error);
    }
}

/**
 * Downloads models from Fireworks to refresh the database.
 */
export async function downloadFireworksModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.fireworks) {
            return;
        }

        const response = await fetch(
            "https://api.fireworks.ai/inference/v1/models",
            { headers: { Authorization: `Bearer ${apiKeys.fireworks}` } },
        );

        if (!response.ok) return;

        const { data: models } = (await response.json()) as {
            data: { id: string }[];
        };

        for (const model of models) {
            await saveModelAndDefaultConfig(
                db,
                {
                    id: `fireworks::${model.id}`,
                    displayName: model.id,
                    supportedAttachmentTypes: ["text", "image", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading Fireworks models:", error);
    }
}

/**
 * Downloads models from Together.ai to refresh the database.
 */
export async function downloadTogetherModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.together) {
            return;
        }

        const response = await tauriFetch("https://api.together.xyz/v1/models", {
            headers: { Authorization: `Bearer ${apiKeys.together}` },
        });

        if (!response.ok) return;

        const models = (await response.json()) as Array<{
            id: string;
            display_name?: string;
            type?: string;
        }>;

        // Filter for chat models only
        const chatModels = models.filter(
            (model) =>
                model.type === "chat" ||
                model.id.includes("chat") ||
                model.id.includes("instruct"),
        );

        for (const model of chatModels) {
            // Determine if model supports images based on model name
            const supportsImages =
                model.id.includes("vision") ||
                model.id.includes("llama-3.2-90b") ||
                model.id.includes("llama-3.2-11b");

            await saveModelAndDefaultConfig(
                db,
                {
                    id: `together::${model.id}`,
                    displayName: model.display_name || model.id,
                    supportedAttachmentTypes: supportsImages
                        ? ["text", "image", "webpage"]
                        : ["text", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.display_name || model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading Together.ai models:", error);
    }
}

/**
 * Downloads models from Nvidia NIM to refresh the database.
 */
export async function downloadNvidiaModels(
    db: Database,
    apiKeys: ApiKeys,
): Promise<void> {
    try {
        if (!apiKeys.nvidia) {
            return;
        }

        const response = await tauriFetch(
            "https://integrate.api.nvidia.com/v1/models",
            {
                headers: { Authorization: `Bearer ${apiKeys.nvidia}` },
            },
        );

        if (!response.ok) return;

        const { data: models } = (await response.json()) as {
            data: { id: string; owned_by?: string }[];
        };

        for (const model of models) {
            // Determine if model supports images based on model name
            const supportsImages =
                model.id.includes("vision") ||
                model.id.includes("llava") ||
                model.id.includes("llama-3.2-neva");

            await saveModelAndDefaultConfig(
                db,
                {
                    id: `nvidia::${model.id}`,
                    displayName: model.id,
                    supportedAttachmentTypes: supportsImages
                        ? ["text", "image", "webpage"]
                        : ["text", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                model.id,
            );
        }
    } catch (error) {
        console.error("Error downloading Nvidia models:", error);
    }
}

