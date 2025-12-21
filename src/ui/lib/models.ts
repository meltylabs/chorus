// Mapping of model IDs and config IDs for easier maintenance

// The ordering of these keys is the same as the ordering of the models in the UI
export const MODEL_IDS = {
    frontier: {
        CLAUDE_4_1_OPUS: "anthropic::claude-opus-4.1-latest",
    },
    plus: {
        CLAUDE_4_SONNET: "anthropic::claude-sonnet-4-5-20250929",
    },
} as const;

// Flatten the MODEL_IDS object into a single array of allowed IDs
export const ALLOWED_MODEL_IDS_FOR_QUICK_CHAT: string[] = [
    ...Object.values(MODEL_IDS).flatMap((tier) => Object.values(tier)),
    "anthropic::claude-3-5-sonnet-latest",
    "anthropic::claude-3-7-sonnet-latest",
];
