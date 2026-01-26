interface ToolCallParsedContent {
    description?: string;
    prompt?: string;
    command?: string;
    file_path?: string;
    path?: string;
    pattern?: string;
}

function isToolCallParsedContent(
    value: unknown,
): value is ToolCallParsedContent {
    return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/**
 * Extracts a human-readable summary from tool call content
 * @param content - Raw content string (usually JSON)
 * @returns Object with summary text, formatted content, and whether it's JSON
 */
export function extractToolSummary(content: string): {
    summary: string;
    displayContent: string;
    isJSON: boolean;
} {
    try {
        const parsed: unknown = JSON.parse(content);
        const displayContent = JSON.stringify(parsed, null, 2);

        if (!isToolCallParsedContent(parsed)) {
            return {
                summary: "",
                displayContent,
                isJSON: true,
            };
        }

        // Extract summary from common fields
        // Show full description (usually concise and meaningful)
        const description = getString(parsed.description);
        if (description) {
            return {
                summary: description,
                displayContent,
                isJSON: true,
            };
        }

        // Truncate prompts as they can be very long
        const prompt = getString(parsed.prompt);
        if (prompt) {
            const truncated =
                prompt.length > 60 ? prompt.substring(0, 60) + "..." : prompt;
            return {
                summary: truncated,
                displayContent,
                isJSON: true,
            };
        }

        // Show full command, file_path, path, pattern (usually short)
        const command = getString(parsed.command);
        if (command) {
            return {
                summary: command,
                displayContent,
                isJSON: true,
            };
        }

        const filePath = getString(parsed.file_path);
        if (filePath) {
            return {
                summary: filePath,
                displayContent,
                isJSON: true,
            };
        }

        const path = getString(parsed.path);
        if (path) {
            return {
                summary: path,
                displayContent,
                isJSON: true,
            };
        }

        const pattern = getString(parsed.pattern);
        if (pattern) {
            return {
                summary: pattern,
                displayContent,
                isJSON: true,
            };
        }

        // No recognized field, return empty summary
        return {
            summary: "",
            displayContent,
            isJSON: true,
        };
    } catch {
        // Not JSON, use content as-is with truncation for summary
        const summary =
            content.length > 60 ? content.substring(0, 60) + "..." : content;

        return {
            summary,
            displayContent: content,
            isJSON: false,
        };
    }
}
