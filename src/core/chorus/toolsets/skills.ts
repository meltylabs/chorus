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
    getSkillsForSystemPrompt,
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

        // Check if we have any skills available
        const skills = getSkillsForSystemPrompt();
        if (skills.length === 0) {
            console.log(
                "[ToolsetSkills] No auto-invocation skills available"
            );
        }

        // Skill toolset is always "running" once initialized
        return true;
    }

    /**
     * Override ensureStop - nothing to stop for skills.
     */
    override async ensureStop(): Promise<void> {
        // No-op: Skills don't have a server to stop
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
