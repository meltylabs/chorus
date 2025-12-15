import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SettingsManager } from "@core/utilities/Settings";

type SimpleLLMParams = {
    model?: SimpleLLMModel;
    maxTokens: number;
};

enum SimpleLLMModel {
    CLAUDE_HAIKU_4_5 = "claude-haiku-4-5",
}

/**
 * Makes a simple LLM call.
 *
 * Prefers the Anthropic SDK when an Anthropic API key is configured.
 * If no Anthropic key is available but an OpenRouter key is present,
 * falls back to calling an Anthropic model via OpenRouter's
 * OpenAI-compatible API.
 *
 * Used primarily for generating chat titles and suggestions.
 */
export async function simpleLLM(
    prompt: string,
    params: SimpleLLMParams,
): Promise<string> {
    const settingsManager = SettingsManager.getInstance();
    const settings = await settingsManager.get();
    const anthropicKey = settings.apiKeys?.anthropic;
    const openrouterKey = settings.apiKeys?.openrouter;

    // Prefer direct Anthropic if available
    if (anthropicKey) {
        const client = new Anthropic({
            apiKey: anthropicKey,
            dangerouslyAllowBrowser: true,
        });

        let anthropicModel: string;
        switch (params.model ?? SimpleLLMModel.CLAUDE_HAIKU_4_5) {
            case SimpleLLMModel.CLAUDE_HAIKU_4_5:
                anthropicModel = "claude-haiku-4-5";
                break;
        }

        const stream = client.messages.stream({
            model: anthropicModel,
            max_tokens: params.maxTokens,
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        let fullResponse = "";

        stream.on("text", (text: string) => {
            fullResponse += text;
        });

        await stream.finalMessage();

        return fullResponse;
    }

    // Fallback: use OpenRouter via OpenAI-compatible API if available
    if (openrouterKey) {
        const client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: openrouterKey,
            defaultHeaders: {
                "HTTP-Referer": "https://chorus.sh",
                "X-Title": "Chorus",
            },
            dangerouslyAllowBrowser: true,
        });

        let openrouterModel: string;
        switch (params.model ?? SimpleLLMModel.CLAUDE_HAIKU_4_5) {
            case SimpleLLMModel.CLAUDE_HAIKU_4_5:
                openrouterModel = "anthropic/claude-haiku-4.5";
                break;
        }

        const stream = await client.chat.completions.create({
            model: openrouterModel,
            max_tokens: params.maxTokens,
            stream: true,
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        let fullResponse = "";

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
                fullResponse += delta;
            }
        }

        return fullResponse;
    }

    // If neither key is available, surface a clear error
    throw new Error(
        "Please add an Anthropic or OpenRouter API key in Settings to generate chat titles.",
    );
}

/**
 * Makes a simple LLM call using Google's Gemini models via OpenAI-compatible API.
 * Used for generating chat titles and summaries.
 */
export async function simpleSummarizeLLM(
    prompt: string,
    params: SimpleLLMParams,
): Promise<string> {
    const settingsManager = SettingsManager.getInstance();
    const settings = await settingsManager.get();
    const apiKey = settings.apiKeys?.google;

    if (!apiKey) {
        throw new Error("Please add your Google AI API key in Settings.");
    }

    // Use Google's OpenAI-compatible endpoint
    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: params.model,
                max_tokens: params.maxTokens,
                stream: true,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`Google API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const decoder = new TextDecoder();
    let fullResponse = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
            if (line.startsWith("data: ")) {
                try {
                    const dataStr = line.slice(6);
                    if (dataStr === "[DONE]") continue;

                    const data = JSON.parse(dataStr) as {
                        choices?: Array<{
                            delta?: { content?: string };
                        }>;
                    };

                    const content = data.choices?.[0]?.delta?.content;
                    if (content) {
                        fullResponse += content;
                    }
                } catch (e) {
                    console.warn("Error parsing chunk:", e);
                }
            }
        }
    }

    return fullResponse;
}
