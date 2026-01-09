import { ApiKeys } from "@core/chorus/Models";

export interface CanProceedResult {
    canProceed: boolean;
    reason?: string;
}

/**
 * Maps provider names to their corresponding API key field names
 */
const PROVIDER_TO_API_KEY: Record<string, keyof ApiKeys> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    perplexity: "perplexity",
    openrouter: "openrouter",
    grok: "grok",
};

/**
 * Maps provider names to human-readable names for error messages
 */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google AI",
    perplexity: "Perplexity",
    openrouter: "OpenRouter",
    grok: "xAI",
};

/**
 * Checks if we have the required API key to use a provider
 * @param providerKey The provider name (e.g. 'anthropic', 'openai')
 * @param apiKeys The API keys object
 * @returns true if we have an API key for this provider
 */
export function hasApiKey(
    providerKey: keyof ApiKeys,
    apiKeys: ApiKeys,
): boolean {
    return Boolean(apiKeys[providerKey]);
}

/**
 * Checks if we can proceed with a provider request.
 * Requires the user to have configured an API key for the provider.
 * @param providerKey The provider name (e.g. 'anthropic', 'openai')
 * @param apiKeys The API keys object
 * @returns Object containing whether we can proceed and an optional reason if we cannot
 */
export function canProceedWithProvider(
    providerKey: string,
    apiKeys: ApiKeys,
): CanProceedResult {
    const apiKeyField = PROVIDER_TO_API_KEY[providerKey];

    // Local models (ollama, lmstudio) and claude-code don't require API keys
    // claude-code uses the local Claude Code CLI authentication
    if (
        providerKey === "ollama" ||
        providerKey === "lmstudio" ||
        providerKey === "claude-code"
    ) {
        return { canProceed: true };
    }

    // For providers that need API keys, check if one is configured
    if (!apiKeyField) {
        return {
            canProceed: false,
            reason: `Unknown provider: ${providerKey}`,
        };
    }

    if (!hasApiKey(apiKeyField, apiKeys)) {
        const displayName = PROVIDER_DISPLAY_NAMES[providerKey] || providerKey;
        return {
            canProceed: false,
            reason: `Please add your ${displayName} API key in Settings to use this model.`,
        };
    }

    return { canProceed: true };
}
