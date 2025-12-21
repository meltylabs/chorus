import { ProviderName } from "./Models";

type Idea = {
    idea: string;
    advantage?: string;
};

export function parseIdeaMessage(text: string): Idea[] {
    const matches = Array.from(text.matchAll(/<idea>([\s\S]*?)<\/idea>/g));
    const ideasRaw = matches.map((match) => match[1]);
    const ideas = ideasRaw.map((idea) => {
        const advantageMatch = idea.match(/<advantage>([\s\S]*?)<\/advantage>/);
        const ideaWithoutAdvantage = idea.replace(
            /<advantage>([\s\S]*?)<\/advantage>/,
            "",
        );
        return { idea: ideaWithoutAdvantage, advantage: advantageMatch?.[1] };
    });
    return ideas || [];
}

/**
 * If you ever remove keys from this object,
 * it will break existing chats.
 */
export const BRAINSTORMER_NAMES: {
    [key: string]: {
        longName: string;
        shortName?: string;
        provider: ProviderName;
    };
} = {
    "2b1c042c-82f8-4913-9cee-03ed71361f03": {
        longName: "Claude 3.7 Sonnet",
        shortName: "Claude",
        provider: "anthropic",
    },
    "anthropic::claude-sonnet-4-5-20250929": {
        longName: "Claude Sonnet 4.5",
        shortName: "Claude",
        provider: "anthropic",
    },
};

export const BRAINSTORMERS: (keyof typeof BRAINSTORMER_NAMES)[] = [
    "2b1c042c-82f8-4913-9cee-03ed71361f03",
];
