# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Chorus?

Chorus is a native Mac AI chat app that lets you chat with multiple AI models simultaneously.

It's built with Tauri (Rust), React, TypeScript, TanStack Query, and SQLite. The app sends one prompt and displays responses from Claude, o3-pro, Gemini, and other models side by side.

Key features:

-   MCP (Model Context Protocol) support
-   Ambient chats (quick chats accessible from anywhere)
-   Projects (organized folders of chats)
-   Bring your own API keys
-   Multi-model comparison

Most functionality lives in this repo. A separate Elixir backend at app.chorus.sh handles accounts, billing, and request proxying.

## Development Commands

**Initial setup:**

```bash
pnpm run setup           # Install dependencies and initialize dev environment
```

**Development:**

```bash
pnpm run dev             # Start development instance (uses repo directory name)
pnpm run workspace [name] # Run specific isolated instance with separate data directory
```

**Building:**

```bash
pnpm run build           # Compile TypeScript and build with Vite
```

**Testing:**

```bash
pnpm run test            # Run tests with Vitest
```

**Linting and formatting:**

```bash
pnpm run lint            # Run ESLint
pnpm run lint:fix        # Run ESLint with auto-fix
pnpm run format          # Format all files with Prettier
pnpm run format:check    # Check formatting without making changes
pnpm run validate        # Run both linting and formatting checks
pnpm run validate:fix    # Run both with auto-fix
```

**Database management:**

```bash
pnpm run generate-schema # Generate SQL_SCHEMA.md from migrations.rs
pnpm run delete-db       # Delete local development database
```

**Release:**

```bash
pnpm run release         # Interactive release script
```

Note: Pre-commit hooks automatically run linting and formatting. See `.lintstagedrc.json`.

## Development Instances

The `dev-instance.sh` script lets you run multiple isolated Chorus instances simultaneously:

-   Each instance has its own data directory: `~/Library/Application Support/sh.chorus.app.dev.<instance-name>/`
-   Each gets a unique port (1420-1520) based on instance name hash
-   Instance name appears in the DEV MODE indicator in the sidebar
-   Data persists between runs

This is useful for working on multiple branches or testing without affecting your main development environment.

## Architecture

### High-Level Structure

```
src/
├── ui/                      # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   └── providers/          # Context providers
├── core/
│   └── chorus/             # Core business logic
│       ├── api/            # TanStack Query queries and mutations
│       ├── ModelProviders/ # Provider implementations (Anthropic, OpenAI, etc.)
│       ├── toolsets/       # MCP toolset implementations
│       └── DB.ts           # Database connection
src-tauri/
└── src/                    # Rust backend
    ├── command.rs          # Tauri commands exposed to frontend
    ├── migrations.rs       # Database migrations
    └── window.rs           # Window management
```

### Data Flow

1. **User Input** → ChatInput.tsx captures user message
2. **TanStack Mutation** → API layer (e.g., MessageAPI.ts) handles request
3. **Provider Selection** → Models.ts routes to appropriate provider (ProviderAnthropic.ts, ProviderOpenAI.ts, etc.)
4. **Streaming Response** → Provider streams back to UI via TanStack Query
5. **Database Persistence** → Rust migrations.rs defines schema, TypeScript DB queries persist data

### Key Architectural Patterns

**Model Provider System:**

-   All providers implement `IProvider` interface
-   Each provider handles its own API communication format
-   Providers support streaming, tool calling, and attachments
-   See `src/core/chorus/ModelProviders/`

**Database Layer:**

-   SQLite database with migrations in `src-tauri/src/migrations.rs`
-   Database schema is auto-generated to `SQL_SCHEMA.md` via `pnpm run generate-schema`
-   TypeScript database operations reference this schema
-   CRITICAL: Never modify existing migrations, always add new ones

**API Layer (TanStack Query):**

-   Queries and mutations split by entity type: ChatAPI, MessageAPI, ProjectAPI, etc.
-   Located in `src/core/chorus/api/`
-   Each file handles one entity's CRUD operations and related business logic

**MCP (Model Context Protocol):**

-   Toolsets defined in `src/core/chorus/Toolsets.ts`
-   Individual toolset implementations in `src/core/chorus/toolsets/`
-   ToolsetsManager.ts handles toolset lifecycle

**State Management:**

-   TanStack Query for server state
-   Zustand for UI state (DialogStore, etc.)
-   React Context for app-wide state (AppProvider, SidebarProvider)

## Important Files and Directories

**Entry Points:**

-   `src/ui/App.tsx` - React root component with routing
-   `src-tauri/src/main.rs` - Rust application entry point
-   `src-tauri/src/lib.rs` - Tauri plugin configuration

**Core Logic:**

-   `src/core/chorus/Models.ts` - Model configuration and defaults
-   `src/core/chorus/Toolsets.ts` - Tool/connection definitions
-   `src/core/chorus/ChatState.ts` - Chat state management

**UI Components:**

-   `src/ui/components/MultiChat.tsx` - Main chat interface (handles both regular and quick chats)
-   `src/ui/components/ChatInput.tsx` - Message input box
-   `src/ui/components/AppSidebar.tsx` - Left sidebar with projects and chats
-   `src/ui/components/ManageModelsBox.tsx` - Model selection interface
-   `src/ui/components/Settings.tsx` - Settings dialog

**Database:**

-   `src-tauri/src/migrations.rs` - Database schema migrations
-   `SQL_SCHEMA.md` - Auto-generated schema documentation (DO NOT EDIT MANUALLY)

## Data Model Changes

When modifying the data model:

1. Add a new migration in `src-tauri/src/migrations.rs` (NEVER modify existing migrations)
2. Run `pnpm run generate-schema` to update SQL_SCHEMA.md
3. Update TypeScript types throughout the codebase
4. Update TanStack Query queries/mutations in `src/core/chorus/api/`
5. Stage SQL_SCHEMA.md with your migration changes

## Git Workflow

**Branch management:**

-   NEVER commit directly to main
-   NEVER push to origin/main
-   Create feature branches: `claude/feature-name`
-   Use rebase or cherry-pick to reconcile branches, not merge

**Committing:**

-   Run git commands separately, not chained (e.g., `git add -A` then `git commit`, not `git add -A && git commit`)
-   Commit frequently to allow easy reverts
-   Pre-commit hooks will automatically lint and format

**Pull Requests:**

-   Tag all issues and PRs with "by-claude"
-   PR title should NOT include issue number
-   PR description should START with issue number
-   Include comprehensive test plan for user to execute
-   Test plan must cover both new functionality and potentially impacted existing features
-   Use `gh` CLI for GitHub interactions

## Coding Style

**TypeScript:**

-   Strict mode enabled, ES2020 target
-   Use `as` type assertions only in exceptional cases with explanatory comments
-   Prefer type hints over assertions

**Imports:**

-   Use path aliases: `@ui/*`, `@core/*`, `@/*` instead of relative imports
-   Configured in `tsconfig.json` and `vite.config.ts`

**Naming:**

-   React components: PascalCase
-   Interfaces: Prefixed with "I" (e.g., `IProvider`)
-   Hooks: camelCase with "use" prefix
-   Files: Match component name

**Formatting:**

-   4-space indentation (see `.prettierrc`)
-   Prettier handles formatting automatically via pre-commit hooks

**Nulls and Undefined:**

-   Prefer `undefined` over `null`
-   Convert database nulls to undefined: `parentChatId: row.parent_chat_id ?? undefined`

**Dates:**

-   Format dates with `displayDate` from `src/ui/lib/utils.ts`
-   Convert SQLite dates to UTC with `convertDate` before formatting

**Constraints:**

-   Do not use foreign keys or database constraints (difficult to remove later)

**Promises:**

-   ESLint enforces that all promises must be handled (@typescript-eslint/no-floating-promises)

**Restricted Features - Require Explicit Permission:**
Before using any of these, you MUST ask the user for permission:

-   `setTimeout`
-   `useImperativeHandle`
-   `useRef`
-   Type assertions with `as`

## Troubleshooting

When investigating bugs:

1. Form hypotheses about root causes by reading relevant code
2. Evaluate each hypothesis against reported observations
3. Design tests to eliminate hypotheses
4. Propose a troubleshooting plan (tests, logging, code changes)
5. Iterate through the plan, re-evaluating hypotheses with new evidence

**Model Provider Debugging:**
To debug requests to model providers (prompt formatting, attachments, tool calls):

```typescript
// Add to ProviderAnthropic.ts or relevant provider
console.log(`createParams: ${JSON.stringify(createParams, null, 2)}`);
```

## Testing

You (Claude) do NOT have access to the running app. You MUST rely on the user to test your code.

After fixing a bug, pause and ask the user to verify the fix before continuing.

When you complete a draft implementation, ask the user to test it early and often.

## Role and Workflow

Your role is to write code. When working on features:

1. **Setup:**

    - Identify or create GitHub issue
    - Checkout main and pull latest
    - Create new branch `claude/feature-name`

2. **Development:**

    - Ask questions when unclear about implementation approach
    - Commit often for easy reversion
    - Request user testing early with draft implementations

3. **Review:**

    - Verify diff with `git diff main`
    - Don't worry about manual linting/formatting (hooks handle it)
    - Push branch to GitHub
    - Open PR with issue number, description, and user-executable test plan

4. **Context:**
    - If user sends a URL, fetch and read it immediately before doing anything else
    - Screenshots are in `screenshots/` directory (may not reflect latest changes)
    - SQL schema is in `SQL_SCHEMA.md` (auto-generated reference)

When asked to start unrelated work, repeat the workflow from the beginning (checkout main, new branch).
