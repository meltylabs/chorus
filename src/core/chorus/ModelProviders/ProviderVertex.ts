import OpenAI from "openai";
import OpenAICompletionsAPIUtils from "@core/chorus/OpenAICompletionsAPIUtils";
import { SettingsManager } from "@core/utilities/Settings";
import { StreamResponseParams } from "../Models";
import { IProvider, ModelDisabled } from "./IProvider";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import JSON5 from "json5";

interface ProviderError {
    message: string;
    error?: {
        message?: string;
        metadata?: { raw?: string };
    };
    metadata?: { raw?: string };
}

function isProviderError(error: unknown): error is ProviderError {
    return (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        ("error" in error || "metadata" in error) &&
        error.message === "Provider returned error"
    );
}

function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        return (error as { message: string }).message;
    } else if (typeof error === "string") {
        return error;
    }
    return "Unknown error";
}

function base64UrlEncodeFromBytes(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeJson(value: unknown): string {
    return base64UrlEncodeFromBytes(
        new TextEncoder().encode(JSON.stringify(value)),
    );
}

function pemToDerBytes(pem: string): Uint8Array {
    const normalized = pem
        .trim()
        // Handle pasting from service account JSON where newlines are escaped.
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        // Remove wrapping quotes if the value is copied as a JSON string.
        .replace(/^['"]/, "")
        .replace(/['"]$/, "");

    const clean = normalized
        .replace(/-----BEGIN [^-]+-----/g, "")
        .replace(/-----END [^-]+-----/g, "")
        .replace(/\s+/g, "")
        .trim();
    let binary: string;
    try {
        binary = atob(clean);
    } catch (_error) {
        throw new Error(
            "Invalid service account private key. Paste the PEM contents (with real newlines), or paste the JSON value (it should contain \\n sequences).",
        );
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function signJwtRS256(params: {
    payload: Record<string, unknown>;
    privateKeyPem: string;
}): Promise<string> {
    const header = { alg: "RS256", typ: "JWT" };

    const encodedHeader = base64UrlEncodeJson(header);
    const encodedPayload = base64UrlEncodeJson(params.payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Work around TS DOM lib typing differences between ArrayBuffer and SharedArrayBuffer.
    const keyBytes = new Uint8Array(pemToDerBytes(params.privateKeyPem));
    const key = await crypto.subtle.importKey(
        "pkcs8",
        keyBytes,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );

    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput),
    );

    const encodedSignature = base64UrlEncodeFromBytes(
        new Uint8Array(signature),
    );

    return `${signingInput}.${encodedSignature}`;
}

type CachedAccessToken = {
    token: string;
    expiresAtMs: number;
};

let cachedAccessToken: CachedAccessToken | undefined;

async function getGoogleAccessToken(params: {
    clientEmail: string;
    privateKey: string;
}): Promise<string> {
    const nowMs = Date.now();
    if (cachedAccessToken && cachedAccessToken.expiresAtMs - nowMs > 60_000) {
        return cachedAccessToken.token;
    }

    const iat = Math.floor(nowMs / 1000);
    const exp = iat + 60 * 60;

    const jwt = await signJwtRS256({
        privateKeyPem: params.privateKey,
        payload: {
            iss: params.clientEmail,
            sub: params.clientEmail,
            aud: "https://oauth2.googleapis.com/token",
            iat,
            exp,
            scope: "https://www.googleapis.com/auth/cloud-platform",
        },
    });

    const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
    }).toString();

    const response = await tauriFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
            `Failed to fetch Google access token (${response.status}): ${errorText || response.statusText}`,
        );
    }

    const tokenResponse = (await response.json()) as {
        access_token: string;
        expires_in: number;
        token_type: string;
    };

    cachedAccessToken = {
        token: tokenResponse.access_token,
        expiresAtMs: nowMs + tokenResponse.expires_in * 1000,
    };

    return tokenResponse.access_token;
}

function getVertexBaseUrl(params: { projectId: string; location: string }) {
    // Vertex AI OpenAI-compatible API base URL.
    // Ref: https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/openai
    const host =
        params.location === "global"
            ? "aiplatform.googleapis.com"
            : `${params.location}-aiplatform.googleapis.com`;
    return `https://${host}/v1beta1/projects/${params.projectId}/locations/${params.location}/endpoints/openapi`;
}

function normalizeVertexPublisherModel(model: string): string {
    const trimmed = model.trim();
    if (!trimmed) return trimmed;

    // Allow pasting full resource names.
    // e.g. "publishers/google/models/gemini-2.5-pro" -> "google/gemini-2.5-pro"
    const publishersMatch = trimmed.match(
        /^publishers\/([^/]+)\/models\/(.+)$/,
    );
    if (publishersMatch) {
        return `${publishersMatch[1]}/${publishersMatch[2]}`;
    }

    // e.g. "projects/<id>/locations/<loc>/publishers/google/models/gemini-2.5-pro" -> "google/gemini-2.5-pro"
    const fullMatch = trimmed.match(
        /^projects\/[^/]+\/locations\/[^/]+\/publishers\/([^/]+)\/models\/(.+)$/,
    );
    if (fullMatch) {
        return `${fullMatch[1]}/${fullMatch[2]}`;
    }

    // e.g. "models/gemini-2.5-pro" -> "google/gemini-2.5-pro"
    const modelsMatch = trimmed.match(/^models\/(.+)$/);
    if (modelsMatch) {
        return `google/${modelsMatch[1]}`;
    }

    // If it already looks like "<publisher>/<model>", keep it.
    if (trimmed.includes("/")) {
        return trimmed;
    }

    // Default to Google publisher models for convenience.
    return `google/${trimmed}`;
}

export class ProviderVertex implements IProvider {
    async streamResponse({
        llmConversation,
        modelConfig,
        onChunk,
        onComplete,
        additionalHeaders,
        tools,
        enabledToolsets,
        onError,
        customBaseUrl,
    }: StreamResponseParams): Promise<ModelDisabled | void> {
        const rawModelName = modelConfig.modelId
            .split("::")
            .slice(1)
            .join("::");
        if (!rawModelName) {
            throw new Error(`Invalid model id: ${modelConfig.modelId}`);
        }
        const modelName = normalizeVertexPublisherModel(rawModelName);

        const settings = await SettingsManager.getInstance().get();
        const vertex = settings.vertexAI;

        if (
            !vertex ||
            !vertex.projectId.trim() ||
            !vertex.location.trim() ||
            !vertex.serviceAccountClientEmail.trim() ||
            !vertex.serviceAccountPrivateKey.trim()
        ) {
            throw new Error(
                "Please configure Vertex AI credentials in Settings.",
            );
        }

        const accessToken = await getGoogleAccessToken({
            clientEmail: vertex.serviceAccountClientEmail,
            privateKey: vertex.serviceAccountPrivateKey,
        });

        const baseURL =
            customBaseUrl ||
            getVertexBaseUrl({
                projectId: vertex.projectId,
                location: vertex.location,
            });

        const client = new OpenAI({
            baseURL,
            apiKey: accessToken,
            fetch: tauriFetch,
            defaultHeaders: {
                ...(additionalHeaders ?? {}),
            },
            dangerouslyAllowBrowser: true,
        });

        let messages: OpenAI.ChatCompletionMessageParam[] =
            await OpenAICompletionsAPIUtils.convertConversation(
                llmConversation,
                {
                    imageSupport:
                        modelConfig.supportedAttachmentTypes?.includes(
                            "image",
                        ) ?? false,
                    functionSupport: true,
                },
            );

        if (modelConfig.systemPrompt) {
            messages = [
                {
                    role: "system",
                    content: modelConfig.systemPrompt,
                },
                ...messages,
            ];
        }

        const streamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: modelName,
            messages,
            stream: true,
        };

        const nativeWebSearchEnabled =
            enabledToolsets?.includes("web") ?? false;
        const supportsNativeWebSearch =
            modelName.startsWith("google/") && modelName.includes("gemini");
        const shouldUseNativeWebSearch =
            nativeWebSearchEnabled && supportsNativeWebSearch;

        if (shouldUseNativeWebSearch) {
            // Vertex AI OpenAI-compatible web search grounding.
            // The API accepts `web_search_options` but does not support sub-options.
            // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview
            (
                streamParams as unknown as Record<string, unknown>
            ).web_search_options = {};
        }

        // Gemini thinking parameters (Vertex OpenAI-compatible API)
        const isGemini3 = modelName.includes("gemini-3");
        const isGemini25 = modelName.includes("gemini-2.5");

        if (isGemini3 && modelConfig.thinkingLevel) {
            (
                streamParams as unknown as Record<string, unknown>
            ).thinking_level = modelConfig.thinkingLevel;
        } else if (isGemini25 && modelConfig.budgetTokens) {
            (
                streamParams as unknown as Record<string, unknown>
            ).thinking_budget = modelConfig.budgetTokens;
        }

        if (tools && tools.length > 0) {
            streamParams.tools =
                OpenAICompletionsAPIUtils.convertToolDefinitions(tools);
            streamParams.tool_choice = "auto";
        }

        const chunks: OpenAI.ChatCompletionChunk[] = [];

        try {
            const stream = await client.chat.completions.create(streamParams);
            for await (const chunk of stream) {
                chunks.push(chunk);
                if (chunk.choices[0]?.delta?.content) {
                    onChunk(chunk.choices[0].delta.content);
                }
            }
        } catch (error: unknown) {
            console.error(
                "Raw error from ProviderVertex:",
                error,
                modelName,
                baseURL,
                messages,
            );
            console.error(JSON.stringify(error, null, 2));

            if (
                isProviderError(error) &&
                error.message === "Provider returned error"
            ) {
                let errorDetails: ProviderError;
                try {
                    errorDetails = JSON5.parse(
                        error.error?.metadata?.raw ||
                            error.metadata?.raw ||
                            "{}",
                    );
                } catch {
                    errorDetails = {
                        message: "Failed to parse error details",
                        error: { message: "Failed to parse error details" },
                    };
                }
                const errorMessage = `Provider returned error: ${errorDetails.error?.message || error.message}`;
                if (onError) {
                    onError(errorMessage);
                } else {
                    throw new Error(errorMessage);
                }
            } else {
                if (onError) {
                    onError(getErrorMessage(error));
                } else {
                    throw error;
                }
            }
            return undefined;
        }

        const toolCalls = OpenAICompletionsAPIUtils.convertToolCalls(
            chunks,
            tools ?? [],
        );

        await onComplete(
            undefined,
            toolCalls.length > 0 ? toolCalls : undefined,
        );
    }
}
