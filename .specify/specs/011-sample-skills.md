# Feature Specification: Sample Skills

## Spec ID: 011
## Status: Draft
## Priority: P2
## Created: 2025-01-14

---

## Overview

Create sample skills to demonstrate the Agent Skills system and help users understand how to create their own skills. These will be included in the project as examples.

---

## User Stories

- As a new user, I want sample skills so that I can see how the system works
- As a developer, I want example skills so that I can understand the format
- As a user, I want useful built-in skills so that I get value immediately

---

## Acceptance Criteria

- [ ] At least 3 sample skills created
- [ ] Skills demonstrate different use cases
- [ ] Skills follow Agent Skills specification exactly
- [ ] Skills are documented with clear instructions
- [ ] Skills are placed in correct directory structure

---

## Technical Requirements

### Functional Requirements

| ID   | Requirement                                              | Notes |
| ---- | -------------------------------------------------------- | ----- |
| FR-1 | Create chorus-chat skill for multi-model guidance        | Project-specific |
| FR-2 | Create code-review skill for reviewing code              | General purpose |
| FR-3 | Create documentation skill for writing docs              | General purpose |
| FR-4 | Each skill has proper SKILL.md frontmatter               | |
| FR-5 | Each skill has useful instructions                       | |

---

## Implementation Notes

### Sample Skill 1: chorus-chat

```markdown
---
name: chorus-chat
description: Guidelines for using Chorus multi-model chat effectively. Helps compare AI responses and synthesize insights.
---

# Chorus Multi-Model Chat Guidelines

When users are chatting with multiple AI models simultaneously:

## Comparing Responses
- Point out key differences between model responses
- Highlight unique insights from each model
- Note areas of agreement and disagreement

## Synthesis
- Combine the best elements from multiple responses
- Provide a unified recommendation when appropriate

## Model Strengths
- Claude: Nuanced analysis, safety considerations
- GPT-4: Broad knowledge, creative solutions
- Gemini: Multimodal understanding, current events
```

### Sample Skill 2: code-review

```markdown
---
name: code-review
description: Systematic code review guidelines. Invoke when reviewing pull requests or code changes.
---

# Code Review Skill

## Review Checklist

### Functionality
- [ ] Code does what it's supposed to do
- [ ] Edge cases handled
- [ ] Error handling present

### Code Quality
- [ ] Clear naming conventions
- [ ] No unnecessary complexity
- [ ] DRY principle followed

### Security
- [ ] No hardcoded secrets
- [ ] Input validation
- [ ] SQL injection prevention

### Performance
- [ ] No obvious N+1 queries
- [ ] Appropriate caching
- [ ] Memory leaks avoided

## Review Format

Structure feedback as:
1. **Summary**: One sentence overview
2. **Strengths**: What's done well
3. **Concerns**: Issues to address
4. **Suggestions**: Optional improvements
```

### Sample Skill 3: documentation

```markdown
---
name: documentation
description: Best practices for writing technical documentation. Use when creating READMEs, API docs, or guides.
---

# Documentation Writing Skill

## Structure

1. **Title**: Clear and descriptive
2. **Overview**: What and why (1-2 paragraphs)
3. **Quick Start**: Get running in < 5 minutes
4. **Detailed Usage**: Comprehensive guide
5. **API Reference**: If applicable
6. **Examples**: Real-world use cases
7. **Troubleshooting**: Common issues

## Writing Style

- Use active voice
- Keep sentences short
- Include code examples
- Add diagrams for complex concepts
- Link to related docs

## Formatting

- Use headings for navigation
- Use code blocks with syntax highlighting
- Use tables for structured data
- Use admonitions for warnings/tips
```

---

## Dependencies

- Spec 003 (Skill discovery to find these)

---

## Files to Modify/Create

| File Path | Action | Description |
| --------- | ------ | ----------- |
| `.chorus/skills/chorus-chat/SKILL.md` | Create | Chorus-specific skill |
| `.chorus/skills/code-review/SKILL.md` | Create | Code review skill |
| `.chorus/skills/documentation/SKILL.md` | Create | Documentation skill |

---

## Test Plan

### Manual Verification
- [ ] Skills discovered by system
- [ ] Skills appear in Settings
- [ ] Skills can be invoked
- [ ] Skill content is useful

---

## Completion Checklist

- [ ] All acceptance criteria met
- [ ] Code committed and pushed
- [ ] Skills follow spec format
- [ ] Skills are useful

---

## Completion Signal

Upon successful validation of all requirements, output:

```
<promise>DONE</promise>
```
