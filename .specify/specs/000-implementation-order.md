# Agent Skills Implementation Order

## Overview

This document outlines the recommended order for implementing the Agent Skills feature in Chorus. Specs should be completed in this order to ensure dependencies are satisfied.

---

## Phase 1: Foundation (Core Infrastructure)

These specs establish the core data structures and parsing logic.

| Order | Spec | Title | Priority |
| ----- | ---- | ----- | -------- |
| 1 | 001 | Skill Types and Interfaces | P0 |
| 2 | 002 | Skill Parser | P0 |
| 3 | 003 | Skill Discovery | P0 |
| 4 | 004 | Skill Manager | P0 |
| 5 | 010 | Database Skill State | P1 |

**Milestone**: Skills can be discovered and loaded into memory.

---

## Phase 2: Execution (Making Skills Work)

These specs enable skills to actually be used in conversations.

| Order | Spec | Title | Priority |
| ----- | ---- | ----- | -------- |
| 6 | 005 | Skill Execution Engine | P0 |
| 7 | 006 | Skill API and React Hooks | P1 |

**Milestone**: AI can discover and use skills in conversations.

---

## Phase 3: User Interface

These specs provide the user-facing controls.

| Order | Spec | Title | Priority |
| ----- | ---- | ----- | -------- |
| 8 | 007 | Skills Settings UI | P1 |
| 9 | 008 | Skill Invocation UI | P1 |
| 10 | 009 | Skill Context Indicator | P2 |

**Milestone**: Users can manage and invoke skills through the UI.

---

## Phase 4: Polish & Examples

| Order | Spec | Title | Priority |
| ----- | ---- | ----- | -------- |
| 11 | 011 | Sample Skills | P2 |

**Milestone**: Feature is complete with examples.

---

## Execution Command

To implement all specs in order using Ralph Wiggum:

```bash
./scripts/ralph-loop.sh --all
```

Or implement individually:

```bash
./scripts/ralph-loop.sh --spec 001-skill-types-and-interfaces
./scripts/ralph-loop.sh --spec 002-skill-parser
# ... etc
```

---

## Success Criteria

The Agent Skills feature is complete when:

1. Users can create SKILL.md files following the spec
2. Chorus discovers skills from project and user directories
3. Skills appear in Settings with enable/disable toggles
4. AI can automatically invoke relevant skills
5. Users can manually invoke skills with /skill-name
6. Skill preferences persist across sessions
7. Active skills are visually indicated in conversations

---

## Notes

- All P0 specs must be completed for a working feature
- P1 specs provide essential user experience
- P2 specs are polish and can be deferred
- Test each phase milestone before proceeding
