# Chorus Project Constitution
## Version: 1.0.0
## Last Updated: 2025-01-14

---

## I. Project Identity

**Project Name:** Chorus

**Description:** Chorus is a native Mac AI chat app that lets you chat with multiple AI models simultaneously. It lets you send one prompt and see responses from Claude, o3-pro, Gemini, etc. all at once. Built with Tauri, React, TypeScript, TanStack Query, and a local SQLite database.

---

## II. Core Principles

### Principle I: User Privacy & Data Ownership
All user data is stored locally in SQLite. API keys are stored securely. No telemetry or tracking without explicit consent. Users bring their own API keys.

### Principle II: Multi-Model Experience
The core value proposition is comparing responses across AI models. Every feature should consider the multi-model context.

### Principle III: Simplicity & YAGNI
Start simple. Avoid over-engineering. Build exactly what's needed, nothing more. Prefer editing existing files over creating new ones.

### Principle IV: Type Safety & Code Quality
Strict TypeScript with explicit type hints. Prefer undefined over null. Use path aliases (@ui/*, @core/*). PascalCase for components, camelCase for hooks (use prefix).

### Principle V: Autonomous Agent Development
Agents should:
- Make decisions without asking for approval on implementation details
- Handle commits independently
- Follow established patterns in the codebase
- Test changes through the user before marking complete

---

## III. Technical Stack

| Layer          | Technology                              |
| -------------- | --------------------------------------- |
| Framework      | Tauri 2.x + React 18                    |
| Language       | TypeScript (strict mode)                |
| Styling        | Tailwind CSS + shadcn/ui                |
| State Mgmt     | TanStack Query + Zustand                |
| Database       | SQLite (local)                          |
| Backend        | Elixir (app.chorus.sh - external)       |
| Package Mgr    | pnpm                                    |
| Routing        | react-router-dom                        |

---

## IV. Project Structure

```
src/
├── core/
│   ├── chorus/
│   │   ├── api/          # TanStack Query queries/mutations
│   │   ├── db/           # SQLite database queries
│   │   ├── ModelProviders/  # AI model integrations
│   │   ├── toolsets/     # Tool implementations (MCP)
│   │   └── ...
│   ├── infra/            # Infrastructure (stores, etc.)
│   └── utilities/        # Shared utilities
├── ui/
│   ├── components/       # React components
│   ├── context/          # React contexts
│   ├── hooks/            # Custom hooks
│   └── lib/              # UI utilities
src-tauri/
└── src/                  # Rust backend
```

---

## V. Key Files Reference

- `src/ui/components/MultiChat.tsx` - Main chat interface
- `src/ui/components/ChatInput.tsx` - Chat input box
- `src/ui/components/AppSidebar.tsx` - Left sidebar
- `src/core/chorus/Toolsets.ts` - Tool/MCP system
- `src/core/chorus/ToolsetsManager.ts` - Toolset coordination
- `src/core/utilities/Settings.ts` - App settings

---

## VI. Development Workflow

This project follows the **Ralph Wiggum + SpecKit** methodology:

1. **Specify**: Define requirements in `.specify/specs/` with clear acceptance criteria
2. **Implement**: Build iteratively, committing often
3. **Validate**: User tests changes; iterate until all criteria pass
4. **Complete**: Output `<promise>DONE</promise>` when all checks pass

---

## VII. Coding Conventions

- Use `@ui/*`, `@core/*`, `@/*` path aliases
- Prefer undefined over null
- Convert database nulls: `row.field ?? undefined`
- Format dates with `displayDate()` from `src/ui/lib/utils.ts`
- No foreign keys or database constraints
- Avoid: `setTimeout`, `useImperativeHandle`, `useRef`, `as` type assertions (without permission)

---

## VIII. Governance

### Amendments
Any changes to this constitution require version increment and documentation.

### Compliance
This constitution serves as guidance, not restriction. Exceptions may be documented inline with rationale.

---

## IX. Agent Skills Context

This project is implementing the Agent Skills specification (https://agentskills.io) to enable:
- Loading skills from local directories
- Discovering skills from project and user locations
- Executing skill instructions on-demand
- Managing skill enable/disable through UI
