# Architecture

This document describes the high-level architecture of Chorus.
If you want to familiarize yourself with the codebase, you are in the right place.

## Bird's Eye View

Chorus is a native Mac desktop app for chatting with multiple AI models simultaneously.
You send one prompt and see responses from Claude, GPT, Gemini, and others side by side.

The app is built with **Tauri**: a Rust shell hosts a web frontend.
The frontend is React + TypeScript. All data lives in a local SQLite database.
There is also an external backend at `app.chorus.sh` (Elixir) that handles accounts, billing,
and proxying API requests to model providers — but that backend lives in a separate repo
and is not described here.

```
┌─────────────────────────────────────────────────────┐
│                     Tauri (Rust)                    │
│   window management, menus, global shortcuts,       │
│   screenshots, image processing, DB migrations      │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌─────────────┐          ┌──────────────────┐    │
│   │  UI Layer   │───uses──▶│   Core Layer     │    │
│   │  (React)    │          │   (TypeScript)   │    │
│   └─────────────┘          └──────┬───────────┘    │
│                                   │                 │
│                            ┌──────▼───────────┐    │
│                            │    SQLite DB      │    │
│                            └──────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
         │                          │
         │ Tauri IPC                │ HTTP
         ▼                          ▼
   OS (shortcuts,             Model provider APIs
   file system,               (Anthropic, OpenAI,
   notifications)              Google, etc.)
```

## Codemap

### `src-tauri/` — Rust / Tauri Shell

The Rust layer is thin. It does not contain business logic.
Its job is to be the bridge between the OS and the web frontend.

- **`lib.rs`** — Application entry point. Registers Tauri plugins (SQL, clipboard,
  filesystem, global shortcuts, updater), builds the macOS menu bar, sets up the
  system tray, and registers IPC command handlers.

- **`command.rs`** — All Tauri IPC commands that the frontend can `invoke()`.
  Window show/hide, screenshots, image resizing, file writes. There are roughly
  a dozen commands; they are intentionally simple wrappers around OS capabilities.

- **`window.rs`** — macOS-specific code that converts a standard window into a
  floating NSPanel for the quick-chat (ambient chat) feature. Uses unsafe
  Objective-C interop via `tauri-nspanel`.

- **`migrations.rs`** — Every SQLite schema migration, applied automatically on
  app startup by the Tauri SQL plugin. Migrations are append-only: old ones are
  never modified. There is a companion binary `bin/generate_schema.rs` that
  replays all migrations to produce `SCHEMA.md`.

**Invariant:** The Rust layer never reads or writes domain data directly.
All database queries happen in TypeScript through the Tauri SQL plugin.
Rust only owns the migration definitions and the IPC surface.

### `src/core/` — TypeScript Business Logic

This is where domain logic lives. It has no dependency on React.
(One exception: `MessageAPI.ts` imports a React hook for app context.
This is a known violation, not a pattern to follow.)

#### `src/core/chorus/Models.ts` — The Model Registry

Central file that defines the core types (`Model`, `ModelConfig`, `LLMMessage`,
`StreamResponseParams`, `ApiKeys`) and the `streamResponse()` routing function.
A model ID encodes its provider (e.g. `anthropic::claude-sonnet-4-20250514`).
`streamResponse()` parses the provider prefix and delegates to the appropriate
`IProvider` implementation.

#### `src/core/chorus/ModelProviders/` — Provider Implementations

Each file implements the `IProvider` interface, which has a single method:
`streamResponse(params: StreamResponseParams) => Promise<void | ModelDisabled>`.

Providers: `ProviderAnthropic`, `ProviderOpenAI`, `ProviderGoogle`,
`ProviderOpenRouter`, `ProviderPerplexity`, `ProviderOllama`,
`ProviderLMStudio`, `ProviderGrok`. A `simple/` subdirectory contains
lighter-weight wrappers for non-streaming use cases.

Each provider converts the universal `LLMMessage[]` format into the
provider-specific wire format, handles streaming, and normalizes errors.

**Boundary:** Providers receive a `StreamResponseParams` and write to
callbacks. They do not know about chats, message sets, the database,
or the UI. They are pure API adapters.

#### `src/core/chorus/ChatState.ts` — Conversation Data Model

Defines the in-memory shapes: `MessageSet`, `Message`, `MessagePart`,
and the block types (`UserBlock`, `ChatBlock`, `CompareBlock`,
`ToolsBlock`, `BrainstormBlock`). A `MessageSet` groups the messages
for one conversational turn. Each message set has a `selectedBlockType`
that determines how the turn is displayed.

#### `src/core/chorus/api/` — Data Access (TanStack Query)

One file per entity: `ChatAPI`, `MessageAPI`, `ModelsAPI`, `ProjectAPI`,
`AttachmentsAPI`, `ToolsetsAPI`, `AppMetadataAPI`, `CostAPI`, `DraftAPI`,
`SearchAPI`, etc.

Each file exports:
- Query key factories (for cache invalidation)
- Query option factories (for `useQuery`)
- Mutation hooks (for `useMutation`)
- Pure fetch functions that run SQL against the database

`MessageAPI` is the most complex: it builds the `LLMMessage[]` conversation
history, calls `streamResponse()`, and orchestrates tool-call loops.

#### `src/core/chorus/DB.ts` — Database Singleton

A one-liner that loads the SQLite database via the Tauri SQL plugin.
All query functions in `api/` import `db` from here.

#### `src/core/chorus/Toolsets.ts` and `ToolsetsManager.ts` — Tool System

`Toolsets.ts` defines the tool abstraction: `UserTool`, `UserToolCall`,
`UserToolResult`, `Toolset`, `MCPServer`. A `Toolset` is a named collection
of tools backed either by an MCP server connection or by custom TypeScript
functions.

`ToolsetsManager` is the singleton that owns all active toolsets (built-in
and user-defined), routes incoming tool calls from the LLM to the correct
toolset, and enforces tool permissions.

Built-in toolset implementations live in `src/core/chorus/toolsets/`
(web, terminal, github, media, etc.).

**Boundary:** The LLM produces `UserToolCall` objects. `ToolsetsManager`
consumes them and returns `UserToolResult` objects. The LLM and the tool
implementations never interact directly.

#### `src/core/infra/` — Infrastructure Stores

Zustand stores for cross-cutting UI state that doesn't belong in React context:
`DialogStore` (modal open/close), `InputStore` (chat input state),
`ToolPermissionStore` (queued permission requests).

#### `src/core/utilities/Settings.ts` — User Settings

`SettingsManager` singleton backed by the Tauri persistent store. Holds API keys,
default model, UI preferences.

### `src/ui/` — React Frontend

The UI layer. Imports freely from `src/core/` but never the reverse.

#### `src/ui/App.tsx` — Root Component

Sets up routing (react-router-dom), context providers, global keyboard
shortcuts, deep link handling, and auto-update checking.

Routes:
- `/` — `Home` (redirects to a new chat)
- `/chat/:chatId` — `MultiChat`
- `/projects/:projectId` — `ProjectView`
- `/prompts` — `ListPrompts`
- `/new-prompt` — `NewPrompt`

#### `src/ui/components/MultiChat.tsx` — The Main Chat View

The largest and most complex component. Renders the message list, manages
streaming state, handles model responses, tool permission prompts, replies,
and branching. Both regular chats and quick (ambient) chats render through
this component.

#### `src/ui/components/ChatInput.tsx` — The Input Box

Text input with attachment handling, model pill selector, and tool picker.

#### `src/ui/components/AppSidebar.tsx` — Sidebar Navigation

Chat history list, project folders, drag-and-drop reordering.

#### `src/ui/components/renderers/` — Content Renderers

`MessageMarkdown`, `CodeBlock`, `LatexBlock`, `Mermaid`, `ThinkBlock`,
`ImagePreview`, `WebPreview`, `SVG`, `HTML`. These turn message content
into rendered React elements.

#### `src/ui/components/ui/` — Design System Primitives

Shadcn/ui components (button, dialog, popover, etc.) plus a few custom
components (retro-spinner, provider-logo, ErrorBoundary).

#### `src/ui/context/` and `src/ui/providers/` — React Context

Four contexts: `AppContext` (window type, zoom), `DatabaseContext` (SQLite
instance), `SidebarContext`, `ThemeContext`. Each has a corresponding
provider in `providers/`.

#### `src/ui/hooks/` — Custom Hooks

`useAppContext`, `useDatabase`, `useTheme`, `useSidebar`, `useShortcut`,
`useAttachments`, `useShareChat`, `useScrollDetection`.

#### `src/ui/lib/utils.ts` — UI Utilities

`cn()` for class merging, `convertDate()` / `displayDate()` for date
formatting, `formatShortcut()` for keyboard shortcut display.

### Two-Window Architecture

The app runs two Tauri windows:

1. **Main window** (`label: "main"`, 1400x800) — full chat interface with
   sidebar, projects, settings.
2. **Quick-chat window** (`label: "quick-chat"`, 500x400) — a lightweight
   floating panel activated via global shortcut (default: Alt+Space).
   On macOS this is converted to an NSPanel that floats above fullscreen apps.

Both windows render the same React app. `AppContext.isQuickChatWindow`
controls which UI elements are shown.

## Cross-Cutting Concerns

### Data Flow

User input flows: `ChatInput` -> `MessageAPI.sendMessage()` -> build
`LLMMessage[]` from DB history -> `Models.streamResponse()` -> provider
-> streaming callbacks write to DB -> TanStack Query invalidation ->
UI re-renders.

Tool calls insert a loop: provider yields `UserToolCall` ->
`ToolsetsManager.executeToolCall()` -> result appended to conversation ->
provider continues.

### Database Migrations

All schema changes go through `src-tauri/src/migrations.rs`. Migrations
are numbered sequentially and never modified after shipping. The Tauri SQL
plugin runs pending migrations on every app launch. `SCHEMA.md` is
generated from migrations and should be treated as the source of truth
for the current schema.

No foreign key constraints are used. Cascading deletes are implemented
via SQLite triggers defined in the migrations.

### State Management

Three layers, intentionally separated:

1. **Server state** (chats, messages, models, settings) — TanStack Query,
   backed by SQLite. This is the source of truth.
2. **App-wide UI state** (dialogs, input focus, tool permissions) — Zustand
   stores in `src/core/infra/`.
3. **Component-local state** — React `useState`. Used for transient UI state
   only.

### Streaming

All model responses are streamed. Each streaming response gets a unique
`streamingToken`. The provider writes partial text to the message via
callbacks. `MessageAPI` updates the database and triggers query
invalidation so the UI rerenders incrementally.

### Path Aliases

TypeScript imports use path aliases: `@core/*` maps to `src/core/*`,
`@ui/*` maps to `src/ui/*`, `@/*` maps to `src/*`. Relative imports
are not used across layer boundaries.

### External Backend

The Elixir backend at `app.chorus.sh` handles user accounts, billing,
and proxying model API requests. The frontend communicates with it via
HTTP. Its URL is configured in `src/core/config.ts` as `meltyProxyUrl`.
The backend is a separate system with a separate codebase; this repo
does not depend on it for core chat functionality.
