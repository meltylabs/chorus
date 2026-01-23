/**
 * Skills Toolset
 *
 * Provides a virtual tool for AI to invoke skills.
 * Unlike other toolsets, this doesn't use MCP servers -
 * it uses custom tool implementations that interact with SkillManager.
 */

import { Toolset } from "@core/chorus/Toolsets";
import {
    executeSkill,
    prepareScriptExecution,
    getSkillScripts,
} from "@core/chorus/skills/SkillExecution";
import { getSkillManager } from "@core/chorus/skills/SkillManager";

/**
 * Toolset that provides skill invocation capabilities.
 * Exposes a `skills_use` tool for loading skill instructions.
 */
export class ToolsetSkills extends Toolset {
    constructor() {
        super(
            "skills",
            "Skills",
            {}, // No config needed - skills are discovered automatically
            "Load skill instructions to help with specific tasks"
        );

        // Add the use_skill tool
        this.addCustomTool(
            "use",
            {
                type: "object",
                properties: {
                    skill_name: {
                        type: "string",
                        description:
                            "The name of the skill to invoke (e.g., 'deploy-helper', 'code-review')",
                    },
                },
                required: ["skill_name"],
            },
            async (args: Record<string, unknown>): Promise<string> => {
                const skillName = args.skill_name as string;
                const result = executeSkill(skillName);

                if (result.success) {
                    return result.content ?? "";
                } else {
                    return `<error>${result.error}</error>`;
                }
            },
            "Load detailed instructions from a skill to help with a specific task"
        );

        // Add the run_script tool
        this.addCustomTool(
            "run_script",
            {
                type: "object",
                properties: {
                    skill_name: {
                        type: "string",
                        description: "Name of the skill containing the script",
                    },
                    script: {
                        type: "string",
                        description:
                            'Script filename to run (e.g., "deploy.sh", "validate.py")',
                    },
                    args: {
                        type: "array",
                        items: { type: "string" },
                        description: "Arguments to pass to the script",
                    },
                },
                required: ["skill_name", "script"],
            },
            async (args: Record<string, unknown>): Promise<string> => {
                const skillName = args.skill_name as string;
                const script = args.script as string;
                const scriptArgs = (args.args as string[]) ?? [];

                const result = prepareScriptExecution(
                    skillName,
                    script,
                    scriptArgs
                );

                if (result.success) {
                    // Return the command for the AI to execute with the terminal tool
                    return `<script_command>
To run this script, use the terminal_execute_command tool with:

Command: ${result.command}
Working Directory: ${result.workingDirectory}

Note: The script runs in the skill's folder. Make sure the terminal toolset is enabled.
</script_command>`;
                } else {
                    return `<error>${result.error}</error>`;
                }
            },
            "Prepare a skill script for execution. Returns the command to run with the terminal tool."
        );

        // Add the list_scripts tool
        this.addCustomTool(
            "list_scripts",
            {
                type: "object",
                properties: {
                    skill_name: {
                        type: "string",
                        description: "Name of the skill to list scripts for",
                    },
                },
                required: ["skill_name"],
            },
            async (args: Record<string, unknown>): Promise<string> => {
                const skillName = args.skill_name as string;
                const result = getSkillScripts(skillName);

                if ("error" in result) {
                    return `<error>${result.error}</error>`;
                }

                if (result.scripts.length === 0) {
                    return `<info>Skill "${skillName}" has no scripts.</info>`;
                }

                const scriptList = result.scripts
                    .map((s) => {
                        const parts = [`- ${s.name}`];
                        if (s.interpreter) {
                            parts.push(`  Interpreter: ${s.interpreter}`);
                        }
                        if (s.description) {
                            parts.push(`  Description: ${s.description}`);
                        }
                        parts.push(`  Path: ${s.absolutePath}`);
                        return parts.join("\n");
                    })
                    .join("\n");

                return `<scripts skill="${skillName}">
${scriptList}
</scripts>`;
            },
            "List available scripts for a skill"
        );
    }

    /**
     * Override ensureStart to not require server initialization.
     * Skills toolset is always ready when skills are available.
     */
    override async ensureStart(
        _config: Record<string, string>
    ): Promise<boolean> {
        const manager = getSkillManager();

        // Initialize skill manager if not already done
        if (!manager.isInitialized()) {
            await manager.initialize();
        }

        // Set status to running - this is critical for listTools() to return tools
        this._status = { status: "running" };

        return true;
    }

    /**
     * Override ensureStop - nothing to stop for skills.
     */
    override async ensureStop(): Promise<void> {
        // Set status to stopped
        this._status = { status: "stopped" };
    }

    /**
     * Override listTools to only show tools when skills are available.
     */
    override listTools() {
        const manager = getSkillManager();

        if (!manager.isInitialized()) {
            return [];
        }

        // Only expose the tool if there are enabled skills
        const enabledSkills = manager.getEnabledSkills();
        if (enabledSkills.length === 0) {
            return [];
        }

        return super.listTools();
    }
}
