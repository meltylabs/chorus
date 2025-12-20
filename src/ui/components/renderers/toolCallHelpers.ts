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
        const parsed = JSON.parse(content);
        const displayContent = JSON.stringify(parsed, null, 2);

        // Extract summary from common fields
        // Show full description (usually concise and meaningful)
        if (parsed.description) {
            return {
                summary: parsed.description,
                displayContent,
                isJSON: true,
            };
        }

        // Truncate prompts as they can be very long
        if (parsed.prompt) {
            const truncated =
                parsed.prompt.length > 60
                    ? parsed.prompt.substring(0, 60) + "..."
                    : parsed.prompt;
            return {
                summary: truncated,
                displayContent,
                isJSON: true,
            };
        }

        // Show full command, file_path, path, pattern (usually short)
        if (parsed.command) {
            return {
                summary: parsed.command,
                displayContent,
                isJSON: true,
            };
        }

        if (parsed.file_path) {
            return {
                summary: parsed.file_path,
                displayContent,
                isJSON: true,
            };
        }

        if (parsed.path) {
            return {
                summary: parsed.path,
                displayContent,
                isJSON: true,
            };
        }

        if (parsed.pattern) {
            return {
                summary: parsed.pattern,
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
