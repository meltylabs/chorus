# Feature Specification: Skill Manager

## Spec ID: 004
## Status: Draft
## Priority: P0
## Created: 2025-01-14

---

## Overview

Implement the central SkillManager that coordinates skill discovery, loading, state management, and provides access to skills for the rest of the application. This is the main entry point for the skill system.

---

## User Stories

- As the application, I want a central manager so that skills are coordinated properly
- As a component, I want to query available skills so that I can display them or use them
- As a user, I want skill state persisted so that my preferences are remembered

---

## Acceptance Criteria

- [ ] SkillManager is a singleton accessible throughout the app
- [ ] SkillManager initializes skill discovery on startup
- [ ] SkillManager provides list of all discovered skills
- [ ] SkillManager tracks enabled/disabled state per skill
- [ ] SkillManager tracks invocation mode (auto/manual) per skill
- [ ] Skill states are persisted to local storage
- [ ] SkillManager provides method to get skill by ID
- [ ] SkillManager provides method to get enabled skills only
- [ ] SkillManager emits events when skills change

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Singleton pattern for SkillManager                       | |
| FR-2 | Initialize discovery on first access                     | |
| FR-3 | Maintain skill registry in memory                        | |
| FR-4 | Persist skill states using Tauri store                   | |
| FR-5 | Provide getSkill(id) method                              | |
| FR-6 | Provide getAllSkills() method                            | |
| FR-7 | Provide getEnabledSkills() method                        | |
| FR-8 | Provide enableSkill(id) / disableSkill(id) methods       | |
| FR-9 | Provide setInvocationMode(id, mode) method               | |
| FR-10| Emit 'skills-changed' event on state changes             | |

---

## Implementation Notes

```typescript
class SkillManager {
    private static instance: SkillManager;
    private skills: Map<string, ISkill> = new Map();
    private states: Map<string, ISkillState> = new Map();
    private storeName = 'skills';

    private constructor() {}

    static getInstance(): SkillManager;

    async initialize(): Promise<void>;
    async refresh(): Promise<void>;

    getAllSkills(): ISkill[];
    getEnabledSkills(): ISkill[];
    getSkill(id: string): ISkill | undefined;
    getSkillState(id: string): ISkillState;

    async enableSkill(id: string): Promise<void>;
    async disableSkill(id: string): Promise<void>;
    async setInvocationMode(id: string, mode: 'auto' | 'manual'): Promise<void>;

    // For loading skill content on-demand (progressive disclosure)
    async getSkillContent(id: string): Promise<string>;
    async getSkillScripts(id: string): Promise<string[]>;
    async getSkillReferences(id: string): Promise<string[]>;
}

// Storage schema
interface ISkillStorageState {
    [skillId: string]: {
        enabled: boolean;
        invocationMode: 'auto' | 'manual';
        lastUsed?: string;
    };
}
```

---

## Dependencies

- Spec 001 (ISkill, ISkillState types)
- Spec 003 (SkillDiscovery)
- Tauri store API

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/skills/SkillManager.ts` | Create | Central skill manager |

---

## Test Plan

### Automated Tests
- [ ] Singleton returns same instance
- [ ] Initialize populates skills
- [ ] Enable/disable persists state
- [ ] getEnabledSkills filters correctly

### Manual Verification
- [ ] Skills load on app startup
- [ ] Enable/disable survives app restart
- [ ] Refresh picks up new skills

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] State persists correctly

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
