import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { LLMToolCall } from '../llm/base'
import type { ChatMessage, ChatArtifact } from '../chats/chat'
import type { ToolCallResult } from '../llm/editorRefinementToolExecutor'
import {
  runToolLoop,
  type LLMAdapter,
  type MessagePersistence,
  type ToolExecutorFactory,
  type ExecutionStateUpdater,
} from '../llm/toolLoopCore'

export interface ToolExecutor {
  executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<ToolCallResult>
}

export interface ToolLoopOptions {
  /** Tool definitions in JSON Schema format */
  tools: any[]
  /** Maximum iterations before stopping (safety limit) */
  maxIterations?: number
  /** Maximum auto-continue attempts when LLM doesn't call tools */
  maxAutoContinue?: number
  /** Optional callback invoked after each tool execution */
  onToolResult?: (toolName: string, result: ToolCallResult) => void
}

export interface UseToolLoopReturn {
  // State
  messages: Ref<ChatMessage[]>
  artifacts: Ref<ChatArtifact[]>
  isLoading: Ref<boolean>
  activeToolName: Ref<string>
  error: Ref<string | null>

  // Methods
  executeMessage: (
    userMessage: string,
    llmStore: LLMConnectionStoreType,
    llmConnectionName: string,
    systemPrompt: string,
    toolExecutor: ToolExecutor,
    options?: ToolLoopOptions,
  ) => Promise<{ terminated: boolean; finalMessage?: string; stopped?: boolean }>
  addMessage: (message: ChatMessage) => void
  clearMessages: () => void
  setMessages: (msgs: ChatMessage[]) => void
  setArtifacts: (arts: ChatArtifact[]) => void
  setIsLoading: (loading: boolean) => void
  stop: () => void
}

/**
 * Generic composable for running a multi-hop tool execution loop.
 * Designed to be reusable across different surfaces (editor refinement, etc.)
 */
export function useToolLoop(): UseToolLoopReturn {
  const messages = ref<ChatMessage[]>([])
  const artifacts = ref<ChatArtifact[]>([])
  const isLoading = ref(false)
  const activeToolName = ref('')
  const error = ref<string | null>(null)

  // Abort controller for stopping execution
  let abortController: AbortController | null = null

  const stop = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  const addMessage = (message: ChatMessage) => {
    messages.value = [...messages.value, message]
  }

  const clearMessages = () => {
    messages.value = []
    artifacts.value = []
    error.value = null
  }

  const setMessages = (msgs: ChatMessage[]) => {
    messages.value = [...msgs]
  }

  const setArtifacts = (arts: ChatArtifact[]) => {
    artifacts.value = [...arts]
  }

  const setIsLoading = (loading: boolean) => {
    isLoading.value = loading
  }

  /**
   * Execute a message through the tool loop.
   * Returns when:
   * - LLM responds without tool calls
   * - A tool returns terminatesLoop: true
   * - Max iterations reached
   * - An error occurs
   */
  const executeMessage = async (
    userMessage: string,
    llmStore: LLMConnectionStoreType,
    llmConnectionName: string,
    systemPrompt: string,
    toolExecutor: ToolExecutor,
    options: ToolLoopOptions = { tools: [] },
  ): Promise<{ terminated: boolean; finalMessage?: string; stopped?: boolean }> => {
    if (!llmConnectionName) {
      error.value = 'No LLM connection available'
      return { terminated: false, finalMessage: error.value }
    }

    isLoading.value = true
    activeToolName.value = ''
    error.value = null

    // Create new abort controller for this execution
    abortController = new AbortController()
    const signal = abortController.signal

    // Add user message to messages.value for UI display
    addMessage({
      role: 'user',
      content: userMessage,
    })

    try {
      // Create adapters for the core tool loop
      const llmAdapter: LLMAdapter = {
        generateCompletion: (connectionName, llmOptions, msgs) =>
          llmStore.generateCompletion(connectionName, llmOptions, msgs),
        shouldAutoContinue: (connectionName, responseText) =>
          llmStore.shouldAutoContinue(connectionName, responseText),
      }

      const messagePersistence: MessagePersistence = {
        addMessage: (msg) => {
          messages.value = [...messages.value, msg]
        },
        addArtifact: (artifact) => {
          artifacts.value = [...artifacts.value, artifact]
        },
        getMessages: () => messages.value,
      }

      const toolExecutorFactory: ToolExecutorFactory = {
        getToolExecutor: () => toolExecutor,
      }

      const stateUpdater: ExecutionStateUpdater = {
        setActiveToolName: (name) => {
          activeToolName.value = name
        },
        checkAborted: () => signal.aborted,
      }

      return await runToolLoop(
        userMessage,
        llmConnectionName,
        llmAdapter,
        messagePersistence,
        toolExecutorFactory,
        stateUpdater,
        {
          tools: options.tools,
          maxIterations: options.maxIterations,
          maxAutoContinue: options.maxAutoContinue,
          buildSystemPrompt: () => systemPrompt,
          onToolResult: options.onToolResult,
        },
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
      error.value = errorMessage
      addMessage({
        role: 'assistant',
        content: `Error: ${errorMessage}`,
      })
      return { terminated: false, finalMessage: `Error: ${errorMessage}` }
    } finally {
      isLoading.value = false
      activeToolName.value = ''
      abortController = null
    }
  }

  return {
    messages,
    artifacts,
    isLoading,
    activeToolName,
    error,
    executeMessage,
    addMessage,
    clearMessages,
    setMessages,
    setArtifacts,
    setIsLoading,
    stop,
  }
}
