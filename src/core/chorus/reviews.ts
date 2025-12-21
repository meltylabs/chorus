import { ProviderName } from "./Models";

export type ReviewUnvalidated = {
    decision?: string;
    explanation?: string;
    revision?: string;
};

export function parseReview(
    text: string,
    isComplete: boolean,
): ReviewUnvalidated {
    const decision = text.match(/<decision>([\s\S]*?)<\/decision>/)?.[1];
    const explanation = text.match(
        /<explanation>([\s\S]*?)<\/explanation>/,
    )?.[1];
    let revision = text.match(/<revision>([\s\S]*?)<\/revision>/)?.[1];

    if (!revision && text.match(/<revision>/) && isComplete) {
        console.warn(
            `No revision end tag found in ${text}. Assuming it goes till end of response.`,
        );
        revision = text.match(/<revision>([\s\S]*?)$/)?.[1];
    } else if (decision !== "AGREE" && !revision && isComplete) {
        console.warn(`Hopeless revision ${text}`);
    }

    return {
        decision,
        explanation,
        revision,
    };
}

export const REVIEWERS: {
    [key: string]: {
        longName: string;
        shortName?: string;
        provider: ProviderName;
    };
} = {
    // Keep old keys for backwards compatibility with existing chats
    "58147fb6-1cd0-4c58-b0f0-2760bc96ef79": {
        longName: "Anthropic Claude 3.7 Sonnet Thinking",
        shortName: "Claude",
        provider: "anthropic",
    },
    "anthropic::claude-sonnet-4-5-20250929": {
        longName: "Claude Sonnet 4.5",
        shortName: "Claude",
        provider: "anthropic",
    },
};

export const ACTIVE_REVIEWERS_ORDER: (keyof typeof REVIEWERS)[] = [
    "58147fb6-1cd0-4c58-b0f0-2760bc96ef79",
];
