import { defineStore } from 'pinia'
import Editor from '../editors/editor'
import type { EditorRefinementSession } from '../editors/editor'
import { Results } from '../editors/results'
import type { ChartConfig } from '../editors/results'
import { EditorTag } from '../editors'
import type { ChatMessage, ChatArtifact, ChatToolCall } from '../chats/chat'
import type { LLMRequestOptions, LLMResponse } from '../llm'
import type { LLMConnectionStoreType } from './llmStore'
import type { ConnectionStoreType } from './connectionStore'
import type QueryExecutionService from './queryExecutionService'
import type { CompletionItem } from './resolver'
import {
  EditorRefinementToolExecutor,
  type EditorContext,
  type QueryExecutionResult,
} from '../llm/editorRefinementToolExecutor'
import {
  EDITOR_REFINEMENT_TOOLS,
  buildEditorRefinementPrompt,
  type EditorRefinementContext,
} from '../llm/editorRefinementTools'
import type { LLMToolCall, LLMToolResult } from '../llm/base'

/** Per-editor refinement execution state */
export interface RefinementExecution {
  isLoading: boolean
  activeToolName: string
  error: string | null
  abortController: AbortController | null
}

/** Dependencies needed to execute a refinement message */
export interface RefinementExecutionDependencies {
  llmConnectionStore: LLMConnectionStoreType
  connectionStore: ConnectionStoreType
  queryExecutionService: QueryExecutionService
}

const useEditorStore = defineStore('editors', {
  state: () => ({
    editors: {} as Record<string, Editor>, // Use an object instead of Map
    activeEditorName: '',
    activeEditorId: '',
    /** Per-editor refinement execution state - tracks loading, active tool, errors */
    refinementExecutions: {} as Record<string, RefinementExecution>,
  }),
  getters: {
    editorList: (state) => Object.keys(state.editors).map((key) => state.editors[key]),
    unsavedEditors: (state) => {
      return Object.values(state.editors).filter((editor) => editor.changed).length
    },

    /** Get execution state for a specific editor's refinement */
    getRefinementExecution:
      (state) =>
      (editorId: string): RefinementExecution | null =>
        state.refinementExecutions[editorId] || null,

    /** Check if a specific editor's refinement is currently executing */
    isRefinementExecuting:
      (state) =>
      (editorId: string): boolean =>
        state.refinementExecutions[editorId]?.isLoading ?? false,

    /** Get the active tool name for a specific editor's refinement */
    getRefinementActiveToolName:
      (state) =>
      (editorId: string): string =>
        state.refinementExecutions[editorId]?.activeToolName ?? '',
  },
  actions: {
    newEditor(
      name: string,
      type: 'trilogy' | 'sql' | 'preql',
      connection: string,
      contents: string | undefined,
    ) {
      let baseName = name
      let uniqueName = name
      let suffix = 1

      // Keep trying new names with incremented suffixes until we find a unique one
      while (uniqueName in this.editors) {
        uniqueName = `${baseName}_${suffix}`
        suffix++
      }

      let editor = new Editor({
        id: uniqueName,
        name: baseName,
        type,
        connection,
        storage: 'local',
        contents: contents || '',
      })

      this.editors[editor.id] = editor
      return editor
    },
    addEditor(editor: Editor) {
      this.editors[editor.id] = editor
    },
    getEditorByName(name: string): Editor | undefined {
      return Object.values(this.editors).find((editor) => editor.name === name)
    },
    getConnectionEditors(connection: string, tags: EditorTag[] = []) {
      // return Object.values(this.editors).filter((editor) => editor.connection === connection)
      let base = Object.values(this.editors).filter((editor) => editor.connection === connection)
      if (tags.length === 0) {
        return base
      }
      return base.filter((editor) => tags.every((tag) => editor.tags.includes(tag)))
    },
    updateEditorName(id: string, newName: string) {
      this.editors[id].setName(newName)
    },
    removeEditor(id: string) {
      if (this.editors[id]) {
        this.editors[id].deleted = true
      } else {
        return false
      }
    },
    setEditorScrollPosition(id: string, scrollPosition: { line: number; column: number }) {
      if (this.editors[id]) {
        this.editors[id].scrollPosition = scrollPosition
      } else {
        throw new Error(`Editor with id "${id}" not found.`)
      }
    },
    setEditorContents(id: string, contents: string) {
      if (this.editors[id]) {
        this.editors[id].setContent(contents)
      } else {
        throw new Error(`Editor with id "${id}" not found.`)
      }
    },
    setEditorResults(id: string, results: Results) {
      if (this.editors[id]) {
        let editor = this.editors[id]
        editor.results = results
        // clean error state
        editor.setError(null)
      } else {
        throw new Error(`Editor with id "${id}" not found.`)
      }
    },
    getCurrentEditorAutocomplete(word: string) {
      if (!this.activeEditorId) {
        return []
      }
      let activeEditor = this.editors[this.activeEditorId]
      if (!word) {
        return []
      }
      return activeEditor.getAutocomplete(word)
    },

    // ==================== Refinement Session Management ====================

    /** Start a new refinement session for an editor */
    startRefinementSession(
      editorId: string,
      options: {
        selectedText?: string
        selectionRange?: { start: number; end: number }
      } = {},
    ): void {
      const editor = this.editors[editorId]
      if (!editor) return

      const session: EditorRefinementSession = {
        messages: [],
        artifacts: [],
        originalContent: editor.contents,
        originalChartConfig: editor.chartConfig || undefined,
        currentContent: editor.contents,
        currentChartConfig: editor.chartConfig || undefined,
        selectedText: options.selectedText,
        selectionRange: options.selectionRange,
        wasLoading: false,
      }
      editor.setRefinementSession(session)
    },

    /** Update the refinement session for an editor */
    updateRefinementSession(editorId: string, updates: Partial<EditorRefinementSession>): void {
      const editor = this.editors[editorId]
      if (!editor || !editor.refinementSession) return

      editor.setRefinementSession({
        ...editor.refinementSession,
        ...updates,
      })
    },

    /** Add a message to a refinement session */
    addRefinementMessage(editorId: string, message: ChatMessage): void {
      const editor = this.editors[editorId]
      if (!editor || !editor.refinementSession) return

      editor.setRefinementSession({
        ...editor.refinementSession,
        messages: [...editor.refinementSession.messages, message],
      })
    },

    /** Add an artifact to a refinement session */
    addRefinementArtifact(editorId: string, artifact: ChatArtifact): void {
      const editor = this.editors[editorId]
      if (!editor || !editor.refinementSession) return

      editor.setRefinementSession({
        ...editor.refinementSession,
        artifacts: [...editor.refinementSession.artifacts, artifact],
      })
    },

    /** Clear refinement session for an editor */
    clearRefinementSession(editorId: string): void {
      const editor = this.editors[editorId]
      if (!editor) return

      editor.setRefinementSession(null)
      delete this.refinementExecutions[editorId]
    },

    // ==================== Refinement Execution State Management ====================

    /** Initialize execution state for a refinement */
    startRefinementExecution(editorId: string): void {
      this.refinementExecutions[editorId] = {
        isLoading: true,
        activeToolName: '',
        error: null,
        abortController: new AbortController(),
      }
      // Also update the session's wasLoading state
      const editor = this.editors[editorId]
      if (editor?.refinementSession) {
        editor.setRefinementSession({
          ...editor.refinementSession,
          wasLoading: true,
        })
      }
    },

    /** Update the active tool name during execution */
    setRefinementActiveToolName(editorId: string, toolName: string): void {
      if (this.refinementExecutions[editorId]) {
        this.refinementExecutions[editorId].activeToolName = toolName
      }
    },

    /** Mark execution as complete, optionally with an error */
    completeRefinementExecution(editorId: string, error?: string): void {
      if (this.refinementExecutions[editorId]) {
        this.refinementExecutions[editorId].isLoading = false
        this.refinementExecutions[editorId].activeToolName = ''
        this.refinementExecutions[editorId].error = error || null
        this.refinementExecutions[editorId].abortController = null
      }
      // Update the session's wasLoading state
      const editor = this.editors[editorId]
      if (editor?.refinementSession) {
        editor.setRefinementSession({
          ...editor.refinementSession,
          wasLoading: false,
        })
      }
    },

    /** Stop a running refinement execution */
    stopRefinementExecution(editorId: string): void {
      const execution = this.refinementExecutions[editorId]
      if (execution?.abortController) {
        execution.abortController.abort()
      }
    },

    // ==================== Refinement Message Execution ====================

    /**
     * Execute a refinement message with tool support.
     * This runs the full LLM conversation loop including tool calls.
     * The execution persists even if the component unmounts.
     */
    async executeRefinementMessage(
      editorId: string,
      message: string,
      deps: RefinementExecutionDependencies,
      options: {
        onContentChange?: (content: string, replaceSelection?: boolean) => void
        onChartConfigChange?: (config: ChartConfig) => void
        onFinish?: (message?: string) => void
        onRunActiveEditorQuery?: () => Promise<QueryExecutionResult>
      } = {},
    ): Promise<{ terminated: boolean; finalMessage?: string; stopped?: boolean }> {
      const MAX_ITERATIONS = 20
      const MAX_AUTO_CONTINUE = 3

      const editor = this.editors[editorId]
      if (!editor || !editor.refinementSession) {
        return { terminated: false, finalMessage: 'Editor or session not found.' }
      }

      const { llmConnectionStore, connectionStore, queryExecutionService } = deps
      const llmConnectionName = llmConnectionStore.activeConnection
      if (!llmConnectionName) {
        this.addRefinementMessage(editorId, {
          role: 'assistant',
          content: 'Error: No LLM connection configured. Please set up an LLM provider.',
        })
        return { terminated: false, finalMessage: 'No LLM connection available' }
      }

      // Initialize execution state
      this.startRefinementExecution(editorId)
      const signal = this.refinementExecutions[editorId]?.abortController?.signal

      // Add user message
      this.addRefinementMessage(editorId, {
        role: 'user',
        content: message,
      })

      try {
        const session = editor.refinementSession
        let currentMessages: Array<{
          role: 'user' | 'assistant' | 'system'
          content: string
          hidden?: boolean
        }> = [...session.messages]
        let currentPrompt = message
        let autoContinueCount = 0
        let lastResponseText = ''

        // Track available symbols for system prompt updates
        let availableSymbols: CompletionItem[] = editor.completionSymbols || []

        // Build editor context for tool executor
        const buildEditorContext = (): EditorContext => ({
          connectionName: editor.connection,
          editorContents: session.currentContent,
          selectedText: session.selectedText,
          selectionRange: session.selectionRange,
          chartConfig: session.currentChartConfig,
          onEditorContentChange: (content: string, replaceSelection?: boolean) => {
            let newContent = content
            if (replaceSelection && session.selectionRange) {
              const before = session.currentContent.slice(0, session.selectionRange.start)
              const after = session.currentContent.slice(session.selectionRange.end)
              newContent = before + content + after
            }
            this.updateRefinementSession(editorId, { currentContent: newContent })
            options.onContentChange?.(newContent, replaceSelection)
          },
          onChartConfigChange: (config: ChartConfig) => {
            this.updateRefinementSession(editorId, { currentChartConfig: config })
            options.onChartConfigChange?.(config)
          },
          onFinish: (msg?: string) => {
            options.onFinish?.(msg)
          },
          onRunActiveEditorQuery: options.onRunActiveEditorQuery
            ? () => options.onRunActiveEditorQuery!()
            : undefined,
        })

        // Build system prompt
        const buildSystemPrompt = (): string => {
          const currentSession = this.editors[editorId]?.refinementSession
          if (!currentSession) return ''

          const context: EditorRefinementContext = {
            connectionName: editor.connection,
            editorContents: currentSession.currentContent,
            selectedText: currentSession.selectedText,
            selectionRange: currentSession.selectionRange,
            chartConfig: currentSession.currentChartConfig,
            completionSymbols: availableSymbols,
          }
          return buildEditorRefinementPrompt(context)
        }

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          // Check for abort before starting iteration
          if (signal?.aborted) {
            this.addRefinementMessage(editorId, {
              role: 'assistant',
              content: lastResponseText || '(Response in progress when stopped)',
            })
            this.addRefinementMessage(editorId, {
              role: 'user',
              content: '[User requested pause - conversation can be continued]',
              hidden: true,
            })
            return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
          }

          // Create tool executor with current context
          const toolExecutor = new EditorRefinementToolExecutor(
            queryExecutionService,
            connectionStore,
            buildEditorContext(),
            this,
          )

          const llmOptions: LLMRequestOptions = {
            prompt: currentPrompt,
            systemPrompt: buildSystemPrompt(),
            tools: EDITOR_REFINEMENT_TOOLS,
          }

          // Generate LLM response
          const response: LLMResponse = await llmConnectionStore.generateCompletion(
            llmConnectionName,
            llmOptions,
            currentMessages,
          )

          const responseText = response.text
          lastResponseText = responseText

          // Use structured tool calls from response (preserve full LLMToolCall objects)
          const toolCalls: LLMToolCall[] = response.toolCalls ?? []

          // Check for abort after LLM response
          if (signal?.aborted) {
            this.addRefinementMessage(editorId, {
              role: 'assistant',
              content: responseText,
            })
            this.addRefinementMessage(editorId, {
              role: 'user',
              content: '[User requested pause - conversation can be continued]',
              hidden: true,
            })
            return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
          }

          // If no tool calls, we're done (or check for auto-continue)
          if (toolCalls.length === 0) {
            this.addRefinementMessage(editorId, {
              role: 'assistant',
              content: responseText,
            })

            // Check if we should auto-continue (skip if aborted)
            if (autoContinueCount < MAX_AUTO_CONTINUE && !signal?.aborted) {
              try {
                const shouldContinue = await llmConnectionStore.shouldAutoContinue(
                  llmConnectionName,
                  responseText,
                )

                if (shouldContinue && !signal?.aborted) {
                  autoContinueCount++
                  console.log(
                    `[executeRefinementMessage] Auto-continue ${autoContinueCount}/${MAX_AUTO_CONTINUE}`,
                  )

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
                console.error('[executeRefinementMessage] Auto-continue check error:', err)
              }
            }

            return { terminated: false, finalMessage: responseText }
          }

          // Execute tool calls
          const toolResults: LLMToolResult[] = []
          const executedToolCalls: ChatToolCall[] = []

          for (const toolCall of toolCalls) {
            // Check for abort before each tool call
            if (signal?.aborted) {
              this.addRefinementMessage(editorId, {
                role: 'assistant',
                content: responseText,
                toolCalls: toolCalls.slice(0, executedToolCalls.length), // Only include executed ones
                executedToolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
              })
              this.addRefinementMessage(editorId, {
                role: 'user',
                content: '[User requested pause - conversation can be continued]',
                hidden: true,
              })
              return { terminated: false, stopped: true, finalMessage: 'Stopped by user' }
            }

            this.setRefinementActiveToolName(editorId, toolCall.name)
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

            // Update available symbols when validation returns them
            if (toolCall.name === 'validate_query' && result.availableSymbols) {
              availableSymbols = result.availableSymbols
            }

            if (result.terminatesLoop) {
              if (result.message) {
                this.addRefinementMessage(editorId, {
                  role: 'assistant',
                  content: result.message,
                  toolCalls: toolCalls.slice(0, executedToolCalls.length),
                  executedToolCalls: executedToolCalls,
                })
              }
              return { terminated: true, finalMessage: result.message }
            }

            // If tool requests user input, add message and stop the loop
            if (result.awaitsUserInput) {
              this.addRefinementMessage(editorId, {
                role: 'assistant',
                content: result.message || '',
                toolCalls: toolCalls.slice(0, executedToolCalls.length),
                executedToolCalls: executedToolCalls,
              })
              return { terminated: false, finalMessage: result.message }
            }

            // Build result text for LLM
            let resultText = ''
            if (result.success) {
              if (result.artifact) {
                this.addRefinementArtifact(editorId, result.artifact)

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
                resultText = `Success. ${result.message || artifactInfo}${dataPreview}`
              } else if (result.message) {
                resultText = result.message
              } else {
                resultText = 'Success.'
              }
            } else {
              resultText = `Error: ${result.error}`
            }

            toolResults.push({
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              result: resultText,
            })
          }

          this.setRefinementActiveToolName(editorId, '')

          // Add assistant message with tool calls for display and LLM history
          if (responseText || executedToolCalls.length > 0) {
            this.addRefinementMessage(editorId, {
              role: 'assistant',
              content: responseText,
              toolCalls: toolCalls, // For LLM history
              toolResults: toolResults, // Store tool results with message for history reconstruction
              executedToolCalls: executedToolCalls, // For UI display
            })
          }

          // Add tool results to message history for next iteration
          currentMessages = [
            ...currentMessages,
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

          currentPrompt = 'Continue based on the tool results.'
          autoContinueCount = 0 // Reset after successful tool execution

          // Safety check for last iteration
          if (iteration === MAX_ITERATIONS - 1) {
            const warningMessage = responseText + '\n\n(Max tool iterations reached)'
            this.addRefinementMessage(editorId, {
              role: 'assistant',
              content: warningMessage,
            })
            return { terminated: false, finalMessage: warningMessage }
          }
        }

        return { terminated: false }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
        this.addRefinementMessage(editorId, {
          role: 'assistant',
          content: `Error: ${errorMessage}`,
        })
        this.completeRefinementExecution(editorId, errorMessage)
        return { terminated: false, finalMessage: `Error: ${errorMessage}` }
      } finally {
        this.completeRefinementExecution(editorId)
      }
    },

    /** Discard refinement and restore original content */
    discardRefinement(
      editorId: string,
      callbacks?: {
        onContentChange?: (content: string) => void
        onChartConfigChange?: (config: ChartConfig) => void
        onDiscard?: () => void
      },
    ): void {
      const editor = this.editors[editorId]
      if (!editor?.refinementSession) return

      const session = editor.refinementSession

      // Restore original content
      editor.setContent(session.originalContent)
      callbacks?.onContentChange?.(session.originalContent)

      if (session.originalChartConfig) {
        editor.setChartConfig(session.originalChartConfig)
        callbacks?.onChartConfigChange?.(session.originalChartConfig)
      }

      callbacks?.onDiscard?.()
      this.clearRefinementSession(editorId)
    },

    /** Accept refinement changes */
    acceptRefinement(
      editorId: string,
      callbacks?: {
        onFinish?: (message?: string) => void
      },
    ): void {
      callbacks?.onFinish?.('Changes accepted')
      this.clearRefinementSession(editorId)
    },
  },
})

export type EditorStoreType = ReturnType<typeof useEditorStore>

export default useEditorStore
