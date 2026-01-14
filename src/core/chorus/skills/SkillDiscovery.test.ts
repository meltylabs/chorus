/**
 * Tests for SkillDiscovery
 *
 * These tests mock the Tauri file system APIs to test discovery logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Tauri APIs before importing the module
vi.mock("@tauri-apps/api/path", () => ({
    homeDir: vi.fn().mockResolvedValue("/Users/test"),
    join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    exists: vi.fn(),
    readDir: vi.fn(),
    readTextFile: vi.fn(),
}));

import {
    discoverSkills,
    refreshSkills,
    getCachedSkills,
    clearSkillCache,
    getSkillByName,
} from "./SkillDiscovery";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";

// Type the mocks
const mockExists = vi.mocked(exists);
const mockReadDir = vi.mocked(readDir);
const mockReadTextFile = vi.mocked(readTextFile);

// Sample valid SKILL.md content
const VALID_SKILL_CONTENT = `---
name: test-skill
description: A test skill for discovery
license: MIT
---

# Instructions

Do the thing.`;


describe("SkillDiscovery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearSkillCache();
    });

    afterEach(() => {
        clearSkillCache();
    });

    describe("discoverSkills", () => {
        it("should discover skills in user directory", async () => {
            // Setup mocks
            mockExists.mockImplementation(async (path) => {
                if (
                    path === "/Users/test/.chorus/skills" ||
                    path === "/Users/test/.chorus/skills/test-skill" ||
                    path === "/Users/test/.chorus/skills/test-skill/SKILL.md"
                ) {
                    return true;
                }
                return false;
            });

            mockReadDir.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills") {
                    return [{ name: "test-skill", isDirectory: true, isFile: false, isSymlink: false }];
                }
                if (path === "/Users/test/.chorus/skills/test-skill") {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                return [];
            });

            mockReadTextFile.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills/test-skill/SKILL.md") {
                    return VALID_SKILL_CONTENT;
                }
                throw new Error("File not found");
            });

            const result = await discoverSkills();

            expect(result.skills).toHaveLength(1);
            expect(result.skills[0].metadata.name).toBe("test-skill");
            expect(result.skills[0].location).toBe("user");
            expect(result.errors).toHaveLength(0);
        });

        it("should discover skills in project directory", async () => {
            mockExists.mockImplementation(async (path) => {
                if (
                    path === "/project/.chorus/skills" ||
                    path === "/project/.chorus/skills/project-skill" ||
                    path === "/project/.chorus/skills/project-skill/SKILL.md"
                ) {
                    return true;
                }
                return false;
            });

            mockReadDir.mockImplementation(async (path) => {
                if (path === "/project/.chorus/skills") {
                    return [{ name: "project-skill", isDirectory: true, isFile: false, isSymlink: false }];
                }
                if (path === "/project/.chorus/skills/project-skill") {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                return [];
            });

            mockReadTextFile.mockImplementation(async (path) => {
                if (path === "/project/.chorus/skills/project-skill/SKILL.md") {
                    return `---
name: project-skill
description: A project skill
---`;
                }
                throw new Error("File not found");
            });

            const result = await discoverSkills("/project");

            expect(result.skills).toHaveLength(1);
            expect(result.skills[0].metadata.name).toBe("project-skill");
            expect(result.skills[0].location).toBe("project");
        });

        it("should handle missing directories gracefully", async () => {
            mockExists.mockResolvedValue(false);
            mockReadDir.mockRejectedValue(new Error("Directory not found"));

            const result = await discoverSkills();

            expect(result.skills).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it("should handle malformed SKILL.md files", async () => {
            mockExists.mockImplementation(async (path) => {
                if (
                    path === "/Users/test/.chorus/skills" ||
                    path === "/Users/test/.chorus/skills/bad-skill" ||
                    path === "/Users/test/.chorus/skills/bad-skill/SKILL.md"
                ) {
                    return true;
                }
                return false;
            });

            mockReadDir.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills") {
                    return [{ name: "bad-skill", isDirectory: true, isFile: false, isSymlink: false }];
                }
                if (path === "/Users/test/.chorus/skills/bad-skill") {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                return [];
            });

            mockReadTextFile.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills/bad-skill/SKILL.md") {
                    return "not valid yaml frontmatter";
                }
                throw new Error("File not found");
            });

            const result = await discoverSkills();

            expect(result.skills).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].skillPath).toContain("bad-skill");
        });

        it("should let project skills override user skills with same name", async () => {
            mockExists.mockImplementation(async (path) => {
                // User skill
                if (
                    path === "/Users/test/.chorus/skills" ||
                    path === "/Users/test/.chorus/skills/shared-skill" ||
                    path === "/Users/test/.chorus/skills/shared-skill/SKILL.md"
                ) {
                    return true;
                }
                // Project skill
                if (
                    path === "/project/.chorus/skills" ||
                    path === "/project/.chorus/skills/shared-skill" ||
                    path === "/project/.chorus/skills/shared-skill/SKILL.md"
                ) {
                    return true;
                }
                return false;
            });

            mockReadDir.mockImplementation(async (path) => {
                if (
                    path === "/Users/test/.chorus/skills" ||
                    path === "/project/.chorus/skills"
                ) {
                    return [{ name: "shared-skill", isDirectory: true, isFile: false, isSymlink: false }];
                }
                if (
                    path === "/Users/test/.chorus/skills/shared-skill" ||
                    path === "/project/.chorus/skills/shared-skill"
                ) {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                return [];
            });

            mockReadTextFile.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills/shared-skill/SKILL.md") {
                    return `---
name: shared-skill
description: User version
---`;
                }
                if (path === "/project/.chorus/skills/shared-skill/SKILL.md") {
                    return `---
name: shared-skill
description: Project version
---`;
                }
                throw new Error("File not found");
            });

            const result = await discoverSkills("/project");

            expect(result.skills).toHaveLength(1);
            expect(result.skills[0].metadata.name).toBe("shared-skill");
            expect(result.skills[0].metadata.description).toBe("Project version");
            expect(result.skills[0].location).toBe("project");
        });

        it("should discover multiple skills and sort by name", async () => {
            mockExists.mockImplementation(async (path) => {
                if (
                    path === "/Users/test/.chorus/skills" ||
                    path === "/Users/test/.chorus/skills/zebra-skill" ||
                    path === "/Users/test/.chorus/skills/zebra-skill/SKILL.md" ||
                    path === "/Users/test/.chorus/skills/alpha-skill" ||
                    path === "/Users/test/.chorus/skills/alpha-skill/SKILL.md"
                ) {
                    return true;
                }
                return false;
            });

            mockReadDir.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills") {
                    return [
                        { name: "zebra-skill", isDirectory: true, isFile: false, isSymlink: false },
                        { name: "alpha-skill", isDirectory: true, isFile: false, isSymlink: false },
                    ];
                }
                if (path === "/Users/test/.chorus/skills/zebra-skill") {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                if (path === "/Users/test/.chorus/skills/alpha-skill") {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                return [];
            });

            mockReadTextFile.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills/zebra-skill/SKILL.md") {
                    return `---
name: zebra-skill
description: Z skill
---`;
                }
                if (path === "/Users/test/.chorus/skills/alpha-skill/SKILL.md") {
                    return `---
name: alpha-skill
description: A skill
---`;
                }
                throw new Error("File not found");
            });

            const result = await discoverSkills();

            expect(result.skills).toHaveLength(2);
            expect(result.skills[0].metadata.name).toBe("alpha-skill");
            expect(result.skills[1].metadata.name).toBe("zebra-skill");
        });
    });

    describe("refreshSkills", () => {
        it("should clear cache and re-discover skills", async () => {
            // Make exists return true so readDir gets called
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);

            // First call
            await getCachedSkills();
            expect(mockExists).toHaveBeenCalled();

            // Reset call count
            vi.clearAllMocks();
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);

            // Refresh should re-discover
            await refreshSkills();
            expect(mockExists).toHaveBeenCalled();
        });
    });

    describe("getCachedSkills", () => {
        it("should return cached results on subsequent calls", async () => {
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);

            // First call
            await getCachedSkills();
            expect(mockExists).toHaveBeenCalled();

            // Reset call count
            vi.clearAllMocks();

            // Second call should use cache (no fs calls)
            await getCachedSkills();
            expect(mockExists).not.toHaveBeenCalled();
        });

        it("should invalidate cache when project path changes", async () => {
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);

            // First call with no project
            await getCachedSkills();
            expect(mockExists).toHaveBeenCalled();

            vi.clearAllMocks();
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);

            // Second call with project path should re-discover
            await getCachedSkills("/new-project");
            expect(mockExists).toHaveBeenCalled();
        });
    });

    describe("getSkillByName", () => {
        it("should find skill by name", async () => {
            mockExists.mockImplementation(async (path) => {
                if (
                    path === "/Users/test/.chorus/skills" ||
                    path === "/Users/test/.chorus/skills/target-skill" ||
                    path === "/Users/test/.chorus/skills/target-skill/SKILL.md"
                ) {
                    return true;
                }
                return false;
            });

            mockReadDir.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills") {
                    return [{ name: "target-skill", isDirectory: true, isFile: false, isSymlink: false }];
                }
                if (path === "/Users/test/.chorus/skills/target-skill") {
                    return [{ name: "SKILL.md", isDirectory: false, isFile: true, isSymlink: false }];
                }
                return [];
            });

            mockReadTextFile.mockImplementation(async (path) => {
                if (path === "/Users/test/.chorus/skills/target-skill/SKILL.md") {
                    return `---
name: target-skill
description: The target
---`;
                }
                throw new Error("File not found");
            });

            const skill = await getSkillByName("target-skill");

            expect(skill).toBeDefined();
            expect(skill?.metadata.name).toBe("target-skill");
        });

        it("should return undefined for non-existent skill", async () => {
            mockExists.mockResolvedValue(false);
            mockReadDir.mockResolvedValue([]);

            const skill = await getSkillByName("non-existent");

            expect(skill).toBeUndefined();
        });
    });

    describe("clearSkillCache", () => {
        it("should clear the cache", async () => {
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);

            // Populate cache
            await getCachedSkills();
            vi.clearAllMocks();

            // Clear and verify re-discovery happens
            mockExists.mockResolvedValue(true);
            mockReadDir.mockResolvedValue([]);
            clearSkillCache();
            await getCachedSkills();
            expect(mockExists).toHaveBeenCalled();
        });
    });
});
