# Repository Guidelines

## Project Structure

-   `src/`: Vite + React frontend (TypeScript).
    -   `src/ui/`: UI components, themes, providers, and hooks.
    -   `src/core/`: business logic (models/providers, toolsets, importers).
    -   `src/types/`: shared types.
-   `src-tauri/`: Tauri (Rust) backend, bundling, and native integrations.
-   `script/`: local dev utilities (instance setup/run, validation, release).
-   `public/` + `resources/`: static assets and Tauri resources/icons.
-   `docs/` and `screenshots/`: documentation and marketing assets.
-   `dist/`: generated build output (do not hand-edit).

## Build, Test, and Development Commands

Prereqs: Node `>=22`, `pnpm`, Rust/Cargo, and Git LFS (`git lfs install --force && git lfs pull`).

-   Install deps: `pnpm install`
-   Set up an isolated instance: `pnpm run setup [instance-name]`
-   Run the app (Tauri + Vite): `pnpm run dev [instance-name]`
-   Web-only dev server: `pnpm run vite:dev`
-   Build (typecheck + bundle): `pnpm run build`
-   Lint/format/typecheck (matches CI): `pnpm run validate && pnpm tsc`
-   Generate SQL docs after DB changes: `pnpm run generate-schema` (updates `SQL_SCHEMA.md`)

## Coding Style & Naming Conventions

-   TypeScript is strict (`tsconfig.json`); keep types explicit and avoid unsafe casts.
-   Prefer path aliases over deep relatives: `@ui/*`, `@core/*`, `@/*`.
-   Formatting is Prettier-first (4-space `tabWidth`) with ESLint enforcement.
-   Naming: `PascalCase` components, `useX` hooks, `camelCase` vars/functions.

## Testing Guidelines

-   JS/TS tests use Vitest: `pnpm test`.
-   Name tests `*.test.ts(x)` (or place under `src/tests/`) and keep snapshots committed.
-   Rust tests (if added) run from `src-tauri/`: `cargo test`.

## Security & Local Data

-   Dev instances store data in `~/Library/Application Support/sh.chorus.app.dev.<instance>/` (e.g., `auth.dat`, `chats.db`); never commit or share these files.
-   Keep API keys and provider credentials out of git and logs; use local configuration only.

## Commit & Pull Request Guidelines

-   Follow the existing commit style: `feat: ...`, `fix: ...`, `chore: ...` (optionally `(#issue)`).
-   PRs should explain the “why”, link issues, and include screenshots for UI changes.
-   Before opening a PR, ensure `pnpm run validate` passes; run `pnpm test` when touching core logic.
