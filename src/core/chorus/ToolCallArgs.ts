import JSON5 from "json5";

function stripMarkdownCodeFences(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("```")) return trimmed;

    return trimmed
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseToolCallArguments(raw: string | null | undefined): {
    args: Record<string, unknown>;
    parseError?: string;
} {
    const rawText = (raw ?? "").trim();
    if (!rawText) {
        return { args: {} };
    }

    const normalized = stripMarkdownCodeFences(rawText);

    const candidates: string[] = [normalized];
    const objectStart = normalized.indexOf("{");
    const objectEnd = normalized.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
        const sliced = normalized.slice(objectStart, objectEnd + 1).trim();
        if (sliced && sliced !== normalized) {
            candidates.push(sliced);
        }
    }

    let lastError: string | undefined;
    for (const candidate of candidates) {
        const parsers: Array<(text: string) => unknown> = [
            (text) => {
                const parsed: unknown = JSON.parse(text);
                return parsed;
            },
            (text) => {
                const parsed: unknown = JSON5.parse(text);
                return parsed;
            },
        ];
        for (const parser of parsers) {
            try {
                const parsed = parser(candidate);
                if (!isPlainObject(parsed)) {
                    lastError =
                        "Expected a JSON object for tool arguments (got a non-object value).";
                    continue;
                }
                return { args: parsed };
            } catch (error) {
                lastError =
                    error instanceof Error ? error.message : String(error);
            }
        }
    }

    return {
        args: {},
        parseError: `Invalid JSON for tool arguments: ${lastError ?? "unknown error"}`,
    };
}
