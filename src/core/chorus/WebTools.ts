import { fetch } from "@tauri-apps/plugin-http";
import OpenAI from "openai";
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

type SearchProviderConfig = {
    name: "perplexity" | "openrouter";
    baseURL: string;
    apiKey: string;
    model: string;
    defaultHeaders?: Record<string, string>;
};

const OPENROUTER_PERPLEXITY_MODEL = "perplexity/sonar";

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

function getSearchProviderConfig(
    apiKeys: ApiKeys,
): SearchProviderConfig | null {
    if (apiKeys.perplexity) {
        return {
            name: "perplexity",
            baseURL: "https://api.perplexity.ai",
            apiKey: apiKeys.perplexity,
            model: "sonar",
            defaultHeaders: {
                "Content-Type": "application/json",
                // unset headers that are not supported by the Perplexity API
                // Perplexity's API does not allow x-stainless-* headers added by the OpenAI JS SDK
                "x-stainless-arch": null,
                "x-stainless-lang": null,
                "x-stainless-os": null,
                "x-stainless-package-version": null,
                "x-stainless-retry-count": null,
                "x-stainless-runtime": null,
                "x-stainless-runtime-version": null,
                "x-stainless-timeout": null,
            },
        };
    }

    if (apiKeys.openrouter) {
        return {
            name: "openrouter",
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: apiKeys.openrouter,
            model: OPENROUTER_PERPLEXITY_MODEL,
            defaultHeaders: {
                "HTTP-Referer": "https://chorus.sh",
                "X-Title": "Chorus",
            },
        };
    }

    return null;
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
        query: string,
        apiKeys: ApiKeys,
    ): Promise<SearchResult> {
        try {
            const providerConfig = getSearchProviderConfig(apiKeys);

            if (!providerConfig) {
                return {
                    content:
                        "<web_search_system_message>Please add your Perplexity or OpenRouter API key in Settings to use web search.</web_search_system_message>",
                    error: "No web search API key configured",
                };
            }

            const client = new OpenAI({
                baseURL: providerConfig.baseURL,
                apiKey: providerConfig.apiKey,
                defaultHeaders: providerConfig.defaultHeaders,
                dangerouslyAllowBrowser: true,
            });

            const completion = await client.chat.completions.create({
                model: providerConfig.model,
                messages: [
                    {
                        role: "system",
                        content:
                            "Search the web for information about the user's query. Provide relevant search results with links to sources.",
                    },
                    {
                        role: "user",
                        content: query,
                    },
                ],
                stream: false,
            });

            const content = completion.choices[0]?.message?.content || "";

            // Extract citations if they exist
            // Perplexity returns citations in the completion object
            const completionWithCitations =
                completion as OpenAI.ChatCompletion & {
                    citations?: string[];
                };
            const citations = completionWithCitations.citations;
            let finalContent = content;

            if (citations && citations.length > 0) {
                const sources = citations
                    .map((url, i) => `${i + 1}. [${url}](${url})`)
                    .join("\n");
                finalContent += "\n\nSources:\n" + sources;
            }

            return {
                content: finalContent,
            };
        } catch (error) {
            return {
                content: `<web_search_system_message>Error searching the web: ${getErrorMessage(error)}</web_search_system_message>`,
                error: getErrorMessage(error),
            };
        }
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
