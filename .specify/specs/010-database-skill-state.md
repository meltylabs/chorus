# Feature Specification: Database Skill State Persistence

## Spec ID: 010
## Status: Draft
## Priority: P1
## Created: 2025-01-14

---

## Overview

Implement persistent storage for skill enable/disable states, invocation modes, and usage statistics. Uses the existing Tauri store mechanism rather than SQLite for simplicity.

---

## User Stories

- As a user, I want my skill preferences to persist across app restarts
- As a user, I want to see which skills I've used recently
- As the app, I want fast access to skill state without database queries

---

## Acceptance Criteria

- [ ] Skill enabled/disabled state persists across app restarts
- [ ] Invocation mode (auto/manual) persists
- [ ] Last used timestamp tracked per skill
- [ ] Usage count tracked per skill (optional)
- [ ] State loads quickly on app startup
- [ ] State updates are debounced for performance

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Use Tauri store API for persistence                      | Similar to Settings.ts |
| FR-2 | Store skill states as JSON object                        | |
| FR-3 | Load states on SkillManager initialization               | |
| FR-4 | Save states on change (debounced)                        | |
| FR-5 | Track last used timestamp                                | |
| FR-6 | Default new skills to enabled with auto mode             | |
| FR-7 | Handle version migrations if schema changes              | |

---

## Implementation Notes

```typescript
// Storage schema
interface ISkillStoreData {
    version: number; // For future migrations
    skills: {
        [skillId: string]: {
            enabled: boolean;
            invocationMode: 'auto' | 'manual';
            lastUsed?: string; // ISO date
            useCount?: number;
        };
    };
}

// Store manager
class SkillStateStore {
    private static instance: SkillStateStore;
    private storeName = 'skills';
    private data: ISkillStoreData = { version: 1, skills: {} };
    private saveDebounced: () => void;

    private constructor() {
        this.saveDebounced = debounce(() => this.save(), 500);
    }

    static getInstance(): SkillStateStore;

    async load(): Promise<void> {
        const store = await getStore(this.storeName);
        const data = await store.get('state');
        if (data) {
            this.data = this.migrate(data as ISkillStoreData);
        }
    }

    async save(): Promise<void> {
        const store = await getStore(this.storeName);
        await store.set('state', this.data);
        await store.save();
    }

    getSkillState(skillId: string): ISkillState {
        const state = this.data.skills[skillId];
        return {
            skillId,
            enabled: state?.enabled ?? true,
            invocationMode: state?.invocationMode ?? 'auto',
            lastUsed: state?.lastUsed,
        };
    }

    setSkillEnabled(skillId: string, enabled: boolean): void {
        this.ensureSkillEntry(skillId);
        this.data.skills[skillId].enabled = enabled;
        this.saveDebounced();
    }

    setInvocationMode(skillId: string, mode: 'auto' | 'manual'): void {
        this.ensureSkillEntry(skillId);
        this.data.skills[skillId].invocationMode = mode;
        this.saveDebounced();
    }

    recordUsage(skillId: string): void {
        this.ensureSkillEntry(skillId);
        this.data.skills[skillId].lastUsed = new Date().toISOString();
        this.data.skills[skillId].useCount = (this.data.skills[skillId].useCount || 0) + 1;
        this.saveDebounced();
    }

    private ensureSkillEntry(skillId: string): void {
        if (!this.data.skills[skillId]) {
            this.data.skills[skillId] = {
                enabled: true,
                invocationMode: 'auto',
            };
        }
    }

    private migrate(data: ISkillStoreData): ISkillStoreData {
        // Handle future schema migrations
        return data;
    }
}
```

---

## Dependencies

- Tauri store API (already used in Settings.ts)
- lodash debounce (already in project)

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/skills/SkillStateStore.ts` | Create | State persistence |
| `src/core/chorus/skills/SkillManager.ts` | Modify | Use SkillStateStore |

---

## Test Plan

### Automated Tests
- [ ] State loads on initialization
- [ ] State persists across save/load cycle
- [ ] Default values for new skills

### Manual Verification
- [ ] Enable skill, restart app, still enabled
- [ ] Change mode, restart app, mode persisted
- [ ] Use skill, check lastUsed updated

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Persistence works reliably

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
