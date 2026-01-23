/**
 * SKILL.md Parser
 *
 * Parses SKILL.md files according to the Agent Skills specification.
 * Extracts YAML frontmatter metadata and markdown content.
 */

import yaml from "js-yaml";
import { ISkillMetadata } from "./SkillTypes";

/**
 * Result type for parse operations that can fail.
 */
export type ParseResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Parsed skill file containing metadata and body content.
 */
export interface IParsedSkillFile {
    metadata: ISkillMetadata;
    body: string;
}

/**
 * Validation regex for skill name.
 * Must be 1-64 characters, lowercase alphanumeric with hyphens.
 * Cannot start or end with a hyphen.
 * Pattern: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$|^[a-z0-9]$
 */
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Maximum length for skill name.
 */
const MAX_NAME_LENGTH = 64;

/**
 * Maximum length for skill description.
 */
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Maximum length for compatibility field.
 */
const MAX_COMPATIBILITY_LENGTH = 500;

/**
 * Extracts frontmatter and body from a SKILL.md file content.
 *
 * @param content - Raw file content
 * @returns Object with frontmatter string and body, or null if no frontmatter
 */
function extractFrontmatter(content: string): {
    frontmatter: string;
    body: string;
} | null {
    const trimmed = content.trimStart();

    // Must start with ---
    if (!trimmed.startsWith("---")) {
        return null;
    }

    // Find the closing ---
    const endIndex = trimmed.indexOf("\n---", 3);
    if (endIndex === -1) {
        return null;
    }

    const frontmatter = trimmed.slice(4, endIndex).trim();
    const body = trimmed.slice(endIndex + 4).trim();

    return { frontmatter, body };
}

/**
 * Validates the skill name according to the spec.
 *
 * @param name - The name to validate
 * @returns Error message or null if valid
 */
function validateName(name: unknown): string | null {
    if (typeof name !== "string") {
        return "name must be a string";
    }

    if (name.length === 0) {
        return "name cannot be empty";
    }

    if (name.length > MAX_NAME_LENGTH) {
        return `name must be ${MAX_NAME_LENGTH} characters or less (got ${name.length})`;
    }

    if (!NAME_PATTERN.test(name)) {
        return "name must be lowercase alphanumeric with hyphens, cannot start or end with hyphen";
    }

    return null;
}

/**
 * Validates the skill description according to the spec.
 *
 * @param description - The description to validate
 * @returns Error message or null if valid
 */
function validateDescription(description: unknown): string | null {
    if (typeof description !== "string") {
        return "description must be a string";
    }

    if (description.length === 0) {
        return "description cannot be empty";
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
        return `description must be ${MAX_DESCRIPTION_LENGTH} characters or less (got ${description.length})`;
    }

    return null;
}

/**
 * Validates optional fields if present.
 *
 * @param data - Parsed YAML data
 * @returns Error message or null if valid
 */
function validateOptionalFields(data: Record<string, unknown>): string | null {
    // Validate license if present
    if (data.license !== undefined && typeof data.license !== "string") {
        return "license must be a string";
    }

    // Validate compatibility if present
    if (data.compatibility !== undefined) {
        if (typeof data.compatibility !== "string") {
            return "compatibility must be a string";
        }
        if (data.compatibility.length > MAX_COMPATIBILITY_LENGTH) {
            return `compatibility must be ${MAX_COMPATIBILITY_LENGTH} characters or less (got ${data.compatibility.length})`;
        }
    }

    // Validate metadata if present
    if (data.metadata !== undefined) {
        if (
            typeof data.metadata !== "object" ||
            data.metadata === null ||
            Array.isArray(data.metadata)
        ) {
            return "metadata must be an object with string key-value pairs";
        }
        for (const [key, value] of Object.entries(data.metadata)) {
            if (typeof value !== "string") {
                return `metadata.${key} must be a string`;
            }
        }
    }

    // Validate allowed-tools if present (spec uses kebab-case)
    const allowedTools = data["allowed-tools"] ?? data.allowedTools;
    if (allowedTools !== undefined) {
        if (!Array.isArray(allowedTools)) {
            return "allowed-tools must be an array of strings";
        }
        for (let i = 0; i < allowedTools.length; i++) {
            if (typeof allowedTools[i] !== "string") {
                return `allowed-tools[${i}] must be a string`;
            }
        }
    }

    return null;
}

/**
 * Parses a SKILL.md file content and extracts metadata and body.
 *
 * @param content - Raw SKILL.md file content
 * @returns ParseResult with metadata and body, or error message
 */
export function parseSkillFile(content: string): ParseResult<IParsedSkillFile> {
    // Extract frontmatter and body
    const extracted = extractFrontmatter(content);
    if (!extracted) {
        return {
            success: false,
            error: "Invalid SKILL.md format: must start with YAML frontmatter (---)",
        };
    }

    const { frontmatter, body } = extracted;

    // Parse YAML frontmatter
    let data: Record<string, unknown>;
    try {
        const parsed = yaml.load(frontmatter);
        if (typeof parsed !== "object" || parsed === null) {
            return {
                success: false,
                error: "Invalid frontmatter: must be a YAML object",
            };
        }
        data = parsed as Record<string, unknown>;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            error: `Invalid YAML in frontmatter: ${message}`,
        };
    }

    // Validate required fields
    if (!("name" in data)) {
        return {
            success: false,
            error: "Missing required field: name",
        };
    }

    if (!("description" in data)) {
        return {
            success: false,
            error: "Missing required field: description",
        };
    }

    // Validate name
    const nameError = validateName(data.name);
    if (nameError) {
        return { success: false, error: `Invalid name: ${nameError}` };
    }

    // Validate description
    const descError = validateDescription(data.description);
    if (descError) {
        return { success: false, error: `Invalid description: ${descError}` };
    }

    // Validate optional fields
    const optionalError = validateOptionalFields(data);
    if (optionalError) {
        return { success: false, error: optionalError };
    }

    // Build metadata object
    const metadata: ISkillMetadata = {
        name: data.name as string,
        description: data.description as string,
    };

    // Add optional fields if present
    if (typeof data.license === "string") {
        metadata.license = data.license;
    }

    if (typeof data.compatibility === "string") {
        metadata.compatibility = data.compatibility;
    }

    if (data.metadata && typeof data.metadata === "object") {
        metadata.metadata = data.metadata as Record<string, string>;
    }

    // Handle both allowed-tools (spec) and allowedTools (camelCase)
    const allowedTools = data["allowed-tools"] ?? data.allowedTools;
    if (Array.isArray(allowedTools)) {
        metadata.allowedTools = allowedTools as string[];
    }

    return {
        success: true,
        data: {
            metadata,
            body,
        },
    };
}

/**
 * Checks if content appears to be a valid SKILL.md file.
 * This is a quick check without full validation.
 *
 * @param content - File content to check
 * @returns True if the content looks like a SKILL.md file
 */
export function isSkillFile(content: string): boolean {
    const trimmed = content.trimStart();
    return trimmed.startsWith("---") && trimmed.includes("\nname:");
}
