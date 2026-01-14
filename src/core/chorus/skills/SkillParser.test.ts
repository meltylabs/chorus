/**
 * Tests for SkillParser
 */

import { describe, it, expect } from "vitest";
import { parseSkillFile, isSkillFile } from "./SkillParser";

describe("SkillParser", () => {
    describe("parseSkillFile", () => {
        describe("valid files", () => {
            it("should parse a minimal valid SKILL.md", () => {
                const content = `---
name: test-skill
description: A test skill
---

# Instructions

Do the thing.`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(true);
                if (result.success) {
                    expect(result.data.metadata.name).toBe("test-skill");
                    expect(result.data.metadata.description).toBe("A test skill");
                    expect(result.data.body).toContain("# Instructions");
                }
            });

            it("should parse a fully specified SKILL.md", () => {
                const content = `---
name: deploy-helper
description: Helps deploy applications to production
license: MIT
compatibility: Requires Node.js 18+
metadata:
  author: jane-doe
  version: 1.0.0
allowed-tools:
  - bash
  - read-file
---

# Deployment Instructions

When deploying, follow these steps...`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(true);
                if (result.success) {
                    expect(result.data.metadata.name).toBe("deploy-helper");
                    expect(result.data.metadata.license).toBe("MIT");
                    expect(result.data.metadata.compatibility).toBe("Requires Node.js 18+");
                    expect(result.data.metadata.metadata).toEqual({
                        author: "jane-doe",
                        version: "1.0.0",
                    });
                    expect(result.data.metadata.allowedTools).toEqual(["bash", "read-file"]);
                }
            });

            it("should handle frontmatter-only file (no body)", () => {
                const content = `---
name: empty-body
description: A skill with no body content
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(true);
                if (result.success) {
                    expect(result.data.metadata.name).toBe("empty-body");
                    expect(result.data.body).toBe("");
                }
            });

            it("should handle single character name", () => {
                const content = `---
name: a
description: Single char name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(true);
                if (result.success) {
                    expect(result.data.metadata.name).toBe("a");
                }
            });

            it("should handle name with numbers", () => {
                const content = `---
name: skill123
description: Name with numbers
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(true);
                if (result.success) {
                    expect(result.data.metadata.name).toBe("skill123");
                }
            });

            it("should handle camelCase allowedTools field", () => {
                const content = `---
name: test
description: Test
allowedTools:
  - bash
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(true);
                if (result.success) {
                    expect(result.data.metadata.allowedTools).toEqual(["bash"]);
                }
            });
        });

        describe("missing required fields", () => {
            it("should error when name is missing", () => {
                const content = `---
description: A skill without a name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Missing required field: name");
                }
            });

            it("should error when description is missing", () => {
                const content = `---
name: no-description
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Missing required field: description");
                }
            });
        });

        describe("invalid name format", () => {
            it("should error when name has uppercase letters", () => {
                const content = `---
name: TestSkill
description: Invalid name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Invalid name");
                    expect(result.error).toContain("lowercase");
                }
            });

            it("should error when name starts with hyphen", () => {
                const content = `---
name: -invalid
description: Invalid name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Invalid name");
                }
            });

            it("should error when name ends with hyphen", () => {
                const content = `---
name: invalid-
description: Invalid name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Invalid name");
                }
            });

            it("should error when name has special characters", () => {
                const content = `---
name: invalid_name
description: Invalid name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Invalid name");
                }
            });

            it("should error when name is too long", () => {
                const longName = "a".repeat(65);
                const content = `---
name: ${longName}
description: Name too long
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("64 characters or less");
                }
            });

            it("should error when name is empty", () => {
                const content = `---
name: ""
description: Empty name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("cannot be empty");
                }
            });

            it("should error when name is not a string", () => {
                const content = `---
name: 123
description: Numeric name
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("must be a string");
                }
            });
        });

        describe("invalid description", () => {
            it("should error when description exceeds 1024 chars", () => {
                const longDesc = "a".repeat(1025);
                const content = `---
name: test
description: ${longDesc}
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("1024 characters or less");
                }
            });

            it("should error when description is empty", () => {
                const content = `---
name: test
description: ""
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("cannot be empty");
                }
            });
        });

        describe("invalid optional fields", () => {
            it("should error when license is not a string", () => {
                const content = `---
name: test
description: Test
license: 123
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("license must be a string");
                }
            });

            it("should error when compatibility exceeds 500 chars", () => {
                const longCompat = "a".repeat(501);
                const content = `---
name: test
description: Test
compatibility: ${longCompat}
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("500 characters or less");
                }
            });

            it("should error when metadata is not an object", () => {
                const content = `---
name: test
description: Test
metadata: not-an-object
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("metadata must be an object");
                }
            });

            it("should error when metadata value is not a string", () => {
                const content = `---
name: test
description: Test
metadata:
  count: 123
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("metadata.count must be a string");
                }
            });

            it("should error when allowed-tools is not an array", () => {
                const content = `---
name: test
description: Test
allowed-tools: bash
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("allowed-tools must be an array");
                }
            });

            it("should error when allowed-tools contains non-strings", () => {
                const content = `---
name: test
description: Test
allowed-tools:
  - bash
  - 123
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("allowed-tools[1] must be a string");
                }
            });
        });

        describe("invalid file format", () => {
            it("should error when no frontmatter delimiters", () => {
                const content = `name: test
description: No frontmatter`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("must start with YAML frontmatter");
                }
            });

            it("should error when missing closing delimiter", () => {
                const content = `---
name: test
description: Missing closing delimiter`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("must start with YAML frontmatter");
                }
            });

            it("should error on invalid YAML", () => {
                const content = `---
name: test
description: Invalid YAML
  badindent: true
---`;

                const result = parseSkillFile(content);
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error).toContain("Invalid YAML");
                }
            });
        });
    });

    describe("isSkillFile", () => {
        it("should return true for valid skill file", () => {
            const content = `---
name: test
description: Test
---`;
            expect(isSkillFile(content)).toBe(true);
        });

        it("should return false for file without frontmatter", () => {
            const content = `# Just markdown

Some content`;
            expect(isSkillFile(content)).toBe(false);
        });

        it("should return false for file without name field", () => {
            const content = `---
title: Not a skill
---`;
            expect(isSkillFile(content)).toBe(false);
        });

        it("should handle leading whitespace", () => {
            const content = `
---
name: test
description: Test
---`;
            expect(isSkillFile(content)).toBe(true);
        });
    });
});
