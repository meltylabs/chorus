import { Toolset as Toolset } from "@core/chorus/Toolsets";
import { WebTools } from "../WebTools";
import { getApiKeys } from "../api/AppMetadataAPI";

/*
Spec

Tools:
- `web_fetch` - Fetches a URL from the internet and extracts its contents as markdown. Images are omitted.
    - `url` (string, required): URL to fetch
        - if no protocol, should default to https:// - so input can be either like `https://example.com` or like `example.com`
    - `max_length` (integer, optional): Maximum number of characters to return (default: 5000).
    - `start_index` (integer, optional): Start content from this character index (default: 0). Useful if a previous fetch was truncated and more context is required.
    - `raw` (boolean, optional): Get the raw HTML content of the page without markdown conversion (default: false).
    - Return values:
        - webpage content
        - `<error>No more content available.</error>`
        - webpage content + `<warning>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</warning>`
        - `<error>Markdown conversion failed. You may try again with raw = true.</error>`
        - fetch errors appear like `<error>Error fetching webpage: 403 Unauthorized</error>`
- `web_search` - Searches the web to produce a report (with citations) on a topic. Uses Perplexity Sonar (via Perplexity or OpenRouter) to produce the report.
    - `query` (string, required): The topic to search for.
    - Return values: list of webpages
*/

export class ToolsetWeb extends Toolset {
    constructor() {
        super("web", "Web", {}, "Search the web and read webpages", "");

        this.addCustomTool(
            "fetch",
            {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "URL to fetch",
                    },
                    max_length: {
                        type: "integer",
                        description:
                            "Maximum number of characters to return (default: 50000)",
                    },
                    start_index: {
                        type: "integer",
                        description:
                            "Start content from this character index (default: 0). Useful if a previous fetch was truncated and more context is required.",
                    },
                    raw: {
                        type: "boolean",
                        description:
                            "Get the raw HTML content of the page without markdown conversion (default: false)",
                    },
                },
                required: ["url"],
                additionalProperties: false,
            },
            async (args) => {
                const { url, max_length, start_index, raw } = args;

                const result = await WebTools.fetchWebpage(url as string, {
                    maxLength: max_length as number | undefined,
                    startIndex: start_index as number | undefined,
                    raw: raw as boolean | undefined,
                });

                return result.content;
            },
            "Fetch a webpage from the internet and return its content as markdown. Images are omitted.",
        );

        this.addCustomTool(
            "search",
            {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Query to search the web for.",
                    },
                },
                required: ["query"],
                additionalProperties: false,
            },
            async (args) => {
                const { query } = args;

                const apiKeys = await getApiKeys();
                if (!apiKeys) {
                    throw new Error("API keys are not available.");
                }
                const result = await WebTools.search(query as string, apiKeys);
                return result.content;
            },
            `Search the web to produce a report (with citations) on a topic. Uses Perplexity Sonar to produce the report.
The query should be a natural-language description of the topic to search for. For example:
- 'How has SF summer weather typically compared to NYC summer weather?'
- 'Best resources for learning to code'
Make sure to use full sentences in your query.
Assume that the user will not read the report. If you think information in the report is relevant to the user, you should repeat it.`,
        );
    }
}
