import { Chat } from '../chats/chat'
import type { ChartConfig } from '../editors/results'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatStoreType, ChatExecutionDependencies } from '../stores/chatStore'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import {
  EditorRefinementToolExecutor,
  type EditorContext,
  type QueryExecutionResult,
} from './editorRefinementToolExecutor'
import {
  getEditorRefinementTools,
  buildEditorRefinementPrompt,
  type EditorRefinementContext,
} from './editorRefinementTools'

/**
 * Editor refinement on the shared chatStore execution pipeline.
 *
 * Each refinement session gets a backing 'ephemeral' chat record (never
 * persisted — serializeChats only keeps storage === 'local'). Execution runs
 * through chatStore.executeMessage, so refinement gains rate-limit backoff,
 * pause/resume, and consistent abort semantics; the inline UI reads the same
 * chatStore state the global panel would.
 */

export interface RefinementRuntimeStores {
  editorStore: EditorStoreType
  chatStore: ChatStoreType
  llmConnectionStore: LLMConnectionStoreType
}

export function ensureRefinementChat(
  editorId: string,
  stores: RefinementRuntimeStores,
): string | null {
  const { editorStore, chatStore, llmConnectionStore } = stores
  const editor = editorStore.editors[editorId]
  const session = editor?.refinementSession
  if (!editor || !session) return null

  if (session.refinementChatId) {
    const existing = chatStore.chats[session.refinementChatId]
    if (existing && !existing.deleted) return session.refinementChatId
  }

  const chat = new Chat({
    name: `Refine: ${editor.name}`,
    llmConnectionName: llmConnectionStore.activeConnection || '',
    dataConnectionName: editor.connection,
    source: 'editor',
    sourceRefId: editorId,
    storage: 'ephemeral',
  })
  chatStore.addChat(chat)
  editorStore.updateRefinementSession(editorId, { refinementChatId: chat.id })
  return chat.id
}

// Frozen per session-chat: buildEditorRefinementPrompt embeds live editor
// contents, and rebuilding it every iteration invalidated the Anthropic
// prompt-cache prefix each turn. Content changes are visible to the model
// through validate/run/edit tool results instead.
const frozenPrompts = new Map<string, string>()

export function clearRefinementPrompt(chatId: string): void {
  frozenPrompts.delete(chatId)
}

export interface RefinementCallbacks {
  onContentChange?: (content: string, replaceSelection?: boolean) => void
  onChartConfigChange?: (config: ChartConfig) => void
  onFinish?: (message?: string) => void
  onRunActiveEditorQuery?: () => Promise<QueryExecutionResult>
}

export async function sendRefinementMessage(opts: {
  editorId: string
  message: string
  stores: RefinementRuntimeStores
  deps: ChatExecutionDependencies
  callbacks?: RefinementCallbacks
}): Promise<void> {
  const { editorId, message, stores, deps, callbacks = {} } = opts
  const { editorStore, chatStore } = stores
  const editor = editorStore.editors[editorId]
  if (!editor || !editor.refinementSession) return

  const chatId = ensureRefinementChat(editorId, stores)
  if (!chatId) return

  // Editor context resolved fresh per tool call, mirroring the old
  // per-iteration factory: the session's currentContent/selection evolve as
  // the agent edits.
  const buildEditorContext = (): EditorContext => {
    const currentSession = editorStore.editors[editorId]?.refinementSession
    if (!currentSession) {
      return {
        editorType: editor.type,
        connectionName: editor.connection,
        editorContents: '',
        selectedText: undefined,
        selectionRange: undefined,
        chartConfig: undefined,
        onEditorContentChange: () => {},
        onChartConfigChange: () => {},
        onFinish: () => {},
      }
    }
    return {
      editorType: editor.type,
      connectionName: editor.connection,
      editorContents: currentSession.currentContent,
      selectedText: currentSession.selectedText,
      selectionRange: currentSession.selectionRange,
      chartConfig: currentSession.currentChartConfig,
      onEditorContentChange: (content: string, replaceSelection?: boolean) => {
        let newContent = content
        if (replaceSelection && currentSession.selectionRange) {
          const before = currentSession.currentContent.slice(0, currentSession.selectionRange.start)
          const after = currentSession.currentContent.slice(currentSession.selectionRange.end)
          newContent = before + content + after
        }
        editorStore.updateRefinementSession(editorId, { currentContent: newContent })
        callbacks.onContentChange?.(newContent, replaceSelection)
      },
      onChartConfigChange: (config: ChartConfig) => {
        editorStore.updateRefinementSession(editorId, { currentChartConfig: config })
        callbacks.onChartConfigChange?.(config)
      },
      onFinish: (msg?: string) => {
        callbacks.onFinish?.(msg)
      },
      onRunActiveEditorQuery: callbacks.onRunActiveEditorQuery
        ? () => callbacks.onRunActiveEditorQuery!()
        : undefined,
      getCurrentResults: () => editorStore.editors[editorId]?.results ?? null,
    }
  }

  const buildFrozenPrompt = (): string => {
    let prompt = frozenPrompts.get(chatId)
    if (!prompt) {
      const session = editorStore.editors[editorId]?.refinementSession
      const context: EditorRefinementContext = {
        editorType: editor.type,
        connectionName: editor.connection,
        editorContents: session?.currentContent ?? editor.contents,
        selectedText: session?.selectedText,
        selectionRange: session?.selectionRange,
        chartConfig: session?.currentChartConfig,
        completionSymbols: editor.completionSymbols || [],
      }
      prompt = buildEditorRefinementPrompt(context)
      frozenPrompts.set(chatId, prompt)
    }
    return prompt
  }

  await chatStore.executeMessage(chatId, message, deps, {
    overrides: {
      tools: getEditorRefinementTools(editor.type),
      executeToolCall: (toolName, toolInput) =>
        new EditorRefinementToolExecutor(
          deps.queryExecutionService,
          deps.connectionStore,
          buildEditorContext(),
          editorStore,
        ).executeToolCall(toolName, toolInput as Record<string, any>),
      buildSystemPrompt: buildFrozenPrompt,
      maxIterations: 20,
      noToolCallReminder:
        'You must call a tool to proceed. If you are finished with the requested changes, call request_close to wrap up the session. Do not respond with text only.',
    },
  })
}

/** Tear down the session's backing chat (stop any run, drop the record). */
export function disposeRefinementChat(
  editorId: string,
  stores: Pick<RefinementRuntimeStores, 'editorStore' | 'chatStore'>,
): void {
  const session = stores.editorStore.editors[editorId]?.refinementSession
  const chatId = session?.refinementChatId
  if (!chatId) return
  if (stores.chatStore.isChatExecuting(chatId)) {
    stores.chatStore.stopExecution(chatId)
  }
  stores.chatStore.removeChat(chatId)
  clearRefinementPrompt(chatId)
}
