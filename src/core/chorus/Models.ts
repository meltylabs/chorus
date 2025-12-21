// Explanation:
// - "Model" is roughly an LLM. It's a function that generates text.
// - "ModelConfig" is a user-defined configuration that includes a model id and a system prompt.
//   This is what the user is selecting in the UI. The user can also create their own configs
//   on top of the default models.
// - Every model comes with a default config that shares its id and has no system prompt.

import { ProviderAnthropic } from "./ModelProviders/ProviderAnthropic";
import { IProvider } from "./ModelProviders/IProvider";
import Database from "@tauri-apps/plugin-sql";
import { readFile } from "@tauri-apps/plugin-fs";
import { ProviderClaudeCode } from "./ModelProviders/ProviderClaudeCode";
import posthog from "posthog-js";
import { UserTool, UserToolCall, UserToolResult } from "./Toolsets";
import { Attachment } from "./api/AttachmentsAPI";

/// ------------------------------------------------------------------------------------------------
/// Basic Types
/// ------------------------------------------------------------------------------------------------

export type AttachmentType = "image" | "pdf" | "text" | "webpage";

export const allowedExtensions: Record<AttachmentType, string[]> = {
    image: ["png", "jpg", "jpeg", "gif", "webp"],
    pdf: ["pdf"],
    text: [
        // Documentation
        "txt",
        "md",
        "rst",
        "org",
        "wiki",
        // Web
        "html",
        "htm",
        "css",
        "scss",
        "less",
        "js",
        "jsx",
        "ts",
        "tsx",
        "json",
        // Programming
        "py",
        "java",
        "cpp",
        "c",
        "h",
        "cs",
        "go",
        "rs",
        "rb",
        "php",
        "sql",
        "swift",
        "kt",
        "scala",
        "lua",
        "pl",
        "r",
        "dart",
        "ex",
        "exs",
        "erl",
        // Data/Config
        "csv",
        "yml",
        "yaml",
        "xml",
        "ini",
        "env",
        "conf",
        "toml",
        "lock",
        "properties",
        // Shell
        "sh",
        "bash",
        "zsh",
        "bat",
        "ps1",
        "env",
    ],
    webpage: [],
};

/**
 * LEGACY -- TODO get rid of this one when we deprecate old-style tools
 */
export interface ToolConfig {
    name: string; // "Web Search"
    generic_tool_name: string; //  a generic name for the tool, e.g. "web_search"
    provider_tool_id: string; // provider specific id for the tool, e.g. "web_search_preview" for OpenAI
    description: string; // "Search the web for information"
    default_enabled: boolean; // whether the tool should be enabled by default
    toggleable: boolean; // whether the tool should be toggleable by the user
}

export type LLMMessageUser = {
    role: "user";
    content: string;
    attachments: Attachment[];
};

export type LLMMessageAssistant = {
    role: "assistant";
    content: string;
    model?: string;
    toolCalls: UserToolCall[];
};

export type LLMMessageToolResults = {
    role: "tool_results";
    toolResults: UserToolResult[];
};

export type LLMMessage =
    | LLMMessageUser
    | LLMMessageAssistant
    | LLMMessageToolResults;

/**
 * Converts an LLM message to a string. Does not include attachments. Uses XML for tool results.
 * Do not use for anything too serious!
 */
export function llmMessageToString(message: LLMMessage): string {
    switch (message.role) {
        case "user":
            return message.content;
        case "assistant":
            return message.content;
        case "tool_results":
            return message.toolResults
                .map((t) => `<tool_result>${t.content}</tool_result>`)
                .join("\n");
        default: {
            const exhaustiveCheck: never = message;
            throw new Error(
                `Unknown role on message: ${JSON.stringify(exhaustiveCheck)}`,
            );
        }
    }
}

export type ApiKeys = {
    anthropic?: string;
};

export type Model = {
    id: string;
    displayName: string;
    // use this to archive old models or models that disappear from OpenRouter
    // TODO: implement handling for this
    isEnabled: boolean;
    supportedAttachmentTypes: AttachmentType[];
    isInternal: boolean; // internal models are never shown to users
};

/** Data for staff picks, used only for UI treatment */
export interface StaffPickModel {
    id: string;
    label: string;
    description: string;
    author: string;
}

export type ModelConfig = {
    id: string;
    displayName: string;
    author: "user" | "system";

    // optional data for UI treatment
    newUntil?: string; // the ISO datetime string when this model is not considered "new" in UI treatment anymore
    staffPickData?: StaffPickModel; // optional data for staff pick models

    // derived from models table -- if model is disabled, so is the config
    // TODO: implement handling for this
    isEnabled: boolean;
    // derived from models table
    supportedAttachmentTypes: AttachmentType[];
    isInternal: boolean; // internal model configs are never shown to users
    isDeprecated: boolean; // deprecated models are filtered out from the UI

    // controls the actual behavior
    modelId: string;
    systemPrompt?: string;
    isDefault: boolean;
    budgetTokens?: number; // optional token budget for thinking mode
    reasoningEffort?: "low" | "medium" | "high";
};

export type StreamResponseParams = {
    modelConfig: ModelConfig;
    llmConversation: LLMMessage[];
    tools?: UserTool[];
    apiKeys: ApiKeys;
    onChunk: (chunk: string) => void;
    onComplete: (
        finalMessage?: string,
        toolCalls?: UserToolCall[],
    ) => Promise<void>;
    onError: (errorMessage: string) => void;
    additionalHeaders?: Record<string, string>;
    customBaseUrl?: string;
};

/// ------------------------------------------------------------------------------------------------
/// Model resolution
/// ------------------------------------------------------------------------------------------------

export type ProviderName = "anthropic" | "claude-code";

/**
 * Returns a human readable label for the provider
 */
export function getProviderLabel(modelId: string): string {
    return getProviderName(modelId);
}

/**
 * Returns the provider name from a model id
 * Ex: "openrouter::meta-llama/llama-4-scout" -> "openrouter"
 * Ex: "openai/gpt-4o" -> "openai"
 */
export function getProviderName(modelId: string): ProviderName {
    if (!modelId) {
        throw new Error("couldn't get provider name for empty modelId");
    }
    const providerName = modelId.split("::")[0];
    if (!providerName) {
        console.error(
            `Invalid modelId - ${modelId} does not have a valid provider name`,
        );
    }
    return providerName as ProviderName;
}

function getProvider(providerName: string): IProvider {
    switch (providerName) {
        case "anthropic":
            return new ProviderAnthropic();
        case "claude-code":
            return new ProviderClaudeCode();
        default:
            throw new Error(`Unknown provider: ${providerName}`);
    }
}

export async function streamResponse(
    params: StreamResponseParams,
): Promise<void> {
    const providerName = getProviderName(params.modelConfig.modelId);
    const provider = getProvider(providerName);
    await provider.streamResponse(params).catch((error: unknown) => {
        console.error(error);
        const errorMessage = getErrorMessage(error);
        void params.onError(errorMessage);
        posthog.capture("response_errored", {
            modelProvider: providerName,
            modelId: params.modelConfig.modelId,
            errorMessage,
        });
    });
}

/// ------------------------------------------------------------------------------------------------
/// Model initialization
/// ------------------------------------------------------------------------------------------------
export async function saveModelAndDefaultConfig(
    db: Database,
    model: Model,
    modelConfigDisplayName: string,
): Promise<void> {
    // insert or replace is important. this way I can have a refresh where Ollama / LM studio models are set to disabled if they're not running, and enabled if they are
    await db.execute(
        "INSERT OR REPLACE INTO models (id, display_name, is_enabled, supported_attachment_types, is_internal) VALUES (?, ?, ?, ?, ?)",
        [
            model.id,
            model.displayName,
            model.isEnabled ? 1 : 0,
            model.supportedAttachmentTypes,
            model.isInternal ? 1 : 0,
        ],
    );
    await db.execute(
        "INSERT OR REPLACE INTO model_configs (id, display_name, author, model_id, system_prompt) VALUES (?, ?, ?, ?, ?)",
        [model.id, modelConfigDisplayName, "system", model.id, ""],
    );
}

/**
 * @deprecated This function is no longer needed as we only support Anthropic models.
 */
export async function DEPRECATED_USE_HOOK_INSTEAD_downloadModels(
    _db: Database,
): Promise<number> {
    // No external models to download - we only support Anthropic now
    return 0;
}

/// ------------------------------------------------------------------------------------------------
/// Helpers
/// ------------------------------------------------------------------------------------------------

export async function readTextAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "text") {
        throw new Error("Attachment is not a text file");
    }
    const fileContent = await readFile(attachment.path);
    return new TextDecoder().decode(fileContent);
}

export async function readWebpageAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "webpage") {
        throw new Error("Attachment is not a webpage");
    }
    const fileContent = await readFile(attachment.path);
    return new TextDecoder().decode(fileContent);
}

/**
 * to base64 array
 */
export async function readImageAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "image") {
        throw new Error("Attachment is not an image file");
    }
    const fileContent = await readFile(attachment.path);
    const base64Data = btoa(
        new Uint8Array(fileContent).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
        ),
    );
    return base64Data;
}

export async function readPdfAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "pdf") {
        throw new Error("Attachment is not a PDF file");
    }
    const fileContent = await readFile(attachment.path);
    const base64Data = btoa(
        new Uint8Array(fileContent).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
        ),
    );
    return base64Data;
}

export async function encodeWebpageAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "webpage") {
        throw new Error("Attachment is not a webpage");
    }
    return `<attachment url="${attachment.originalName}">\n${await readWebpageAttachment(attachment)}\n</attachment>\n\n`;
}

export async function encodeTextAttachment(
    attachment: Attachment,
): Promise<string> {
    if (attachment.type !== "text") {
        throw new Error("Attachment is not a text file");
    }
    return `<attachment name="${attachment.originalName}">\n${await readTextAttachment(attachment)}\n</attachment>\n\n`;
}

export function attachmentMissingFlag(attachment: Attachment): string {
    return `<attachment name="${attachment.originalName}" type="${attachment.type}">
[This attachment type is not supported by the model. Respond anyway if you can.]
</attachment>\n\n`;
}

function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        return (error as { message: string }).message;
    } else if (typeof error === "string") {
        return error;
    } else {
        return "Unknown error";
    }
}

// Provider-specific context limit error messages
const CONTEXT_LIMIT_PATTERNS: Record<ProviderName, string> = {
    anthropic: "prompt is too long",
    "claude-code": "prompt is too long",
};

/**
 * Detects if an error message indicates that the model ran out of context.
 * Each provider has different error messages for context limit errors.
 */
export function detectContextLimitError(
    errorMessage: string,
    modelId: string,
): boolean {
    if (!errorMessage) {
        return false;
    }

    const lowerMessage = errorMessage.toLowerCase();

    const providerName = getProviderName(modelId);
    const pattern = CONTEXT_LIMIT_PATTERNS[providerName];

    if (pattern) {
        if (lowerMessage.includes(pattern)) {
            return true;
        }
    }

    return false;
}
