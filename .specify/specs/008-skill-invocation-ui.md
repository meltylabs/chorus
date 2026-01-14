# Feature Specification: Skill Invocation UI

## Spec ID: 008
## Status: Draft
## Priority: P1
## Created: 2025-01-14

---

## Overview

Implement UI for manually invoking skills from the chat input. Users can type `/` followed by a skill name to manually load a skill into the conversation context. This provides a discoverable way to use skills.

---

## User Stories

- As a user, I want to type /skill-name to invoke a skill so that I can use it when needed
- As a user, I want autocomplete for skill names so that I can discover and select them easily
- As a user, I want to see skill descriptions in autocomplete so that I know what each does

---

## Acceptance Criteria

- [ ] Typing `/` in chat input shows skill suggestions
- [ ] Suggestions show skill name and description
- [ ] Suggestions filtered as user types
- [ ] Arrow keys navigate suggestions
- [ ] Enter selects suggestion
- [ ] Selected skill invoked and added to context
- [ ] Only enabled manual-invocation skills shown
- [ ] Clear indication when skill is loaded

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Detect `/` at start of input                             | |
| FR-2 | Show skill autocomplete dropdown                         | |
| FR-3 | Filter suggestions by typed text                         | |
| FR-4 | Navigate with arrow keys                                 | |
| FR-5 | Select with Enter key                                    | |
| FR-6 | Invoke skill on selection                                | |
| FR-7 | Show confirmation/feedback when skill loaded             | Toast or inline message |
| FR-8 | Escape dismisses autocomplete                            | |
| FR-9 | Click outside dismisses autocomplete                     | |

---

## Implementation Notes

```tsx
// In ChatInput.tsx or as a separate component
function SkillAutocomplete({
    query,
    onSelect,
    onDismiss
}: {
    query: string;
    onSelect: (skill: ISkill) => void;
    onDismiss: () => void;
}) {
    const { data: skills } = useEnabledSkills();
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredSkills = skills?.filter(s =>
        s.metadata.name.toLowerCase().includes(query.toLowerCase()) &&
        (s.state?.invocationMode === 'manual' || !query) // Show all if just /
    ) || [];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(i => Math.min(i + 1, filteredSkills.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(i => Math.max(i - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (filteredSkills[selectedIndex]) {
                        onSelect(filteredSkills[selectedIndex]);
                    }
                    break;
                case 'Escape':
                    onDismiss();
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredSkills, selectedIndex, onSelect, onDismiss]);

    if (filteredSkills.length === 0) {
        return (
            <div className="skill-autocomplete-empty">
                No skills match "{query}"
            </div>
        );
    }

    return (
        <div className="skill-autocomplete">
            {filteredSkills.map((skill, index) => (
                <div
                    key={skill.id}
                    className={cn(
                        "skill-suggestion",
                        index === selectedIndex && "selected"
                    )}
                    onClick={() => onSelect(skill)}
                >
                    <span className="skill-name">/{skill.metadata.name}</span>
                    <span className="skill-description">{skill.metadata.description}</span>
                </div>
            ))}
        </div>
    );
}

// Integration with ChatInput
function ChatInput() {
    const [value, setValue] = useState('');
    const [showSkillAutocomplete, setShowSkillAutocomplete] = useState(false);
    const [skillQuery, setSkillQuery] = useState('');

    const handleChange = (newValue: string) => {
        setValue(newValue);
        if (newValue.startsWith('/')) {
            setShowSkillAutocomplete(true);
            setSkillQuery(newValue.slice(1));
        } else {
            setShowSkillAutocomplete(false);
        }
    };

    const handleSkillSelect = async (skill: ISkill) => {
        setValue(''); // Clear input
        setShowSkillAutocomplete(false);
        // Invoke skill and add to context
        await invokeSkill(skill.id);
        toast(`Loaded skill: ${skill.metadata.name}`);
    };

    // ...rest of component
}
```

---

## Dependencies

- Spec 005 (Skill execution)
- Spec 006 (Skill API hooks)
- Existing ChatInput.tsx component

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/ui/components/SkillAutocomplete.tsx` | Create | Autocomplete dropdown |
| `src/ui/components/ChatInput.tsx` | Modify | Add skill invocation |

---

## Test Plan

### Automated Tests
- [ ] Autocomplete shows on `/`
- [ ] Filtering works correctly
- [ ] Keyboard navigation works

### Manual Verification
- [ ] Type `/` shows skill suggestions
- [ ] Typing filters list
- [ ] Arrow keys navigate
- [ ] Enter selects skill
- [ ] Escape closes autocomplete
- [ ] Skill loads with confirmation

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Keyboard navigation smooth

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
