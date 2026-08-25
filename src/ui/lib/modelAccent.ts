import { getProviderName } from "@core/chorus/Models";

const PROVIDER_HUE: Record<string, number> = {
    anthropic: 18,
    openai: 158,
    google: 217,
    grok: 38,
    perplexity: 188,
    openrouter: 262,
    ollama: 95,
    lmstudio: 280,
    meta: 210,
};

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

/**
 * Stable HSL accent per model so compare columns are easy to tell apart.
 * Provider sets the family hue; the model id nudges it so GPT-5.6 Sol and Luna differ.
 */
export function getModelAccentHsl(modelId: string | undefined): string {
    if (!modelId) {
        return "hsl(220 10% 50%)";
    }

    const provider = getProviderName(modelId);
    const baseHue = PROVIDER_HUE[provider] ?? 220;
    const nudge = (hashString(modelId) % 25) - 12;
    const hue = (baseHue + nudge + 360) % 360;

    return `hsl(${hue} 52% 46%)`;
}
