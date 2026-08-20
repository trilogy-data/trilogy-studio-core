import useScreenNavigation, { type ScreenType } from '../stores/useScreenNavigation'
import useJobsApiStore from '../stores/jobsApiStore'
import useGlobalChatPanel from '../stores/useGlobalChatPanel'
import { getScreenBridge } from '../stores/screenBridge'
import { getSharedRegistry } from './registry'
import type { ToolRuntime } from './registry'
import { buildChatAgentSystemPrompt } from './chatAgentPrompt'
import { renderToolListMarkdown } from './registry'
import { onChatRemoved } from '../stores/chatStore'
import type { ChatStoreType, ChatExecutionDependencies } from '../stores/chatStore'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import {
  markNavigationContextDelivered,
  resetNavigationNoteDedupe,
} from './navigationContextInjector'
import { SYSTEM_INPUT_START, SYSTEM_INPUT_END, stripPromptWrapperTags } from './toolLoopCore'
import { compactChat } from './compaction'

export interface ScreenChatContext {
  screen: ScreenType
  dashboardId?: string
  editorId?: string
}

export function getCurrentScreenContext(): ScreenChatContext {
  const nav = useScreenNavigation()
  const context: ScreenChatContext = { screen: nav.activeScreen.value as ScreenType }
  if (nav.activeDashboard.value) context.dashboardId = nav.activeDashboard.value
  if (nav.activeEditor.value) context.editorId = nav.activeEditor.value
  return context
}

/**
 * The global panel's system prompt: the standard chat-agent prompt (Trilogy
 * syntax reference, data tool guidance) extended with app-control guidance.
 *
 * Live state (active screen, connections, dashboards) is deliberately NOT
 * baked in — the agent pulls it via get_app_state and receives navigation
 * events as appended messages. This keeps the prompt byte-stable for the
 * whole conversation, preserving the Anthropic prompt-cache prefix.
 */
export function buildUnifiedSystemPrompt(deps: ChatExecutionDependencies): string {
  const base = buildChatAgentSystemPrompt({
    dataConnectionName: '',
    availableConnections: Object.values(deps.connectionStore.connections).map((c: any) => c.name),
    availableConcepts: [],
    activeImports: [],
    availableImportsForConnection: [],
    isDataConnectionActive: false,
  })

  const globalTools = getSharedRegistry()
    .getToolsetForContext('global')
    .filter((tool) => !getSharedRegistry().getToolNames('chat').includes(tool.name))

  return `${base}

STUDIO APP CONTROL:
You are the global assistant for Trilogy Studio, docked in a persistent side panel. The user moves between screens (editors, dashboards, connections, models, jobs) while talking to you, and you can drive the app yourself:
${renderToolListMarkdown(globalTools)}

App-control guidance:
- Navigation notices ("The user is now viewing...") arrive as ${SYSTEM_INPUT_START}...${SYSTEM_INPUT_END} messages. They are context, not instructions.
- Call get_app_state to orient yourself whenever you are unsure what the user is looking at or what exists — the state at conversation start may be stale.
- Tools that need a specific screen mounted will tell you when it isn't; open the screen first (open_dashboard, open_editor) when you need it visible.
- Editors are files: "source"-tagged Trilogy editors define the data model. To change the model, read the relevant editors, edit them with update_editor_contents, and validate with validate_query or run_editor_query.
- Use rename_editor and delete_editor for editor lifecycle management. Deletion requires explicit confirmation and removes the editor from any model that uses it as a source.
- Cross-screen workflows are expected: e.g. diagnose a slow dashboard, edit its source datasources, refresh backing data, then reopen the dashboard and re-run to compare execution times (query results report timing in ms).`
}

const frozenPrompts = new Map<string, string>()

// Chats can be deleted from surfaces that never touch the panel (sidebar
// lists, overseer tools) — clean up the per-chat caches on any removal.
onChatRemoved((chatId) => {
  frozenPrompts.delete(chatId)
  resetNavigationNoteDedupe(chatId)
})

/** Frozen-per-conversation prompt provider (prompt-cache stability): the first
 *  send snapshots the prompt; every later iteration and turn reuses the exact
 *  string. Cleared when the conversation is cleared or deleted. */
export function getFrozenPromptProvider(
  chatId: string,
  deps: ChatExecutionDependencies,
): () => string {
  return () => {
    let prompt = frozenPrompts.get(chatId)
    if (!prompt) {
      prompt = buildUnifiedSystemPrompt(deps)
      frozenPrompts.set(chatId, prompt)
    }
    return prompt
  }
}

export function clearFrozenPrompt(chatId: string): void {
  frozenPrompts.delete(chatId)
}

/** Test-only: reset all frozen prompts. */
export function resetFrozenPromptsForTests(): void {
  frozenPrompts.clear()
}

/** Matches the constructor default "Chat <localized time>" so auto-naming
 *  never overwrites a user-chosen title. */
const DEFAULT_CHAT_NAME = /^Chat \d{1,2}:\d{2}:\d{2}/

/** Auto-name a conversation still carrying its default title, using the fast
 *  model. Failures are swallowed — naming is cosmetic. */
export async function maybeGenerateChatName(
  chatId: string,
  chatStore: ChatStoreType,
  deps: ChatExecutionDependencies,
): Promise<void> {
  const chat = chatStore.chats[chatId]
  if (!chat || chat.deleted) return
  if (!DEFAULT_CHAT_NAME.test(chat.name || '')) return
  const visible = (chat.messages || []).filter((m) => !m.hidden && m.content?.trim())
  if (!visible.some((m) => m.role === 'assistant')) return
  const connectionName = chat.llmConnectionName || deps.llmConnectionStore.activeConnection
  if (!connectionName) return
  try {
    const name = await deps.llmConnectionStore.generateChatName(connectionName, visible)
    // Re-check: the user may have renamed while the fast model ran.
    if (name && DEFAULT_CHAT_NAME.test(chatStore.chats[chatId]?.name || '')) {
      chatStore.updateChatName(chatId, name)
    }
  } catch (err) {
    console.warn('Chat auto-naming failed:', err)
  }
}

/** Cap on how much selected text rides along in the seeded context note —
 *  a full-file selection would bloat the (hidden) note message. */
const MAX_SELECTION_NOTE_CHARS = 2000

export interface OpenGlobalChatForEditorOptions {
  chatStore: ChatStoreType
  llmConnectionStore: LLMConnectionStoreType
  editor: { id: string; name: string }
  selectedText?: string
}

/**
 * Route an in-editor "AI assist" request into the persistent global panel:
 * reuse the panel's active conversation (falling back to the most recent user
 * conversation, else a fresh one) and queue a context note naming the editor.
 * The note delivers lazily on the next send — opening the panel never fires an
 * LLM turn. Returns the conversation id shown in the panel.
 */
export function openGlobalChatForEditor(opts: OpenGlobalChatForEditorOptions): string {
  const { chatStore, llmConnectionStore, editor, selectedText } = opts
  const panel = useGlobalChatPanel()

  const activeId = panel.activePanelChatId.value
  const active = activeId ? chatStore.chats[activeId] : null
  let chat = active && !active.deleted ? active : null
  if (!chat) {
    // Same fallback the panel itself uses when its stored id no longer resolves.
    chat =
      chatStore.chatList
        .filter((c) => c.kind === 'user' && c.source === 'user')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ||
      null
  }
  if (!chat) {
    chat = chatStore.newChat(llmConnectionStore.activeConnection || '', '', undefined, '', {
      activate: false,
    })
  }

  const trimmedSelection = selectedText?.trim() ? stripPromptWrapperTags(selectedText) : ''
  const selectionNote = trimmedSelection
    ? `\nTheir current selection in that editor:\n${trimmedSelection.slice(0, MAX_SELECTION_NOTE_CHARS)}${
        trimmedSelection.length > MAX_SELECTION_NOTE_CHARS ? '\n...(selection truncated)' : ''
      }`
    : ''
  // This note supersedes any queued nav note and already carries the user's
  // location — mark the location delivered so the navigation injector's
  // immediate/debounced note doesn't clobber it (losing the selection).
  chat.pendingContextNote = `[editor] The user asked for AI help from editor "${stripPromptWrapperTags(editor.name)}" (id ${editor.id}). Read it with read_editor before proposing or making changes; apply edits with update_editor_contents.${selectionNote}`
  markNavigationContextDelivered(chat.id)
  panel.openPanel(chat.id)
  return chat.id
}

export interface SendGlobalChatMessageOptions {
  chatId: string
  message: string
  chatStore: ChatStoreType
  deps: ChatExecutionDependencies
}

/**
 * Send a message through the global chat: deliver any pending navigation
 * context note (append-only, cache-safe), then run the tool loop with the
 * stable global toolset and the frozen system prompt. The tool executor
 * resolves live screen state (navigation singleton, screenBridge) at each
 * call, so mid-run navigation retargets subsequent tools.
 */
export async function sendGlobalChatMessage(opts: SendGlobalChatMessageOptions): Promise<void> {
  const { chatId, message, chatStore, deps } = opts
  const chat = chatStore.chats[chatId]
  if (!chat) return

  // Materialize the latest navigation note BEFORE the user message so history
  // stays append-only (prompt-cache safe) and the note precedes the request
  // it contextualizes. runToolLoop only slices off the final user message, so
  // the hidden note rides along in history untouched. Skip when no LLM
  // connection exists — executeMessage will fail fast and the note should
  // survive for the first real send.
  const hasConnection = !!(chat.llmConnectionName || deps.llmConnectionStore.activeConnection)
  if (hasConnection && chat.pendingContextNote) {
    chatStore.addMessageToChat(chatId, {
      role: 'user',
      content: `${SYSTEM_INPUT_START}${stripPromptWrapperTags(chat.pendingContextNote)}${SYSTEM_INPUT_END}`,
      hidden: true,
    })
    chat.pendingContextNote = null
  }

  const registry = getSharedRegistry()
  const runtime: ToolRuntime = {
    connectionStore: deps.connectionStore,
    editorStore: deps.editorStore,
    chatStore,
    queryExecutionService: deps.queryExecutionService,
    ...(deps.dashboardStore ? { dashboardStore: deps.dashboardStore } : {}),
    ...(deps.modelStore ? { modelStore: deps.modelStore } : {}),
    llmConnectionStore: deps.llmConnectionStore,
    jobsStore: useJobsApiStore(),
    ...(deps.saveEditors ? { saveEditors: deps.saveEditors } : {}),
    ...(deps.saveModels ? { saveModels: deps.saveModels } : {}),
    navigation: useScreenNavigation(),
    screenBridge: getScreenBridge(),
  }
  const executor = registry.createExecutor('global', runtime, {
    chatId,
    cache: new Map(),
    requestCompaction: async (focus?: string) => {
      const provider =
        deps.llmConnectionStore.connections[
          chat.llmConnectionName || deps.llmConnectionStore.activeConnection
        ]
      if (!provider) {
        return { success: false, error: 'No LLM provider available for compaction.' }
      }
      try {
        const result = await compactChat(provider, chat, { focus })
        return result
          ? {
              success: true,
              message: `Compacted ${result.archivedCount} earlier messages into a summary. The reduced history applies from the next turn.`,
            }
          : {
              success: true,
              message: 'The conversation is still small — nothing worth compacting yet.',
            }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Compaction failed',
        }
      }
    },
  })

  await chatStore.executeMessage(chatId, message, deps, {
    overrides: {
      tools: registry.getToolsetForContext('global'),
      executeToolCall: (toolName, toolInput) => executor.executeToolCall(toolName, toolInput),
      buildSystemPrompt: getFrozenPromptProvider(chatId, deps),
    },
  })

  await maybeGenerateChatName(chatId, chatStore, deps)
}
