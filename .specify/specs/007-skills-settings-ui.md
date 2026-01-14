# Feature Specification: Skills Settings UI

## Spec ID: 007
## Status: Draft
## Priority: P1
## Created: 2025-01-14

---

## Overview

Implement the Skills management UI in the Settings panel. This allows users to view, enable/disable, and configure discovered skills. The UI follows Chorus's existing design patterns and component library.

---

## User Stories

- As a user, I want to see all available skills so that I know what's installed
- As a user, I want to enable/disable skills so that I control what's active
- As a user, I want to set auto/manual invocation so that I control how skills are used
- As a user, I want to see where skills are from so that I understand their scope

---

## Acceptance Criteria

- [ ] Skills section added to Settings panel
- [ ] List of all discovered skills displayed
- [ ] Each skill shows: name, description, location (project/user)
- [ ] Toggle switch for enable/disable per skill
- [ ] Dropdown/toggle for invocation mode (Agent Decides / Manual Only)
- [ ] Visual distinction for project vs user skills
- [ ] Refresh button to re-scan for skills
- [ ] Empty state when no skills found
- [ ] Error state for skills that failed to load

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Add "Skills" section to Settings component               | |
| FR-2 | Display SkillCard for each skill                         | |
| FR-3 | SkillCard shows metadata and controls                    | |
| FR-4 | Enable/disable toggle updates state                      | |
| FR-5 | Invocation mode selector                                 | Dropdown or segmented control |
| FR-6 | Location badge (Project / User / Global)                 | |
| FR-7 | Refresh button triggers re-discovery                     | |
| FR-8 | Empty state with instructions                            | How to add skills |
| FR-9 | Error handling for failed skills                         | |

---

## Implementation Notes

```tsx
// Skills section in Settings
function SkillsSettings() {
    const { data: skills, isLoading } = useSkills();
    const refreshSkills = useRefreshSkills();

    if (isLoading) return <Skeleton />;

    return (
        <SettingsSection
            title="Skills"
            description="Extend AI capabilities with specialized skills"
            action={
                <Button variant="ghost" onClick={() => refreshSkills.mutate()}>
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </Button>
            }
        >
            {skills?.length === 0 ? (
                <SkillsEmptyState />
            ) : (
                <div className="space-y-3">
                    {skills?.map(skill => (
                        <SkillCard key={skill.id} skill={skill} />
                    ))}
                </div>
            )}
        </SettingsSection>
    );
}

// Individual skill card
function SkillCard({ skill }: { skill: ISkill }) {
    const { data: state } = useSkillState(skill.id);
    const enableSkill = useEnableSkill();
    const disableSkill = useDisableSkill();
    const setMode = useSetSkillInvocationMode();

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        {skill.metadata.name}
                        <Badge variant={skill.location === 'project' ? 'default' : 'secondary'}>
                            {skill.location}
                        </Badge>
                    </CardTitle>
                    <CardDescription>{skill.metadata.description}</CardDescription>
                </div>
                <Switch
                    checked={state?.enabled}
                    onCheckedChange={(checked) =>
                        checked ? enableSkill.mutate(skill.id) : disableSkill.mutate(skill.id)
                    }
                />
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Invocation:</span>
                    <Select
                        value={state?.invocationMode || 'auto'}
                        onValueChange={(mode) => setMode.mutate({ id: skill.id, mode })}
                    >
                        <SelectTrigger className="w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Agent Decides</SelectItem>
                            <SelectItem value="manual">Manual Only</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}
```

---

## Dependencies

- Spec 006 (Skill API hooks)
- Existing Settings.tsx component
- shadcn/ui components (Card, Switch, Select, Badge, Button)

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/ui/components/SkillsSettings.tsx` | Create | Skills settings panel |
| `src/ui/components/SkillCard.tsx` | Create | Individual skill card |
| `src/ui/components/Settings.tsx` | Modify | Add Skills section |

---

## Test Plan

### Automated Tests
- [ ] SkillsSettings renders without error
- [ ] SkillCard displays skill info correctly
- [ ] Toggle triggers enable/disable mutation

### Manual Verification
- [ ] Skills section visible in Settings
- [ ] All discovered skills listed
- [ ] Enable/disable works and persists
- [ ] Invocation mode changes work
- [ ] Refresh updates skill list
- [ ] Empty state shows when no skills
- [ ] Location badges correct

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] UI matches Chorus design

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
