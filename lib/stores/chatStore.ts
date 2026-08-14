import { defineStore } from 'pinia'
import { Chat } from '../chats/chat'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'
import type { LLMConnectionStoreType } from './llmStore'
import type { ConnectionStoreType } from './connectionStore'
import type QueryExecutionService from './queryExecutionService'
import type { EditorStoreType } from './editorStore'
import type { ProjectStoreType } from './projectStore'
import type { DashboardStoreType } from './dashboardStore'
import type { ModelConfigStoreType } from './modelStore'
import { OverseerToolExecutor } from '../llm/overseerToolExecutor'
import { ArchitectToolExecutor } from '../llm/architectToolExecutor'
import { summarizeSubchat } from '../llm/subchatSummarize'
import type { ToolCallResult } from '../llm/sharedToolHelpers'
import { buildChatAgentSystemPrompt } from '../llm/chatAgentPrompt'
import { getSharedRegistry } from '../llm/registry'
import { compactChat, COMPACTION_THRESHOLD_TOKENS } from '../llm/compactConversation'
import {
  buildOverseerSystemPrompt,
  OVERSEER_TOOLS,
  ANALYST_DEFAULT_INSTRUCTIONS,
  type SubchatStatus,
  type SubchatKind,
} from '../llm/overseerAgentPrompt'
import { buildArchitectSystemPrompt, ARCHITECT_TOOLS } from '../llm/architectAgentPrompt'
import type { CompletionItem } from './resolver'
import type { LLMToolDefinition } from '../llm/base'
import {
  runToolLoop,
  type LLMAdapter,
  type MessagePersistence,
  type ToolExecutorFactory,
  type ExecutionStateUpdater,
} from '../llm/toolLoopCore'

/** Overrides that let a caller plug custom tools and a custom tool executor
 *  into the persistent executeMessage pipeline. Used by the dashboard agent
 *  runtime and the global chat runtime so those agents get persistence +
 *  background execution without polluting the generic chat agent. */
export interface ExecuteMessageOverrides {
  tools: LLMToolDefinition[]
  executeToolCall: (toolName: string, toolInput: Record<string, any>) => Promise<ToolCallResult>
  buildSystemPrompt: () => string
  noToolCallReminder?: string
  terminateOnNoToolCall?: boolean
  /** Cap on tool-loop iterations for this run (default 50). */
  maxIterations?: number
}

/** Rate limit backoff state */
export interface RateLimitBackoff {
  isWaiting: boolean
  attempt: number
  delayMs: number
  startedAt: number // timestamp when backoff started
}

/** Per-chat execution state */
export interface ChatExecution {
  isLoading: boolean
  activeToolName: string
  error: string | null
  rateLimitBackoff: RateLimitBackoff | null
  abortController: AbortController | null
  /** When true, the tool loop holds at the top of the next iteration until
   *  flipped back to false (or aborted). Mid-iteration work is not interrupted. */
  paused: boolean
}

/** Dependencies needed to execute a chat message */
export interface ChatExecutionDependencies {
  llmConnectionStore: LLMConnectionStoreType
  connectionStore: ConnectionStoreType
  queryExecutionService: QueryExecutionService
  editorStore: EditorStoreType
  /** Required when executing overseer/subchat flows: the overseer reads
   *  active project at tool-call time to know where to spawn subchats and
   *  what to put in the system prompt. Studio chats (kind=user) don't
   *  need this. */
  projectStore?: ProjectStoreType
  /** Optional model + persistence services used by global editor-management tools. */
  modelStore?: ModelConfigStoreType
  saveEditors?: () => Promise<unknown> | unknown
  saveModels?: () => Promise<unknown> | unknown
  /** Optional dashboard store — used by the overseer's create_report tool to
   *  spin up a new report-mode dashboard and queue its initial prompt. */
  dashboardStore?: DashboardStoreType
}

/** Module-level removal hooks: caches keyed by chat id (frozen prompts,
 *  nav-note dedupe, refinement state) register here so deletions from ANY
 *  surface (sidebar, tools, panel) clean them up. Kept outside the store to
 *  avoid import cycles — higher layers import the store, never vice versa. */
type ChatRemovalListener = (chatId: string) => void
const chatRemovalListeners: ChatRemovalListener[] = []
export function onChatRemoved(listener: ChatRemovalListener): void {
  chatRemovalListeners.push(listener)
}

export const useChatStore = defineStore('chats', {
  state: () => ({
    chats: {} as Record<string, Chat>,
    activeChatId: '',
    /** Per-chat execution state - tracks loading, active tool, errors */
    chatExecutions: {} as Record<string, ChatExecution>,
  }),

  getters: {
    chatList: (state) => Object.values(state.chats).filter((c) => !c.deleted),

    unsavedChats: (state) =>
      Object.values(state.chats).filter((c) => c.changed && !c.deleted).length,

    activeChat: (state) => (state.activeChatId ? state.chats[state.activeChatId] : null),

    getConnectionChats:
      (state) =>
      (llmConnectionName: string): Chat[] =>
        Object.values(state.chats).filter(
          (c) => c.llmConnectionName === llmConnectionName && !c.deleted,
        ),

    getChatById:
      (state) =>
      (chatId: string): Chat | null =>
        state.chats[chatId] || null,

    /** Get execution state for a specific chat */
    getChatExecution:
      (state) =>
      (chatId: string): ChatExecution | null =>
        state.chatExecutions[chatId] || null,

    /** Check if a specific chat is currently executing */
    isChatExecuting:
      (state) =>
      (chatId: string): boolean =>
        state.chatExecutions[chatId]?.isLoading ?? false,

    /** Get the active tool name for a specific chat */
    getChatActiveToolName:
      (state) =>
      (chatId: string): string =>
        state.chatExecutions[chatId]?.activeToolName ?? '',

    /** Get rate limit backoff state for a specific chat */
    getChatRateLimitBackoff:
      (state) =>
      (chatId: string): RateLimitBackoff | null =>
        state.chatExecutions[chatId]?.rateLimitBackoff ?? null,

    /** Whether the chat's loop is currently paused. */
    isChatPaused:
      (state) =>
      (chatId: string): boolean =>
        state.chatExecutions[chatId]?.paused ?? false,
  },

  actions: {
    newChat(
      llmConnectionName: string,
      dataConnectionName: string = '',
      name?: string,
      dataConnectionId: string = '',
      options: { activate?: boolean } = {},
    ): Chat {
      const chat = new Chat({
        llmConnectionName,
        dataConnectionName,
        dataConnectionId,
        name: name || `Chat ${new Date().toLocaleTimeString()}`,
      })
      this.chats[chat.id] = chat
      // activeChatId belongs to the llms screen; panel-driven creation passes
      // activate: false so it doesn't silently change that screen's selection.
      if (options.activate !== false) {
        this.activeChatId = chat.id
      }
      return chat
    },

    addChat(chat: Chat): void {
      this.chats[chat.id] = chat
    },

    removeChat(id: string): void {
      if (this.chats[id]) {
        this.chats[id].deleted = true
        this.chats[id].changed = true
        if (this.activeChatId === id) {
          this.activeChatId = ''
        }
        chatRemovalListeners.forEach((listener) => {
          try {
            listener(id)
          } catch (e) {
            console.error('Chat removal listener failed', e)
          }
        })
      }
    },

    setActiveChat(id: string): void {
      if (this.chats[id] && !this.chats[id].deleted) {
        this.activeChatId = id
      }
    },

    clearActiveChat(): void {
      this.activeChatId = ''
    },

    updateChatName(chatId: string, name: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setName(name)
      }
    },

    updateChatLLMConnection(chatId: string, llmConnectionName: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setLLMConnection(llmConnectionName)
      }
    },

    updateChatDataConnection(
      chatId: string,
      connectionName: string,
      connectionId: string = '',
    ): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setDataConnection(connectionName, connectionId)
      }
    },

    addMessageToChat(chatId: string, message: ChatMessage): void {
      if (this.chats[chatId]) {
        this.chats[chatId].addMessage(message)
      }
    },

    addArtifactToChat(chatId: string, artifact: ChatArtifact): number {
      if (this.chats[chatId]) {
        return this.chats[chatId].addArtifact(artifact)
      }
      return -1
    },

    setActiveArtifact(chatId: string, index: number): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setActiveArtifact(index)
      }
    },

    // Import management
    setImports(chatId: string, imports: ChatImport[]): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setImports(imports)
      }
    },

    addImportToChat(chatId: string, imp: ChatImport): boolean {
      if (this.chats[chatId]) {
        return this.chats[chatId].addImport(imp)
      }
      return false
    },

    removeImportFromChat(chatId: string, importId: string): boolean {
      if (this.chats[chatId]) {
        return this.chats[chatId].removeImport(importId)
      }
      return false
    },

    clearChatMessages(chatId: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].clearMessages()
      }
    },

    loadChats(serializedChats: Record<string, any>): void {
      Object.entries(serializedChats).forEach(([id, data]) => {
        this.chats[id] = Chat.fromSerialized(data)
      })
    },

    serializeChats(): Record<string, any> {
      const serialized: Record<string, any> = {}
      Object.entries(this.chats).forEach(([id, chat]) => {
        if (chat.storage === 'local' && !chat.deleted) {
          serialized[id] = chat.serialize()
        }
      })
      return serialized
    },

    // Mark all chats as saved (used after persistence)
    markAllSaved(): void {
      Object.values(this.chats).forEach((chat) => {
        if (!chat.deleted) {
          chat.changed = false
        }
      })
    },

    // Permanently remove deleted chats from memory
    purgeDeleted(): void {
      Object.keys(this.chats).forEach((id) => {
        if (this.chats[id].deleted) {
          delete this.chats[id]
        }
      })
    },

    // ==================== Execution State Management ====================

    /** Initialize or reset execution state for a chat */
    startExecution(chatId: string): void {
      // Abort any existing execution first
      if (this.chatExecutions[chatId]?.abortController) {
        this.chatExecutions[chatId].abortController.abort()
      }
      this.chatExecutions[chatId] = {
        isLoading: true,
        activeToolName: '',
        error: null,
        rateLimitBackoff: null,
        abortController: new AbortController(),
        paused: false,
      }
    },

    /** Toggle pause for an in-progress chat — the loop will hold before its
     *  next iteration and stay there until resumeExecution is called. Has no
     *  effect on idle chats or chats already paused. */
    pauseExecution(chatId: string): void {
      const execution = this.chatExecutions[chatId]
      if (!execution || !execution.isLoading) return
      execution.paused = true
    },

    /** Release a paused chat so its tool loop resumes from the next iteration. */
    resumeExecution(chatId: string): void {
      const execution = this.chatExecutions[chatId]
      if (!execution) return
      execution.paused = false
    },

    /** Stop an in-progress execution for a chat */
    stopExecution(chatId: string): void {
      const execution = this.chatExecutions[chatId]
      if (execution?.abortController) {
        execution.abortController.abort()
      }
      // Mark as complete without error - user initiated stop
      this.completeExecution(chatId)
    },

    /** Update rate limit backoff state during execution */
    setRateLimitBackoff(chatId: string, attempt: number, delayMs: number): void {
      if (this.chatExecutions[chatId]) {
        this.chatExecutions[chatId].rateLimitBackoff = {
          isWaiting: true,
          attempt,
          delayMs,
          startedAt: Date.now(),
        }
      }
    },

    /** Clear rate limit backoff state */
    clearRateLimitBackoff(chatId: string): void {
      if (this.chatExecutions[chatId]) {
        this.chatExecutions[chatId].rateLimitBackoff = null
      }
    },

    /** Update the active tool name during execution */
    setActiveToolName(chatId: string, toolName: string): void {
      if (this.chatExecutions[chatId]) {
        this.chatExecutions[chatId].activeToolName = toolName
      }
    },

    /** Mark execution as complete, optionally with an error */
    completeExecution(chatId: string, error?: string): void {
      if (this.chatExecutions[chatId]) {
        this.chatExecutions[chatId].isLoading = false
        this.chatExecutions[chatId].activeToolName = ''
        this.chatExecutions[chatId].error = error || null
      }
    },

    /** Clear execution state for a chat */
    clearExecution(chatId: string): void {
      delete this.chatExecutions[chatId]
    },

    // ==================== Message Execution ====================

    /**
     * Execute a chat message with tool support.
     * This runs the full LLM conversation loop including tool calls.
     * The execution persists even if the component unmounts.
     * Uses the shared runToolLoop core function for consistency.
     */
    async executeMessage(
      chatId: string,
      message: string,
      deps: ChatExecutionDependencies,
      options: {
        /** Callback to refresh symbols after import changes */
        onSymbolsRefresh?: () => Promise<CompletionItem[]>
        /** Replace the generic chat tools + executor + prompt with a caller-supplied set.
         *  When provided, onSymbolsRefresh and the default ChatToolExecutor are bypassed. */
        overrides?: ExecuteMessageOverrides
        /** Mark the injected user message as hidden so it doesn't render in
         *  the UI as a user-typed message. Used for subchat-completion
         *  injections into the overseer. */
        hiddenUserMessage?: boolean
      } = {},
    ): Promise<{ response?: string; artifacts?: ChatArtifact[] } | void> {
      const chat = this.chats[chatId]
      if (!chat) {
        return { response: 'Chat not found.' }
      }

      const { llmConnectionStore, connectionStore, queryExecutionService, editorStore } = deps

      // Use the chat's LLM connection, falling back to global active connection
      const llmConnectionName = chat.llmConnectionName || llmConnectionStore.activeConnection
      if (!llmConnectionName) {
        // Persist the message and a visible error — chat UIs render from the
        // store and deliberately don't echo locally, so silently dropping the
        // send makes the user's text vanish without feedback.
        this.addMessageToChat(chatId, {
          role: 'user',
          content: message,
          hidden: options.hiddenUserMessage ?? false,
        })
        this.addMessageToChat(chatId, {
          role: 'assistant',
          content: 'Error: No LLM connection available. Please configure an LLM provider first.',
          error: true,
        })
        return {
          response: 'No LLM connection available. Please configure an LLM provider first.',
        }
      }

      // Auto-compact BEFORE starting the loop (never mid-loop: the running
      // loop holds its own history copy) when the last request's context grew
      // past the threshold. Failure is non-fatal — the turn proceeds uncompacted.
      if ((chat.lastContextTokens ?? 0) > COMPACTION_THRESHOLD_TOKENS) {
        const provider = llmConnectionStore.connections[llmConnectionName]
        if (provider) {
          try {
            const compacted = await compactChat(provider, chat)
            if (compacted) {
              // Reset so the trigger re-arms only after the next real request.
              chat.lastContextTokens = undefined
            }
          } catch (err) {
            console.error('Automatic conversation compaction failed:', err)
          }
        }
      }

      // Initialize execution state. Keep the record's identity: a later
      // executeMessage on the same chat replaces it via startExecution, and
      // this (superseded) run must then never touch the new run's state.
      this.startExecution(chatId)
      const execution = this.chatExecutions[chatId]
      const isCurrentRun = () => this.chatExecutions[chatId] === execution

      // Get abort signal for this execution
      const signal = execution?.abortController?.signal
      let stoppedByUser = false

      // Add user message to chat (runToolLoop expects it in getMessages() and will slice it off)
      this.addMessageToChat(chatId, {
        role: 'user',
        content: message,
        hidden: options.hiddenUserMessage ?? false,
      })

      try {
        // Create adapters for the shared runToolLoop

        const llmAdapter: LLMAdapter = {
          generateCompletion: async (connectionName, llmOptions, msgs) => {
            // Add rate limit callback to options
            const optionsWithCallback = {
              ...llmOptions,
              signal,
              onRateLimitBackoff: (attempt: number, delayMs: number) => {
                this.setRateLimitBackoff(chatId, attempt, delayMs)
              },
            }
            const result = await llmConnectionStore.generateCompletion(
              connectionName,
              optionsWithCallback,
              msgs,
            )
            // Clear backoff state after successful completion
            this.clearRateLimitBackoff(chatId)
            // Track approximate context size (prompt + cached input) so the
            // auto-compaction trigger knows when the conversation has grown.
            if (result.usage) {
              chat.lastContextTokens =
                result.usage.promptTokens +
                (result.usage.cacheCreationTokens ?? 0) +
                (result.usage.cacheReadTokens ?? 0)
              chat.changed = true
            }
            return result
          },
        }

        const messagePersistence: MessagePersistence = {
          addMessage: (msg) => {
            this.addMessageToChat(chatId, msg)
          },
          addArtifact: (artifact) => {
            this.addArtifactToChat(chatId, artifact)
            // Inject renderable artifacts into the chat as carrier messages so
            // the user sees them inline. These are UI-only — getLLMMessages
            // excludes them from LLM history.
            if (
              artifact.type === 'chart' ||
              artifact.type === 'markdown' ||
              artifact.type === 'results'
            ) {
              this.addMessageToChat(chatId, {
                role: 'assistant',
                content: '',
                artifact: artifact,
                hidden: false,
              })
            }
          },
          // getLLMMessages excludes compaction-archived history — this is the
          // single history-construction point for the loop across all modes.
          getMessages: () => chat.getLLMMessages(),
        }

        // Build tool executor: caller-provided override > overseer-kind
        // executor > default chat executor.
        const toolExecutorFactory: ToolExecutorFactory = options.overrides
          ? {
              getToolExecutor: () => ({
                executeToolCall: options.overrides!.executeToolCall,
              }),
            }
          : chat.kind === 'overseer'
            ? (() => {
                if (!deps.projectStore) {
                  throw new Error('Overseer chats require deps.projectStore')
                }
                const exec = new OverseerToolExecutor(
                  this,
                  deps.projectStore,
                  chatId,
                  deps,
                  deps.dashboardStore,
                )
                return { getToolExecutor: () => exec }
              })()
            : chat.kind === 'architect'
              ? (() => {
                  if (!deps.projectStore) {
                    throw new Error('Architect subchats require deps.projectStore')
                  }
                  const exec = new ArchitectToolExecutor(
                    this,
                    deps.projectStore,
                    editorStore,
                    connectionStore,
                    queryExecutionService,
                    chatId,
                  )
                  return { getToolExecutor: () => exec }
                })()
              : (() => {
                  // Default chat path goes through the tool registry: same
                  // ChatToolExecutor underneath (session-memoized), but
                  // dispatch and unknown-tool errors come from the registry.
                  const toolExecutor = getSharedRegistry().createExecutor(
                    'chat',
                    {
                      connectionStore,
                      editorStore,
                      chatStore: this,
                      queryExecutionService,
                      ...(deps.dashboardStore ? { dashboardStore: deps.dashboardStore } : {}),
                    },
                    { chatId, cache: new Map() },
                  )
                  return { getToolExecutor: () => toolExecutor }
                })()

        const stateUpdater: ExecutionStateUpdater = {
          setActiveToolName: (name) => this.setActiveToolName(chatId, name),
          checkAborted: () => signal?.aborted ?? false,
          isPaused: () => this.chatExecutions[chatId]?.paused ?? false,
        }

        // Build system prompt function (called each iteration for freshness)
        const buildSystemPrompt = options.overrides
          ? options.overrides.buildSystemPrompt
          : () => this.buildSystemPrompt(chatId, deps)

        // Handle symbol refresh on tool results (default path only)
        const onToolResult = options.overrides
          ? undefined
          : async (_toolName: string, result: ToolCallResult) => {
              if (result.triggersSymbolRefresh && options.onSymbolsRefresh) {
                await options.onSymbolsRefresh()
              }
            }

        const tools = options.overrides
          ? options.overrides.tools
          : chat.kind === 'overseer'
            ? OVERSEER_TOOLS
            : chat.kind === 'architect'
              ? ARCHITECT_TOOLS
              : getSharedRegistry().getToolsetForContext('chat')

        const loopResult = await runToolLoop(
          message,
          llmConnectionName,
          llmAdapter,
          messagePersistence,
          toolExecutorFactory,
          stateUpdater,
          {
            tools,
            maxIterations: options.overrides?.maxIterations ?? 50,
            noToolCallReminder:
              options.overrides?.noToolCallReminder ??
              'You must call a tool to proceed. If you are finished, call return_to_user with a summary of what was done. Do not respond with text only.',
            terminateOnNoToolCall: options.overrides?.terminateOnNoToolCall,
            buildSystemPrompt,
            onToolResult,
          },
        )
        stoppedByUser = !!loopResult.stopped

        // Don't return response - messages are synced to UI via watchers in useChatWithTools
        // Returning a response here would cause duplicate messages in the UI
      } catch (err) {
        // Handle abort gracefully - no error message in the chat. Providers
        // rewrap DOMException AbortErrors into plain Errors, so the reliable
        // signal is this run's own abort flag.
        const wasAborted =
          (err instanceof DOMException && err.name === 'AbortError') || signal?.aborted
        if (wasAborted) {
          stoppedByUser = true
          if (isCurrentRun()) {
            this.completeExecution(chatId)
          }
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
        // Add error message directly to the correct chat
        this.addMessageToChat(chatId, {
          role: 'assistant',
          content: `Error: ${errorMessage}`,
          error: true,
        })
        if (isCurrentRun()) {
          this.completeExecution(chatId, errorMessage)
        }
      } finally {
        // Only finalize when this run still owns the execution record (a
        // newer executeMessage may have replaced it) and no error was already
        // recorded (completeExecution would wipe the error field).
        if (isCurrentRun() && execution.isLoading) {
          this.completeExecution(chatId)
        }
      }

      // Post-execution: if this is a subchat, inject its summary into the
      // parent overseer (auto-trigger or queue). Then drain any pending
      // injections this chat itself accumulated while busy. Skip both when
      // the user stopped this run (a stop must not auto-restart the agent)
      // or when a newer run superseded it (the newer run owns follow-ups).
      if (stoppedByUser || !isCurrentRun()) {
        return undefined
      }
      this.handleSubchatCompletion(chatId, deps).catch((e) =>
        console.error('handleSubchatCompletion failed', e),
      )
      this.drainPendingInjections(chatId, deps).catch((e) =>
        console.error('drainPendingInjections failed', e),
      )

      return undefined
    },

    /**
     * If `chatId` is a subchat (kind != 'user' && parentChatId set), build
     * a summary message and either auto-trigger the parent's executeMessage
     * (if idle) or queue into the parent's pendingInjections (if busy).
     *
     * The summary is generated by running the subchat's transcript through
     * the provider's fastModel — guarantees the overseer sees something
     * useful even when the LLM hit max iterations or returned text without
     * calling return_to_user.
     */
    async handleSubchatCompletion(chatId: string, deps: ChatExecutionDependencies): Promise<void> {
      const chat = this.chats[chatId]
      if (!chat || chat.kind === 'user' || !chat.parentChatId) return
      const parent = this.chats[chat.parentChatId]
      if (!parent) return

      const provider =
        deps.llmConnectionStore.connections[chat.llmConnectionName] ??
        deps.llmConnectionStore.connections[parent.llmConnectionName] ??
        null

      let summary: string
      if (provider) {
        try {
          summary = await summarizeSubchat(provider, chat, 'completion')
        } catch (e) {
          console.error('subchat summarization failed; falling back', e)
          const last = chat.messages[chat.messages.length - 1]
          summary =
            last?.content?.trim() ||
            '(no summary available — subchat finished but the auto-summary call failed)'
        }
      } else {
        const last = chat.messages[chat.messages.length - 1]
        summary = last?.content?.trim() || '(no summary — provider unavailable)'
      }

      const injection = `[subchat ${chat.id} (${chat.kind}) "${chat.name}" completed]\n\n${summary}`

      if (this.isChatExecuting(chat.parentChatId)) {
        parent.pendingInjections.push(injection)
        parent.changed = true
      } else {
        // Auto-wake the parent. Fire and forget; the recursion is bounded
        // because each subchat only injects once per terminal state.
        void this.executeMessage(chat.parentChatId, injection, deps, {
          hiddenUserMessage: true,
        }).catch((e) => console.error('Parent auto-wake failed', e))
      }
    },

    /**
     * After a chat finishes, if it accumulated subchat injections while
     * busy, fire them as a follow-up turn.
     */
    async drainPendingInjections(chatId: string, deps: ChatExecutionDependencies): Promise<void> {
      const chat = this.chats[chatId]
      if (!chat) return
      if (chat.pendingInjections.length === 0) return
      if (this.isChatExecuting(chatId)) return // re-entrant; let next drain handle it

      const drained = chat.pendingInjections.splice(0)
      const combined = drained.join('\n\n---\n\n')
      void this.executeMessage(chatId, combined, deps, {
        hiddenUserMessage: true,
      }).catch((e) => console.error('Drain failed', e))
    },

    /** Build the system prompt for a chat based on its current state */
    buildSystemPrompt(chatId: string, deps: ChatExecutionDependencies): string {
      const chat = this.chats[chatId]
      if (!chat) return ''

      // Overseer chats use a completely different prompt — they never query
      // data directly, only orchestrate subchats.
      if (chat.kind === 'overseer') {
        return this.buildOverseerPrompt(chatId, deps)
      }

      // Architect subchats use a file-centric prompt. We resolve their
      // operating project from parentProjectId set at spawn.
      if (chat.kind === 'architect') {
        return this.buildArchitectPrompt(chatId, deps)
      }

      const { connectionStore, editorStore } = deps
      const dataConnectionName = chat.dataConnectionName
      const availableConnections = Object.values(connectionStore.connections).map((c) => c.name)

      // Resolve the chat's persisted connection FK: prefer the migrated id,
      // fall back to looking the legacy name string up in the store.
      const dataConnection =
        (chat.dataConnectionId && connectionStore.connections[chat.dataConnectionId]) ||
        (dataConnectionName ? connectionStore.connectionByName(dataConnectionName) : undefined)
      const isDataConnectionActive = dataConnection?.connected ?? false

      // Get available imports for the connection — scoped by connection id so
      // a same-named editor from a different origin can't show up in the
      // agent's prompt.
      const availableImports: ChatImport[] =
        editorStore && dataConnection
          ? Object.values(editorStore.editors)
              .filter((editor: any) => editor.connectionId === dataConnection.id)
              .sort((a: any, b: any) => a.name.localeCompare(b.name))
              .map((editor: any) => ({
                id: editor.id,
                name: editor.name.replace(/\//g, '.'),
                alias: '',
              }))
          : []

      // Note: concepts are passed separately via options.onSymbolsRefresh
      // For now, we pass an empty array - the composable will handle concept refresh
      const basePrompt = buildChatAgentSystemPrompt({
        dataConnectionName,
        availableConnections,
        availableConcepts: [], // Concepts managed by composable
        activeImports: chat.imports,
        availableImportsForConnection: availableImports,
        isDataConnectionActive,
      })

      // Analyst subchats still ride on the generic CHAT_TOOLS for now —
      // give them a short role preamble. Architect handled above with its
      // own dedicated prompt.
      if (chat.kind === 'analyst') {
        const projectId = chat.parentProjectId || deps.projectStore?.activeProjectId || ''
        const project = projectId ? deps.projectStore?.projects[projectId] : null
        const preamble = project?.promptOverrides.analyst?.trim() || ANALYST_DEFAULT_INSTRUCTIONS
        return `${preamble}\n\n${basePrompt}`
      }
      return basePrompt
    },

    /** Architect subchat prompt — file-centric. Reads context from the
     *  subchat's parentProjectId set at spawn. */
    buildArchitectPrompt(chatId: string, deps: ChatExecutionDependencies): string {
      const chat = this.chats[chatId]
      if (!chat) return ''
      const projectId = chat.parentProjectId || deps.projectStore?.activeProjectId || ''
      const project = projectId ? deps.projectStore?.projects[projectId] : null

      const files = project
        ? project.editorIds
            .map((id) => deps.editorStore.editors[id])
            .filter((e) => e && !e.deleted)
            .map((ed) => ({ name: ed.name, type: ed.type, size: (ed.contents || '').length }))
        : []

      const conn =
        (project?.dataConnectionId && deps.connectionStore.connections[project.dataConnectionId]) ||
        null

      return buildArchitectSystemPrompt({
        projectName: project?.name,
        projectDescription: project?.description,
        files,
        dataConnectionName: conn?.name ?? '',
        isDataConnectionActive: conn?.connected ?? false,
        instructionsOverride: project?.promptOverrides.architect,
      })
    },

    /** Build the overseer-specific system prompt (orchestration only). */
    buildOverseerPrompt(chatId: string, deps: ChatExecutionDependencies): string {
      const chat = this.chats[chatId]
      if (!chat) return ''
      const { projectStore, connectionStore, editorStore } = deps
      // Overseer is global. Read active project at prompt-build time so it
      // always reflects what the user is currently looking at.
      const project = projectStore?.activeProject ?? null

      const subchats: SubchatStatus[] = []
      if (project) {
        for (const subId of project.subchatIds) {
          const sub = this.chats[subId]
          if (!sub || sub.deleted) continue
          const last = sub.messages[sub.messages.length - 1]
          subchats.push({
            id: sub.id,
            kind: sub.kind as SubchatKind,
            status: this.isChatExecuting(subId) ? 'running' : 'idle',
            lastMessage: last?.content,
          })
        }
      }

      const editorNames = project
        ? project.editorIds
            .map((id) => editorStore?.editors[id]?.name)
            .filter((n): n is string => !!n)
        : []

      return buildOverseerSystemPrompt({
        projectName: project?.name,
        projectDescription: project?.description,
        subchats,
        availableConnections: Object.values(connectionStore.connections).map((c) => c.name),
        availableEditors: editorNames,
        instructionsOverride: project?.promptOverrides.overseer,
      })
    },
  },
})

export type ChatStoreType = ReturnType<typeof useChatStore>
export default useChatStore
