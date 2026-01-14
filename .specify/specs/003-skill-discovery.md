# Feature Specification: Skill Discovery System

## Spec ID: 003
## Status: Draft
## Priority: P0
## Created: 2025-01-14

---

## Overview

Implement the skill discovery system that finds and loads skills from multiple locations: project directories, user directories, and global directories. Following the Agent Skills specification, skills are discovered in standardized paths.

---

## User Stories

- As a user, I want Chorus to automatically find my skills so that I don't have to configure each one manually
- As a user, I want project-specific skills to work when I open that project
- As a user, I want global skills to be available across all projects

---

## Acceptance Criteria

- [ ] Discover skills in project `.chorus/skills/` directory
- [ ] Discover skills in project `.claude/skills/` directory (compatibility)
- [ ] Discover skills in user `~/.chorus/skills/` directory
- [ ] Discover skills in user `~/.claude/skills/` directory (compatibility)
- [ ] Each skill folder must contain a SKILL.md file
- [ ] Skills are loaded and parsed using SkillParser
- [ ] Duplicate skill names handled (project overrides user)
- [ ] Discovery is non-blocking and handles errors gracefully
- [ ] Skill discovery can be triggered manually (refresh)

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Scan project-level skill directories                     | .chorus/skills/, .claude/skills/ |
| FR-2 | Scan user-level skill directories                        | ~/.chorus/skills/, ~/.claude/skills/ |
| FR-3 | Load SKILL.md from each skill folder                     | |
| FR-4 | Parse and validate each skill                            | |
| FR-5 | Build skill registry with location metadata              | |
| FR-6 | Handle discovery errors without blocking                 | Log errors, continue |
| FR-7 | Provide refresh mechanism                                | |
| FR-8 | Cache discovered skills in memory                        | |

### Non-Functional Requirements

| ID    | Requirement                                             | Notes |
| ----- | ------------------------------------------------------- | ----- |
| NFR-1 | Discovery should complete in < 500ms for 50 skills      | |
| NFR-2 | Discovery should not block UI                           | |

---

## Implementation Notes

```typescript
// Discovery paths (in priority order)
const DISCOVERY_PATHS = {
    project: [
        '.chorus/skills',
        '.claude/skills'
    ],
    user: [
        '~/.chorus/skills',
        '~/.claude/skills'
    ]
};

// Discovery result
interface ISkillDiscoveryResult {
    skills: ISkill[];
    errors: ISkillDiscoveryError[];
}

interface ISkillDiscoveryError {
    skillPath: string;
    error: string;
}

// Main discovery function
async function discoverSkills(projectPath?: string): Promise<ISkillDiscoveryResult>;

// Refresh function (clears cache and re-discovers)
async function refreshSkills(): Promise<ISkillDiscoveryResult>;
```

Use Tauri's file system APIs for cross-platform compatibility.

---

## Dependencies

- Spec 001 (ISkill, ISkillLocation types)
- Spec 002 (SkillParser)
- Tauri file system APIs

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/skills/SkillDiscovery.ts` | Create | Skill discovery implementation |

---

## Test Plan

### Automated Tests
- [ ] Discovers skills in project directory
- [ ] Discovers skills in user directory
- [ ] Handles missing directories gracefully
- [ ] Handles malformed SKILL.md files
- [ ] Project skills override user skills with same name

### Manual Verification
- [ ] Create skill in .chorus/skills/ and verify discovery
- [ ] Create skill in ~/.chorus/skills/ and verify discovery
- [ ] Refresh updates skill list

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Discovery works on macOS

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
