/**
 * Skill Execution Engine
 *
 * Handles the execution of skills within conversations.
 * Implements "progressive disclosure" where skill metadata is loaded at startup,
 * but full instructions are only loaded when the skill is invoked.
 */

import { ISkill } from "./SkillTypes";
import { getSkillManager } from "./SkillManager";

/**
 * Result of executing a skill.
 */
export interface ISkillExecutionResult {
    success: boolean;
    content?: string;
    error?: string;
    skillName: string;
}

/**
 * Generates the skills system prompt section that lists available skills.
 * This is added to the system prompt so the AI knows what skills are available.
 *
 * @param skills - List of enabled skills to include in the prompt
 * @returns System prompt section describing available skills
 */
export function generateSkillsSystemPrompt(skills: ISkill[]): string {
    if (skills.length === 0) {
        return "";
    }

    const skillDescriptions = skills
        .map((s) => `- **${s.metadata.name}**: ${s.metadata.description}`)
        .join("\n");

    return `<skills_instructions>
## Available Skills

You have access to the following skills. When a user's request matches a skill's domain,
you can invoke it to get detailed instructions.

${skillDescriptions}

To invoke a skill, use the \`skills_use\` tool with the skill name.
Once invoked, the skill's detailed instructions will be provided to guide your response.

Note: Only invoke skills when they're clearly relevant to the user's request.
</skills_instructions>
`;
}

/**
 * Generates a shorter skills reference for the AI.
 * Used when a skill has already been invoked in the conversation.
 *
 * @param activeSkills - Skills currently active in the conversation
 * @returns A brief reference of active skills
 */
export function generateActiveSkillsPrompt(activeSkills: ISkill[]): string {
    if (activeSkills.length === 0) {
        return "";
    }

    return `<active_skills>
The following skills have been loaded and their instructions are available:
${activeSkills.map((s) => `- ${s.metadata.name}`).join("\n")}
</active_skills>
`;
}

/**
 * Executes a skill by loading its full content.
 *
 * @param skillName - The name of the skill to execute
 * @returns The execution result with skill content or error
 */
export function executeSkill(skillName: string): ISkillExecutionResult {
    const manager = getSkillManager();

    // Check if manager is initialized
    if (!manager.isInitialized()) {
        return {
            success: false,
            error: "Skill system not initialized",
            skillName,
        };
    }

    // Get the skill
    const skill = manager.getSkill(skillName);
    if (!skill) {
        // Try to find a similar skill name for helpful error message
        const allSkills = manager.getAllSkills();
        const similarNames = allSkills
            .map((s) => s.metadata.name)
            .filter(
                (name) =>
                    name.includes(skillName) || skillName.includes(name)
            );

        let errorMsg = `Skill "${skillName}" not found`;
        if (similarNames.length > 0) {
            errorMsg += `. Did you mean: ${similarNames.join(", ")}?`;
        } else {
            const availableSkills = allSkills
                .map((s) => s.metadata.name)
                .join(", ");
            errorMsg += `. Available skills: ${availableSkills || "none"}`;
        }

        return {
            success: false,
            error: errorMsg,
            skillName,
        };
    }

    // Check if skill is enabled
    const state = manager.getSkillState(skillName);
    if (!state?.enabled) {
        return {
            success: false,
            error: `Skill "${skillName}" is disabled. The user can enable it in Settings > Skills.`,
            skillName,
        };
    }

    // Record usage
    manager.recordSkillUsage(skillName);

    // Build the skill content response
    const content = buildSkillResponse(skill);

    return {
        success: true,
        content,
        skillName,
    };
}

/**
 * Builds the full skill response including instructions and available resources.
 *
 * @param skill - The skill to build response for
 * @returns Formatted skill content
 */
function buildSkillResponse(skill: ISkill): string {
    const parts: string[] = [];

    // Main instructions
    parts.push(`<skill name="${skill.metadata.name}">`);
    parts.push(`<instructions>`);
    parts.push(skill.content);
    parts.push(`</instructions>`);

    // Scripts if available
    if (skill.scripts.length > 0) {
        parts.push(`<available_scripts>`);
        parts.push(
            `The following scripts are available in this skill's scripts/ directory:`
        );
        for (const script of skill.scripts) {
            const description = script.description
                ? ` - ${script.description}`
                : "";
            parts.push(`- ${script.name}${description}`);
            parts.push(`  Path: ${script.absolutePath}`);
            if (script.interpreter) {
                parts.push(`  Interpreter: ${script.interpreter}`);
            }
        }
        parts.push(
            `To execute a script, use the skills_run_script tool with the script path.`
        );
        parts.push(`</available_scripts>`);
    }

    // References if available
    if (skill.references.length > 0) {
        parts.push(`<reference_files>`);
        parts.push(
            `The following reference files are available for additional context:`
        );
        for (const ref of skill.references) {
            parts.push(`- ${ref}`);
        }
        parts.push(
            `You can read these files using the files_read tool if needed.`
        );
        parts.push(`</reference_files>`);
    }

    parts.push(`</skill>`);

    return parts.join("\n");
}

/**
 * Gets the list of auto-invocation skills that should be mentioned in the system prompt.
 * These are enabled skills set to "auto" invocation mode.
 *
 * @returns Array of skills for system prompt
 */
export function getSkillsForSystemPrompt(): ISkill[] {
    const manager = getSkillManager();

    if (!manager.isInitialized()) {
        return [];
    }

    return manager.getAutoSkills();
}

/**
 * Gets the list of manual-invocation skills.
 * These are enabled skills set to "manual" invocation mode.
 *
 * @returns Array of manual skills
 */
export function getManualSkills(): ISkill[] {
    const manager = getSkillManager();

    if (!manager.isInitialized()) {
        return [];
    }

    return manager.getManualSkills();
}

/**
 * Handles manual skill invocation via /skill-name command.
 *
 * @param command - The command string (e.g., "/my-skill")
 * @returns The execution result, or null if not a skill command
 */
export function handleSkillCommand(
    command: string
): ISkillExecutionResult | null {
    // Check if it looks like a skill command
    if (!command.startsWith("/")) {
        return null;
    }

    const skillName = command.slice(1).trim();
    if (!skillName) {
        return null;
    }

    const manager = getSkillManager();

    // Check if this is actually a skill
    const skill = manager.getSkill(skillName);
    if (!skill) {
        // Not a recognized skill - return null to allow other command handlers
        return null;
    }

    // Execute the skill
    return executeSkill(skillName);
}

/**
 * Result of script execution preparation.
 */
export interface IScriptExecutionResult {
    success: boolean;
    command?: string;
    workingDirectory?: string;
    error?: string;
    skillName: string;
    scriptName: string;
}

/**
 * Default allowed interpreters.
 */
const DEFAULT_ALLOWED_INTERPRETERS = ["python3", "bash", "node"];

/**
 * Prepares a skill script for execution.
 * Validates the script and returns the command to run.
 *
 * @param skillName - Name of the skill containing the script
 * @param scriptName - Name or relative path of the script
 * @param args - Optional arguments to pass to the script
 * @param allowedInterpreters - List of allowed interpreters (default: python3, bash, node)
 * @returns Script execution preparation result
 */
export function prepareScriptExecution(
    skillName: string,
    scriptName: string,
    args: string[] = [],
    allowedInterpreters: string[] = DEFAULT_ALLOWED_INTERPRETERS
): IScriptExecutionResult {
    const manager = getSkillManager();

    // Check if manager is initialized
    if (!manager.isInitialized()) {
        return {
            success: false,
            error: "Skill system not initialized",
            skillName,
            scriptName,
        };
    }

    // Get the skill
    const skill = manager.getSkill(skillName);
    if (!skill) {
        return {
            success: false,
            error: `Skill "${skillName}" not found`,
            skillName,
            scriptName,
        };
    }

    // Check if skill is enabled
    const state = manager.getSkillState(skillName);
    if (!state?.enabled) {
        return {
            success: false,
            error: `Skill "${skillName}" is disabled`,
            skillName,
            scriptName,
        };
    }

    // Find the script
    const script = skill.scripts.find(
        (s) => s.name === scriptName || s.relativePath === scriptName
    );

    if (!script) {
        const availableScripts = skill.scripts.map((s) => s.name).join(", ");
        return {
            success: false,
            error: `Script "${scriptName}" not found in skill "${skillName}". Available scripts: ${availableScripts || "none"}`,
            skillName,
            scriptName,
        };
    }

    // Check interpreter
    if (!script.interpreter) {
        return {
            success: false,
            error: `Unknown script type for "${scriptName}". Supported extensions: .py, .sh, .bash, .js, .ts, .rb, .pl`,
            skillName,
            scriptName,
        };
    }

    // Check if interpreter is allowed
    // Extract just the interpreter name (e.g., "npx ts-node" -> "ts-node")
    const interpreterName = script.interpreter.split(" ").pop() ?? script.interpreter;
    const isAllowed = allowedInterpreters.some(
        (allowed) =>
            allowed === script.interpreter ||
            allowed === interpreterName ||
            script.interpreter.includes(allowed)
    );

    if (!isAllowed) {
        return {
            success: false,
            error: `Interpreter "${script.interpreter}" is not allowed. Allowed interpreters: ${allowedInterpreters.join(", ")}`,
            skillName,
            scriptName,
        };
    }

    // Build the command
    // Escape arguments to prevent injection
    const escapedArgs = args.map((arg) => {
        // Simple escaping - wrap in quotes and escape existing quotes
        const escaped = arg.replace(/"/g, '\\"');
        return `"${escaped}"`;
    });

    const command = `${script.interpreter} "${script.absolutePath}"${escapedArgs.length > 0 ? " " + escapedArgs.join(" ") : ""}`;

    return {
        success: true,
        command,
        workingDirectory: skill.folderPath,
        skillName,
        scriptName,
    };
}

/**
 * Gets available scripts for a skill.
 *
 * @param skillName - Name of the skill
 * @returns Array of script info, or error message
 */
export function getSkillScripts(
    skillName: string
): { scripts: ISkill["scripts"] } | { error: string } {
    const manager = getSkillManager();

    if (!manager.isInitialized()) {
        return { error: "Skill system not initialized" };
    }

    const skill = manager.getSkill(skillName);
    if (!skill) {
        return { error: `Skill "${skillName}" not found` };
    }

    return { scripts: skill.scripts };
}
