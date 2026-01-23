/**
 * Agent Skills Type Definitions
 *
 * These types follow the open Agent Skills specification (https://agentskills.io)
 * and are used throughout the skill loading, discovery, and execution system.
 */

/**
 * Metadata extracted from SKILL.md YAML frontmatter.
 * Defines the skill's identity and configuration.
 */
export interface ISkillMetadata {
    /**
     * Unique identifier for the skill.
     * 1-64 characters, lowercase alphanumeric with hyphens allowed.
     * Must match pattern: ^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$
     */
    name: string;

    /**
     * Human-readable description of what the skill does and when to use it.
     * Maximum 1024 characters. Should help AI determine when to invoke the skill.
     */
    description: string;

    /**
     * Optional license name or file reference for the skill.
     * Examples: "MIT", "Apache-2.0", "LICENSE.md"
     */
    license?: string;

    /**
     * Environment requirements or compatibility notes.
     * Maximum 500 characters.
     * Examples: "Requires Node.js 18+", "macOS only"
     */
    compatibility?: string;

    /**
     * Arbitrary key-value pairs for additional metadata.
     * Can be used for custom tool-specific configuration.
     */
    metadata?: Record<string, string>;

    /**
     * Pre-approved tools that this skill can use without additional confirmation.
     * Experimental feature from Agent Skills spec.
     */
    allowedTools?: string[];
}

/**
 * Represents an executable script within a skill's scripts/ directory.
 * Scripts can be invoked by the AI to perform actions.
 */
export interface ISkillScript {
    /**
     * The filename of the script.
     * Example: "deploy.sh"
     */
    name: string;

    /**
     * Path relative to the skill folder.
     * Example: "scripts/deploy.sh"
     */
    relativePath: string;

    /**
     * Full absolute path to the script file.
     * Example: "/Users/alice/projects/my-app/.skills/deploy-skill/scripts/deploy.sh"
     */
    absolutePath: string;

    /**
     * The interpreter to use for executing the script.
     * Auto-detected from file extension if not specified.
     * Examples: "bash", "python3", "node"
     */
    interpreter?: string;

    /**
     * Optional description of what the script does.
     * Can be extracted from script comments or frontmatter.
     */
    description?: string;
}

/**
 * Represents a fully loaded skill with all its components.
 */
export interface ISkill {
    /**
     * Unique identifier for the skill.
     * Typically the folder name containing the skill.
     */
    id: string;

    /**
     * Parsed metadata from the SKILL.md frontmatter.
     */
    metadata: ISkillMetadata;

    /**
     * The markdown body content (instructions) from SKILL.md.
     * This is the prompt/instructions that get injected into conversations.
     */
    content: string;

    /**
     * Where the skill was discovered from.
     */
    location: ISkillLocation;

    /**
     * Full absolute path to the SKILL.md file.
     */
    filePath: string;

    /**
     * Full absolute path to the skill folder.
     */
    folderPath: string;

    /**
     * Available executable scripts in the skill's scripts/ directory.
     */
    scripts: ISkillScript[];

    /**
     * Paths to reference files available in the skill folder.
     * These can be read by the AI for additional context.
     */
    references: string[];
}

/**
 * Indicates where a skill was discovered from.
 * Discovery happens in this order with later sources taking precedence:
 * - global: System-wide skills (e.g., ~/.config/chorus/skills/)
 * - user: User-specific skills (e.g., ~/.chorus/skills/)
 * - project: Project-specific skills (e.g., ./.skills/)
 */
export type ISkillLocation = "project" | "user" | "global";

/**
 * Tracks the runtime state of a skill for a specific context.
 */
export interface ISkillState {
    /**
     * The skill's unique identifier.
     */
    skillId: string;

    /**
     * Whether the skill is currently enabled.
     */
    enabled: boolean;

    /**
     * ISO date string of when the skill was last used.
     */
    lastUsed?: string;

    /**
     * How the skill should be invoked:
     * - auto: AI automatically decides when to use the skill
     * - manual: User must explicitly invoke with /skill-name
     */
    invocationMode: "auto" | "manual";

    /**
     * Number of times this skill has been used.
     */
    useCount?: number;
}

/**
 * Persistent settings for the skills system.
 * Stored in user preferences/database.
 */
export interface ISkillSettings {
    /**
     * Map of skill IDs to their enabled state.
     */
    enabledSkills: Record<string, boolean>;

    /**
     * Map of skill IDs to their invocation mode.
     */
    invocationModes: Record<string, "auto" | "manual">;

    /**
     * Additional paths to search for skills.
     * Added to the default discovery locations.
     */
    skillDiscoveryPaths: string[];

    /**
     * List of interpreters allowed to execute skill scripts.
     * Default: ['python3', 'bash', 'node']
     */
    allowedInterpreters: string[];

    /**
     * Maximum time in milliseconds a script can run before being terminated.
     * Default: 300000 (5 minutes)
     */
    scriptTimeout: number;

    /**
     * Whether to require user approval before executing scripts.
     * Default: true
     */
    requireScriptApproval: boolean;
}

/**
 * Maps file extensions to their default interpreters.
 * Used for auto-detecting how to execute skill scripts.
 */
export const INTERPRETER_MAP: Record<string, string> = {
    ".py": "python3",
    ".sh": "bash",
    ".bash": "bash",
    ".js": "node",
    ".ts": "npx ts-node",
    ".rb": "ruby",
    ".pl": "perl",
};

/**
 * Default settings for the skills system.
 */
export const DEFAULT_SKILL_SETTINGS: ISkillSettings = {
    enabledSkills: {},
    invocationModes: {},
    skillDiscoveryPaths: [],
    allowedInterpreters: ["python3", "bash", "node"],
    scriptTimeout: 300000,
    requireScriptApproval: true,
};
