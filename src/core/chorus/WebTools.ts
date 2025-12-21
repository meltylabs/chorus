import { fetch } from "@tauri-apps/plugin-http";
import { ApiKeys } from "./Models";

type FetchOptions = {
    maxLength?: number;
    startIndex?: number;
    raw?: boolean;
    headers?: Record<string, string>;
};

type FetchResult = {
    content: string;
    truncated: boolean;
    nextStartIndex?: number;
    error?: string;
};

type SearchResult = {
    content: string;
    error?: string;
};

function normalizeUrl(url: string): string {
    if (url.startsWith("http://") && !url.startsWith("https://")) {
        return "https://" + url;
    } else {
        return url;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    } else {
        return "Unknown error";
    }
}

export class WebTools {
    private static async _fetch(
        url: string,
        headers: Record<string, string>,
    ): Promise<Response> {
        console.log("fetching url", url);
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                ...headers,
            },
        });
        console.log("response", response);

        if (!response.ok) {
            throw new Error(
                `HTTP error: ${response.status} ${response.statusText}`,
            );
        }
        return response;
    }

    static async search(
        _query: string,
        _apiKeys: ApiKeys,
    ): Promise<SearchResult> {
        // Web search is not currently available
        return {
            content:
                "<web_search_system_message>Web search is not currently available.</web_search_system_message>",
            error: "Web search is not currently available",
        };
    }

    static async fetchWebpage(
        url: string,
        options: FetchOptions = {},
    ): Promise<FetchResult> {
        const {
            maxLength = 50000,
            startIndex = 0,
            raw = false,
            headers = {},
        } = options;

        try {
            const response = await this._fetch(
                raw ? normalizeUrl(url) : `https://r.jina.ai/${url}`,
                headers,
            );
            let content = await response.text();
            console.log("raw text content", content);

            // Check for empty content early
            if (content.length === 0) {
                return {
                    content:
                        "<web_fetch_system_message>No content found.</web_fetch_system_message>",
                    truncated: false,
                };
            }

            // Now handle pagination
            const totalLength = content.length;

            // Check if startIndex is out of bounds
            if (startIndex >= totalLength) {
                return {
                    content:
                        "<web_fetch_system_message>No more content available.</web_fetch_system_message>",
                    truncated: false,
                };
            }

            // Calculate pagination
            const endIndex = Math.min(startIndex + maxLength, totalLength);
            const truncated = totalLength > endIndex;

            // Extract the requested portion
            content = content.substring(startIndex, endIndex);

            // Add truncation message if needed
            if (truncated) {
                const nextStart = endIndex;
                content += `\n<web_fetch_system_message>Content truncated. If you need to see more content, call the fetch tool with a start_index of ${nextStart}.</web_fetch_system_message>`;
                return {
                    content,
                    truncated: true,
                    nextStartIndex: nextStart,
                };
            }

            return {
                content,
                truncated: false,
            };
        } catch (error) {
            return {
                // Format error message according to spec
                content: `<web_fetch_system_message>Error fetching webpage: ${getErrorMessage(error)}</web_fetch_system_message>`,
                truncated: false,
                error: getErrorMessage(error),
            };
        }
    }
}
