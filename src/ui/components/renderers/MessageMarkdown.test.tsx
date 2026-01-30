import { describe, it, expect } from "vitest";
import { encode } from "html-entities";

// Import the actual safeEncodeMarkdown logic for more realistic testing
function safeEncodeMarkdown(text: string): string {
    // This is the actual implementation from MessageMarkdown.tsx
    const codeBlocks: string[] = [];
    let codeBlockIndex = 0;
    const codePlaceholderPrefix = "MELTY_CODE_PLACEHOLDER_START_";
    const codePlaceholderSuffix = "_MELTY_CODE_PLACEHOLDER_END";

    const preBlocks: string[] = [];
    let preBlockIndex = 0;
    const prePlaceholderPrefix = "MELTY_PRE_PLACEHOLDER_START_";
    const prePlaceholderSuffix = "_MELTY_PRE_PLACEHOLDER_END";

    const contentWithoutPre = text
        .split("\n")
        .map((line) => {
            if (line.startsWith("    ") || line.startsWith("\t")) {
                preBlocks.push(line);
                return `${prePlaceholderPrefix}${preBlockIndex++}${prePlaceholderSuffix}`;
            }
            return line;
        })
        .join("\n");

    const contentWithoutCode = contentWithoutPre.replace(
        /(```[\s\S]*?```|`[^`]*`)/g,
        (match) => {
            codeBlocks.push(match);
            return `${codePlaceholderPrefix}${codeBlockIndex++}${codePlaceholderSuffix}`;
        },
    );

    let encodedText = encode(contentWithoutCode);

    encodedText = encodedText
        .replace(
            new RegExp(
                `${codePlaceholderPrefix}(\\d+)${codePlaceholderSuffix}`,
                "g",
            ),
            (_match: string, index: string) => {
                return codeBlocks[Number(index)];
            },
        )
        .replace(
            new RegExp(
                `${prePlaceholderPrefix}(\\d+)${prePlaceholderSuffix}`,
                "g",
            ),
            (_match: string, index: string) => {
                return preBlocks[Number(index)];
            },
        );

    return encodedText;
}

// Test the regex transformations directly without DOM rendering
describe("MessageMarkdown - CoT regex transformations", () => {
    function processThinkBlocks(text: string): string {
        // Use the actual safeEncodeMarkdown function
        const encodedText = safeEncodeMarkdown(text);

        // Apply the same transformations as MessageMarkdown
        return (
            encodedText
                // First: Handle closed blocks WITH thinkmeta (highest priority)
                .replace(
                    /&lt;think(?:\s+[^>]*?)?&gt;([\s\S]*?)&lt;\/think\s*&gt;\s*&lt;thinkmeta\s+seconds=&quot;(\d+)&quot;\s*\/&gt;/g,
                    (_match, content, seconds: string) => {
                        return `<think complete="true" seconds="${seconds}">\n${content}\n</think>\n\n`;
                    },
                )
                .replace(
                    /&lt;thought(?:\s+[^>]*?)?&gt;([\s\S]*?)&lt;\/thought\s*&gt;\s*&lt;thinkmeta\s+seconds=&quot;(\d+)&quot;\s*\/&gt;/g,
                    (_match, content, seconds: string) => {
                        return `<think complete="true" seconds="${seconds}">\n${content}\n</think>\n\n`;
                    },
                )
                // Second: Handle closed blocks WITHOUT thinkmeta (must come before unclosed patterns)
                .replace(
                    /&lt;think(?:\s+[^>]*?)?&gt;([\s\S]*?)&lt;\/think\s*&gt;/g,
                    (_match, content) => {
                        return `<think complete="true">\n${content}\n</think>\n\n`;
                    },
                )
                .replace(
                    /&lt;thought(?:\s+[^>]*?)?&gt;([\s\S]*?)&lt;\/thought\s*&gt;/g,
                    (_match, content) => {
                        return `<think complete="true">\n${content}\n</think>\n\n`;
                    },
                )
                // Third: Handle unclosed blocks (fallback for streaming)
                .replace(
                    /&lt;think(?:\s+[^>]*?)?&gt;([\s\S]*?)$/g,
                    (_match, content) => {
                        return `<think complete="false">\n${content}\n</think>\n\n`;
                    },
                )
                .replace(
                    /&lt;thought(?:\s+[^>]*?)?&gt;([\s\S]*?)$/g,
                    (_match, content) => {
                        return `<think complete="false">\n${content}\n</think>\n\n`;
                    },
                )
        );
    }

    it("should handle closed <think> blocks without <thinkmeta> tags", () => {
        const text = `<think>This is reasoning content</think>

This is the actual answer that should be visible.`;

        const result = processThinkBlocks(text);

        // The actual answer should NOT be captured by the think block
        expect(result).toContain(
            "This is the actual answer that should be visible.",
        );
        expect(result).toContain('<think complete="true">');
        expect(result).toContain("</think>");

        // The answer should be OUTSIDE the think tags, not inside
        const thinkBlockRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
        const matches = result.matchAll(thinkBlockRegex);
        for (const match of matches) {
            const thinkContent = match[1];
            // The actual answer should NOT be inside any think block
            expect(thinkContent).not.toContain(
                "This is the actual answer that should be visible.",
            );
        }
    });

    it("should handle multiple closed <think> blocks without <thinkmeta>", () => {
        const text = `<think>First reasoning</think>

<think>Second reasoning</think>

Final answer content here.`;

        const result = processThinkBlocks(text);

        // The final answer should NOT be captured by think blocks
        expect(result).toContain("Final answer content here.");

        // Verify the answer is OUTSIDE all think blocks
        const thinkBlockRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
        const matches = result.matchAll(thinkBlockRegex);
        for (const match of matches) {
            const thinkContent = match[1];
            expect(thinkContent).not.toContain("Final answer content here.");
        }
    });

    it("should handle closed <think> blocks WITH <thinkmeta> tags", () => {
        const text = `<think>Reasoning content</think><thinkmeta seconds="2"/>

Actual response here.`;

        const result = processThinkBlocks(text);

        // The actual response should be outside the think block
        expect(result).toContain("Actual response here.");
        expect(result).toContain('seconds="2"');

        // Verify the response is not captured inside the think block
        const thinkBlockRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
        const matches = result.matchAll(thinkBlockRegex);
        for (const match of matches) {
            const thinkContent = match[1];
            expect(thinkContent).not.toContain("Actual response here.");
        }
    });

    it("should handle mixed <think> blocks (with and without <thinkmeta>)", () => {
        const text = `<think>First reasoning</think><thinkmeta seconds="2"/>

<think>Second reasoning without thinkmeta</think>

<think>Third reasoning</think><thinkmeta seconds="3"/>

Final content should be visible.`;

        const result = processThinkBlocks(text);

        // The final content should be outside all think blocks
        expect(result).toContain("Final content should be visible.");

        // Verify it's not captured by any think block
        const thinkBlockRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
        const matches = result.matchAll(thinkBlockRegex);
        for (const match of matches) {
            const thinkContent = match[1];
            expect(thinkContent).not.toContain(
                "Final content should be visible.",
            );
        }
    });

    it("should handle OpenAI reasoning model output format (from bug report)", () => {
        // This is the exact format from the bug report
        const text = `<think>**Clarifying news search**

I need to clarify that the user is looking for news from the US.</think><thinkmeta seconds="2"/>

<think>**Gathering news sources**

I've come across search results from The Guardian and WaPo.</think><thinkmeta seconds="2"/>

## News today (Thu, **January 29, 2026**) — quick briefing

### U.S. politics & government
- **Shutdown risk is rising**: Senate Democrats are pressing for reforms.`;

        const result = processThinkBlocks(text);

        // The actual news content should be OUTSIDE all think blocks
        expect(result).toContain("News today");
        expect(result).toContain("U.S. politics &amp; government");
        expect(result).toContain("Shutdown risk is rising");

        // Verify the news content is not captured inside any think block
        const thinkBlockRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
        const matches = result.matchAll(thinkBlockRegex);
        for (const match of matches) {
            const thinkContent = match[1];
            expect(thinkContent).not.toContain("News today");
            expect(thinkContent).not.toContain("Shutdown risk is rising");
        }
    });
});
