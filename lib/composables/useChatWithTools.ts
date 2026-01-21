import { ref, computed, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { ChatStoreType, RateLimitBackoff } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { NavigationStore } from '../stores/useScreenNavigation'
import { KeySeparator } from '../data/constants'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'
import { buildChatAgentSystemPrompt } from '../llm/chatAgentPrompt'
import { completionItemsToConcepts } from '../llm/editorRefinementTools'
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
  isChatLoading: ComputedRef<boolean>
  isGeneratingName: Ref<boolean>
  activeToolName: ComputedRef<string>
  rateLimitBackoff: ComputedRef<RateLimitBackoff | null>
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

  // Local state for standalone mode (when no chatStore)
  const standaloneLoading = ref(false)
  const standaloneActiveToolName = ref('')

  // Chat state refs for UI binding
  const isGeneratingName = ref(false)
  const activeChatMessages = ref<ChatMessage[]>([])
  const activeChatArtifacts = ref<ChatArtifact[]>([])
  const activeChatArtifactIndex = ref(-1)

  // Concepts fetched from active imports
  const chatConcepts = ref<ModelConceptInput[]>([])
  // Raw completion items for the symbols pane
  const chatSymbols = ref<CompletionItem[]>([])

  // Helper to get current data connection (from chatStore or standalone)
  const currentDataConnectionName = computed(() => {
    return chatStore?.activeChat?.dataConnectionName ?? standaloneDataConnection.value
  })

  // Helper to get current imports (from chatStore or standalone)
  const currentImports = computed(() => {
    return chatStore?.activeChat?.imports ?? standaloneImports.value
  })

  // Loading state - reads from store if available, otherwise local ref
  const isChatLoading = computed(() => {
    if (chatStore?.activeChatId) {
      return chatStore.isChatExecuting(chatStore.activeChatId)
    }
    return standaloneLoading.value
  })

  // Active tool name - reads from store if available, otherwise local ref
  const activeToolName = computed(() => {
    if (chatStore?.activeChatId) {
      return chatStore.getChatActiveToolName(chatStore.activeChatId)
    }
    return standaloneActiveToolName.value
  })

  // Rate limit backoff state - reads from store if available
  const rateLimitBackoff = computed((): RateLimitBackoff | null => {
    if (chatStore?.activeChatId) {
      return chatStore.getChatRateLimitBackoff(chatStore.activeChatId)
    }
    return null
  })

  // Computed properties for chat
  const activeChatTitle = computed(() => {
    if (chatStore?.activeChat) {
      return chatStore.activeChat.name
    }
    return standaloneTitle.value
  })

  // Helper to get current LLM connection (from chatStore or standalone - fallback to global active)
  const currentLLMConnectionName = computed(() => {
    return chatStore?.activeChat?.llmConnectionName ?? llmConnectionStore.activeConnection
  })

  const chatConnectionInfo = computed(() => {
    const parts: string[] = []
    const llmConnName = currentLLMConnectionName.value
    if (llmConnName) {
      const conn = llmConnectionStore.getConnection(llmConnName)
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

    // Build extra content: connection sources + all editors for this connection
    // This ensures symbols in files with cross-file dependencies (like 'import etl') can be parsed
    console.log(`[useChatWithTools] Refreshing symbols for connection: "${connectionName}"`)
    const allConnectionEditors = editorStore
      ? Object.values(editorStore.editors)
          .filter((editor) => {
            const matches = editor.connection === connectionName && !editor.deleted
            return matches
          })
          .map((editor) => ({
            alias: editor.name,
            contents: editor.contents,
          }))
      : []
    console.log(
      `[useChatWithTools] Found ${allConnectionEditors.length} editors:`,
      allConnectionEditors.map((e) => e.alias),
    )

    const modelSources = connectionStore?.getConnectionSources(connectionName) || []

    const extraContentMap = new Map<string, string>()

    // Start with connection sources
    modelSources.forEach((s) => extraContentMap.set(s.alias, s.contents))

    // Add/overwrite with all editors for this connection
    allConnectionEditors.forEach((s) => extraContentMap.set(s.alias, s.contents))

    // Also include chat imports content explicitly
    const importContent: ContentInput[] = (imports || []).map((imp) => ({
      alias: imp.alias || imp.name,
      contents: editorStore?.editors[imp.id]?.contents || '',
    }))

    importContent.forEach((s) => extraContentMap.set(s.alias, s.contents))

    const extraContent: ContentInput[] = Array.from(extraContentMap.entries()).map(
      ([alias, contents]) => ({
        alias,
        contents,
      }),
    )

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
        console.log('Chat symbols refresh - trilogyTypes:', [
          ...new Set(validation.data.completion_items.map((i) => i.trilogyType)),
        ])

        // Convert to concepts (filters to trilogyType === 'concept' and maps to ModelConceptInput)
        chatConcepts.value = completionItemsToConcepts(validation.data.completion_items)

        // Store filtered symbols for the symbols pane (same filter as completionItemsToConcepts)
        chatSymbols.value = validation.data.completion_items.filter(
          (item) => item.trilogyType === 'concept',
        )

        console.log('Chat symbols refresh - filtered concepts count:', chatSymbols.value.length)

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
        ? (connectionStore.connections[dataConnectionName]?.connected ?? false)
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

    // Also watch for changes to the active chat's messages/artifacts
    // This ensures UI updates when execution adds messages in the background
    watch(
      () => chatStore?.activeChat?.messages,
      (messages) => {
        if (messages) {
          activeChatMessages.value = [...messages]
        }
      },
      { deep: true },
    )

    watch(
      () => chatStore?.activeChat?.artifacts,
      (artifacts) => {
        if (artifacts) {
          activeChatArtifacts.value = [...artifacts]
        }
      },
      { deep: true },
    )

    watch(
      () => chatStore?.activeChat?.activeArtifactIndex,
      (index) => {
        if (index !== undefined) {
          activeChatArtifactIndex.value = index
        }
      },
    )
  }

  /**
   * Handle chat messages with tool execution loop.
   * Delegates to chatStore.executeMessage for persistent chats,
   * which allows execution to continue even if the component unmounts.
   */
  const handleChatMessageWithTools = async (
    message: string,
    chatMessages: ChatMessage[],
  ): Promise<{ response?: string; artifacts?: ChatArtifact[] } | void> => {
    // For persistent chats, delegate to the store
    if (chatStore?.activeChatId && connectionStore && queryExecutionService && editorStore) {
      return chatStore.executeMessage(
        chatStore.activeChatId,
        message,
        {
          llmConnectionStore,
          connectionStore,
          queryExecutionService,
          editorStore,
        },
        {
          onSymbolsRefresh: refreshChatSymbols,
        },
      )
    }

    // Standalone mode: execute locally (won't persist across navigation)
    // This path is used for embedded/throwaway chats without a chatStore
    if (!llmConnectionStore.activeConnection) {
      return {
        response: 'No LLM connection available. Please configure an LLM provider first.',
      }
    }

    // For standalone mode, we still need basic execution
    // but it won't persist if the component unmounts
    standaloneLoading.value = true
    try {
      const response = await llmConnectionStore.generateCompletion(
        llmConnectionStore.activeConnection,
        {
          prompt: message,
          systemPrompt: chatSystemPrompt.value,
        },
        chatMessages,
      )
      return { response: response.text }
    } catch (err) {
      return {
        response: `Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`,
      }
    } finally {
      standaloneLoading.value = false
      standaloneActiveToolName.value = ''
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
    // State (now computed from store for persistent chats)
    isChatLoading,
    isGeneratingName,
    activeToolName,
    rateLimitBackoff,
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
