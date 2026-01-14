# Feature Specification: Skill Parser

## Spec ID: 002
## Status: Draft
## Priority: P0
## Created: 2025-01-14

---

## Overview

Implement a parser for SKILL.md files that extracts YAML frontmatter metadata and markdown content. The parser must validate the frontmatter against the Agent Skills specification requirements.

---

## User Stories

- As the skill system, I want to parse SKILL.md files so that I can load skill metadata and instructions
- As a user, I want validation errors reported clearly so that I can fix malformed skill files

---

## Acceptance Criteria

- [ ] Parser extracts YAML frontmatter from SKILL.md content
- [ ] Parser extracts markdown body after frontmatter
- [ ] Parser validates required fields (name, description)
- [ ] Parser validates name format (1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens)
- [ ] Parser validates description length (max 1024 chars)
- [ ] Parser handles optional fields gracefully
- [ ] Parser returns structured ISkillMetadata and content
- [ ] Parser provides clear error messages for invalid files

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Parse YAML frontmatter between `---` delimiters          | |
| FR-2 | Validate `name` field format per spec                    | |
| FR-3 | Validate `description` field length                      | |
| FR-4 | Parse optional `license`, `compatibility`, `metadata`    | |
| FR-5 | Parse optional `allowed-tools` as array                  | |
| FR-6 | Return remaining markdown as `content`                   | |
| FR-7 | Provide validation error with line numbers if possible   | |

### Non-Functional Requirements

| ID    | Requirement                                             | Notes |
| ----- | ------------------------------------------------------- | ----- |
| NFR-1 | Parser should be fast (< 10ms for typical skill files)  | |
| NFR-2 | Parser should handle large files gracefully             | |

---

## Implementation Notes

```typescript
// Parser function signature
function parseSkillFile(content: string): ParseResult<{
    metadata: ISkillMetadata;
    body: string;
}>;

// Validation regex for name
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Example SKILL.md structure:
// ---
// name: my-skill
// description: Does something useful when the user asks about X
// license: MIT
// compatibility: Requires Node.js 18+
// metadata:
//   author: jane-doe
//   version: 1.0.0
// allowed-tools:
//   - bash
//   - read-file
// ---
//
// # Instructions
//
// When the user asks about X, follow these steps...
```

Use a YAML parsing library (js-yaml or similar) for frontmatter parsing.

---

## Dependencies

- YAML parsing library (js-yaml)
- Spec 001 (ISkillMetadata type)

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/skills/SkillParser.ts` | Create | SKILL.md parser implementation |
| `package.json` | Modify | Add js-yaml dependency if not present |

---

## Test Plan

### Automated Tests
- [ ] Valid SKILL.md parses correctly
- [ ] Missing required fields returns error
- [ ] Invalid name format returns error
- [ ] Description over 1024 chars returns error
- [ ] Optional fields parsed when present
- [ ] Frontmatter-only file (no body) works

### Manual Verification
- [ ] Parse sample SKILL.md files from agentskills.io
- [ ] Error messages are clear and actionable

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Parser handles edge cases

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
