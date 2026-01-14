# Feature Specification: Skill Types and Interfaces

## Spec ID: 001
## Status: Draft
## Priority: P0
## Created: 2025-01-14

---

## Overview

Define the TypeScript types and interfaces for the Agent Skills system. These types follow the open Agent Skills specification (https://agentskills.io) and will be used throughout the skill loading, discovery, and execution system.

---

## User Stories

- As a developer, I want clear type definitions so that I can work with skills in a type-safe manner
- As a developer, I want the types to match the Agent Skills spec so that skills are portable across tools

---

## Acceptance Criteria

- [ ] ISkillMetadata interface defined with all required and optional fields from spec
- [ ] ISkill interface defined representing a loaded skill
- [ ] ISkillLocation enum/type for skill discovery locations
- [ ] ISkillState type for tracking enable/disable status
- [ ] Types exported from a central location
- [ ] All fields properly documented with JSDoc comments

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Define ISkillMetadata matching YAML frontmatter schema   | name, description, license, compatibility, metadata, allowed-tools |
| FR-2 | Define ISkill with metadata + content + location info    | |
| FR-3 | Define ISkillLocation for discovery sources              | project, user, global |
| FR-4 | Define ISkillState for enabled/disabled tracking         | |
| FR-5 | Define ISkillSettings for persistence                    | |

---

## Implementation Notes

Based on Agent Skills specification:

```typescript
// YAML Frontmatter fields
interface ISkillMetadata {
    name: string;           // 1-64 chars, lowercase alphanumeric + hyphens
    description: string;    // Max 1024 chars, describes what and when
    license?: string;       // Optional license name or file reference
    compatibility?: string; // Max 500 chars, environment requirements
    metadata?: Record<string, string>; // Arbitrary key-value pairs
    allowedTools?: string[]; // Pre-approved tools (experimental)
}

interface ISkill {
    id: string;             // Unique identifier (folder name)
    metadata: ISkillMetadata;
    content: string;        // Markdown body (instructions)
    location: ISkillLocation;
    filePath: string;       // Full path to SKILL.md
    folderPath: string;     // Path to skill folder
    scripts?: string[];     // Available script files
    references?: string[];  // Available reference files
}

type ISkillLocation = 'project' | 'user' | 'global';

interface ISkillState {
    skillId: string;
    enabled: boolean;
    lastUsed?: string;      // ISO date
    invocationMode: 'auto' | 'manual'; // Agent decides vs user invokes
}

interface ISkillSettings {
    enabledSkills: Record<string, boolean>;
    invocationModes: Record<string, 'auto' | 'manual'>;
    skillDiscoveryPaths: string[];
}
```

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/skills/SkillTypes.ts` | Create | All skill-related type definitions |

---

## Test Plan

### Automated Tests
- [ ] TypeScript compilation succeeds with strict mode
- [ ] All required fields are properly typed

### Manual Verification
- [ ] Types can be imported without errors
- [ ] Types match Agent Skills specification

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Types exported correctly

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
