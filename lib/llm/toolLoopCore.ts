/**
 * Core tool loop execution logic shared between useToolLoop composable and editorStore.
 * This module contains the main iteration loop, tool execution, and message persistence patterns.
 */

import type { LLMMessage, LLMRequestOptions, LLMResponse, LLMToolCall, LLMToolResult } from './base'
import type { ChatMessage, ChatArtifact, ChatToolCall } from '../chats/chat'
import type { ToolCallResult } from './editorRefinementToolExecutor'

const USER_INPUT_START = '<user_input>'
const USER_INPUT_END = '</user_input>'

/** Interface for LLM operations needed by the tool loop */
export interface LLMAdapter {
  generateCompletion(
    connectionName: string,
    options: LLMRequestOptions,
    messages: LLMMessage[],
  ): Promise<LLMResponse>
}

/** Interface for persisting messages during tool loop execution */
export interface MessagePersistence {
  /** Add a message to the conversation history */
  addMessage(message: ChatMessage): void
  /** Add an artifact produced by a tool */
  addArtifact(artifact: ChatArtifact): void
  /** Get current messages for building LLM history */
  getMessages(): ChatMessage[]
}

/** Interface for tool execution */
export interface ToolExecutorFactory {
  /** Create/get a tool executor. Called at the start of each iteration to allow fresh context. */
  getToolExecutor(): {
    executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<ToolCallResult>
  }
}

/** Interface for updating execution state (loading, active tool, etc.) */
export interface ExecutionStateUpdater {
  setActiveToolName(name: string): void
  checkAborted(): boolean
}

/** Options for running the tool loop */
export interface ToolLoopConfig {
  /** Tool definitions in JSON Schema format */
  tools: any[]
  /** Maximum iterations before stopping (safety limit) */
  maxIterations?: number
  /** Build system prompt - called each iteration to allow dynamic prompts */
  buildSystemPrompt: () => string
  /** Optional callback invoked after each tool execution */
  onToolResult?: (toolName: string, result: ToolCallResult) => void
  /** Optional callback when a tool returns awaitsUserInput */
  onAwaitsUserInput?: (result: ToolCallResult, executedToolCalls: ChatToolCall[]) => void
  /** Message sent to agent when it responds with text but no tool call. Defaults to a generic reminder. */
  noToolCallReminder?: string
  /**
   * If true, terminate the loop when the LLM responds with text but no tool calls,
   * instead of re-prompting. Use this for standalone/embedded chat modes where the
   * LLM's plain text response is the final answer.
   */
  terminateOnNoToolCall?: boolean
}

/** Result from running the tool loop */
export interface ToolLoopResult {
  terminated: boolean
  finalMessage?: string
  stopped?: boolean
}

/**
 * Format a tool result for sending to the LLM.
 * Handles artifacts, messages, and errors consistently.
 * Includes artifact IDs so the LLM can reference them in follow-up tool calls.
 */
export function formatToolResultText(result: ToolCallResult): string {
  if (result.success) {
    if (result.artifact) {
      const config = result.artifact.config
      const artifactData = result.artifact.data
      const artifactId = result.artifact.id
      let dataPreview = ''
      if (artifactData) {
        const jsonData =
          typeof artifactData.toJSON === 'function' ? artifactData.toJSON() : artifactData
        // Send full data to the LLM - no truncation
        dataPreview = `\n\nQuery results (${config?.resultSize || 0} rows):\n${JSON.stringify(jsonData, null, 2)}`
      }
      const artifactInfo = config
        ? `Results: ${config.resultSize || 0} rows, ${config.columnCount || 0} columns.`
        : ''
      const idInfo = artifactId ? `Artifact ID: ${artifactId}. ` : ''
      return `Success. ${idInfo}${result.message || artifactInfo}${dataPreview}`
    } else if (result.message) {
      return result.message
    } else {
      return 'Success.'
    }
  } else {
    return `Error: ${result.error}`
  }
}

/**
 * Core tool loop execution.
 * Runs the LLM conversation with tool calls until:
 * - A tool returns terminatesLoop: true (agent explicitly signals done)
 * - A tool returns awaitsUserInput: true (agent pauses for user input)
 * - Max iterations reached (safety limit)
 * - Abort signal triggered
 * - An error occurs
 *
 * If the LLM responds with text and no tool calls, it is re-prompted with a
 * reminder to call a tool. The agent must explicitly call a termination tool
 * (e.g. return_to_user, request_close) to return control to the user.
 */
export async function runToolLoop(
  userMessage: string,
  llmConnectionName: string,
  llmAdapter: LLMAdapter,
  messagePersistence: MessagePersistence,
  toolExecutorFactory: ToolExecutorFactory,
  stateUpdater: ExecutionStateUpdater,
  config: ToolLoopConfig,
): Promise<ToolLoopResult> {
  const MAX_ITERATIONS = config.maxIterations ?? 20

  // currentMessages is the history to send to the LLM, excluding the message we just added
  // (the current user message is sent separately via options.prompt on first iteration)
  // Wrap user message content with delimiters for consistent LLM context across all turns
  let currentMessages: LLMMessage[] = messagePersistence.getMessages().slice(0, -1).map((msg) =>
    msg.role === 'user' && !msg.hidden && msg.content
      ? { ...msg, content: `${USER_INPUT_START}${msg.content}${USER_INPUT_END}` }
      : msg,
  )
  // Wrap user message in delimiters for LLM context; display strips these automatically
  const wrappedUserMessage = `${USER_INPUT_START}${userMessage}${USER_INPUT_END}`
  let currentPrompt = wrappedUserMessage
  let lastResponseText = ''
  // Track whether we've added the user message to currentMessages (happens after first tool call)
  let userMessageAddedToHistory = false

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Check for abort before starting iteration
    if (stateUpdater.checkAborted()) {
      messagePersistence.addMessage({
        role: 'assistant',
        content: lastResponseText || '(Response in progress when stopped)',
      })
      messagePersistence.addMessage({
        role: 'user',
        content: '[User requested pause - conversation can be continued]',
        hidden: true,
      })
      return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
    }

    // Get fresh tool executor for this iteration (allows context updates)
    const toolExecutor = toolExecutorFactory.getToolExecutor()

    const llmOptions: LLMRequestOptions = {
      prompt: currentPrompt,
      systemPrompt: config.buildSystemPrompt(),
      tools: config.tools,
    }

    // Generate LLM response
    const response: LLMResponse = await llmAdapter.generateCompletion(
      llmConnectionName,
      llmOptions,
      currentMessages,
    )

    const responseText = response.text
    lastResponseText = responseText

    // Use structured tool calls from response (preserve full LLMToolCall objects)
    const toolCalls: LLMToolCall[] = response.toolCalls ?? []

    // Check for abort after LLM response
    if (stateUpdater.checkAborted()) {
      messagePersistence.addMessage({
        role: 'assistant',
        content: responseText,
      })
      messagePersistence.addMessage({
        role: 'user',
        content: '[User requested pause - conversation can be continued]',
        hidden: true,
      })
      return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
    }

    // If no tool calls, either terminate (standalone mode) or re-prompt the agent
    if (toolCalls.length === 0) {
      // Persist the assistant's text response
      messagePersistence.addMessage({
        role: 'assistant',
        content: responseText,
      })

      // In standalone/embedded chat mode, a plain text response is the final answer
      if (config.terminateOnNoToolCall) {
        return { terminated: true, finalMessage: responseText }
      }

      // Re-prompt: agent must call a tool; plain text responses are not a valid exit
      const reminder =
        config.noToolCallReminder ??
        'You must call a tool to proceed. If you are finished, call the appropriate completion tool to return control to the user. Do not respond with text only.'

      console.log('[toolLoopCore] No tool call — re-prompting agent to use a tool')

      currentMessages = [
        ...currentMessages,
        ...(!userMessageAddedToHistory
          ? [{ role: 'user' as const, content: wrappedUserMessage }]
          : []),
        { role: 'assistant' as const, content: responseText },
        { role: 'user' as const, content: reminder, hidden: true },
      ]
      userMessageAddedToHistory = true
      currentPrompt = reminder
      continue
    }

    // Execute tool calls
    const toolResults: LLMToolResult[] = []
    const executedToolCalls: ChatToolCall[] = []

    for (const toolCall of toolCalls) {
      // Check for abort before each tool call
      if (stateUpdater.checkAborted()) {
        messagePersistence.addMessage({
          role: 'assistant',
          content: responseText,
          toolCalls: toolCalls.slice(0, executedToolCalls.length),
          executedToolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
        })
        messagePersistence.addMessage({
          role: 'user',
          content: '[User requested pause - conversation can be continued]',
          hidden: true,
        })
        return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
      }

      stateUpdater.setActiveToolName(toolCall.name)
      const result = await toolExecutor.executeToolCall(toolCall.name, toolCall.input)

      // Track executed tool call for UI display
      const chatToolCall: ChatToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
        result: {
          success: result.success,
          message: result.message,
          error: result.error,
        },
      }
      executedToolCalls.push(chatToolCall)

      // Notify caller of tool result
      config.onToolResult?.(toolCall.name, result)

      // Handle artifact
      if (result.artifact) {
        messagePersistence.addArtifact(result.artifact)
      }

      if (result.terminatesLoop) {
        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: '',
        })

        // Persist assistant message with tool calls
        messagePersistence.addMessage({
          role: 'assistant',
          content: responseText,
          toolCalls: toolCalls.slice(0, executedToolCalls.length),
          executedToolCalls: executedToolCalls,
        })

        // Persist tool results (required for OpenAI API on follow-ups)
        messagePersistence.addMessage({
          role: 'user',
          content: '',
          toolResults: toolResults,
          hidden: true,
        })

        return { terminated: true, finalMessage: result.message }
      }

      // Handle awaitsUserInput
      if (result.awaitsUserInput) {
        const awaitingResultText = result.message || 'Awaiting user input.'
        toolResults.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: awaitingResultText,
        })

        messagePersistence.addMessage({
          role: 'assistant',
          content: result.message || '',
          toolCalls: toolCalls.slice(0, executedToolCalls.length),
          executedToolCalls: executedToolCalls,
        })

        messagePersistence.addMessage({
          role: 'user',
          content: '',
          toolResults: toolResults,
          hidden: true,
        })

        config.onAwaitsUserInput?.(result, executedToolCalls)
        return { terminated: false, finalMessage: result.message }
      }

      // Build result text for LLM
      const resultText = formatToolResultText(result)
      toolResults.push({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result: resultText,
      })
    }

    stateUpdater.setActiveToolName('')

    // Persist assistant message with tool calls to session
    messagePersistence.addMessage({
      role: 'assistant',
      content: responseText,
      toolCalls: toolCalls,
      executedToolCalls: executedToolCalls,
    })

    // Persist tool results as separate user message (OpenAI expects role: 'tool' for each result)
    messagePersistence.addMessage({
      role: 'user',
      content: '',
      toolResults: toolResults,
      hidden: true,
    })

    // Also update currentMessages for the next iteration
    // On first tool call cycle, add the user message that was excluded from initial currentMessages
    currentMessages = [
      ...currentMessages,
      ...(!userMessageAddedToHistory
        ? [{ role: 'user' as const, content: wrappedUserMessage }]
        : []),
      {
        role: 'assistant' as const,
        content: responseText,
        toolCalls: toolCalls,
      },
      {
        role: 'user' as const,
        content: '', // Content handled by toolResults
        toolResults: toolResults,
        hidden: true,
      },
    ]
    userMessageAddedToHistory = true

    currentPrompt = '' // No extra prompt needed - tool results speak for themselves

    // Safety check for last iteration
    if (iteration === MAX_ITERATIONS - 1) {
      const warningMessage = responseText + '\n\n(Max tool iterations reached)'
      messagePersistence.addMessage({
        role: 'assistant',
        content: warningMessage,
      })
      return { terminated: false, finalMessage: warningMessage }
    }
  }

  return { terminated: false }
}
