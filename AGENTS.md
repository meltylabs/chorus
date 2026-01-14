# Chorus AI Agent Guidelines

This document provides instructions for AI agents working on the Chorus codebase.

## Project Overview

Chorus is a native Mac AI chat application built with Tauri, React, TypeScript, and SQLite. It enables users to chat with multiple AI models simultaneously.

## Key Directories

- `src/ui/components/` - React components
- `src/core/chorus/` - Business logic
- `src/core/chorus/api/` - TanStack Query hooks
- `src/core/chorus/skills/` - Agent Skills system (NEW)
- `src-tauri/src/` - Rust backend

## Coding Standards

1. **TypeScript**: Strict mode, use explicit types, avoid `as` assertions
2. **Imports**: Use path aliases (`@ui/*`, `@core/*`, `@/*`)
3. **Components**: PascalCase names
4. **Hooks**: camelCase with `use` prefix
5. **Interfaces**: Prefix with `I` (e.g., `ISkill`)
6. **Nulls**: Prefer `undefined` over `null`

## Working with Skills

The Agent Skills system follows the open specification at https://agentskills.io.

### Skill Structure
```
.chorus/skills/
└── my-skill/
    └── SKILL.md
```

### SKILL.md Format
```yaml
---
name: my-skill
description: What this skill does and when to use it
---

# Instructions

Detailed instructions for the AI...
```

## Testing Changes

1. TypeScript must compile without errors
2. UI changes must render correctly
3. User must verify functionality in the app

## Commit Guidelines

- Commit often with clear messages
- Never commit to main branch
- Use branches like `claude/feature-name`

## Resources

- See `.specify/memory/constitution.md` for project principles
- See `.specify/specs/` for feature specifications
- See `CLAUDE.md` for detailed onboarding

## Ralph Wiggum Integration

This project uses Ralph Wiggum for spec-driven development:

- Specs are in `.specify/specs/`
- Templates are in `templates/`
- Run `/speckit.implement` to implement a spec
- Output `<promise>DONE</promise>` when complete
