import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { LLMMessage, LLMRequestOptions, LLMResponse } from '../llm/base'
import type { ChatMessage, ChatArtifact } from '../chats/chat'
import { parseToolCalls } from '../llm/chatAgentPrompt'
import type { ToolCallResult } from '../llm/editorRefinementToolExecutor'

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
    const MAX_ITERATIONS = options.maxIterations ?? 20
    const MAX_AUTO_CONTINUE = options.maxAutoContinue ?? 3

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

    // Add user message
    addMessage({
      role: 'user',
      content: userMessage,
    })

    try {
      let currentMessages: LLMMessage[] = [...messages.value]
      let currentPrompt = userMessage
      let autoContinueCount = 0
      let lastResponseText = ''

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // Check for abort before starting iteration
        if (signal.aborted) {
          // Add pause message for conversation continuity
          addMessage({
            role: 'assistant',
            content: lastResponseText || '(Response in progress when stopped)',
          })
          addMessage({
            role: 'user',
            content: '[User requested pause - conversation can be continued]',
            hidden: true,
          })
          return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
        }

        const llmOptions: LLMRequestOptions = {
          prompt: currentPrompt,
          systemPrompt,
          tools: options.tools,
        }

        // Generate LLM response
        const response: LLMResponse = await llmStore.generateCompletion(
          llmConnectionName,
          llmOptions,
          currentMessages,
        )

        const responseText = response.text
        lastResponseText = responseText
        const toolCalls = parseToolCalls(responseText)

        // Check for abort after LLM response
        if (signal.aborted) {
          // Add the response we got and pause message
          addMessage({
            role: 'assistant',
            content: responseText,
          })
          addMessage({
            role: 'user',
            content: '[User requested pause - conversation can be continued]',
            hidden: true,
          })
          return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
        }

        // If no tool calls, we're done (or check for auto-continue)
        if (toolCalls.length === 0) {
          addMessage({
            role: 'assistant',
            content: responseText,
          })

          // Check if we should auto-continue (skip if aborted)
          if (autoContinueCount < MAX_AUTO_CONTINUE && !signal.aborted) {
            try {
              const shouldContinue = await llmStore.shouldAutoContinue(
                llmConnectionName,
                responseText,
              )

              if (shouldContinue && !signal.aborted) {
                autoContinueCount++
                console.log(`[useToolLoop] Auto-continue ${autoContinueCount}/${MAX_AUTO_CONTINUE}`)

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
                continue
              }
            } catch (err) {
              console.error('[useToolLoop] Auto-continue check error:', err)
            }
          }

          return { terminated: false, finalMessage: responseText }
        }

        // Execute tool calls
        const toolResults: string[] = []

        for (const toolCall of toolCalls) {
          // Check for abort before each tool call
          if (signal.aborted) {
            addMessage({
              role: 'assistant',
              content: responseText,
            })
            addMessage({
              role: 'user',
              content: '[User requested pause - conversation can be continued]',
              hidden: true,
            })
            return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
          }

          activeToolName.value = toolCall.name
          const result = await toolExecutor.executeToolCall(toolCall.name, toolCall.input)

          // Notify caller of tool result
          options.onToolResult?.(toolCall.name, result)

          if (result.terminatesLoop) {
            // Add final message before terminating
            if (result.message) {
              addMessage({
                role: 'assistant',
                content: result.message,
              })
            }
            return { terminated: true, finalMessage: result.message }
          }

          if (result.success) {
            if (result.artifact) {
              artifacts.value = [...artifacts.value, result.artifact]

              // Format artifact result for LLM
              const config = result.artifact.config
              const artifactData = result.artifact.data
              let dataPreview = ''
              if (artifactData) {
                const jsonData =
                  typeof artifactData.toJSON === 'function' ? artifactData.toJSON() : artifactData
                const limitedData = {
                  ...jsonData,
                  data: jsonData.data?.slice(0, 50),
                }
                dataPreview = `\n\nQuery results (${config?.resultSize || 0} rows, showing up to 50):\n${JSON.stringify(limitedData, null, 2)}`
              }
              const artifactInfo = config
                ? `Results: ${config.resultSize || 0} rows, ${config.columnCount || 0} columns.`
                : ''
              toolResults.push(
                `<tool_result name="${toolCall.name}">\nSuccess. ${result.message || artifactInfo}${dataPreview}\n</tool_result>`,
              )
            } else if (result.message) {
              toolResults.push(
                `<tool_result name="${toolCall.name}">\n${result.message}\n</tool_result>`,
              )
            } else {
              toolResults.push(`<tool_result name="${toolCall.name}">\nSuccess.\n</tool_result>`)
            }
          } else {
            toolResults.push(
              `<tool_result name="${toolCall.name}">\nError: ${result.error}\n</tool_result>`,
            )
          }
        }

        activeToolName.value = ''

        // Add tool results to message history for next iteration
        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: responseText },
          {
            role: 'user' as const,
            content: toolResults.join('\n\n'),
            hidden: true,
          },
        ]

        currentPrompt = 'Continue based on the tool results.'
        autoContinueCount = 0 // Reset after successful tool execution

        // Safety check for last iteration
        if (iteration === MAX_ITERATIONS - 1) {
          const warningMessage = responseText + '\n\n(Max tool iterations reached)'
          addMessage({
            role: 'assistant',
            content: warningMessage,
          })
          return { terminated: false, finalMessage: warningMessage }
        }
      }

      return { terminated: false }
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
    stop,
  }
}
