/**
 * Tests for SkillExecution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/event", () => ({
    emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@core/infra/Store", () => ({
    getStore: vi.fn().mockResolvedValue({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
    }),
}));

// Mock SkillDiscovery
vi.mock("./SkillDiscovery", () => ({
    discoverSkills: vi.fn(),
    clearSkillCache: vi.fn(),
}));

import {
    generateSkillsSystemPrompt,
    generateActiveSkillsPrompt,
    executeSkill,
    getSkillsForSystemPrompt,
    getManualSkills,
    handleSkillCommand,
    prepareScriptExecution,
    getSkillScripts,
} from "./SkillExecution";
import { SkillManager } from "./SkillManager";
import { discoverSkills } from "./SkillDiscovery";
import { ISkill } from "./SkillTypes";

const mockDiscoverSkills = vi.mocked(discoverSkills);

// Sample skills for testing
const sampleSkill1: ISkill = {
    id: "test-skill",
    metadata: {
        name: "test-skill",
        description: "A test skill for deployment",
    },
    content: "# Test Skill Instructions\nFollow these steps to deploy.",
    location: "user",
    filePath: "/path/to/test-skill/SKILL.md",
    folderPath: "/path/to/test-skill",
    scripts: [],
    references: [],
};

const sampleSkill2: ISkill = {
    id: "code-review",
    metadata: {
        name: "code-review",
        description: "Helps with code review tasks",
    },
    content: "# Code Review Instructions\nUse these guidelines.",
    location: "project",
    filePath: "/path/to/code-review/SKILL.md",
    folderPath: "/path/to/code-review",
    scripts: [
        {
            name: "lint.sh",
            relativePath: "scripts/lint.sh",
            absolutePath: "/path/to/code-review/scripts/lint.sh",
            interpreter: "bash",
            description: "Run linting",
        },
    ],
    references: ["/path/to/code-review/guidelines.md"],
};

describe("SkillExecution", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SkillManager.resetInstance();

        // Default mock: return sample skills
        mockDiscoverSkills.mockResolvedValue({
            skills: [sampleSkill1, sampleSkill2],
            errors: [],
        });
    });

    afterEach(() => {
        SkillManager.resetInstance();
    });

    describe("generateSkillsSystemPrompt", () => {
        it("should return empty string for no skills", () => {
            const result = generateSkillsSystemPrompt([]);
            expect(result).toBe("");
        });

        it("should generate prompt with skill descriptions", () => {
            const result = generateSkillsSystemPrompt([sampleSkill1, sampleSkill2]);

            expect(result).toContain("<skills_instructions>");
            expect(result).toContain("test-skill");
            expect(result).toContain("A test skill for deployment");
            expect(result).toContain("code-review");
            expect(result).toContain("Helps with code review tasks");
            expect(result).toContain("skills_use");
            expect(result).toContain("</skills_instructions>");
        });

        it("should format skills as markdown list", () => {
            const result = generateSkillsSystemPrompt([sampleSkill1]);

            expect(result).toContain("- **test-skill**: A test skill for deployment");
        });
    });

    describe("generateActiveSkillsPrompt", () => {
        it("should return empty string for no active skills", () => {
            const result = generateActiveSkillsPrompt([]);
            expect(result).toBe("");
        });

        it("should list active skill names", () => {
            const result = generateActiveSkillsPrompt([sampleSkill1, sampleSkill2]);

            expect(result).toContain("<active_skills>");
            expect(result).toContain("test-skill");
            expect(result).toContain("code-review");
            expect(result).toContain("</active_skills>");
        });
    });

    describe("executeSkill", () => {
        it("should return error when manager not initialized", () => {
            const result = executeSkill("test-skill");

            expect(result.success).toBe(false);
            expect(result.error).toContain("not initialized");
        });

        it("should return error for non-existent skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = executeSkill("non-existent");

            expect(result.success).toBe(false);
            expect(result.error).toContain('Skill "non-existent" not found');
            expect(result.error).toContain("Available skills");
        });

        it("should return skill content for valid skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = executeSkill("test-skill");

            expect(result.success).toBe(true);
            expect(result.content).toContain('<skill name="test-skill">');
            expect(result.content).toContain("<instructions>");
            expect(result.content).toContain("Test Skill Instructions");
            expect(result.content).toContain("</instructions>");
            expect(result.content).toContain("</skill>");
        });

        it("should include scripts in output when available", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = executeSkill("code-review");

            expect(result.success).toBe(true);
            expect(result.content).toContain("<available_scripts>");
            expect(result.content).toContain("lint.sh");
            expect(result.content).toContain("Run linting");
            expect(result.content).toContain("/path/to/code-review/scripts/lint.sh");
        });

        it("should include references in output when available", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = executeSkill("code-review");

            expect(result.success).toBe(true);
            expect(result.content).toContain("<reference_files>");
            expect(result.content).toContain("guidelines.md");
        });

        it("should return error for disabled skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();
            await manager.disableSkill("test-skill");

            const result = executeSkill("test-skill");

            expect(result.success).toBe(false);
            expect(result.error).toContain('Skill "test-skill" is disabled');
        });

        it("should record skill usage on successful execution", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            expect(manager.getSkillUseCount("test-skill")).toBe(0);

            executeSkill("test-skill");

            expect(manager.getSkillUseCount("test-skill")).toBe(1);
        });
    });

    describe("getSkillsForSystemPrompt", () => {
        it("should return empty array when not initialized", () => {
            const result = getSkillsForSystemPrompt();
            expect(result).toEqual([]);
        });

        it("should return auto-invocation skills", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = getSkillsForSystemPrompt();

            expect(result.length).toBe(2);
            expect(result.map((s) => s.metadata.name)).toContain("test-skill");
            expect(result.map((s) => s.metadata.name)).toContain("code-review");
        });

        it("should exclude manual-only skills", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();
            await manager.setInvocationMode("test-skill", "manual");

            const result = getSkillsForSystemPrompt();

            expect(result.length).toBe(1);
            expect(result[0].metadata.name).toBe("code-review");
        });
    });

    describe("getManualSkills", () => {
        it("should return empty array when not initialized", () => {
            const result = getManualSkills();
            expect(result).toEqual([]);
        });

        it("should return manual-invocation skills", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();
            await manager.setInvocationMode("test-skill", "manual");

            const result = getManualSkills();

            expect(result.length).toBe(1);
            expect(result[0].metadata.name).toBe("test-skill");
        });
    });

    describe("handleSkillCommand", () => {
        it("should return null for non-command input", () => {
            const result = handleSkillCommand("hello");
            expect(result).toBeNull();
        });

        it("should return null for empty command", () => {
            const result = handleSkillCommand("/");
            expect(result).toBeNull();
        });

        it("should return null for non-existent skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = handleSkillCommand("/unknown-skill");
            expect(result).toBeNull();
        });

        it("should execute skill for valid command", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = handleSkillCommand("/test-skill");

            expect(result).not.toBeNull();
            expect(result?.success).toBe(true);
            expect(result?.skillName).toBe("test-skill");
        });

        it("should handle command with extra whitespace", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = handleSkillCommand("/test-skill  ");

            expect(result).not.toBeNull();
            expect(result?.success).toBe(true);
        });
    });

    describe("prepareScriptExecution", () => {
        it("should return error when manager not initialized", () => {
            const result = prepareScriptExecution("code-review", "lint.sh");

            expect(result.success).toBe(false);
            expect(result.error).toContain("not initialized");
        });

        it("should return error for non-existent skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = prepareScriptExecution("non-existent", "script.sh");

            expect(result.success).toBe(false);
            expect(result.error).toContain('Skill "non-existent" not found');
        });

        it("should return error for non-existent script", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = prepareScriptExecution("code-review", "missing.sh");

            expect(result.success).toBe(false);
            expect(result.error).toContain('Script "missing.sh" not found');
            expect(result.error).toContain("lint.sh"); // Available scripts
        });

        it("should return error for disabled skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();
            await manager.disableSkill("code-review");

            const result = prepareScriptExecution("code-review", "lint.sh");

            expect(result.success).toBe(false);
            expect(result.error).toContain('Skill "code-review" is disabled');
        });

        it("should return error for disallowed interpreter", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            // Try with only "python3" allowed, but script uses "bash"
            const result = prepareScriptExecution(
                "code-review",
                "lint.sh",
                [],
                ["python3"]
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("not allowed");
            expect(result.error).toContain("python3");
        });

        it("should return command for valid script", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = prepareScriptExecution("code-review", "lint.sh");

            expect(result.success).toBe(true);
            expect(result.command).toContain("bash");
            expect(result.command).toContain("lint.sh");
            expect(result.workingDirectory).toBe("/path/to/code-review");
        });

        it("should find script by relative path", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = prepareScriptExecution("code-review", "scripts/lint.sh");

            expect(result.success).toBe(true);
        });

        it("should include arguments in command", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = prepareScriptExecution("code-review", "lint.sh", [
                "--fix",
                "src/",
            ]);

            expect(result.success).toBe(true);
            expect(result.command).toContain('"--fix"');
            expect(result.command).toContain('"src/"');
        });

        it("should escape quotes in arguments", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = prepareScriptExecution("code-review", "lint.sh", [
                'file with "quotes"',
            ]);

            expect(result.success).toBe(true);
            expect(result.command).toContain('\\"quotes\\"');
        });
    });

    describe("getSkillScripts", () => {
        it("should return error when not initialized", () => {
            const result = getSkillScripts("code-review");

            expect("error" in result).toBe(true);
            if ("error" in result) {
                expect(result.error).toContain("not initialized");
            }
        });

        it("should return error for non-existent skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = getSkillScripts("non-existent");

            expect("error" in result).toBe(true);
            if ("error" in result) {
                expect(result.error).toContain("not found");
            }
        });

        it("should return scripts for valid skill", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = getSkillScripts("code-review");

            expect("scripts" in result).toBe(true);
            if ("scripts" in result) {
                expect(result.scripts.length).toBe(1);
                expect(result.scripts[0].name).toBe("lint.sh");
            }
        });

        it("should return empty array for skill without scripts", async () => {
            const manager = SkillManager.getInstance();
            await manager.initialize();

            const result = getSkillScripts("test-skill");

            expect("scripts" in result).toBe(true);
            if ("scripts" in result) {
                expect(result.scripts.length).toBe(0);
            }
        });
    });
});
