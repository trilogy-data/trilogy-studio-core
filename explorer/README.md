# Trilogy Explorer

A focused, AI-native desktop app for exploring data with Trilogy. Built on the same primitives as Trilogy Studio, but stripped down to one product idea: **a Project is a bundle of files and chats that share context.**

> Status: pre-alpha. Phase 1 skeleton. Not yet packaged as a desktop app — see [Plan](#plan) below.

---

## Why a separate app

Studio is a broad IDE — editors, dashboards, jobs, models, multiple connections, the works. Explorer narrows the surface to **chat first, files second, everything else hidden**. The bet: a tighter chat-driven UX gets us to the questions users actually ask faster, and what we learn here makes Studio better.

Explorer must never become a fork. Both apps share lib/.

---

## Load-bearing principles

These exist so we don't drift apart from Studio. **Read these before adding anything to explorer.**

### 1. `lib/` is the single source of truth

Explorer **never** forks code from [lib/](../lib/). If explorer needs a behavior lib doesn't expose, the change happens **in lib** — as a new prop, slot, export, or option — not as a copy living in explorer.

If you find yourself reaching for copy-paste, stop. Open lib, find the component or function, and extend it there. Studio gets the improvement for free, which is the whole point.

### 2. Improvements flow both ways

Anything explorer adds that isn't explorer-specific belongs in lib:
- New chat tools → [lib/llm/](../lib/llm/)
- New providers → [lib/llm/](../lib/llm/)
- New artifact renderers → [lib/components/](../lib/components/)
- New chat features (file context, vision, retrieval) → [lib/llm/](../lib/llm/) + [lib/chats/](../lib/chats/)

What stays in explorer:
- Project sidebar, project file picker, project file viewer
- Tauri-specific FS/keychain bridges
- Native menus, command palette

Rule of thumb: if Studio could plausibly want it someday, build it in lib.

### 3. Host adapter pattern for storage

[chatStore](../lib/stores/chatStore.ts) and the future `projectStore` must accept a pluggable storage backend. Studio plugs in `localStorage`/IndexedDB; explorer plugs in Tauri FS + OS keychain. Lib defines the interface.

This is a small refactor in lib but it's load-bearing — without it, the two apps diverge on persistence and we can't share chats.

### 4. Workspace link, not republish

Explorer depends on `@trilogy-data/trilogy-studio-components` via `link:../lib`, the same pattern Studio uses. Lockstep dev: edit lib, restart explorer, see the change. Never bump a version of lib in explorer that isn't also live for Studio.

### 5. Hosted pyserver in v0; no bundled Python

Trilogy validation/compilation lives in [pyserver](../pyserver/). v0 explorer uses a hosted instance. A Tauri sidecar that spawns pyserver locally is a Phase 6+ problem — Python bundling is ugly and we don't want it blocking shipping a chat experience.

DuckDB-wasm queries don't need pyserver, so file-only flows work fully offline.

### 6. No new abstractions until we feel pain

The only genuinely new concept explorer introduces is **Project**. Resist adding more. If a component or store *might* be useful later, leave it out until the second use case shows up.

---

## Architecture

```
trilogy-studio-core/
├── lib/                      # source of truth, unchanged
├── src/                      # studio (existing)
├── pyserver/                 # backend, hosted
└── explorer/                 # THIS APP
    ├── src/                  # Vue 3 + Vite SPA
    │   ├── App.vue
    │   ├── main.ts
    │   └── components/       # explorer-only UI (ProjectSidebar etc.)
    └── src-tauri/            # Rust shell (added in Phase 1.5)
        ├── Cargo.toml
        └── src/main.rs
```

Explorer imports from lib via subpath exports:
- `@trilogy-data/trilogy-studio-components/llm` — providers, prompts, tool loop
- `@trilogy-data/trilogy-studio-components/connections` — DuckDB, BigQuery, Snowflake
- `@trilogy-data/trilogy-studio-components/stores` — chatStore, llmStore, connectionStore, projectStore (new)
- `@trilogy-data/trilogy-studio-components/views` — LLMView, components

### Stack
- **Shell**: Tauri 2 (Rust + WebView2/WKWebView/webkitgtk)
- **UI**: Vue 3 + Vite, same as Studio
- **State**: Pinia, same stores as Studio
- **LLM**: Anthropic / OpenAI / Google / OpenRouter via [lib/llm/](../lib/llm/)
- **Local data**: duckdb-wasm via [lib/connections/duckdb.ts](../lib/connections/duckdb.ts)
- **Trilogy compile**: hosted pyserver (Phase 1) → Tauri sidecar (Phase 6+)

### Why Tauri 2
- ~10MB binaries vs ~150MB for Electron
- OS keychain plugin for API key storage (real security upgrade over `localStorage`)
- Rust shell gives us room to spawn pyserver as a sidecar later
- Native menus, file dialogs, FS access

Tradeoff: WebView differences across platforms (Linux webkitgtk is the rough one). Studio already runs in browsers everywhere, so we know the Vue side survives.

---

## The Project model

A Project is a directory on disk:

```
~/.trilogy-explorer/projects/<slug>/
├── project.json          # name, description, default LLM/data connection
├── files/                # user-attached files
├── chats/<chat-id>.json  # reuses ChatSessionData verbatim
└── artifacts/            # exported charts/queries (later)
```

How file types enter LLM context:

| Extension | Treatment |
|---|---|
| `.preql` `.trilogy` | imported via existing [ChatImport](../lib/chats/chat.ts) flow |
| `.csv` `.parquet` | registered as duckdb-wasm tables, queryable via Trilogy |
| `.md` `.txt` `.sql` | inlined into system prompt as named context blocks |
| `.png` `.jpg` | multimodal blocks for vision-capable providers |

This is the **only** non-trivial new abstraction. Everything else is reuse from lib.

---

## Plan

### Phase 0 — Decisions (✓ done)
Tauri 2, link-to-lib, hosted pyserver, principles agreed.

### Phase 1 — Skeleton (in progress)
- explorer/ folder with Vue 3 + Vite
- Workspace-link `@trilogy-data/trilogy-studio-components`
- Mount existing [LLMView.vue](../lib/views/LLMView.vue) full-screen — proves reuse works end-to-end
- Single LLM provider, single hardcoded DuckDB-wasm connection

### Phase 1.5 — Tauri shell
- `pnpm tauri init` inside explorer/
- App identifier, window config
- Verify dev + build on at least one platform

### Phase 2 — Project model
- `Project` / `ProjectFile` types + `projectStore` **in lib/**
- Tauri commands: `project_list`, `project_load`, `project_save`, `chat_save`, `chat_load`
- Browser-fallback storage adapter so `projectStore` works in Studio too
- `ProjectSidebar` in explorer; create / rename / delete

### Phase 3 — File attachment
- Tauri file dialog + drag-drop
- `.csv` / `.parquet` → duckdb-wasm `registerFile`
- `.preql` → existing import flow
- File preview reusing [DataTable.vue](../lib/components/DataTable.vue), [CodeBlock.vue](../lib/components/CodeBlock.vue), [MarkdownRenderer.vue](../lib/components/MarkdownRenderer.vue)

### Phase 4 — Files in LLM context
- Extend [chatAgentPrompt.ts](../lib/llm/chatAgentPrompt.ts) `buildChatAgentSystemPrompt` with `attachedFiles: ProjectFile[]`
- New tools `read_project_file`, `list_project_files` (added to lib)
- Vision blocks for image files via existing provider adapters

### Phase 5 — Native polish
- API keys → Tauri stronghold/keychain plugin
- Native menus (File→New Project, etc.)
- File watcher → reactive project state
- Cmd+K command palette

### Phase 6+ — Offline
- Tauri sidecar that spawns pyserver locally (Python bundling)
- Or: rewrite Trilogy hot-path in Rust

---

## Risks

1. **pyserver bundling.** Trilogy compile is HTTP today. Phase 1 is hosted-only. Real offline support is hard.
2. **Storage adapter refactor.** Adding a host adapter to lib stores is a small but real change. If we cut corners and hardcode `localStorage` deeper into stores, we'll regret it within weeks.
3. **WebView quirks on Linux.** webkitgtk lags WebView2/WKWebView. Validate early.
4. **Discipline cost of "lib is source of truth".** Tempting to just copy a component into explorer when lib doesn't quite fit. Don't. Lift the extension into lib instead.

---

## Where things live (cheat sheet)

| Capability | Location | Notes |
|---|---|---|
| ProjectModel + projectStore | **lib/** | Studio could adopt Projects too |
| Storage host adapter interface | **lib/stores/** | Studio uses browser, explorer uses Tauri FS |
| ProjectSidebar / FileAttachmentPicker / ProjectFileViewer | **explorer/src/** | explorer-specific UX |
| Tauri FS / keychain bridges | **explorer/src-tauri/** + thin TS wrapper | |
| Chat persistence | **lib/** chatStore | swap storage backend per host |
| LLM API keys | explorer: Tauri keychain · studio: localStorage | |
| Trilogy compile / validate | pyserver (hosted v0) → sidecar later | |
| LLM providers, tool loop, prompts | **lib/llm/** | never duplicate |
| Charts, tables, markdown | **lib/components/** | never duplicate |

---

## Dev

```bash
# from repo root
pnpm install ./lib -D       # link lib (same as studio)
cd explorer
pnpm install
pnpm dev                    # browser-only for now (Phase 1)

# Phase 1.5+
pnpm tauri dev              # native shell
```
