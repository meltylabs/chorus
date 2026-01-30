// Mapping of model IDs and config IDs for easier maintenance

import { ProviderName } from "@core/chorus/Models";

// The ordering of these keys is the same as the ordering of the models in the UI
export const MODEL_IDS = {
    basic: {
        GPT_5_NANO: "openai::gpt-5-nano",
        GPT_5_MINI: "openai::gpt-5-mini",
        GEMINI_FLASH: "google::gemini-2.5-flash",
        GROK_3_MINI: "grok::grok-3-mini-beta",
    },
    frontier: {
        O3_PRO: "openai::o3-pro",
        O3_DEEP_RESEARCH: "openai::o3-deep-research",
        CLAUDE_4_1_OPUS: "anthropic::claude-opus-4.1-latest",
        GROK_3_FAST: "grok::grok-3-fast-beta",
        SONAR_DEEP_RESEARCH: "5dfdba07-3bad-456d-8267-4aa448d7ae1c",
    },
    plus: {
        GPT_5: "openai::gpt-5",
        CLAUDE_4_SONNET: "anthropic::claude-sonnet-4-5-20250929",
        GEMINI_2_5_PRO: "google::gemini-2.5-pro-latest",
        O3: "openai::o3",
        O4_MINI: "openai::o4-mini",
        DEEPSEEK_R1_0528: "openrouter::deepseek/deepseek-r1-0528",
        GROK_3: "grok::grok-3-beta",
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
    "openrouter::qwen/qwen3-32b", // Qwen 32B
];
