import { ref, computed, watch, onMounted } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatMessage, ChatArtifact } from '../chats/chat'
import type { ChartConfig } from '../editors/results'
import type { CompletionItem, ContentInput } from '../stores/resolver'
import type { EditorType } from '../editors/editor'
import { useToolLoop } from './useToolLoop'
import {
  EditorRefinementToolExecutor,
  type EditorContext,
  type QueryExecutionResult,
} from '../llm/editorRefinementToolExecutor'
import {
  getEditorRefinementTools,
  buildEditorRefinementPrompt,
  type EditorRefinementContext,
} from '../llm/editorRefinementTools'

export interface EditorRefinementSession {
  messages: ChatMessage[]
  artifacts: ChatArtifact[]
  originalContent: string
  originalChartConfig?: ChartConfig
  currentContent: string
  currentChartConfig?: ChartConfig
  /** True if a request was in-progress when the session was saved (execution was interrupted) */
  wasLoading?: boolean
}

export interface UseEditorRefinementOptions {
  llmConnectionStore: LLMConnectionStoreType
  connectionStore: ConnectionStoreType
  queryExecutionService: QueryExecutionService
  editorStore?: EditorStoreType

  // Editor context
  connectionName: string
  editorType?: EditorType
  initialContent: string
  selectedText?: string
  selectionRange?: { start: number; end: number }
  chartConfig?: ChartConfig
  completionSymbols?: CompletionItem[]

  // Session persistence
  existingSession?: EditorRefinementSession | null

  // Callbacks
  onContentChange?: (content: string, replaceSelection?: boolean) => void
  onChartConfigChange?: (config: ChartConfig) => void
  onFinish?: (message?: string) => void
  onDiscard?: () => void
  onSessionChange?: (session: EditorRefinementSession) => void
  onRunActiveEditorQuery?: () => Promise<QueryExecutionResult>
}

export interface UseEditorRefinementReturn {
  // State
  messages: Ref<ChatMessage[]>
  artifacts: Ref<ChatArtifact[]>
  isLoading: Ref<boolean>
  activeToolName: Ref<string>
  currentContent: Ref<string>
  currentChartConfig: Ref<ChartConfig | undefined>

  // Session management
  session: ComputedRef<EditorRefinementSession>

  // Methods
  sendMessage: (message: string) => Promise<void>
  accept: () => void
  discard: () => void
  stop: () => void
}

/**
 * Composable for editor refinement with tool-based LLM interactions.
 * Wraps useToolLoop with editor-specific configuration and state management.
 */
export function useEditorRefinement(
  options: UseEditorRefinementOptions,
): UseEditorRefinementReturn {
  const {
    llmConnectionStore,
    connectionStore,
    queryExecutionService,
    editorStore,
    connectionName,
    editorType = 'trilogy',
    initialContent,
    selectedText,
    selectionRange,
    chartConfig: initialChartConfig,
    completionSymbols = [],
    existingSession,
    onContentChange,
    onChartConfigChange,
    onFinish,
    onDiscard,
    onSessionChange,
    onRunActiveEditorQuery,
  } = options

  // Use the generic tool loop
  const toolLoop = useToolLoop()

  // Track current editor state (may differ from initial after edits)
  const currentContent = ref(existingSession?.currentContent ?? initialContent)
  const currentChartConfig = ref<ChartConfig | undefined>(
    existingSession?.currentChartConfig ?? initialChartConfig,
  )

  // Track original state for discard
  const originalContent = ref(existingSession?.originalContent ?? initialContent)
  const originalChartConfig = ref<ChartConfig | undefined>(
    existingSession?.originalChartConfig ?? initialChartConfig,
  )

  // Restore session if provided
  if (existingSession) {
    toolLoop.setMessages(existingSession.messages)
    toolLoop.setArtifacts(existingSession.artifacts)
    // Restore the loading state if the session was interrupted mid-request
    if (existingSession.wasLoading) {
      toolLoop.setIsLoading(true)
    }
  }

  // Track available symbols - starts with provided symbols, updated on validation
  const availableSymbols = ref<CompletionItem[]>(completionSymbols)

  // Helper to build extra content for validation
  const buildExtraContent = (): ContentInput[] => {
    const extraContentMap = new Map<string, string>()

    // Add connection sources
    const connectionSources = connectionStore.getConnectionSources(connectionName)
    connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))

    // Add all editors for this connection — scope by origin so a remote
    // editor with the same connection name doesn't sneak into a local
    // refinement (or vice versa).
    if (editorStore) {
      const connection = connectionStore.connectionByName(connectionName)
      if (connection) {
        Object.values(editorStore.editors)
          .filter((editor) => !editor.deleted && editor.connectionId === connection.id)
          .forEach((editor) => {
            extraContentMap.set(editor.name, editor.contents)
          })
      }
    }

    return Array.from(extraContentMap.entries()).map(([alias, contents]) => ({
      alias,
      contents,
    }))
  }

  // Run initial validation to populate symbols if not provided
  const runInitialValidation = async () => {
    // Skip if we already have symbols or session is being restored
    if (completionSymbols.length > 0 || existingSession) {
      return
    }

    try {
      const validation = await queryExecutionService.validateQuery(
        connectionName,
        {
          text: currentContent.value.trim(),
          editorType: 'trilogy',
          imports: [],
          extraContent: buildExtraContent(),
        },
        false, // Don't log
      )

      if (validation?.data?.completion_items) {
        availableSymbols.value = validation.data.completion_items
      }
    } catch (error) {
      // Validation errors are expected, we just want the symbols
      console.debug('Initial validation for symbols:', error)
    }
  }

  // Run initial validation on mount
  onMounted(() => {
    runInitialValidation()
  })

  // Build the session object for persistence
  const session = computed<EditorRefinementSession>(() => ({
    messages: toolLoop.messages.value,
    artifacts: toolLoop.artifacts.value,
    originalContent: originalContent.value,
    originalChartConfig: originalChartConfig.value,
    currentContent: currentContent.value,
    currentChartConfig: currentChartConfig.value,
    wasLoading: toolLoop.isLoading.value,
  }))

  // Watch for session changes and notify
  watch(
    session,
    (newSession) => {
      onSessionChange?.(newSession)
    },
    { deep: true },
  )

  // Build editor context for tool executor
  const buildEditorContext = (): EditorContext => ({
    editorType,
    connectionName,
    editorContents: currentContent.value,
    selectedText,
    selectionRange,
    chartConfig: currentChartConfig.value,
    onEditorContentChange: (content: string, replaceSelection?: boolean) => {
      if (replaceSelection && selectionRange) {
        // Replace only the selected portion
        const before = currentContent.value.slice(0, selectionRange.start)
        const after = currentContent.value.slice(selectionRange.end)
        currentContent.value = before + content + after
      } else {
        currentContent.value = content
      }
      onContentChange?.(currentContent.value, replaceSelection)
    },
    onChartConfigChange: (config: ChartConfig) => {
      currentChartConfig.value = config
      onChartConfigChange?.(config)
    },
    onFinish: (message?: string) => {
      onFinish?.(message)
    },
    onRunActiveEditorQuery: onRunActiveEditorQuery ? () => onRunActiveEditorQuery() : undefined,
  })

  // Build system prompt
  const buildSystemPrompt = (): string => {
    const context: EditorRefinementContext = {
      editorType,
      connectionName,
      editorContents: currentContent.value,
      selectedText,
      selectionRange,
      chartConfig: currentChartConfig.value,
      completionSymbols: availableSymbols.value,
    }
    return buildEditorRefinementPrompt(context)
  }

  // Send a message through the tool loop
  const sendMessage = async (message: string): Promise<void> => {
    const llmConnectionName = llmConnectionStore.activeConnection
    if (!llmConnectionName) {
      toolLoop.addMessage({
        role: 'assistant',
        content: 'Error: No LLM connection configured. Please set up an LLM provider.',
      })
      return
    }

    // Create tool executor with current context
    const toolExecutor = new EditorRefinementToolExecutor(
      queryExecutionService,
      connectionStore,
      buildEditorContext(),
      editorStore,
    )

    await toolLoop.executeMessage(
      message,
      llmConnectionStore,
      llmConnectionName,
      buildSystemPrompt(),
      toolExecutor,
      {
        tools: getEditorRefinementTools(editorType),
        maxIterations: 20,
        onToolResult: (toolName, result) => {
          // Update available symbols when validation returns them
          if (toolName === 'validate_query' && result.availableSymbols) {
            availableSymbols.value = result.availableSymbols
          }
        },
      },
    )
  }

  // Accept current changes
  const accept = () => {
    onFinish?.('Changes accepted')
  }

  // Discard changes and restore original
  const discard = () => {
    currentContent.value = originalContent.value
    currentChartConfig.value = originalChartConfig.value
    onContentChange?.(originalContent.value)
    if (originalChartConfig.value) {
      onChartConfigChange?.(originalChartConfig.value)
    }
    onDiscard?.()
  }

  // Stop current execution
  const stop = () => {
    toolLoop.stop()
  }

  return {
    messages: toolLoop.messages,
    artifacts: toolLoop.artifacts,
    isLoading: toolLoop.isLoading,
    activeToolName: toolLoop.activeToolName,
    currentContent,
    currentChartConfig,
    session,
    sendMessage,
    accept,
    discard,
    stop,
  }
}
