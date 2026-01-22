import { defineStore } from 'pinia'
import { Chat } from '../chats/chat'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'
import type { LLMRequestOptions, LLMResponse } from '../llm'
import type { LLMConnectionStoreType } from './llmStore'
import type { ConnectionStoreType } from './connectionStore'
import type QueryExecutionService from './queryExecutionService'
import type { EditorStoreType } from './editorStore'
import { ChatToolExecutor } from '../llm/chatToolExecutor'
import { buildChatAgentSystemPrompt, CHAT_TOOLS } from '../llm/chatAgentPrompt'
import type { LLMToolCall } from '../llm/base'
import type { CompletionItem } from './resolver'

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
      this.chatExecutions[chatId] = {
        isLoading: true,
        activeToolName: '',
        error: null,
        rateLimitBackoff: null,
      }
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
      const MAX_TOOL_ITERATIONS = 50
      const MAX_AUTO_CONTINUE = 3 // Limit auto-continuation to prevent infinite loops

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

      try {
        const allArtifacts: ChatArtifact[] = []
        let currentMessages = [...chat.messages]
        let currentPrompt = message
        let finalResponseText = ''
        let autoContinueCount = 0

        // Create tool executor for this execution
        const toolExecutor = new ChatToolExecutor(
          queryExecutionService,
          connectionStore,
          this,
          editorStore,
        )

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt(chatId, deps)

        // Tool use loop - keep going until LLM stops calling tools or we hit max iterations
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const llmOptions: LLMRequestOptions = {
            prompt: currentPrompt,
            systemPrompt,
            tools: CHAT_TOOLS,
            // Notify the store when rate-limited so UI can show feedback
            onRateLimitBackoff: (attempt, delayMs) => {
              this.setRateLimitBackoff(chatId, attempt, delayMs)
            },
          }

          // Generate completion from LLM
          const response: LLMResponse = await llmConnectionStore.generateCompletion(
            llmConnectionName,
            llmOptions,
            currentMessages,
          )

          // Clear backoff state after successful completion
          this.clearRateLimitBackoff(chatId)

          const responseText = response.text
          // Use structured tool calls from response
          const toolCalls: Array<{ name: string; input: Record<string, any> }> =
            response.toolCalls?.map((tc: LLMToolCall) => ({ name: tc.name, input: tc.input })) ?? []

          // If no tool calls, check if we should auto-continue
          if (toolCalls.length === 0) {
            finalResponseText = responseText
            // Add the final assistant response directly to the correct chat
            this.addMessageToChat(chatId, {
              role: 'assistant',
              content: responseText,
            })

            // Check if we should auto-continue (LLM stated intention but didn't act)
            if (autoContinueCount < MAX_AUTO_CONTINUE) {
              try {
                const shouldContinue = await llmConnectionStore.shouldAutoContinue(
                  llmConnectionName,
                  responseText,
                )

                if (shouldContinue) {
                  autoContinueCount++
                  console.log(
                    `[Auto-continue] Triggering continuation ${autoContinueCount}/${MAX_AUTO_CONTINUE}`,
                  )

                  // Update messages to include the response we just added
                  currentMessages = [
                    ...currentMessages,
                    { role: 'assistant' as const, content: responseText },
                    {
                      role: 'user' as const,
                      content: 'Continue with the action you described.',
                      hidden: true,
                    },
                  ]
                  currentPrompt = 'Continue with the action you described.'
                  // Continue the loop instead of breaking
                  continue
                }
              } catch (error) {
                console.error('[Auto-continue] Error checking auto-continue:', error)
                // On error, just proceed normally (don't auto-continue)
              }
            }

            break
          }

          // Execute tool calls and build tool results
          const toolResults: string[] = []

          for (const toolCall of toolCalls) {
            this.setActiveToolName(chatId, toolCall.name)
            const result = await toolExecutor.executeToolCall(toolCall.name, toolCall.input)

            if (result.success) {
              // Check if this tool triggers a symbol refresh (e.g., add_import, remove_import)
              let symbolInfo = ''
              if (result.triggersSymbolRefresh && options.onSymbolsRefresh) {
                const updatedSymbols = await options.onSymbolsRefresh()
                if (updatedSymbols.length > 0) {
                  const symbolNames = updatedSymbols
                    .slice(0, 50)
                    .map((s) => s.label)
                    .join(', ')
                  symbolInfo = `\n\nUpdated available fields (${updatedSymbols.length} total): ${symbolNames}${updatedSymbols.length > 50 ? '...' : ''}`
                } else {
                  symbolInfo = '\n\nNo fields available after import change.'
                }
              }

              if (result.artifact) {
                allArtifacts.push(result.artifact)
                // Add artifact to chat immediately so it persists
                this.addArtifactToChat(chatId, result.artifact)

                // For chart artifacts, inject the chart into the chat as a message
                // so the user sees it inline in the conversation
                if (result.artifact.type === 'chart') {
                  this.addMessageToChat(chatId, {
                    role: 'assistant',
                    content: '',
                    artifact: result.artifact,
                    hidden: false,
                  })
                }

                // Format result for LLM - include actual data so agent can analyze it
                const config = result.artifact.config
                const artifactData = result.artifact.data
                let dataPreview = ''
                if (artifactData) {
                  const jsonData =
                    typeof artifactData.toJSON === 'function' ? artifactData.toJSON() : artifactData
                  const limitedData = {
                    ...jsonData,
                    data: jsonData.data?.slice(0, 100),
                  }
                  dataPreview = `\n\nQuery results (${config?.resultSize || 0} rows, showing up to 100):\n${JSON.stringify(limitedData, null, 2)}`
                }
                const artifactInfo = config
                  ? `Results: ${config.resultSize || 0} rows, ${config.columnCount || 0} columns.`
                  : ''
                toolResults.push(
                  `<tool_result name="${toolCall.name}">\nSuccess. ${result.message || artifactInfo}${dataPreview}${symbolInfo}\n</tool_result>`,
                )
              } else if (result.message) {
                toolResults.push(
                  `<tool_result name="${toolCall.name}">\n${result.message}${symbolInfo}\n</tool_result>`,
                )
              }
            } else {
              toolResults.push(
                `<tool_result name="${toolCall.name}">\nError: ${result.error}\n</tool_result>`,
              )
            }
          }

          // Add assistant response and tool results to conversation for next iteration
          currentMessages = [
            ...currentMessages,
            { role: 'assistant' as const, content: responseText },
            {
              role: 'user' as const,
              content: toolResults.join('\n\n'),
              hidden: true,
            },
          ]

          // Clear prompt for continuation (context is in messages)
          currentPrompt = 'Continue based on the tool results.'

          // Reset auto-continue count after successful tool execution
          // This allows a fresh set of auto-continues after each tool action
          autoContinueCount = 0

          // If this is the last iteration, add response with warning to chat
          if (iteration === MAX_TOOL_ITERATIONS - 1) {
            finalResponseText = responseText + '\n\n(Max tool iterations reached)'
            this.addMessageToChat(chatId, {
              role: 'assistant',
              content: finalResponseText,
            })
          }
        }

        // Return void for persistent chats - messages are added directly to the store
        // The artifacts are also already added during execution
        return
      } catch (err) {
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
