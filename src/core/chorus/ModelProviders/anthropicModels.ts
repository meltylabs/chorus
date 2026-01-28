export type AnthropicModelConfig = {
    inputModelName: string;
    anthropicModelName: string;
    maxTokens: number;
};

export const ANTHROPIC_THINKING_MIN_BUDGET_TOKENS = 1024;

const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;

const ANTHROPIC_MODELS: AnthropicModelConfig[] = [
    {
        inputModelName: "claude-3-5-sonnet-latest",
        anthropicModelName: "claude-3-5-sonnet-latest",
        maxTokens: 8192,
    },
    {
        inputModelName: "claude-3-7-sonnet-latest",
        anthropicModelName: "claude-3-7-sonnet-latest",
        maxTokens: 20000,
    },
    {
        inputModelName: "claude-3-7-sonnet-latest-thinking",
        anthropicModelName: "claude-3-7-sonnet-latest",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-sonnet-4-latest",
        // https://docs.anthropic.com/en/docs/about-claude/models/overview 0 is the new alias for latest
        anthropicModelName: "claude-sonnet-4-0",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-sonnet-4-5-20250929",
        anthropicModelName: "claude-sonnet-4-5-20250929",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-opus-4-latest",
        anthropicModelName: "claude-opus-4-0",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-opus-4.1-latest",
        anthropicModelName: "claude-opus-4-1-20250805",
        maxTokens: 10000,
    },
    {
        inputModelName: "claude-haiku-4-5-20251001",
        anthropicModelName: "claude-haiku-4-5-20251001",
        maxTokens: 20000,
    },
    {
        inputModelName: "claude-opus-4-5-20251101",
        anthropicModelName: "claude-opus-4-5-20251101",
        maxTokens: 20000,
    },
];

export function getAnthropicModelName(modelName: string): string {
    const modelConfig = ANTHROPIC_MODELS.find(
        (m) => m.inputModelName === modelName,
    );
    // If not found in hardcoded list, return the model name as-is
    // (supports dynamically fetched models from API)
    return modelConfig?.anthropicModelName ?? modelName;
}

export function getAnthropicMaxTokens(modelName: string): number {
    const modelConfig = ANTHROPIC_MODELS.find(
        (m) => m.inputModelName === modelName,
    );
    // Return default max tokens if model not found in hardcoded list
    // (supports dynamically fetched models from API)
    return modelConfig?.maxTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS;
}

export function clampAnthropicThinkingBudgetTokens(params: {
    budgetTokens: number;
    maxTokens: number;
}): number {
    const normalizedBudgetTokens = Math.floor(params.budgetTokens);
    if (
        !Number.isFinite(normalizedBudgetTokens) ||
        Number.isNaN(normalizedBudgetTokens)
    ) {
        return ANTHROPIC_THINKING_MIN_BUDGET_TOKENS;
    }

    const maxBudgetTokens = Math.max(
        ANTHROPIC_THINKING_MIN_BUDGET_TOKENS,
        params.maxTokens - 1,
    );

    return Math.min(
        maxBudgetTokens,
        Math.max(ANTHROPIC_THINKING_MIN_BUDGET_TOKENS, normalizedBudgetTokens),
    );
}
