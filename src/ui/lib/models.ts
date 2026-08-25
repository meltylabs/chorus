// Mapping of model IDs and config IDs for easier maintenance

import { ModelConfig, ProviderName } from "@core/chorus/Models";

/** Newest models to show by default in each provider group (search still finds older ones). */
export const FEATURED_MODELS_BY_PROVIDER: Record<string, readonly string[]> = {
    openai: [
        "openai::gpt-5.6-sol",
        "openai::gpt-5.6-terra",
        "openai::gpt-5.6-luna",
    ],
    anthropic: [
        "anthropic::claude-opus-5",
        "anthropic::claude-sonnet-5",
        "anthropic::claude-fable-5",
    ],
    grok: ["grok::grok-4.6", "grok::grok-4.5", "grok::grok-4.3"],
    google: [
        "google::gemini-3-pro-preview",
        "google::gemini-3-flash-preview",
        "google::gemini-2.5-pro-latest",
    ],
    perplexity: [
        "perplexity::sonar-pro",
        "perplexity::sonar-reasoning-pro",
        "perplexity::sonar-deep-research",
    ],
};

function findModelByFeaturedId(
    models: ModelConfig[],
    featuredId: string,
): ModelConfig | undefined {
    return models.find(
        (model) => model.id === featuredId || model.modelId === featuredId,
    );
}

export function limitToFeaturedModels(
    models: ModelConfig[],
    provider: string,
    options: { searching: boolean; alwaysIncludeIds: string[] },
): ModelConfig[] {
    if (options.searching) {
        return models;
    }

    const featuredIds = FEATURED_MODELS_BY_PROVIDER[provider];
    if (!featuredIds) {
        return models;
    }

    const featured = featuredIds
        .map((id) => findModelByFeaturedId(models, id))
        .filter((model): model is ModelConfig => model !== undefined);

    const featuredConfigIds = new Set(featured.map((model) => model.id));
    const alwaysInclude = new Set(options.alwaysIncludeIds);

    const extras = models.filter(
        (model) =>
            alwaysInclude.has(model.id) && !featuredConfigIds.has(model.id),
    );

    return [...featured, ...extras];
}

// The ordering of these keys is the same as the ordering of the models in the UI
export const MODEL_IDS = {
    basic: {
        GPT_5_6_LUNA: "openai::gpt-5.6-luna",
        GPT_5_MINI: "openai::gpt-5-mini",
        GEMINI_FLASH: "google::gemini-2.5-flash",
        GROK_4_3: "grok::grok-4.3",
    },
    frontier: {
        O3_PRO: "openai::o3-pro",
        O3_DEEP_RESEARCH: "openai::o3-deep-research",
        CLAUDE_FABLE_5: "anthropic::claude-fable-5",
        CLAUDE_OPUS_5: "anthropic::claude-opus-5",
        GROK_4_6: "grok::grok-4.6",
        SONAR_DEEP_RESEARCH: "5dfdba07-3bad-456d-8267-4aa448d7ae1c",
    },
    plus: {
        GPT_5_6_SOL: "openai::gpt-5.6-sol",
        GPT_5_6_TERRA: "openai::gpt-5.6-terra",
        CLAUDE_SONNET_5: "anthropic::claude-sonnet-5",
        GEMINI_2_5_PRO: "google::gemini-2.5-pro-latest",
        O3: "openai::o3",
        O4_MINI: "openai::o4-mini",
        DEEPSEEK_R1_0528: "openrouter::deepseek/deepseek-r1-0528",
        GROK_4_5: "grok::grok-4.5",
        GROK_4: "openrouter::x-ai/grok-4",
    },
} as const;

// Hard coded list of default openrouter models that will receive special tier exemptions and logo handling
export const OPENROUTER_CUSTOM_PROVIDER_LOGOS: Record<string, ProviderName> = {
    "openrouter::x-ai/grok-4": "grok",
};

// Flatten the MODEL_IDS object into a single array of allowed IDs
export const ALLOWED_MODEL_IDS_FOR_QUICK_CHAT: string[] = [
    ...Object.values(MODEL_IDS).flatMap((tier) => Object.values(tier)),
    // Add our custom models for quick chat
    "24711c64-725c-4bdd-b5eb-65fe1dbfcde8", // Ambient Claude
    "google::ambient-gemini-2.5-pro-preview-03-25", // Ambient Gemini
    "openrouter::qwen/qwen3-32b", // Qwen 32B
];
