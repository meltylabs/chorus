/**
 * Test file to verify SkillTypes.ts compiles and works correctly
 */
import { describe, it, expect } from "vitest";
import {
    ISkillMetadata,
    ISkillScript,
    ISkill,
    ISkillLocation,
    ISkillState,
    ISkillSettings,
    INTERPRETER_MAP,
    DEFAULT_SKILL_SETTINGS,
} from "./SkillTypes";

describe("SkillTypes", () => {
    describe("ISkillMetadata", () => {
        it("should accept minimal required fields", () => {
            const metadata: ISkillMetadata = {
                name: "test-skill",
                description: "A test skill for verification",
            };
            expect(metadata.name).toBe("test-skill");
            expect(metadata.description).toBe("A test skill for verification");
        });

        it("should accept all optional fields", () => {
            const metadata: ISkillMetadata = {
                name: "full-skill",
                description: "A fully specified skill",
                license: "MIT",
                compatibility: "Node.js 18+",
                metadata: { author: "test", version: "1.0.0" },
                allowedTools: ["read_file", "write_file"],
            };
            expect(metadata.license).toBe("MIT");
            expect(metadata.compatibility).toBe("Node.js 18+");
            expect(metadata.metadata).toEqual({
                author: "test",
                version: "1.0.0",
            });
            expect(metadata.allowedTools).toEqual(["read_file", "write_file"]);
        });
    });

    describe("ISkillScript", () => {
        it("should accept all script properties", () => {
            const script: ISkillScript = {
                name: "deploy.sh",
                relativePath: "scripts/deploy.sh",
                absolutePath: "/path/to/skill/scripts/deploy.sh",
                interpreter: "bash",
                description: "Deploy the application",
            };
            expect(script.name).toBe("deploy.sh");
            expect(script.relativePath).toBe("scripts/deploy.sh");
            expect(script.absolutePath).toBe("/path/to/skill/scripts/deploy.sh");
            expect(script.interpreter).toBe("bash");
            expect(script.description).toBe("Deploy the application");
        });
    });

    describe("ISkillLocation", () => {
        it("should accept all valid location types", () => {
            const locations: ISkillLocation[] = ["project", "user", "global"];
            expect(locations).toContain("project");
            expect(locations).toContain("user");
            expect(locations).toContain("global");
        });
    });

    describe("ISkill", () => {
        it("should accept a full skill object", () => {
            const skill: ISkill = {
                id: "test-skill",
                metadata: {
                    name: "test-skill",
                    description: "A test skill",
                },
                content: "# Instructions\nDo the thing.",
                location: "project",
                filePath: "/path/to/SKILL.md",
                folderPath: "/path/to",
                scripts: [],
                references: ["/path/to/README.md"],
            };
            expect(skill.id).toBe("test-skill");
            expect(skill.metadata.name).toBe("test-skill");
            expect(skill.content).toContain("# Instructions");
            expect(skill.location).toBe("project");
            expect(skill.scripts).toEqual([]);
            expect(skill.references).toContain("/path/to/README.md");
        });
    });

    describe("ISkillState", () => {
        it("should accept skill state with auto invocation mode", () => {
            const state: ISkillState = {
                skillId: "test-skill",
                enabled: true,
                lastUsed: "2025-01-14T12:00:00Z",
                invocationMode: "auto",
            };
            expect(state.skillId).toBe("test-skill");
            expect(state.enabled).toBe(true);
            expect(state.invocationMode).toBe("auto");
        });

        it("should accept skill state with manual invocation mode", () => {
            const state: ISkillState = {
                skillId: "test-skill",
                enabled: false,
                invocationMode: "manual",
            };
            expect(state.enabled).toBe(false);
            expect(state.invocationMode).toBe("manual");
            expect(state.lastUsed).toBeUndefined();
        });
    });

    describe("ISkillSettings", () => {
        it("should accept all settings fields", () => {
            const settings: ISkillSettings = {
                enabledSkills: { "test-skill": true },
                invocationModes: { "test-skill": "auto" },
                skillDiscoveryPaths: ["/custom/path"],
                allowedInterpreters: ["python3", "bash", "node"],
                scriptTimeout: 300000,
                requireScriptApproval: true,
            };
            expect(settings.enabledSkills["test-skill"]).toBe(true);
            expect(settings.invocationModes["test-skill"]).toBe("auto");
            expect(settings.skillDiscoveryPaths).toContain("/custom/path");
            expect(settings.allowedInterpreters).toContain("bash");
            expect(settings.scriptTimeout).toBe(300000);
            expect(settings.requireScriptApproval).toBe(true);
        });
    });

    describe("INTERPRETER_MAP", () => {
        it("should have mappings for common script extensions", () => {
            expect(INTERPRETER_MAP[".py"]).toBe("python3");
            expect(INTERPRETER_MAP[".sh"]).toBe("bash");
            expect(INTERPRETER_MAP[".bash"]).toBe("bash");
            expect(INTERPRETER_MAP[".js"]).toBe("node");
            expect(INTERPRETER_MAP[".ts"]).toBe("npx ts-node");
            expect(INTERPRETER_MAP[".rb"]).toBe("ruby");
            expect(INTERPRETER_MAP[".pl"]).toBe("perl");
        });
    });

    describe("DEFAULT_SKILL_SETTINGS", () => {
        it("should have all required fields with sensible defaults", () => {
            expect(DEFAULT_SKILL_SETTINGS.enabledSkills).toEqual({});
            expect(DEFAULT_SKILL_SETTINGS.invocationModes).toEqual({});
            expect(DEFAULT_SKILL_SETTINGS.skillDiscoveryPaths).toEqual([]);
            expect(DEFAULT_SKILL_SETTINGS.allowedInterpreters).toEqual([
                "python3",
                "bash",
                "node",
            ]);
            expect(DEFAULT_SKILL_SETTINGS.scriptTimeout).toBe(300000);
            expect(DEFAULT_SKILL_SETTINGS.requireScriptApproval).toBe(true);
        });
    });
});
