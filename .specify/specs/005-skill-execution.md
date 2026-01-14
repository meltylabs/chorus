# Feature Specification: Skill Execution Engine

## Spec ID: 005
## Status: Draft
## Priority: P0
## Created: 2025-01-14

---

## Overview

Implement the skill execution system that loads skill instructions into the AI context when needed. This follows the Agent Skills "progressive disclosure" pattern where skill metadata is loaded at startup, but full instructions are only loaded when the skill is invoked.

---

## User Stories

- As the AI, I want to see available skills so that I can choose to load relevant ones
- As the AI, I want to load skill instructions when needed so that I have detailed guidance
- As a user, I want skills to enhance AI responses without bloating every conversation

---

## Acceptance Criteria

- [ ] Skill metadata (name, description) available to AI at conversation start
- [ ] AI can invoke a skill to load full instructions
- [ ] Skill instructions injected as system context
- [ ] Scripts from skill's scripts/ directory accessible
- [ ] References from skill's references/ directory loadable
- [ ] Skill invocation tracked for analytics/debugging
- [ ] Manual skill invocation via /skill-name command

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Generate skill metadata summary for system prompt        | List of available skills with descriptions |
| FR-2 | Implement skill invocation mechanism                     | Agent can call to load full content |
| FR-3 | Inject skill content as additional context               | |
| FR-4 | Load scripts on-demand                                   | |
| FR-5 | Load references on-demand                                | |
| FR-6 | Support manual invocation via slash command              | /skill-name in chat |
| FR-7 | Track skill invocations                                  | Which skills used, when |

---

## Implementation Notes

```typescript
// System prompt addition for skill awareness
function generateSkillsSystemPrompt(skills: ISkill[]): string {
    return `
## Available Skills

You have access to the following skills. When a user's request matches a skill's domain,
you can invoke it to get detailed instructions.

${skills.map(s => `- **${s.metadata.name}**: ${s.metadata.description}`).join('\n')}

To invoke a skill, use the \`use_skill\` function with the skill name.
`;
}

// Skill invocation tool definition
const skillTool: UserTool = {
    toolsetName: 'skills',
    displayNameSuffix: 'use_skill',
    description: 'Load detailed instructions from a skill',
    inputSchema: {
        type: 'object',
        properties: {
            skill_name: {
                type: 'string',
                description: 'The name of the skill to invoke'
            }
        },
        required: ['skill_name']
    }
};

// Skill execution function
async function executeSkill(skillName: string): Promise<string> {
    const manager = SkillManager.getInstance();
    const skill = manager.getSkill(skillName);
    if (!skill) {
        return `Skill "${skillName}" not found`;
    }
    if (!manager.getSkillState(skillName).enabled) {
        return `Skill "${skillName}" is disabled`;
    }
    return skill.content;
}
```

### Integration with Chat System

The skill system integrates with the existing chat/tools system:
1. SkillsToolset is registered with ToolsetsManager
2. Skills are exposed as a virtual tool (use_skill)
3. When invoked, skill content is added to context

---

## Dependencies

- Spec 001 (ISkill types)
- Spec 004 (SkillManager)
- Existing Toolsets.ts system

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `src/core/chorus/skills/SkillExecution.ts` | Create | Skill execution logic |
| `src/core/chorus/toolsets/skills.ts` | Create | Skills toolset for tool invocation |
| `src/core/chorus/ToolsetsManager.ts` | Modify | Register skills toolset |
| `src/core/chorus/prompts/prompts.ts` | Modify | Add skills to system prompt |

---

## Test Plan

### Automated Tests
- [ ] Skill metadata appears in system prompt
- [ ] use_skill tool loads correct content
- [ ] Disabled skills return appropriate message
- [ ] Missing skills handled gracefully

### Manual Verification
- [ ] AI sees list of available skills
- [ ] AI can invoke skill and use instructions
- [ ] /skill-name command works in chat
- [ ] Skill content appears in conversation context

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] No TypeScript errors
- [ ] Integration with chat works

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
