import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatArtifact } from '../chats/chat'
import type { ChartConfig } from '../editors/results'
import type { ContentInput, CompletionItem } from '../stores/resolver'
import { symbolsToFieldPrompt } from './editorRefinementTools'

export interface ToolCallResult {
  success: boolean
  artifact?: ChatArtifact
  error?: string
  message?: string
  executionTime?: number
  query?: string
  generatedSql?: string
  formattedQuery?: string
  terminatesLoop?: boolean // If true, the tool loop should stop completely
  awaitsUserInput?: boolean // If true, stop auto-continue and wait for user input
  availableSymbols?: CompletionItem[] // Symbols available after validation
}

export interface QueryExecutionResult {
  success: boolean
  results?: {
    headers: string[]
    data: any[][]
  }
  error?: string
  executionTime?: number
  resultSize?: number
  columnCount?: number
  generatedSql?: string
}

export interface EditorContext {
  connectionName: string
  editorContents: string
  editorId?: string
  selectedText?: string
  selectionRange?: { start: number; end: number }
  chartConfig?: ChartConfig
  // Callbacks to mutate editor state
  onEditorContentChange: (content: string, replaceSelection?: boolean) => void
  onChartConfigChange: (config: ChartConfig) => void
  onFinish: (message?: string) => void
  onRunActiveEditorQuery?: () => Promise<QueryExecutionResult>
}

export class EditorRefinementToolExecutor {
  private queryExecutionService: QueryExecutionService
  private connectionStore: ConnectionStoreType
  private editorStore: EditorStoreType | null
  private editorContext: EditorContext

  constructor(
    queryExecutionService: QueryExecutionService,
    connectionStore: ConnectionStoreType,
    editorContext: EditorContext,
    editorStore?: EditorStoreType,
  ) {
    this.queryExecutionService = queryExecutionService
    this.connectionStore = connectionStore
    this.editorContext = editorContext
    this.editorStore = editorStore || null
  }

  async executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<ToolCallResult> {
    switch (toolName) {
      case 'validate_query':
        return this.validateQuery(toolInput.query)
      case 'run_query':
        return this.runQuery(toolInput.query)
      case 'format_query':
        return this.formatQuery(toolInput.query)
      case 'edit_chart_config':
        return this.editChartConfig(toolInput.chartConfig)
      case 'edit_editor':
        return this.editEditor(toolInput.content, false)
      case 'run_active_editor_query':
        return this.runActiveEditorQuery()
      case 'request_close':
        return this.requestClose(toolInput.message)
      case 'close_session':
        return this.closeSession()
      // Legacy support for 'finish' - treat as close_session
      case 'finish':
        return this.closeSession()
      case 'connect_data_connection':
        return this.connectDataConnection(toolInput.connection)
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available tools: validate_query, run_query, run_active_editor_query, format_query, edit_chart_config, edit_editor, request_close, close_session, connect_data_connection`,
        }
    }
  }

  private async validateQuery(query: string): Promise<ToolCallResult> {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        success: false,
        error: 'Query is required and must be a non-empty string',
      }
    }

    const connectionName = this.editorContext.connectionName
    if (!this.connectionStore.connections[connectionName]) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found`,
      }
    }

    const queryInput = this.buildQueryInput(query)

    try {
      const validation = await this.queryExecutionService.validateQuery(connectionName, queryInput)

      if (validation && validation.data) {
        // Check for validation errors (items with severity > 0 are errors/warnings)
        const errors = validation.data.items.filter((item) => item.severity >= 8) // severity 8 = error
        // Filter to concepts only, matching useChatWithTools behavior
        const availableSymbols = (validation.data.completion_items || []).filter(
          (item) => item.trilogyType === 'concept',
        )

        if (errors.length > 0) {
          // Build symbols section for error response
          const symbolsSummary = this.buildSymbolsSummary(availableSymbols)
          return {
            success: false,
            error: `Validation errors:\n${errors.map((e) => `- ${e.message}`).join('\n')}${symbolsSummary}`,
            query,
            availableSymbols,
          }
        }

        // Build symbols section for success response
        const symbolsSummary = this.buildSymbolsSummary(availableSymbols)
        return {
          success: true,
          message: `Query is valid${symbolsSummary}`,
          query,
          availableSymbols,
        }
      }

      return {
        success: false,
        error: 'Query validation failed - no response from validator',
        query,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation error',
        query,
      }
    }
  }

  private buildSymbolsSummary(symbols: CompletionItem[]): string {
    if (symbols.length === 0) return ''
    return `\n\nAvailable fields (${symbols.length} concepts):\n${symbolsToFieldPrompt(symbols)}`
  }

  private async runQuery(query: string): Promise<ToolCallResult> {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        success: false,
        error: 'Query is required and must be a non-empty string',
      }
    }

    const connectionName = this.editorContext.connectionName

    // Verify connection exists and is active
    const connection = this.connectionStore.connections[connectionName]
    if (!connection) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found`,
        query,
      }
    }

    if (!connection.connected) {
      return {
        success: false,
        error: `Connection "${connectionName}" is not currently connected`,
        query,
      }
    }

    const queryInput = this.buildQueryInput(query)

    try {
      const result = await this.queryExecutionService.executeQuery(
        connectionName,
        queryInput,
        undefined, // onStarted
        undefined, // onProgress
        undefined, // onFailure
        undefined, // onSuccess
        false, // dryRun
      )

      const queryResult = await result.resultPromise

      if (!queryResult.success) {
        return {
          success: false,
          error: queryResult.error || 'Query execution failed',
          executionTime: queryResult.executionTime,
          query,
          generatedSql: queryResult.generatedSql,
        }
      }

      if (!queryResult.results) {
        return {
          success: false,
          error: 'Query returned no results',
          query,
          generatedSql: queryResult.generatedSql,
        }
      }

      // Build artifact with results
      const artifact: ChatArtifact = {
        type: 'results',
        data: queryResult.results,
        config: {
          query,
          connectionName,
          generatedSql: queryResult.generatedSql,
          executionTime: queryResult.executionTime,
          resultSize: queryResult.resultSize,
          columnCount: queryResult.columnCount,
        },
      }

      return {
        success: true,
        artifact,
        executionTime: queryResult.executionTime,
        query,
        generatedSql: queryResult.generatedSql,
        message: `Query executed successfully. ${queryResult.resultSize} rows, ${queryResult.columnCount} columns.`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during query execution',
        query,
      }
    }
  }

  private async formatQuery(query: string): Promise<ToolCallResult> {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        success: false,
        error: 'Query is required and must be a non-empty string',
      }
    }

    const connectionName = this.editorContext.connectionName
    const extraContent = this.buildExtraContent()

    try {
      const formatted = await this.queryExecutionService.formatQuery(
        query.trim(),
        connectionName,
        'trilogy',
        [], // imports
        extraContent,
      )

      if (formatted) {
        return {
          success: true,
          formattedQuery: formatted,
          message: `Query formatted successfully:\n\`\`\`trilogy\n${formatted}\n\`\`\``,
        }
      }

      return {
        success: false,
        error: 'Could not format query - no result returned',
        query,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Format error',
        query,
      }
    }
  }

  private editChartConfig(chartConfig: ChartConfig): ToolCallResult {
    if (!chartConfig || typeof chartConfig !== 'object') {
      return {
        success: false,
        error: 'chartConfig is required and must be an object',
      }
    }

    try {
      this.editorContext.onChartConfigChange(chartConfig)
      return {
        success: true,
        message: `Chart configuration updated: ${JSON.stringify(chartConfig)}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update chart config',
      }
    }
  }

  private async editEditor(content: string, replaceSelection?: boolean): Promise<ToolCallResult> {
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        error: 'Content is required and must be a string',
      }
    }

    try {
      this.editorContext.onEditorContentChange(content, replaceSelection)

      // Automatically validate the new content
      const validationResult = await this.validateQuery(content)

      const updateMessage = replaceSelection ? 'Updated selected text in editor' : 'Updated editor contents'

      if (validationResult.success) {
        return {
          success: true,
          message: `${updateMessage}. ${validationResult.message}`,
          availableSymbols: validationResult.availableSymbols,
        }
      } else {
        // Editor was updated but validation found errors
        return {
          success: true, // Edit succeeded, but we report validation errors
          message: `${updateMessage}.\n\nValidation errors found:\n${validationResult.error}`,
          availableSymbols: validationResult.availableSymbols,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update editor',
      }
    }
  }

  private async runActiveEditorQuery(): Promise<ToolCallResult> {
    if (!this.editorContext.onRunActiveEditorQuery) {
      return {
        success: false,
        error: 'Run active editor query is not available in this context',
      }
    }

    const query = this.editorContext.editorContents
    if (!query || query.trim() === '') {
      return {
        success: false,
        error: 'Editor is empty - no query to run',
      }
    }

    try {
      // Call the parent to run the query and get results back
      const queryResult = await this.editorContext.onRunActiveEditorQuery()

      if (!queryResult.success) {
        return {
          success: false,
          error: queryResult.error || 'Query execution failed',
          executionTime: queryResult.executionTime,
          query,
          generatedSql: queryResult.generatedSql,
        }
      }

      if (!queryResult.results) {
        return {
          success: false,
          error: 'Query returned no results',
          query,
          generatedSql: queryResult.generatedSql,
        }
      }

      // Build artifact with results
      const artifact: ChatArtifact = {
        type: 'results',
        data: queryResult.results,
        config: {
          query,
          connectionName: this.editorContext.connectionName,
          generatedSql: queryResult.generatedSql,
          executionTime: queryResult.executionTime,
          resultSize: queryResult.resultSize,
          columnCount: queryResult.columnCount,
        },
      }

      return {
        success: true,
        artifact,
        executionTime: queryResult.executionTime,
        query,
        generatedSql: queryResult.generatedSql,
        message: `Query executed successfully. ${queryResult.resultSize} rows, ${queryResult.columnCount} columns.`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute query',
        query,
      }
    }
  }

  private requestClose(message: string): ToolCallResult {
    // This does NOT terminate the loop - it just informs the user we're done
    // and gives them a chance to reply with follow-ups
    return {
      success: true,
      message: `${message}\n\nReady to close. Reply with any follow-up requests, or say "done" to close the session.`,
      awaitsUserInput: true, // Stop auto-continue, wait for user
    }
  }

  private closeSession(): ToolCallResult {
    try {
      this.editorContext.onFinish()
      return {
        success: true,
        message: 'Session closed. Changes saved.',
        terminatesLoop: true,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close session',
      }
    }
  }

  private async connectDataConnection(connectionName: string): Promise<ToolCallResult> {
    if (!connectionName || typeof connectionName !== 'string') {
      return {
        success: false,
        error: `Connection name is required. Available connections: ${Object.keys(this.connectionStore.connections).join(', ') || 'None'}`,
      }
    }

    // Verify connection exists
    const connection = this.connectionStore.connections[connectionName]
    if (!connection) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found. Available connections: ${Object.keys(this.connectionStore.connections).join(', ') || 'None'}`,
      }
    }

    // Check if already connected
    if (connection.connected) {
      return {
        success: true,
        message: `Connection "${connectionName}" is already active.`,
      }
    }

    try {
      await this.connectionStore.connectConnection(connectionName)
      return {
        success: true,
        message: `Successfully connected to "${connectionName}". You can now run queries against this connection.`,
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to connect to "${connectionName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  // Helper to build QueryInput with proper context
  private buildQueryInput(query: string): QueryInput {
    return {
      text: query.trim(),
      editorType: 'trilogy',
      imports: [],
      extraContent: this.buildExtraContent(),
    }
  }

  // Helper to build extra content from connection sources and editors
  private buildExtraContent(): ContentInput[] {
    const connectionName = this.editorContext.connectionName
    const extraContentMap = new Map<string, string>()

    // Add connection sources
    const connectionSources = this.connectionStore.getConnectionSources(connectionName)
    connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))

    // Add all editors for this connection
    if (this.editorStore) {
      Object.values(this.editorStore.editors)
        .filter((editor) => editor.connection === connectionName && !editor.deleted)
        .forEach((editor) => {
          extraContentMap.set(editor.name, editor.contents)
        })
    }

    return Array.from(extraContentMap.entries()).map(([alias, contents]) => ({
      alias,
      contents,
    }))
  }
}
