import { defineStore } from 'pinia'
import { Chat } from '../chats/chat'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'
import type { LLMConnectionStoreType } from './llmStore'
import type { ConnectionStoreType } from './connectionStore'
import type QueryExecutionService from './queryExecutionService'
import type { EditorStoreType } from './editorStore'
import { ChatToolExecutor, type ToolCallResult } from '../llm/chatToolExecutor'
import { buildChatAgentSystemPrompt, CHAT_TOOLS } from '../llm/chatAgentPrompt'
import type { CompletionItem } from './resolver'
import {
  runToolLoop,
  type LLMAdapter,
  type MessagePersistence,
  type ToolExecutorFactory,
  type ExecutionStateUpdater,
} from '../llm/toolLoopCore'

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
}

/** Dependencies needed to execute a chat message */
export interface ChatExecutionDependencies {
  llmConnectionStore: LLMConnectionStoreType
  connectionStore: ConnectionStoreType
  queryExecutionService: QueryExecutionService
  editorStore: EditorStoreType
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
  },

  actions: {
    newChat(llmConnectionName: string, dataConnectionName: string = '', name?: string): Chat {
      const chat = new Chat({
        llmConnectionName,
        dataConnectionName,
        name: name || `Chat ${new Date().toLocaleTimeString()}`,
      })
      this.chats[chat.id] = chat
      this.activeChatId = chat.id
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

    updateChatDataConnection(chatId: string, connectionName: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setDataConnection(connectionName)
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
      }
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
        return {
          response: 'No LLM connection available. Please configure an LLM provider first.',
        }
      }

      // Initialize execution state
      this.startExecution(chatId)

      // Get abort signal for this execution
      const signal = this.chatExecutions[chatId]?.abortController?.signal

      // Add user message to chat (runToolLoop expects it in getMessages() and will slice it off)
      this.addMessageToChat(chatId, {
        role: 'user',
        content: message,
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
            return result
          },
          shouldAutoContinue: (connectionName, responseText) =>
            llmConnectionStore.shouldAutoContinue(connectionName, responseText),
        }

        const messagePersistence: MessagePersistence = {
          addMessage: (msg) => {
            this.addMessageToChat(chatId, msg)
          },
          addArtifact: (artifact) => {
            this.addArtifactToChat(chatId, artifact)
            // For chart artifacts, inject the chart into the chat as a message
            // so the user sees it inline in the conversation
            if (artifact.type === 'chart') {
              this.addMessageToChat(chatId, {
                role: 'assistant',
                content: '',
                artifact: artifact,
                hidden: false,
              })
            }
          },
          getMessages: () => chat.messages,
        }

        // Create tool executor for this execution
        const toolExecutor = new ChatToolExecutor(
          queryExecutionService,
          connectionStore,
          this,
          editorStore,
        )

        const toolExecutorFactory: ToolExecutorFactory = {
          getToolExecutor: () => toolExecutor,
        }

        const stateUpdater: ExecutionStateUpdater = {
          setActiveToolName: (name) => this.setActiveToolName(chatId, name),
          checkAborted: () => signal?.aborted ?? false,
        }

        // Build system prompt function (called each iteration for freshness)
        const buildSystemPrompt = () => this.buildSystemPrompt(chatId, deps)

        // Handle symbol refresh on tool results
        const onToolResult = async (_toolName: string, result: ToolCallResult) => {
          if (result.triggersSymbolRefresh && options.onSymbolsRefresh) {
            await options.onSymbolsRefresh()
          }
        }

        await runToolLoop(
          message,
          llmConnectionName,
          llmAdapter,
          messagePersistence,
          toolExecutorFactory,
          stateUpdater,
          {
            tools: CHAT_TOOLS,
            maxIterations: 50,
            maxAutoContinue: 3,
            buildSystemPrompt,
            onToolResult,
          },
        )

        // Don't return response - messages are synced to UI via watchers in useChatWithTools
        // Returning a response here would cause duplicate messages in the UI
        return undefined
      } catch (err) {
        // Handle abort errors gracefully - don't add error message to chat
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User stopped the execution - no error message needed
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
        // Add error message directly to the correct chat
        this.addMessageToChat(chatId, {
          role: 'assistant',
          content: `Error: ${errorMessage}`,
        })
        this.completeExecution(chatId, errorMessage)
        return
      } finally {
        this.completeExecution(chatId)
      }
    },

    /** Build the system prompt for a chat based on its current state */
    buildSystemPrompt(chatId: string, deps: ChatExecutionDependencies): string {
      const chat = this.chats[chatId]
      if (!chat) return ''

      const { connectionStore, editorStore } = deps
      const dataConnectionName = chat.dataConnectionName
      const availableConnections = Object.keys(connectionStore.connections)

      // Check if the data connection is currently active/connected
      const isDataConnectionActive =
        dataConnectionName && connectionStore
          ? (connectionStore.connections[dataConnectionName]?.connected ?? false)
          : false

      // Get available imports for the connection
      const availableImports: ChatImport[] = editorStore
        ? Object.values(editorStore.editors)
            .filter((editor: any) => editor.connection === dataConnectionName)
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((editor: any) => ({
              id: editor.id,
              name: editor.name.replace(/\//g, '.'),
              alias: '',
            }))
        : []

      // Note: concepts are passed separately via options.onSymbolsRefresh
      // For now, we pass an empty array - the composable will handle concept refresh
      return buildChatAgentSystemPrompt({
        dataConnectionName,
        availableConnections,
        availableConcepts: [], // Concepts managed by composable
        activeImports: chat.imports,
        availableImportsForConnection: availableImports,
        isDataConnectionActive,
      })
    },
  },
})

export type ChatStoreType = ReturnType<typeof useChatStore>
export default useChatStore
