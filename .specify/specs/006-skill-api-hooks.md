# Feature Specification: Skill API and React Hooks

## Spec ID: 006
## Status: Draft
## Priority: P1
## Created: 2025-01-14

---

## Overview

Implement TanStack Query hooks and API functions for skill management. These provide reactive data access for UI components and follow the existing patterns in the Chorus codebase.

---

## User Stories

- As a React component, I want hooks to access skills so that I can display and manage them
- As the UI, I want reactive updates when skills change so that the display stays current

---

## Acceptance Criteria

- [ ] useSkills() hook returns all discovered skills
- [ ] useEnabledSkills() hook returns only enabled skills
- [ ] useSkillState(id) hook returns state for a specific skill
- [ ] useEnableSkill() mutation to enable a skill
- [ ] useDisableSkill() mutation to disable a skill
- [ ] useSetSkillInvocationMode() mutation to set auto/manual
- [ ] useRefreshSkills() to trigger re-discovery
- [ ] Proper cache invalidation on mutations

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Create SkillsAPI module following existing patterns      | |
| FR-2 | Implement useSkills query hook                           | |
| FR-3 | Implement useEnabledSkills query hook                    | |
| FR-4 | Implement useSkillState query hook                       | |
| FR-5 | Implement useEnableSkill mutation                        | |
| FR-6 | Implement useDisableSkill mutation                       | |
| FR-7 | Implement useSetSkillInvocationMode mutation             | |
| FR-8 | Implement useRefreshSkills mutation                      | |
| FR-9 | Query keys follow existing naming convention             | ['skills'], ['skills', 'enabled'], etc. |

---

## Implementation Notes

```typescript
// Query keys
export const skillKeys = {
    all: ['skills'] as const,
    enabled: ['skills', 'enabled'] as const,
    state: (id: string) => ['skills', 'state', id] as const,
};

// Queries
export function useSkills() {
    return useQuery({
        queryKey: skillKeys.all,
        queryFn: async () => {
            const manager = SkillManager.getInstance();
            return manager.getAllSkills();
        }
    });
}

export function useEnabledSkills() {
    return useQuery({
        queryKey: skillKeys.enabled,
        queryFn: async () => {
            const manager = SkillManager.getInstance();
            return manager.getEnabledSkills();
        }
    });
}

export function useSkillState(id: string) {
    return useQuery({
        queryKey: skillKeys.state(id),
        queryFn: async () => {
            const manager = SkillManager.getInstance();
            return manager.getSkillState(id);
        }
    });
}

// Mutations
export function useEnableSkill() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const manager = SkillManager.getInstance();
            await manager.enableSkill(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: skillKeys.all });
            queryClient.invalidateQueries({ queryKey: skillKeys.enabled });
        }
    });
}

// Similar pattern for useDisableSkill, useSetSkillInvocationMode, useRefreshSkills
```

---

## Dependencies

- Spec 004 (SkillManager)
- TanStack Query (already in project)

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/api/SkillsAPI.ts` | Create | TanStack Query hooks for skills |

---

## Test Plan

### Automated Tests
- [ ] useSkills returns data when skills exist
- [ ] useEnabledSkills filters correctly
- [ ] Mutations invalidate correct queries

### Manual Verification
- [ ] Components using hooks update reactively
- [ ] Enable/disable reflects immediately in UI
- [ ] Refresh picks up new skills

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Hooks follow existing patterns

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
