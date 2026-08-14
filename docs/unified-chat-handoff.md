# Unified Global Chat — Handoff

Branch: `unified_chat_ui` (uncommitted; coexists with the working-tree connection-resolution
fixes in `dashboardStore.ts` / dashboard tests). Full design rationale:
`~/.claude/plans/rosy-drifting-bunny.md`. Status: all 9 phases implemented; 1393 unit tests,
73/73 chromium e2e, typecheck clean.

## What exists now

One persistent right-panel chat replaces the per-dashboard assistant. Conversations are
app-global, follow the user across screens, and can drive the UI (navigate, edit editors,
manage dashboards, run jobs, search docs, compact themselves). Editor refinement keeps its
inline accept/discard UI but runs on the shared chat pipeline.

## Touchpoints by subsystem

### Panel shell (Phase 1)

| File                                                | Role                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/stores/useGlobalChatPanel.ts`                  | Module singleton: open/width/activePanelChatId/view, `chatPanel` URL-hash key, Ctrl+Shift+. listener (no-ops in fullscreen)                  |
| `lib/components/llm/GlobalChatPanel.vue`            | Panel UI: header (rename, LLM select, stop, new, close), backoff banner, running-elsewhere badge, resize handle; body = shared `LLMChat.vue` |
| `lib/components/llm/GlobalChatConversationList.vue` | List/switch/rename/delete; "Dashboard sessions" group; editor-source chats excluded                                                          |
| `lib/components/layout/SidebarLayout.vue`           | New `#right-panel` slot — third flex child, deliberately NOT in split.js's `splitElements`                                                   |
| `lib/views/IDE.vue`                                 | Mounts panel + registers key listener/initial load                                                                                           |
| `lib/components/sidebar/Sidebar.vue`                | Bottom-rail AI icon (`sidebar-icon-ai-panel`) + pulsing running dot                                                                          |

### Tool registry (Phases 2–4, 6–7)

| File                                                            | Role                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `lib/llm/registry/{types,toolRegistry,renderToolList,index}.ts` | Registry core. `getSharedRegistry()` is the app-wide instance                                                                       |
| `packs/chatPacks.ts`                                            | data/artifacts/base packs wrapping legacy `CHAT_TOOLS` + `ChatToolExecutor` (same object identity)                                  |
| `packs/navigationPack.ts`                                       | `get_app_state`, `navigate_to_screen`, `open_dashboard`, `open_editor`                                                              |
| `packs/editorPack.ts`                                           | `list/read/create/update editors`, `run_editor_query`, `validate_query` (store-backed, works headless)                              |
| `packs/dashboardPack.ts`                                        | DASHBOARD_TOOLS with optional `dashboard_id` + `list/create_dashboard`, `refresh_dashboard_item`; calls fork guard before mutations |
| `packs/jobsPack.ts`                                             | `list_job_stores/files`, `submit_store_job`, `await_job` (bounded in-tool poll), `get_store_state`, `get_recent_query_history`      |
| `packs/docsPack.ts` + `lib/llm/docsIndex.ts`                    | `search_docs`/`read_doc`/`open_documentation` over tutorial tree + generated syntax reference                                       |
| `packs/contextPack.ts`                                          | `compact_conversation` (global context only — kept out of 'base' so legacy toolsets stay byte-identical)                            |

### Runtime & context plumbing (Phase 3)

| File                                   | Role                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/llm/globalChatRuntime.ts`         | `sendGlobalChatMessage` (delivers pending nav note → executeMessage with global toolset + frozen prompt + requestCompaction), `buildUnifiedSystemPrompt` |
| `lib/llm/navigationContextInjector.ts` | Debounced (1.5s) latest-wins nav notes → `Chat.pendingContextNote`; never fires an LLM turn                                                              |
| `lib/stores/screenBridge.ts`           | Mounted-screen capability registry (Dashboard.vue + ReportLayout.vue register; Editor.vue not yet)                                                       |
| `lib/llm/toolLoopCore.ts`              | `executionTime` now surfaces in tool-result text; SYSTEM_INPUT markers exported                                                                          |

### Dashboard migration (Phase 5)

- `DashboardChatPanel.vue` **deleted**. Fork guard now `ensureChatForkForMutation` in
  `lib/llm/dashboardAgentRuntime.ts` (+ `MUTATING_DASHBOARD_TOOLS`).
- `lib/components/dashboard/useDashboardAgentAutoRun.ts` — renderless: consumes
  `dashboardStore.pendingChatPrompts`, fires `startDashboardAgentRun`; used by Dashboard.vue
  and ReportLayout.vue (CTA/creator flows open the panel on the returned chatId).
- `dashboardStore.pendingChatPrompts` API kept — explorer `App.vue` and overseer
  `create_report` depend on it.

### Refinement rebase (Phase 8)

- `lib/llm/editorRefinementRuntime.ts` — ephemeral `source:'editor'` chats on
  `chatStore.executeMessage` (frozen prompt, `maxIterations: 20`); `LLMEditorRefinement.vue`
  reads chatStore state. Old loop machinery removed from `editorStore`;
  `lib/composables/useEditorRefinement.ts` (dead duplicate) deleted.

### Compaction (Phase 7)

- `lib/llm/compactConversation.ts` — `COMPACTION_THRESHOLD_TOKENS = 200_000`; archived-flag
  design (never deletes); safe cut points never split toolCalls/toolResults pairs;
  fast-model summary + programmatic artifact index. Auto-trigger sits in
  `chatStore.executeMessage` before the loop; usage recorded per response into
  `Chat.lastContextTokens`.

## Contracts that must not drift

1. **Byte-stable toolsets.** `getToolsetForContext()` memoizes per context; the golden test
   (`toolRegistry.test.ts`: chat ≡ legacy `CHAT_TOOLS`) is the release gate. Any tool
   definition change busts the Anthropic prompt-cache prefix for existing conversations.
2. **Frozen system prompts.** Global + refinement prompts snapshot once per conversation.
   Live state flows via `get_app_state` and append-only nav notes only.
3. **Navigation never wakes the agent.** Notes go to `Chat.pendingContextNote` (latest-wins)
   and deliver on the next send. Do not route them through `pendingInjections` (its drain
   calls `executeMessage`).
4. **Chat serialization compat.** New `Chat` fields are optional with constructor defaults;
   `storage: 'ephemeral'` is excluded from persistence by the existing `serializeChats`
   filter.

## Refinement session (2026-08-10)

- **Auto-naming**: `maybeGenerateChatName` in `globalChatRuntime.ts` runs after every
  `sendGlobalChatMessage`; fast-model rename fires only while the chat still matches the
  `Chat <time>` constructor default (never overwrites a user title, re-checked after the
  async call). Failures are swallowed.
- **Clear conversation**: broom button in the panel header (`global-chat-clear`) — confirm,
  stop if executing, `clearChatMessages` + `clearFrozenPrompt`. `Chat.clearMessages` now also
  resets `lastContextTokens` so the compaction trigger doesn't fire on an emptied chat.
- **Inline artifacts in the panel**: `GlobalChatPanel` fills LLMChat's `#artifact` slot with
  `ChatArtifact.vue` (tables/charts/markdown/code at 320px; only the newest artifact expands,
  older ones collapse — `ChatArtifact` now uses `v-if` so collapsed ones don't mount).
  `results` artifacts now also get inline carrier messages (was chart/markdown only).
  **Load-bearing fix**: artifact-carrier messages (artifact, empty content, no toolCalls) are
  excluded from `getLLMMessages()` — Anthropic 400s on empty-content messages mid-history, so
  the old carriers were a latent multi-turn failure. Carriers are UI-only; the LLM sees the
  artifact via its tool-result text. `LLMChat.visibleMessages` hides carriers when
  `renderArtifacts` is off (split view keeps its pane, no empty bubbles). Panel drag-resize
  now dispatches a window `resize` on mouseup so vega charts re-measure.

## Refinement candidates (remaining)

- **UX pass on the panel**: message density, empty states.
- **Manual validation with a real LLM**: the slow-dashboard flow end-to-end; confirm
  `cacheReadTokens > 0` on turn 2+ across navigation (now recorded per response).
- **llms screen slimming**: the old chat screen + `ChatCreatorModal` now overlap the panel;
  decide what remains (validation bench, connection management).
- **Union-size check on weak models**: ~40 tools may degrade OpenRouter/DeepSeek tool
  selection — a `global-lite` context is a one-line `TOOLSET_PACKS` change.
- **Deferred items**: mobile overlay variant; panel in fullscreen dashboard mode;
  `update_editor_contents` optimistic-concurrency hash; Editor.vue screenBridge
  registration (in-editor query runs render in the results pane); explorer-shell migration
  off `pendingChatPrompts`; compaction summary rendering in the UI (archived messages
  currently still render; a collapsed "compacted" divider would be nicer).

## Verify

```bash
pnpm typecheck
pnpm vitest run lib/
npx playwright test --project=chromium   # includes e2e/test-global-chat-panel.spec.ts
```
