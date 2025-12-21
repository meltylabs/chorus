# Ripple
## AI-Powered Motion Graphics for Mac

**Product Requirements Document**

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | December 2025 |
| **Author** | Conor |
| **Status** | Draft |
| **Tech Stack** | Remotion + GSAP + FFmpeg on Tauri |
| **Base Repo** | github.com/meltylabs/chorus |

---

## 1. Executive Summary

Ripple is a native Mac application that transforms how motion graphics are created. Users describe what they want in plain English, Claude generates production-ready animation code using multiple rendering engines, and the app renders professional video output locally.

**Vision:** Democratize motion graphics creation by replacing the After Effects learning curve with natural language interaction, while maintaining professional output quality.

**Target Users:**
- Content creators and marketers who need professional motion graphics but lack After Effects expertise
- Professionals who know After Effects but want a faster workflow for common tasks
- Developers and small teams without budget for dedicated motion designers
- Agencies needing rapid prototyping before handing off to After Effects for final polish

---

## 2. Problem Statement

Creating professional motion graphics currently requires:

- Expensive software (After Effects: $23/month minimum)
- Months of learning complex interfaces and workflows
- Hours of manual work for simple animations
- Hiring expensive freelancers ($50-200/hour) for one-off projects

Even professionals who know After Effects spend significant time on repetitive tasks—title cards, lower thirds, logo reveals—that follow predictable patterns. These are highly automatable with the right approach.

---

## 3. Solution Overview

Ripple combines proven technologies into a seamless creative tool:

- **Tauri** — Native Mac app shell with minimal footprint
- **Remotion** — React-based video composition framework with frame-accurate rendering
- **Multiple Animation Engines** — GSAP, Framer Motion, React Three Fiber, Lottie, Rive
- **Claude Agent SDK** — Autonomous AI agent for code generation with tool use and self-correction
- **FFmpeg** — Professional video encoding (MP4, ProRes, WebM, GIF)

### 3.1 Core User Flow

1. User opens Ripple, creates a new project
2. Types: "Create a title card with 'Hello World' scaling up over 2 seconds"
3. Claude Agent selects the optimal animation engine and generates code
4. Preview renders instantly in the app
5. User iterates: "Make the text blue and add a drop shadow"
6. User exports to MP4, ProRes, or After Effects project file

---

## 4. Animation Engines

Ripple supports multiple animation frameworks, allowing Claude to choose the best tool for each job. All engines sync to Remotion's frame-based rendering.

| Engine | Best For | Remotion Integration |
|--------|----------|----------------------|
| **GSAP** | Timelines, kinetic typography, morphing | Custom wrapper (timeline.seek) |
| **Framer Motion** | UI animations, spring physics | Custom wrapper (useMotionValue) |
| **React Three Fiber** | 3D graphics, product shots | Official @remotion/three |
| **Lottie** | After Effects imports, icons | Official @remotion/lottie |
| **Rive** | State machines, characters | Official @remotion/rive |
| **CSS** | Simple fades, maximum performance | Native (animation-delay) |

### 4.1 Engine Selection Logic

Claude automatically selects the optimal engine based on the user's request:

| User Request | Engine | Reason |
|--------------|--------|--------|
| "Kinetic typography title card" | GSAP | SplitText plugin |
| "3D logo spinning on turntable" | React Three Fiber | WebGL required |
| "Import my After Effects animation" | Lottie | AE exports to JSON |
| "Bouncy card stack with springs" | Framer Motion | Spring physics |
| "Simple fade in" | CSS | No library needed |

---

## 5. Functional Requirements

### 5.1 Chat Interface

- Natural language input for describing animations
- Conversation history with context retention
- Streaming responses with typing indicator
- Error display with "Ask Claude to fix" option
- Agent status indicators (thinking, generating, rendering)

### 5.2 Preview Canvas

- Real-time Remotion Player with play/pause controls
- Timeline scrubbing with frame-accurate seeking
- Hot reload on code changes (<500ms)
- Error boundary with graceful fallback
- Resolution presets (1080p, 4K, Square, Vertical)

### 5.3 Export Pipeline

- Format selection: MP4 (H.264), ProRes, WebM, GIF
- After Effects project export (.aep) for professional handoff
- Quality/bitrate configuration
- Resolution override (render at different size than preview)
- Progress tracking with time estimation
- Background rendering (non-blocking)

### 5.4 Asset Management

- Drag-drop import for images, videos, audio, fonts
- 3D model support (.glb, .gltf) for React Three Fiber
- Lottie JSON import from LottieFiles
- Rive file (.riv) import
- Asset panel with thumbnails and metadata

### 5.5 Project Management

- SQLite persistence for projects and compositions
- Generation history with rollback
- Template library organized by engine
- Export compositions as shareable code

---

## 6. Technical Architecture

### 6.1 Application Stack

| Layer | Technology |
|-------|------------|
| App Shell | Tauri 2.0 (Rust backend, WebView frontend) |
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Video Framework | Remotion 4.x (@remotion/player, @remotion/renderer) |
| Animation | GSAP 3.x, Framer Motion 11, @remotion/three, @remotion/lottie, @remotion/rive |
| AI | Claude Agent SDK |
| Code Sandbox | esbuild-wasm for in-browser TypeScript transforms |
| Encoding | FFmpeg (bundled), Chromium (lazy-loaded for render) |
| Persistence | SQLite (projects, compositions, assets, generation history) |

### 6.2 Base Repository

Ripple is built on top of **meltylabs/chorus**, which provides the Tauri shell, chat persistence, and React/TypeScript infrastructure. Key modifications:

- Remove multi-provider chat (OpenAI, Gemini, etc.) — keep Claude only
- Replace chat schema with composition/project schema
- Add Remotion player and renderer integration
- Add code sandbox with esbuild transforms
- Add FFmpeg binary bundling for export

---

## 7. Claude Agent SDK Integration

Ripple uses the full Claude Agent SDK to create an autonomous motion graphics assistant that can plan, execute, and iterate on animations without constant user intervention.

### 7.1 Agent Architecture

The Claude Agent operates as an autonomous system with:

- **Planning Loop** — Breaks down complex requests into executable steps
- **Tool Execution** — Calls tools to create/modify compositions, manage assets, control preview
- **Self-Correction** — Automatically retries failed code generation with error context
- **Context Management** — Maintains conversation history and project state across turns

### 7.2 Agent Tools

| Tool | Description |
|------|-------------|
| `select_animation_engine` | Choose GSAP, Framer Motion, R3F, Lottie, Rive, or CSS |
| `create_composition` | Generate new Remotion composition code |
| `modify_composition` | Edit existing code based on feedback |
| `import_lottie` | Import Lottie JSON from URL or file |
| `import_rive` | Import Rive animation file |
| `add_asset` | Register image, font, audio, or 3D model |
| `preview_frame` | Jump preview to specific frame |
| `get_composition_state` | Read current composition code and metadata |
| `list_assets` | Get available assets in current project |
| `render_preview` | Trigger preview render and get status |

### 7.3 Agent Behavior

**Autonomous Planning:**
When a user says "Create a 10-second intro with my logo flying in, then the tagline typing out, then fade to black," the agent:

1. Analyzes the request and identifies three distinct animations
2. Selects appropriate engines (GSAP for logo, GSAP+SplitText for typing, CSS for fade)
3. Creates a composition with proper sequencing
4. Renders preview and presents result
5. Waits for feedback or iteration requests

**Self-Correction Loop:**
When generated code fails to render:

1. Sandbox captures syntax/runtime error
2. Agent automatically analyzes error and attempts fix
3. Regenerates code with correction
4. Process repeats up to 3 times
5. If still failing, agent explains the issue and asks for guidance

**Target:** >80% success rate within 3 attempts

### 7.4 Agent System Prompt

The agent is configured with comprehensive knowledge of:

- All animation engines and their capabilities
- Remotion's frame-based rendering model
- GSAP plugin syntax (SplitText, MorphSVG, DrawSVG, MotionPath)
- React Three Fiber patterns for 3D
- Best practices for video composition
- Common motion graphics patterns (title cards, lower thirds, transitions)

---

## 8. Implementation Plan

### 8.1 Architecture Overview

Ripple is built on the Chorus codebase, inheriting:
- Tauri shell with React/TypeScript frontend
- TanStack Query for state management
- SQLite database with migrations
- Existing chat UI infrastructure
- API key management (user-provided Claude API key or Claude Code CLI proxy)

**Key Transformation:**
The existing multi-provider chat system becomes a single-provider Claude Agent SDK system. The chat interface remains largely unchanged—the Agent SDK operates like Claude Code, streaming responses and executing tools. The main addition is a preview pane for Remotion compositions.

**Layout:** Sidebar | Chat | Preview (three resizable panes)

### 8.2 What to Remove from Chorus

**Providers to delete:**
- `ProviderOpenAI.ts`
- `ProviderOpenRouter.ts`
- `ProviderGoogle.ts`
- `ProviderPerplexity.ts`
- `ProviderGrok.ts`
- `ProviderOllama.ts`
- `ProviderLMStudio.ts`

**Packages to remove:**
- `openai`
- `@google/genai`
- `@google/generative-ai`

**UI to simplify:**
- Multi-provider model picker → Claude-only
- Provider-specific settings → Remove
- Model comparison mode → Remove (or adapt for engine comparison)

### 8.3 What to Keep from Chorus

- **Chat infrastructure:** `MultiChat.tsx`, `ChatInput.tsx`, message streaming, tool call rendering
- **Database layer:** SQLite migrations, TanStack Query patterns, DB utilities
- **Project system:** Sidebar, project organization (adapt for compositions)
- **API key management:** Settings UI, keychain storage, Claude Code CLI proxy option
- **MCP foundation:** Tool execution patterns (adapt for Ripple-specific tools)
- **Attachments:** Drag-drop, image handling (useful for importing assets)

### 8.4 Detailed Implementation Phases

---

#### Phase 1: Strip & Scaffold

**Goal:** Clean Chorus fork with three-pane layout, Claude-only

**Tasks:**

1. **Remove unused providers**
   - Delete provider files listed above
   - Remove from `Models.ts` provider registry
   - Update imports throughout codebase

2. **Simplify package.json**
   - Remove: `openai`, `@google/genai`, `@google/generative-ai`
   - Keep: `@anthropic-ai/sdk` (will use for Agent SDK)

3. **Update Settings UI**
   - Remove OpenRouter, Google, OpenAI, etc. API key fields
   - Keep Claude API key + Claude Code CLI option
   - Simplify model picker to Claude models only

4. **Create three-pane layout**
   - Left: Project sidebar (adapt `AppSidebar.tsx`)
   - Center: Chat panel (keep `MultiChat.tsx` structure)
   - Right: Preview pane (new `PreviewPane.tsx` - placeholder for now)
   - Use `react-resizable-panels` for layout

5. **Rename/rebrand**
   - Update app name to "Ripple"
   - Update Tauri config
   - New app icon (placeholder)

**Milestone:** App launches with three panes, chat works with Claude, preview pane is empty placeholder

---

#### Phase 2: Remotion Player

**Goal:** Hardcoded animations render in preview pane

**Tasks:**

1. **Install Remotion packages**
   ```
   pnpm add remotion @remotion/player
   ```

2. **Create preview infrastructure**
   - `src/ui/components/PreviewPane.tsx` - Container with controls
   - `src/ui/components/RemotionPlayer.tsx` - Remotion Player wrapper
   - Play/pause, timeline scrubbing, frame counter

3. **Create test compositions**
   - `src/core/ripple/compositions/TestFadeIn.tsx` - Simple CSS fade
   - `src/core/ripple/compositions/TestTitleCard.tsx` - Text animation
   - Hardcoded, no dynamic code yet

4. **Wire up preview**
   - Preview pane loads and plays test compositions
   - Resolution presets dropdown (1080p, 4K, Square, Vertical)
   - Composition selector (for testing multiple)

**Milestone:** Hardcoded animation plays in preview, timeline scrubbing works

---

#### Phase 3: Database Schema

**Goal:** Composition and asset storage

**Tasks:**

1. **New migrations** (in `src-tauri/src/migrations.rs`)
   - `compositions` table (per PRD Appendix B)
   - `generation_history` table
   - `assets` table
   - Keep existing `chats`, `messages`, `message_sets` for conversation history

2. **TypeScript types**
   - `src/core/ripple/types/Composition.ts`
   - `src/core/ripple/types/Asset.ts`
   - `src/core/ripple/types/GenerationHistory.ts`

3. **Database queries**
   - `src/core/ripple/db/CompositionDB.ts`
   - `src/core/ripple/db/AssetDB.ts`
   - CRUD operations for compositions and assets

4. **TanStack Query hooks**
   - `src/core/ripple/api/CompositionAPI.ts`
   - `src/core/ripple/api/AssetAPI.ts`
   - `useCompositions()`, `useAssets()`, mutations

**Milestone:** Compositions persist to database, can be loaded into preview

---

#### Phase 4: Code Sandbox

**Goal:** Dynamic code execution with error handling

**Tasks:**

1. **Install esbuild-wasm**
   ```
   pnpm add esbuild-wasm
   ```

2. **Create sandbox infrastructure**
   - `src/core/ripple/sandbox/Compiler.ts` - esbuild TypeScript → JS
   - `src/core/ripple/sandbox/Validator.ts` - Security checks (block eval, fetch, etc.)
   - `src/core/ripple/sandbox/Runtime.ts` - Execute in isolated context

3. **Dynamic composition loading**
   - Compile composition code on the fly
   - Inject into Remotion Player
   - Error boundary with detailed error capture

4. **Hot reload**
   - Watch for code changes
   - Recompile and refresh preview (<500ms target)

5. **Error handling**
   - Capture syntax errors from esbuild
   - Capture runtime errors from execution
   - Display errors in UI with line numbers
   - Store errors for agent self-correction

**Milestone:** Can type/paste composition code → see it render in preview

---

#### Phase 5: Claude Agent SDK Integration

**Goal:** Natural language → generated code via Agent SDK

**Tasks:**

1. **Replace Anthropic provider with Agent SDK**
   - `src/core/ripple/RippleAgent.ts` - Main agent class
   - Uses `@anthropic-ai/sdk` Agent SDK patterns
   - Integrates with existing streaming infrastructure

2. **Define Ripple tools** (per PRD Appendix C)
   - `select_animation_engine` - Choose GSAP, Framer Motion, R3F, etc.
   - `create_composition` - Generate new composition code
   - `modify_composition` - Edit existing composition
   - `get_composition_state` - Read current code and settings
   - `preview_frame` - Jump to specific frame
   - `render_preview` - Trigger preview render

3. **Tool execution handlers**
   - `src/core/ripple/tools/` - One file per tool
   - Connect tools to database and preview system
   - Return results to agent

4. **System prompt**
   - Motion graphics expertise
   - Animation engine knowledge (GSAP, Framer, R3F, Lottie, Rive)
   - Remotion frame-based rendering model
   - Best practices and patterns

5. **Self-correction loop**
   - Sandbox captures errors
   - Agent receives error context automatically
   - Retry up to 3 times
   - After 3 failures, explain issue and ask user for guidance

6. **UI integration**
   - Tool calls render in chat (like current MCP tools)
   - Agent status indicators (thinking, generating, rendering)
   - "Ask Claude to fix" button on render errors

**Milestone:** "Fade in some text" generates working composition autonomously

---

#### Phase 6: GSAP Integration

**Goal:** GSAP animations sync to Remotion frames

**Tasks:**

1. **Install GSAP**
   ```
   pnpm add gsap @gsap/react
   ```

2. **GSAP-Remotion wrapper**
   - `src/core/ripple/engines/GSAPWrapper.ts`
   - Sync GSAP timeline to Remotion's `useCurrentFrame()`
   - Handle `timeline.seek()` for frame-accurate scrubbing

3. **GSAP templates**
   - `TitleCard` - Scale/fade text
   - `LowerThird` - Slide-in name/title
   - `KineticType` - SplitText character animation

4. **Update agent system prompt**
   - GSAP-specific patterns
   - SplitText plugin usage
   - Timeline composition

**Milestone:** Agent generates working GSAP kinetic typography

---

#### Phase 7: Additional Animation Engines

**Goal:** React Three Fiber, Framer Motion, Lottie, Rive support

**Tasks:**

1. **React Three Fiber**
   ```
   pnpm add @remotion/three three @react-three/fiber @react-three/drei
   ```
   - 3D templates: Logo3D, ProductShot, CameraFly
   - R3F-Remotion integration (official package)

2. **Framer Motion**
   - Framer Motion wrapper for Remotion
   - Spring physics integration
   - Templates: CardStack, ListStagger

3. **Lottie**
   ```
   pnpm add @remotion/lottie lottie-web
   ```
   - `import_lottie` tool implementation
   - LottieFiles URL support

4. **Rive**
   ```
   pnpm add @remotion/rive @rive-app/react-canvas
   ```
   - `import_rive` tool implementation
   - State machine support

5. **Engine auto-selection**
   - Agent uses `select_animation_engine` based on prompt analysis
   - Keyword detection (3D → R3F, springs → Framer, etc.)

**Milestone:** "Make a 3D logo rotation" generates R3F code

---

#### Phase 8: Export Pipeline

**Goal:** Render to video files

**Tasks:**

1. **Bundle FFmpeg**
   - Download static FFmpeg builds for macOS ARM64/x86_64
   - Include in Tauri resources (~80MB)
   - Rust helper for spawning FFmpeg

2. **Chromium for rendering**
   - Lazy download on first export (~200MB)
   - Progress indicator during download
   - Store in app data directory

3. **Remotion renderer integration**
   ```
   pnpm add @remotion/renderer @remotion/bundler
   ```
   - Server-side rendering setup
   - Frame-by-frame render to images
   - FFmpeg stitching to video

4. **Export dialog UI**
   - Format selection: MP4 (H.264), ProRes, WebM, GIF
   - Quality/bitrate configuration
   - Resolution override
   - Output path selection

5. **Background rendering**
   - Non-blocking render queue
   - Progress tracking with frame count and ETA
   - Cancel button
   - Notification on completion

**Milestone:** Export 10-second animation to MP4

---

#### Phase 9: Asset Management

**Goal:** Import and manage project assets

**Tasks:**

1. **Asset import panel**
   - Drag-drop zone in sidebar or dedicated panel
   - Support: images, fonts, audio, video, 3D models, Lottie, Rive
   - Thumbnail generation

2. **Asset browser**
   - Grid view with thumbnails
   - Filter by type
   - Search by name

3. **Asset tools**
   - `add_asset` tool implementation
   - `list_assets` tool implementation
   - Agent can reference assets in compositions

4. **3D model support**
   - `.glb`, `.gltf` import
   - Preview in asset browser
   - Integration with R3F compositions

**Milestone:** Can import logo.png and use in composition via chat

---

#### Phase 10: Polish & Production

**Goal:** Production-ready UX

**Tasks:**

1. **Generation history**
   - View past generations per composition
   - Rollback to previous version
   - Diff view between versions

2. **Template library**
   - Built-in templates organized by engine
   - Template browser UI
   - Quick-start from template

3. **Keyboard shortcuts**
   - Space: Play/pause preview
   - Left/Right: Frame step
   - Cmd+E: Export
   - Cmd+Enter: Send message

4. **Timeline improvements**
   - Frame markers
   - Keyframe visualization (if possible)
   - Zoom in/out

5. **App distribution**
   - macOS code signing
   - DMG installer
   - App icon and branding
   - Notarization

**Milestone:** Complete user flow without crashes, ready for beta

---

## 9. Success Metrics

### 9.1 User Flow Target

A new user should complete this flow in **under 5 minutes**:

1. Open Ripple, create new project
2. Type: "Create a title card with 'Hello World' scaling up over 2 seconds"
3. See preview within 3 seconds
4. Type: "Make the text blue and add a drop shadow"
5. See updated preview
6. Export to MP4

### 9.2 Technical Benchmarks

| Metric | Target |
|--------|--------|
| Code generation latency | < 2 seconds |
| Preview hot reload | < 500ms |
| Agent self-correction success rate | > 80% within 3 attempts |
| Export time (10s @ 1080p) | < 30 seconds |
| App cold start | < 3 seconds |
| Bundle size (without Chromium) | < 150MB |

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Remotion license concerns | Revideo fork as fallback (MIT, compatible API) |
| GSAP timeline sync issues | Extensive testing, fallback to CSS animations |
| Chromium bundle size | Lazy download on first export, clear messaging |
| Claude rate limits | Local caching of templates, retry with backoff |
| Complex animations fail | Template library reduces from-scratch generation |
| R3F performance | LOD system, automatic quality scaling |
| Engine selection errors | Allow manual engine override in UI |
| Bundle size with all engines | Code splitting, lazy load engines on first use |
| Agent loop gets stuck | Maximum iteration limits, graceful fallback to user |

---

## 11. Future Roadmap

Post-MVP feature releases:

- **v1.1:** Audio sync, waveform visualization, audio-reactive animations
- **v1.2:** Template marketplace (organized by engine)
- **v1.3:** Collaboration (share compositions as code)
- **v1.4:** LottieFiles integration (browse/import directly)
- **v1.5:** Rive community files integration
- **v2.0:** Theatre.js visual timeline editor integration
- **v2.1:** Advanced 3D features (HDRI, PBR materials, physics)
- **v2.2:** After Effects project export (.aep) for professional handoff
- **v3.0:** After Effects expression import/conversion

---

## Appendix A: Dependencies

### A.1 NPM Packages

**Remotion:**
- remotion, @remotion/player, @remotion/renderer, @remotion/bundler
- @remotion/three, @remotion/lottie, @remotion/rive

**Animation:**
- gsap, @gsap/react
- framer-motion
- three, @react-three/fiber, @react-three/drei
- lottie-web, @rive-app/react-canvas

**AI:**
- @anthropic-ai/sdk (Claude Agent SDK)

**Code Sandbox:**
- esbuild-wasm

**UI:**
- @monaco-editor/react (for future code view feature)
- react-resizable-panels
- @tanstack/react-query
- @tauri-apps/api

### A.2 Rust Crates

- keyring (OS keychain for API keys)
- reqwest (HTTP client with streaming)
- tokio-stream (SSE parsing)
- tauri-plugin-shell (spawn FFmpeg/Chromium)

### A.3 Bundled Binaries

- **FFmpeg:** Static build for macOS ARM64/x86_64 (~80MB)
- **Chromium:** Lazy-downloaded on first export (~200MB)

---

## Appendix B: Database Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE compositions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 1920,
  height INTEGER NOT NULL DEFAULT 1080,
  fps INTEGER NOT NULL DEFAULT 30,
  duration_frames INTEGER NOT NULL,
  code TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'gsap',
  thumbnail_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE generation_history (
  id TEXT PRIMARY KEY,
  composition_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  generated_code TEXT NOT NULL,
  engine TEXT NOT NULL,
  error_message TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'font', 'audio', 'video', '3d-model', 'lottie', 'rive')),
  path TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## Appendix C: Agent Tool Schemas

```typescript
const RIPPLE_AGENT_TOOLS = [
  {
    name: "select_animation_engine",
    description: "Choose the best animation engine for the user's request",
    input_schema: {
      type: "object",
      properties: {
        engine: { 
          type: "string", 
          enum: ["gsap", "framer-motion", "react-three-fiber", "lottie", "rive", "css"]
        },
        reasoning: { type: "string" }
      },
      required: ["engine", "reasoning"]
    }
  },
  {
    name: "create_composition",
    description: "Create a new Remotion composition with the selected animation engine",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        engine: { type: "string" },
        width: { type: "number", default: 1920 },
        height: { type: "number", default: 1080 },
        fps: { type: "number", default: 30 },
        durationInSeconds: { type: "number" },
        code: { type: "string" }
      },
      required: ["id", "engine", "durationInSeconds", "code"]
    }
  },
  {
    name: "modify_composition",
    description: "Modify existing composition based on user feedback",
    input_schema: {
      type: "object",
      properties: {
        compositionId: { type: "string" },
        modification: { type: "string" },
        currentCode: { type: "string" },
        errorContext: { type: "string" }
      },
      required: ["compositionId", "modification", "currentCode"]
    }
  },
  {
    name: "get_composition_state",
    description: "Get current composition code, settings, and render status",
    input_schema: {
      type: "object",
      properties: {
        compositionId: { type: "string" }
      },
      required: ["compositionId"]
    }
  },
  {
    name: "list_assets",
    description: "List all assets available in the current project",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        type: { type: "string", enum: ["image", "font", "audio", "video", "3d-model", "lottie", "rive", "all"] }
      },
      required: ["projectId"]
    }
  },
  {
    name: "import_lottie",
    description: "Import a Lottie animation from LottieFiles or local file",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string" },
        name: { type: "string" }
      },
      required: ["source", "name"]
    }
  },
  {
    name: "import_rive",
    description: "Import a Rive animation file",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string" },
        name: { type: "string" },
        artboard: { type: "string" },
        animation: { type: "string" }
      },
      required: ["source", "name"]
    }
  },
  {
    name: "add_asset",
    description: "Register an asset for use in compositions",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["image", "font", "audio", "video", "3d-model", "lottie", "rive"] },
        localPath: { type: "string" }
      },
      required: ["name", "type", "localPath"]
    }
  },
  {
    name: "preview_frame",
    description: "Jump preview to a specific frame",
    input_schema: {
      type: "object",
      properties: {
        frame: { type: "number" }
      },
      required: ["frame"]
    }
  },
  {
    name: "render_preview",
    description: "Trigger a preview render and return status",
    input_schema: {
      type: "object",
      properties: {
        compositionId: { type: "string" },
        quality: { type: "string", enum: ["draft", "full"] }
      },
      required: ["compositionId"]
    }
  }
];
```
