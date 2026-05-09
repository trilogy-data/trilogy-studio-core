# Trilogy Explorer

A focused, AI-native desktop app for exploring data with Trilogy. Built on the same primitives as Trilogy Studio, but stripped down to one product idea: **a Project is a bundle of files and chats that share context.**

> Status: pre-alpha. Phases 1, 2, 2.5, 1.5, 3 (browser slice), 4 (tool execution), and 3.5 (native FS via swappable kv backend) done. End-to-end flow: create projects, attach `.preql` / `.sql` / `.md` files, chat with tools enabled — LLM compiles Trilogy → SQL via hosted resolver and executes against an in-browser DuckDB connection. In Tauri, all persisted data (projects, chats, editors) lives as JSON files under the app data dir; in browser dev, IndexedDB. Same lib code, host-chosen backend.

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

A Project's unique value is **multi-chat grouping** plus **a curated set of editor references**. It is *not* a parallel file abstraction — it doesn't own file content, file types, or Trilogy parse state. Those concerns already have homes in lib:

- **Files** live in [`EditorStore`](../lib/stores/editorStore.ts). A Project just holds `editorIds: string[]`. The same editor can belong to multiple projects.
- **Trilogy semantics** live in [`ModelConfig`](../lib/models/model.ts). When `.preql` editors in a project are parsed, a `ModelConfig` is created/updated as a side effect — Project never duplicates concept/datasource state.
- **Chats** live in [`chatStore`](../lib/stores/chatStore.ts). Project holds `chatIds: string[]`; each chat retains its own imports/messages/artifacts.

```
Project ──▶ editorIds[]  ──▶ EditorStore
        ──▶ chatIds[]    ──▶ chatStore
        ──▶ (parse side-effect) ──▶ ModelConfig
```

When Tauri lands and a Project becomes a directory on disk, the directory holds editor *contents* (`.preql`, `.csv`, `.md` etc.) and the storage adapter rehydrates them as Editors at load time. Same model, different persistence.

For the file types we care about (CSV / parquet / markdown / image), `EditorType` will need to grow beyond its current `'trilogy' | 'sql' | 'preql' | 'python'` set. That's a Phase 3 lib change — done in lib so studio inherits it.

---

## Plan

### Phase 0 — Decisions (✓ done)
Tauri 2, link-to-lib, hosted pyserver, principles agreed.

### Phase 1 — Skeleton (✓ done)
- explorer/ folder with Vue 3 + Vite
- `@lib/*` alias to lib source (no rebuild needed in dev)
- Pinia + reactive boot in [main.ts](src/main.ts)

### Phase 2 — Project model + browser persistence (✓ done)
- [`Project`](../lib/projects/project.ts) + `ProjectFileData` types **in lib/**
- [`useProjectStore`](../lib/stores/projectStore.ts) Pinia store **in lib/**
- Reused lib's existing [`AbstractStorage`](../lib/data/storage.ts) abstraction — added `saveProjects` / `loadProjects` / `deleteProject` / `clearProjects` with concrete no-op defaults so GitHub/Remote storages keep compiling
- [`LocalStorage`](../lib/data/localStorage.ts) implements project persistence in a new IndexedDB bucket
- [`ProjectSidebar.vue`](src/components/ProjectSidebar.vue) (explorer-only): list + create + rename + delete
- [`useProjectPersistence`](src/composables/useProjectPersistence.ts) wires the host adapter — swap in a Tauri storage in Phase 1.5 without touching the store

### Phase 2.5 — Chat integration (✓ done)
- [`useChatPersistence`](src/composables/useChatPersistence.ts) and [`useLLMPersistence`](src/composables/useLLMPersistence.ts) wire chats + LLM connections via lib's `LocalStorage`
- [`ProviderSetup.vue`](src/components/ProviderSetup.vue) lets the user add an Anthropic / OpenAI / OpenRouter / Demo provider
- [`ChatPanel.vue`](src/components/ChatPanel.vue) lists project chats, mounts lib's [`LLMChatSplitView`](../lib/components/llm/LLMChatSplitView.vue), and routes `onSendMessage` to the provider's `generateCompletion`
- No tools yet — tool execution lands in Phase 3 once files arrive

### Phase 1.5 — Tauri shell (✓ scaffolded, dev unverified)
- [src-tauri/](src-tauri/) Cargo + Rust entrypoint, [tauri.conf.json](src-tauri/tauri.conf.json), default capabilities
- `pnpm tauri:dev` to verify; first compile on Windows is ~5–10 min
- Bundle icons not yet generated (`bundle.active: false`); run `pnpm tauri icon` before `pnpm tauri:build`
- Tauri-backed `AbstractStorage` subclass (Phase 3) plugs into `useProjectPersistence` without store changes

### Phase 3 — File attachment (browser slice ✓ done)
- `EditorType` extended in lib with `'markdown'` (lib change — studio inherits, fileTypes tests still green)
- [`useEditorPersistence`](src/composables/useEditorPersistence.ts) wires editors via lib's `LocalStorage`
- [`EditorAttachments.vue`](src/components/EditorAttachments.vue): drag-drop + file picker creates Editors and links them via `projectStore.addEditorToProject`
- Supported now: `.preql`, `.sql`, `.py`, `.md`, `.markdown`, `.txt`
- Deferred: `.csv` / `.parquet` (need a separate "data asset" abstraction — Editor's code-execution model doesn't fit), images, and content registration into duckdb-wasm

### Phase 3.5 — Native FS via swappable kv backend (✓ done)
- Lib refactor: [`idbKv`](../lib/data/idbKv.ts) gained a `setKvBackend(backend)` hook and exports a `KvBackend` interface. Default behaviour (IDB → memory fallback) unchanged for studio.
- Rust commands `kv_get` / `kv_set` / `kv_del` / `kv_keys` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) read and write files under the app data dir.
- [`tauriKvBackend`](src/storage/tauriKvBackend.ts) implements `KvBackend` by routing to those commands; [main.ts](src/main.ts) installs it at boot when `__TAURI_INTERNALS__` is present.
- Net effect: lib's `LocalStorage` keeps working unchanged in both shells. Browser uses IDB; Tauri writes JSON files to disk. Studio inherited the hook for free; if it ever ships a native shell, the same plug-in pattern works.

### Phase 3.6 — Project-as-directory + advanced files (next)
- Project = a real directory under `~/.trilogy-explorer/projects/<slug>/` rather than a JSON entry — files visible to the OS, attachable from anywhere
- Tauri's `dialog`/`fs` plugins replace the browser file input in `EditorAttachments.vue`
- New "data asset" abstraction in lib for `.csv` / `.parquet` (separate from Editor)
- Trilogy parsing pipeline: `.preql` editors → derived `ModelConfig` for query validation
- File preview pane reusing [DataTable.vue](../lib/components/DataTable.vue), [CodeBlock.vue](../lib/components/CodeBlock.vue), [MarkdownRenderer.vue](../lib/components/MarkdownRenderer.vue)

### Phase 4 — Tool execution (✓ done)
- [`useExecutionContext`](src/composables/useExecutionContext.ts) bootstraps `userSettingsStore` (default resolver URL), persists/loads connections via `LocalStorage`, ensures a default in-browser `duckdb-local` connection, and instantiates [`TrilogyResolver`](../lib/stores/resolver.ts) + [`QueryExecutionService`](../lib/stores/queryExecutionService.ts)
- [`ChatPanel.vue`](src/components/ChatPanel.vue) now routes `onSendMessage` through `chatStore.executeMessage`, which runs the full lib tool loop (`runToolLoop` + `ChatToolExecutor` + `CHAT_TOOLS`)
- New chats default to the bootstrapped DuckDB connection; new editors get the project's connection so they show up as available imports in the system prompt
- Tools enabled out of the box: `run_trilogy_query`, `chart_trilogy_query`, `add_import`, `remove_import`, `list_available_imports` — all from lib, no fork
- Resolver defaults to the hosted [trilogy-service.fly.dev](https://trilogy-service.fly.dev); offline support is Phase 6 work

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

# browser dev (fast feedback loop)
pnpm dev                    # http://localhost:5174

# native shell (Tauri 2 — first run compiles ~5–10 min on Windows)
pnpm tauri:dev
```

### Native build prerequisites
- Rust toolchain (`cargo`, `rustc`)
- Windows: WebView2 (preinstalled on Windows 10/11), MSVC build tools
- macOS: Xcode CLT
- Linux: webkit2gtk, build-essential

For `pnpm tauri:build`, you also need bundle icons. Run `pnpm tauri icon path/to/source.png` once to generate the platform-specific assets, then flip `bundle.active` to `true` in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json).
