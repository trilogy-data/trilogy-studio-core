import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatArtifact } from '../chats/chat'
import { generateArtifactId } from '../chats/chat'
import type { ChartConfig, Results } from '../editors/results'
import type { EditorType } from '../editors/editor'
import type { ContentInput, CompletionItem } from '../stores/resolver'
import { symbolsToFieldPrompt } from './editorRefinementTools'
import { validateChartConfigForData, formatChartConfigValidationError } from '../dashboards/helpers'
import {
  type ToolCallResult,
  connectDataConnection as sharedConnectDataConnection,
  buildExtraContent,
  getArtifactRowsFromData,
} from './sharedToolHelpers'

export type { ToolCallResult } from './sharedToolHelpers'

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
  editorType: EditorType
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
  /** Optional accessor for the editor's current query results, used to validate chart configs */
  getCurrentResults?: () => Results | null | undefined
}

export class EditorRefinementToolExecutor {
  private queryExecutionService: QueryExecutionService
  private connectionStore: ConnectionStoreType
  private editorStore: EditorStoreType | null
  private editorContext: EditorContext
  /** Artifacts created during this session — used by get_artifact_rows */
  private artifactRegistry = new Map<string, ChatArtifact>()
  /** Most recent Results object produced by run_query in this session, used as a fallback for chart config validation */
  private lastQueryResults: Results | null = null

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
      case 'browse_database_tree':
        return this.browseDatabaseTree(toolInput)
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
      case 'get_artifact_rows':
        return this.getArtifactRows(toolInput.artifact_id, toolInput.start_row, toolInput.end_row)
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}.`,
        }
    }
  }

  private async browseDatabaseTree(toolInput: Record<string, any>): Promise<ToolCallResult> {
    const connectionName = this.editorContext.connectionName
    const connection = this.connectionStore.connectionByName(connectionName)
    if (!connection) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found`,
      }
    }

    if (!connection.connected) {
      return {
        success: false,
        error: `Connection "${connectionName}" is not currently connected`,
      }
    }

    const database = typeof toolInput.database === 'string' ? toolInput.database : undefined
    const schema = typeof toolInput.schema === 'string' ? toolInput.schema : undefined
    const table = typeof toolInput.table === 'string' ? toolInput.table : undefined
    const refresh = toolInput.refresh !== false

    if (table && (!database || !schema)) {
      return {
        success: false,
        error: 'table lookup requires both database and schema',
      }
    }

    if (schema && !database) {
      return {
        success: false,
        error: 'schema lookup requires database',
      }
    }

    try {
      if (refresh || !connection.databases || connection.databases.length === 0) {
        await connection.getDatabases()
      }

      if (database && refresh) {
        await connection.refreshDatabase(database)
        if (!connection.hasSchema) {
          const db = connection.databases?.find((d) => d.name === database)
          if (db && db.schemas.length > 0) {
            await connection.refreshSchema(database, db.schemas[0].name)
          }
        }
      }

      if (database && schema && refresh) {
        await connection.refreshSchema(database, schema)
      }

      if (database && schema && table && refresh) {
        const columns = await connection.getColumns(database, schema, table)
        const localTable = connection.databases
          ?.find((db) => db.name === database)
          ?.schemas.find((s) => s.name === schema)
          ?.tables.find((t) => t.name === table)
        if (localTable) {
          localTable.columns = columns
        }
      }

      const payload = this.serializeDatabaseTree(database, schema, table)
      return {
        success: true,
        message: JSON.stringify(payload, null, 2),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to browse database tree',
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
    const connection = this.connectionStore.connectionByName(connectionName)
    if (!connection) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found`,
      }
    }

    const queryInput = this.buildQueryInput(query)

    if (queryInput.editorType === 'sql') {
      return {
        success: true,
        message: 'SQL parser validation is not available. Use run_query to validate by execution.',
        query,
      }
    }

    try {
      const validation = await this.queryExecutionService.validateQuery(connection.id, queryInput)

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
    const connection = this.connectionStore.connectionByName(connectionName)
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
        connection.id,
        queryInput,
        undefined, // onStarted
        undefined, // onProgress
        undefined, // onFailure
        undefined, // onSuccess
        false, // dryRun
      )

      const queryResult = await result.resultPromise

      if (queryResult.selectCount !== undefined && queryResult.selectCount > 1) {
        return {
          success: false,
          error: `Query contains ${queryResult.selectCount} SELECT statements. Each run_query call must contain exactly one SELECT statement. Please split your selects across multiple run_query calls.`,
          query,
        }
      }

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
        id: generateArtifactId(),
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

      this.artifactRegistry.set(artifact.id, artifact)
      // Track latest results so edit_chart_config can validate against them
      const resultsForValidation = queryResult.results as unknown as Results
      if (resultsForValidation && resultsForValidation.headers) {
        this.lastQueryResults = resultsForValidation
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
    const connection = this.connectionStore.connectionByName(connectionName)
    const extraContent = this.buildEditorExtraContent()

    try {
      const formatted = await this.queryExecutionService.formatQuery(
        query.trim(),
        connection?.id || connectionName,
        this.editorContext.editorType,
        [], // imports
        extraContent,
      )

      if (formatted) {
        return {
          success: true,
          formattedQuery: formatted,
          message: `Query formatted successfully:\n\`\`\`${this.editorContext.editorType}\n${formatted}\n\`\`\``,
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
    if (this.editorContext.editorType === 'sql') {
      return {
        success: false,
        error: 'Chart configuration editing is not supported for SQL editors',
      }
    }

    if (!chartConfig || typeof chartConfig !== 'object') {
      return {
        success: false,
        error: 'chartConfig is required and must be an object',
      }
    }

    // Validate against current results if we have them. Prefer the editor-provided
    // accessor (live editor state); fall back to results from a recent run_query call.
    const results: Results | null =
      this.editorContext.getCurrentResults?.() ?? this.lastQueryResults ?? null

    if (results && results.headers) {
      const validation = validateChartConfigForData(results.data, results.headers, chartConfig)
      if (!validation.valid) {
        // Auto-correct: apply the suggested config instead of the invalid one
        const corrected = validation.suggestedConfig as ChartConfig
        try {
          this.editorContext.onChartConfigChange(corrected)
        } catch {
          // ignore — we still want to surface the validation error
        }
        return {
          success: false,
          error:
            `Auto-corrected to default configuration.\n` +
            formatChartConfigValidationError(validation),
        }
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

      if (this.editorContext.editorType === 'sql') {
        return {
          success: true,
          message: replaceSelection
            ? 'Updated selected text in editor.'
            : 'Updated editor contents.',
        }
      }

      // Automatically validate the new content
      const validationResult = await this.validateQuery(content)

      const updateMessage = replaceSelection
        ? 'Updated selected text in editor'
        : 'Updated editor contents'

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
        id: generateArtifactId(),
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

      this.artifactRegistry.set(artifact.id, artifact)
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

  private getArtifactRows(artifactId: string, startRow: number, endRow: number): ToolCallResult {
    const artifact = this.artifactRegistry.get(artifactId)
    if (!artifact) {
      return {
        success: false,
        error: `Artifact "${artifactId}" not found. Only artifacts created by run_query or run_active_editor_query in this session are available.`,
      }
    }

    return getArtifactRowsFromData(artifactId, artifact.data, startRow, endRow)
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
    return sharedConnectDataConnection(this.connectionStore, connectionName)
  }

  private serializeDatabaseTree(
    database?: string,
    schema?: string,
    table?: string,
  ): Record<string, any> {
    const connection = this.connectionStore.connectionByName(this.editorContext.connectionName)
    const databases = connection?.databases || []
    const filteredDatabases = database ? databases.filter((db) => db.name === database) : databases

    const tree = filteredDatabases.map((db) => {
      const schemas = schema ? db.schemas.filter((s) => s.name === schema) : db.schemas
      return {
        database: db.name,
        schemas: schemas.map((s) => {
          const tables = table ? s.tables.filter((t) => t.name === table) : s.tables
          return {
            schema: s.name,
            tables: tables.map((t) => ({
              name: t.name,
              assetType: t.assetType,
              description: t.description,
              columns: t.columns.map((c) => ({
                name: c.name,
                type: c.type,
                trilogyType: c.trilogyType,
                nullable: c.nullable,
              })),
            })),
          }
        }),
      }
    })

    return {
      connection: this.editorContext.connectionName,
      hasSchema: connection?.hasSchema,
      tree,
    }
  }

  // Helper to build QueryInput with proper context
  private buildQueryInput(query: string): QueryInput {
    return {
      text: query.trim(),
      editorType: this.editorContext.editorType,
      imports: [],
      extraContent: this.buildEditorExtraContent(),
    }
  }

  private buildEditorExtraContent(): ContentInput[] {
    return buildExtraContent(
      this.connectionStore,
      this.editorStore,
      this.editorContext.connectionName,
    )
  }
}
