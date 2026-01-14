# Feature Specification: Skill Context Indicator

## Spec ID: 009
## Status: Draft
## Priority: P2
## Created: 2025-01-14

---

## Overview

Implement visual indicators to show when skills are active in a conversation context. This helps users understand which skills are influencing the AI's responses.

---

## User Stories

- As a user, I want to see which skills are active so that I understand the AI's context
- As a user, I want to know when a skill was invoked so that I can track skill usage
- As a user, I want to be able to dismiss active skills so that I can control the context

---

## Acceptance Criteria

- [ ] Visual indicator shows active skills in conversation
- [ ] Indicator appears near chat input or in message area
- [ ] Shows skill name for each active skill
- [ ] Clicking indicator shows skill details
- [ ] Option to dismiss/deactivate skill from context
- [ ] Skills auto-invoked by agent marked differently
- [ ] Skills manually invoked marked differently

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Track active skills per conversation                     | |
| FR-2 | Display active skill badges                              | Near input or above messages |
| FR-3 | Badge shows skill name                                   | |
| FR-4 | Tooltip or modal shows skill details on click            | |
| FR-5 | X button or action to dismiss skill                      | |
| FR-6 | Different styling for auto vs manual invocation          | |
| FR-7 | Skills persist across messages in conversation           | |

---

## Implementation Notes

```tsx
// Active skills indicator component
function ActiveSkillsIndicator({
    conversationId
}: {
    conversationId: string;
}) {
    const activeSkills = useActiveSkills(conversationId);

    if (activeSkills.length === 0) return null;

    return (
        <div className="active-skills-bar flex flex-wrap gap-1 p-2 bg-muted/50 rounded-lg">
            <span className="text-xs text-muted-foreground">Active skills:</span>
            {activeSkills.map(skill => (
                <ActiveSkillBadge
                    key={skill.id}
                    skill={skill}
                    onDismiss={() => dismissSkill(conversationId, skill.id)}
                />
            ))}
        </div>
    );
}

function ActiveSkillBadge({
    skill,
    onDismiss
}: {
    skill: IActiveSkill;
    onDismiss: () => void;
}) {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <Badge
            variant={skill.invocationType === 'auto' ? 'secondary' : 'default'}
            className="flex items-center gap-1 cursor-pointer"
            onClick={() => setShowDetails(true)}
        >
            <Sparkles className="w-3 h-3" />
            {skill.name}
            <button
                className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                }}
            >
                <X className="w-3 h-3" />
            </button>
        </Badge>
    );
}

// Track active skills in conversation state
interface IActiveSkill {
    id: string;
    name: string;
    invocationType: 'auto' | 'manual';
    invokedAt: string;
}

// Hook to manage active skills
function useActiveSkills(conversationId: string) {
    // Implementation to track and retrieve active skills
}
```

---

## Dependencies

- Spec 005 (Skill execution)
- Spec 006 (Skill API hooks)
- Conversation/chat state management

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/ui/components/ActiveSkillsIndicator.tsx` | Create | Active skills display |
| `src/ui/components/MultiChat.tsx` | Modify | Add indicator to chat |
| `src/core/chorus/ChatState.ts` | Modify | Track active skills |

---

## Test Plan

### Automated Tests
- [ ] Indicator renders when skills active
- [ ] Dismiss removes skill from list
- [ ] Auto vs manual styling different

### Manual Verification
- [ ] Invoke skill, see indicator appear
- [ ] Click to see details
- [ ] Dismiss skill works
- [ ] Agent-invoked skills show different style

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Visual design matches Chorus

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
