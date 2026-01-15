import { ref, computed, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { LLMRequestOptions, LLMResponse } from '../llm'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { NavigationStore } from '../stores/useScreenNavigation'
import { KeySeparator } from '../data/constants'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'
import { ChatToolExecutor } from '../llm/chatToolExecutor'
import {
  buildChatAgentSystemPrompt,
  parseToolCalls,
  CHAT_TOOLS,
} from '../llm/chatAgentPrompt'
import type { ModelConceptInput } from '../llm/data/models'
import type { ContentInput, CompletionItem } from '../stores/resolver'

export interface UseChatWithToolsOptions {
  llmConnectionStore: LLMConnectionStoreType
  connectionStore: ConnectionStoreType | null
  queryExecutionService: QueryExecutionService | null
  editorStore: EditorStoreType | null

  /**
   * Optional chat store for persistent chats. If not provided, chat state
   * is managed locally (throwaway/embedded chat mode).
   */
  chatStore?: ChatStoreType | null

  /**
   * Data connection name to use. If chatStore is provided, this is read from
   * the active chat. For standalone mode, pass this directly.
   */
  dataConnectionName?: string | null

  /**
   * Initial chat title for standalone mode. Ignored if chatStore is provided.
   */
  initialTitle?: string

  /** Optional - only needed if you want tab name updates in navigation */
  navigationStore?: NavigationStore | null

  /** Optional callback when title is updated (alternative to navigationStore) */
  onTitleUpdate?: (newTitle: string, chatId: string) => void
}

export interface UseChatWithToolsReturn {
  // State
  isChatLoading: Ref<boolean>
  isGeneratingName: Ref<boolean>
  activeToolName: Ref<string>
  activeChatMessages: Ref<ChatMessage[]>
  activeChatArtifacts: Ref<ChatArtifact[]>
  activeChatArtifactIndex: Ref<number>
  chatConcepts: Ref<ModelConceptInput[]>
  chatSymbols: Ref<CompletionItem[]>

  // Computed
  activeChatTitle: ComputedRef<string>
  chatConnectionInfo: ComputedRef<string>
  chatSystemPrompt: ComputedRef<string>
  availableImportsForChat: ComputedRef<ChatImport[]>
  activeImportsForChat: ComputedRef<ChatImport[]>

  // Methods
  handleChatMessageWithTools: (
    message: string,
    chatMessages: ChatMessage[],
  ) => Promise<{ response?: string; artifacts?: ChatArtifact[] } | void>
  handleMessagesUpdate: (newMessages: ChatMessage[]) => void
  handleArtifactsUpdate: (newArtifacts: ChatArtifact[]) => void
  handleActiveArtifactUpdate: (index: number) => void
  handleTitleUpdate: (newTitle: string) => void
  handleImportChange: (newImports: ChatImport[]) => void
  generateChatName: () => Promise<void>
  refreshChatSymbols: () => Promise<CompletionItem[]>
}

export function useChatWithTools(options: UseChatWithToolsOptions): UseChatWithToolsReturn {
  const {
    llmConnectionStore,
    connectionStore,
    queryExecutionService,
    chatStore,
    editorStore,
    navigationStore,
    onTitleUpdate: onTitleUpdateCallback,
    dataConnectionName: initialDataConnectionName,
    initialTitle = 'Chat',
  } = options

  // Standalone mode: track state locally when no chatStore
  const standaloneTitle = ref(initialTitle)
  const standaloneImports = ref<ChatImport[]>([])
  const standaloneDataConnection = ref(initialDataConnectionName || null)

  // Chat state
  const isChatLoading = ref(false)
  const isGeneratingName = ref(false)
  const activeToolName = ref('')
  const activeChatMessages = ref<ChatMessage[]>([])
  const activeChatArtifacts = ref<ChatArtifact[]>([])
  const activeChatArtifactIndex = ref(-1)

  // Concepts fetched from active imports
  const chatConcepts = ref<ModelConceptInput[]>([])
  // Raw completion items for the symbols pane
  const chatSymbols = ref<CompletionItem[]>([])

  // Create tool executor if dependencies are available
  const toolExecutor = computed(() => {
    if (connectionStore && queryExecutionService) {
      return new ChatToolExecutor(
        queryExecutionService,
        connectionStore,
        chatStore || undefined,
        editorStore || undefined,
      )
    }
    return null
  })

  // Helper to get current data connection (from chatStore or standalone)
  const currentDataConnectionName = computed(() => {
    return chatStore?.activeChat?.dataConnectionName ?? standaloneDataConnection.value
  })

  // Helper to get current imports (from chatStore or standalone)
  const currentImports = computed(() => {
    return chatStore?.activeChat?.imports ?? standaloneImports.value
  })

  // Computed properties for chat
  const activeChatTitle = computed(() => {
    if (chatStore?.activeChat) {
      return chatStore.activeChat.name
    }
    return standaloneTitle.value
  })

  const chatConnectionInfo = computed(() => {
    const parts: string[] = []
    if (llmConnectionStore.activeConnection) {
      const conn = llmConnectionStore.getConnection(llmConnectionStore.activeConnection)
      if (conn) {
        parts.push(`${conn.name} (${conn.model})`)
      }
    }
    const dataConn = currentDataConnectionName.value
    if (dataConn) {
      parts.push(`Data: ${dataConn}`)
    }
    return parts.join(' | ')
  })

  // Available imports for current data connection
  const availableImportsForChat = computed((): ChatImport[] => {
    const connectionName = currentDataConnectionName.value
    if (!connectionName || !editorStore) return []

    return Object.values(editorStore.editors)
      .filter((editor) => editor.connection === connectionName)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((editor) => ({
        id: editor.id,
        name: editor.name.replace(/\//g, '.'),
        alias: '',
      }))
  })

  // Currently active imports for chat
  const activeImportsForChat = computed((): ChatImport[] => {
    return currentImports.value
  })

  // Function to fetch concepts/symbols from imports
  const refreshChatSymbols = async (): Promise<CompletionItem[]> => {
    const imports = currentImports.value
    const connectionName = currentDataConnectionName.value

    if (!connectionName) {
      chatConcepts.value = []
      chatSymbols.value = []
      return []
    }

    // Start with model sources from the connection (root imports)
    const modelSources = connectionStore?.getConnectionSources(connectionName) || []
    console.log(
      'Chat symbols refresh - model sources:',
      modelSources.length,
      modelSources.map((s) => s.alias),
    )

    // Add extra content from chat imports
    const importContent: ContentInput[] = (imports || []).map((imp) => ({
      alias: imp.alias || imp.name,
      contents: editorStore?.editors[imp.id]?.contents || '',
    }))
    console.log(
      'Chat symbols refresh - import content:',
      importContent.length,
      importContent.map((s) => s.alias),
    )

    // Combine model sources with import content
    const extraContent: ContentInput[] = [...modelSources, ...importContent]

    // If no sources at all, return empty
    if (extraContent.length === 0) {
      console.log('Chat symbols refresh - no sources, returning empty')
      chatConcepts.value = []
      chatSymbols.value = []
      return []
    }

    try {
      // Build imports array from chat imports to actually import the concepts
      const importsForValidation = (imports || []).map((imp) => ({
        name: imp.name,
        alias: imp.alias || '',
      }))

      // Use validation to get parsed concepts
      const queryInput = {
        text: 'SELECT 1', // Minimal query just to parse sources
        editorType: 'trilogy' as const,
        imports: importsForValidation,
        extraContent,
      }

      const validation = await queryExecutionService?.validateQuery(
        connectionName,
        queryInput,
        false, // Don't log
      )

      if (validation?.data?.completion_items) {
        console.log(
          'Chat symbols refresh - completion_items count:',
          validation.data.completion_items.length,
        )
        console.log(
          'Chat symbols refresh - trilogyTypes:',
          [...new Set(validation.data.completion_items.map((i) => i.trilogyType))],
        )

        // Store raw completion items for the symbols pane
        chatSymbols.value = validation.data.completion_items.filter(
          (item) => item.trilogyType === 'concept',
        )

        console.log('Chat symbols refresh - filtered concepts count:', chatSymbols.value.length)

        // Map CompletionItem to ModelConceptInput for the system prompt
        chatConcepts.value = chatSymbols.value.map((item) => ({
          name: item.label,
          type: item.datatype || item.type,
          description: item.description || undefined,
          calculation: item.calculation || undefined,
          keys: item.keys || undefined,
        }))

        return chatSymbols.value
      }
    } catch (error) {
      console.error('Failed to fetch concepts from imports:', error)
      chatConcepts.value = []
      chatSymbols.value = []
    }
    return []
  }

  // Watch for import changes and fetch concepts
  watch(
    () => currentImports.value,
    async () => {
      await refreshChatSymbols()
    },
    { deep: true, immediate: true },
  )

  // Also watch for data connection changes to refresh symbols with model sources
  watch(
    () => currentDataConnectionName.value,
    async () => {
      await refreshChatSymbols()
    },
    { immediate: true },
  )

  const chatSystemPrompt = computed(() => {
    const dataConnectionName = currentDataConnectionName.value
    const availableConnections = connectionStore ? Object.keys(connectionStore.connections) : []

    // Check if the data connection is currently active/connected
    const isDataConnectionActive =
      dataConnectionName && connectionStore
        ? connectionStore.connections[dataConnectionName]?.connected ?? false
        : false

    return buildChatAgentSystemPrompt({
      dataConnectionName,
      availableConnections,
      availableConcepts: chatConcepts.value,
      activeImports: activeImportsForChat.value,
      availableImportsForConnection: availableImportsForChat.value,
      isDataConnectionActive,
    })
  })

  // Handle import changes from UI
  const handleImportChange = (newImports: ChatImport[]) => {
    if (chatStore?.activeChatId) {
      chatStore.setImports(chatStore.activeChatId, newImports)
    } else {
      // Standalone mode: update local imports
      standaloneImports.value = newImports
    }
  }

  // Watch for active chat changes (only when using chatStore)
  if (chatStore) {
    watch(
      () => chatStore?.activeChat,
      (chat) => {
        if (chat) {
          activeChatMessages.value = [...chat.messages]
          activeChatArtifacts.value = [...chat.artifacts]
          activeChatArtifactIndex.value = chat.activeArtifactIndex
        } else {
          activeChatMessages.value = []
          activeChatArtifacts.value = []
          activeChatArtifactIndex.value = -1
        }
      },
      { immediate: true },
    )
  }

  // Handle chat messages with tool execution loop
  const handleChatMessageWithTools = async (
    message: string,
    chatMessages: ChatMessage[],
  ): Promise<{ response?: string; artifacts?: ChatArtifact[] } | void> => {
    const MAX_TOOL_ITERATIONS = 50 // Safety limit - agent decides when to stop

    if (!llmConnectionStore.activeConnection) {
      return {
        response: 'No LLM connection available. Please configure an LLM provider first.',
      }
    }

    isChatLoading.value = true

    try {
      const allArtifacts: ChatArtifact[] = []
      let currentMessages = [...chatMessages]
      let currentPrompt = message
      let finalResponseText = ''

      // Tool use loop - keep going until LLM stops calling tools or we hit max iterations
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const options: LLMRequestOptions = {
          prompt: currentPrompt,
          systemPrompt: chatSystemPrompt.value,
          tools: CHAT_TOOLS,
        }

        // Generate completion from LLM
        const response: LLMResponse = await llmConnectionStore.generateCompletion(
          llmConnectionStore.activeConnection,
          options,
          currentMessages,
        )

        const responseText = response.text
        const toolCalls = parseToolCalls(responseText)

        // If no tool calls, we're done - return the final response
        if (toolCalls.length === 0 || !toolExecutor.value) {
          finalResponseText = responseText
          break
        }

        // Execute tool calls and build tool results
        const toolResults: string[] = []

        for (const toolCall of toolCalls) {
          activeToolName.value = toolCall.name
          const result = await toolExecutor.value.executeToolCall(toolCall.name, toolCall.input)

          if (result.success) {
            // Check if this tool triggers a symbol refresh (e.g., add_import, remove_import)
            let symbolInfo = ''
            if (result.triggersSymbolRefresh) {
              const updatedSymbols = await refreshChatSymbols()
              if (updatedSymbols.length > 0) {
                // Include updated symbol names in the result for the agent
                const symbolNames = updatedSymbols
                  .slice(0, 50) // Limit to first 50 symbols
                  .map((s) => s.label)
                  .join(', ')
                symbolInfo = `\n\nUpdated available fields (${updatedSymbols.length} total): ${symbolNames}${updatedSymbols.length > 50 ? '...' : ''}`
              } else {
                symbolInfo = '\n\nNo fields available after import change.'
              }
            }

            if (result.artifact) {
              allArtifacts.push(result.artifact)
              // Format result for LLM - include actual data so agent can analyze it
              const config = result.artifact.config
              const artifactData = result.artifact.data
              let dataPreview = ''
              if (artifactData) {
                // Convert Results to JSON for the agent
                const jsonData =
                  typeof artifactData.toJSON === 'function' ? artifactData.toJSON() : artifactData
                // Limit data rows to avoid token overflow
                const limitedData = {
                  ...jsonData,
                  data: jsonData.data?.slice(0, 100), // Limit to first 100 rows
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
            hidden: true, // Tool results are hidden in UI
          },
        ]

        // Clear prompt for continuation (context is in messages)
        currentPrompt = 'Continue based on the tool results.'

        // If this is the last iteration, save the response
        if (iteration === MAX_TOOL_ITERATIONS - 1) {
          finalResponseText = responseText + '\n\n(Max tool iterations reached)'
        }
      }

      return {
        response: finalResponseText,
        artifacts: allArtifacts.length > 0 ? allArtifacts : undefined,
      }
    } catch (err) {
      return {
        response: `Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`,
      }
    } finally {
      isChatLoading.value = false
      activeToolName.value = ''
    }
  }

  // Update handlers for chat state synchronization with store
  const handleMessagesUpdate = (newMessages: ChatMessage[]) => {
    activeChatMessages.value = newMessages
    if (chatStore?.activeChatId) {
      // Sync messages to the active chat in the store
      const chat = chatStore.chats[chatStore.activeChatId]
      if (chat) {
        chat.messages = [...newMessages]
        chat.changed = true
      }
    }
  }

  const handleArtifactsUpdate = (newArtifacts: ChatArtifact[]) => {
    activeChatArtifacts.value = newArtifacts
    if (chatStore?.activeChatId) {
      const chat = chatStore.chats[chatStore.activeChatId]
      if (chat) {
        chat.artifacts = [...newArtifacts]
        chat.changed = true
      }
    }
  }

  const handleActiveArtifactUpdate = (index: number) => {
    activeChatArtifactIndex.value = index
    if (chatStore?.activeChatId) {
      chatStore.setActiveArtifact(chatStore.activeChatId, index)
    }
  }

  const handleTitleUpdate = (newTitle: string) => {
    if (chatStore?.activeChatId) {
      // Persistent mode: update store
      chatStore.updateChatName(chatStore.activeChatId, newTitle)

      // Use callback if provided, otherwise fall back to navigationStore
      if (onTitleUpdateCallback) {
        onTitleUpdateCallback(newTitle, chatStore.activeChatId)
      } else if (navigationStore) {
        // Update the tab name in navigation
        const chat = chatStore.activeChat
        if (chat) {
          const address = `${chat.llmConnectionName}${KeySeparator}${chat.id}`
          navigationStore.updateTabName('llms', newTitle, address)
        }
      }
    } else {
      // Standalone mode: update local title
      standaloneTitle.value = newTitle
      if (onTitleUpdateCallback) {
        onTitleUpdateCallback(newTitle, 'standalone')
      }
    }
  }

  // Generate a chat name using the fast model
  const generateChatName = async () => {
    if (!llmConnectionStore.activeConnection || activeChatMessages.value.length === 0) {
      return
    }

    isGeneratingName.value = true
    try {
      const newName = await llmConnectionStore.generateChatName(
        llmConnectionStore.activeConnection,
        activeChatMessages.value,
      )
      handleTitleUpdate(newName)
    } catch (error) {
      console.error('Failed to generate chat name:', error)
    } finally {
      isGeneratingName.value = false
    }
  }

  return {
    // State
    isChatLoading,
    isGeneratingName,
    activeToolName,
    activeChatMessages,
    activeChatArtifacts,
    activeChatArtifactIndex,
    chatConcepts,
    chatSymbols,

    // Computed
    activeChatTitle,
    chatConnectionInfo,
    chatSystemPrompt,
    availableImportsForChat,
    activeImportsForChat,

    // Methods
    handleChatMessageWithTools,
    handleMessagesUpdate,
    handleArtifactsUpdate,
    handleActiveArtifactUpdate,
    handleTitleUpdate,
    handleImportChange,
    generateChatName,
    refreshChatSymbols,
  }
}
