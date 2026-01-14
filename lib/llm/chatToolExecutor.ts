import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput, QueryResult } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatArtifact, ChatImport } from '../chats/chat'
import type { ChartConfig } from '../editors/results'

export interface ToolCallResult {
  success: boolean
  artifact?: ChatArtifact
  error?: string
  message?: string // Success message for non-artifact tools (like add_import)
  executionTime?: number
  query?: string
  generatedSql?: string
  triggersSymbolRefresh?: boolean // Indicates this tool call should trigger symbol refresh
}

export interface ToolCallInput {
  query: string
  connection: string
  chartConfig?: ChartConfig
}

export class ChatToolExecutor {
  private queryExecutionService: QueryExecutionService
  private connectionStore: ConnectionStoreType
  private chatStore: ChatStoreType | null
  private editorStore: EditorStoreType | null

  constructor(
    queryExecutionService: QueryExecutionService,
    connectionStore: ConnectionStoreType,
    chatStore?: ChatStoreType,
    editorStore?: EditorStoreType,
  ) {
    this.queryExecutionService = queryExecutionService
    this.connectionStore = connectionStore
    this.chatStore = chatStore || null
    this.editorStore = editorStore || null
  }

  async executeToolCall(
    toolName: string,
    toolInput: Record<string, any>,
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case 'run_trilogy_query':
        return this.executeTrilogyQuery(
          toolInput.query,
          toolInput.connection,
          'results',
          undefined,
        )
      case 'chart_trilogy_query':
        return this.executeTrilogyQuery(
          toolInput.query,
          toolInput.connection,
          'chart',
          toolInput.chartConfig,
        )
      case 'add_import':
        return this.addImport(toolInput.import_name)
      case 'remove_import':
        return this.removeImport(toolInput.import_name)
      case 'list_available_imports':
        return this.listAvailableImports()
      case 'connect_data_connection':
        return this.connectDataConnection(toolInput.connection)
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available tools: run_trilogy_query, chart_trilogy_query, add_import, remove_import, list_available_imports, connect_data_connection`,
        }
    }
  }

  private async executeTrilogyQuery(
    query: string,
    connectionName: string,
    artifactType: 'results' | 'chart',
    chartConfig?: ChartConfig,
  ): Promise<ToolCallResult> {
    // Validate inputs
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        success: false,
        error: 'Query is required and must be a non-empty string',
        query,
      }
    }

    if (!connectionName || typeof connectionName !== 'string') {
      return {
        success: false,
        error: `Connection name is required. Available connections: ${Object.keys(this.connectionStore.connections).join(', ') || 'None'}`,
        query,
      }
    }

    // Verify connection exists
    if (!this.connectionStore.connections[connectionName]) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found. Available connections: ${Object.keys(this.connectionStore.connections).join(', ') || 'None'}`,
        query,
      }
    }

    // Check connection is active
    const connection = this.connectionStore.connections[connectionName]
    if (!connection.connected) {
      return {
        success: false,
        error: `Connection "${connectionName}" is not currently connected. Please ensure the connection is active.`,
        query,
      }
    }

    // Get active imports from chat store and build extraContent from them
    const activeImports = this.chatStore?.activeChat?.imports || []
    const importsForQuery = activeImports.map((imp) => ({
      name: imp.name,
      alias: imp.alias || '',
    }))

    // Build extra content: connection sources + import file contents
    const extraContent = [
      ...this.connectionStore.getConnectionSources(connectionName),
      ...activeImports.map((imp) => ({
        alias: imp.alias || imp.name,
        contents: this.editorStore?.editors[imp.id]?.contents || '',
      })),
    ]

    const queryInput: QueryInput = {
      text: query.trim(),
      editorType: 'trilogy',
      imports: importsForQuery,
      extraContent,
    }

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

      const queryResult: QueryResult = await result.resultPromise

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

      // Build artifact with results data - store Results object directly
      const artifact: ChatArtifact = {
        type: artifactType,
        data: queryResult.results,
        config: {
          query,
          connectionName,
          generatedSql: queryResult.generatedSql,
          executionTime: queryResult.executionTime,
          resultSize: queryResult.resultSize,
          columnCount: queryResult.columnCount,
          ...(chartConfig && { chartConfig }),
        },
      }

      return {
        success: true,
        artifact,
        executionTime: queryResult.executionTime,
        query,
        generatedSql: queryResult.generatedSql,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during query execution',
        query,
      }
    }
  }

  // Validate a query without executing it (dry run)
  async validateQuery(query: string, connectionName: string): Promise<ToolCallResult> {
    if (!query || !connectionName) {
      return {
        success: false,
        error: 'Query and connection name are required',
      }
    }

    if (!this.connectionStore.connections[connectionName]) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found`,
      }
    }

    // Get active imports from chat store and build extraContent from them
    const activeImports = this.chatStore?.activeChat?.imports || []
    const importsForQuery = activeImports.map((imp) => ({
      name: imp.name,
      alias: imp.alias || '',
    }))

    // Build extra content: connection sources + import file contents
    const extraContent = [
      ...this.connectionStore.getConnectionSources(connectionName),
      ...activeImports.map((imp) => ({
        alias: imp.alias || imp.name,
        contents: this.editorStore?.editors[imp.id]?.contents || '',
      })),
    ]

    const queryInput: QueryInput = {
      text: query.trim(),
      editorType: 'trilogy',
      imports: importsForQuery,
      extraContent,
    }

    try {
      const validation = await this.queryExecutionService.validateQuery(connectionName, queryInput)

      if (validation && validation.data) {
        return {
          success: true,
          query,
        }
      }

      return {
        success: false,
        error: 'Query validation failed',
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

  // Get available connections for the LLM to know about
  getAvailableConnections(): string[] {
    return Object.keys(this.connectionStore.connections).filter(
      (name) => this.connectionStore.connections[name].connected,
    )
  }

  // Get all connections (including disconnected)
  getAllConnections(): string[] {
    return Object.keys(this.connectionStore.connections)
  }

  // Import management tools
  private addImport(importName: string): ToolCallResult {
    if (!this.chatStore?.activeChatId || !this.editorStore) {
      return {
        success: false,
        error: 'No active chat or editor store not available',
      }
    }

    const chat = this.chatStore.activeChat
    if (!chat?.dataConnectionName) {
      return {
        success: false,
        error: 'No data connection selected for this chat. Please select a data connection first.',
      }
    }

    // Find the import in available imports
    const available = this.getAvailableImports(chat.dataConnectionName)
    const importToAdd = available.find(
      (i) => i.name === importName || i.name.endsWith(`.${importName}`),
    )

    if (!importToAdd) {
      return {
        success: false,
        error: `Import "${importName}" not found. Available imports: ${available.map((i) => i.name).join(', ') || 'none'}`,
      }
    }

    // Check if already imported
    if (chat.imports.some((i) => i.id === importToAdd.id)) {
      return {
        success: false,
        error: `Import "${importName}" is already active`,
      }
    }

    // Add the import
    this.chatStore.addImportToChat(this.chatStore.activeChatId, importToAdd)

    return {
      success: true,
      message: `Successfully added import "${importToAdd.name}". Fields from this data source are now available for queries.`,
      triggersSymbolRefresh: true, // Signal that symbols should be refreshed
    }
  }

  private removeImport(importName: string): ToolCallResult {
    if (!this.chatStore?.activeChatId) {
      return {
        success: false,
        error: 'No active chat',
      }
    }

    const chat = this.chatStore.activeChat
    const importToRemove = chat?.imports.find(
      (i) => i.name === importName || i.name.endsWith(`.${importName}`),
    )

    if (!importToRemove) {
      return {
        success: false,
        error: `Import "${importName}" is not currently active. Active imports: ${chat?.imports.map((i) => i.name).join(', ') || 'none'}`,
      }
    }

    this.chatStore.removeImportFromChat(this.chatStore.activeChatId, importToRemove.id)

    return {
      success: true,
      message: `Successfully removed import "${importToRemove.name}".`,
      triggersSymbolRefresh: true, // Signal that symbols should be refreshed
    }
  }

  private listAvailableImports(): ToolCallResult {
    const chat = this.chatStore?.activeChat
    if (!chat?.dataConnectionName) {
      return {
        success: false,
        error: 'No data connection selected for this chat. Please select a data connection first.',
      }
    }

    const available = this.getAvailableImports(chat.dataConnectionName)
    const active = chat.imports

    if (available.length === 0) {
      return {
        success: true,
        message: `No data sources available for import on connection "${chat.dataConnectionName}".`,
      }
    }

    return {
      success: true,
      message: `Available imports for connection "${chat.dataConnectionName}":\n${available.map((i) => `- ${i.name}${active.some((a) => a.id === i.id) ? ' (active)' : ''}`).join('\n')}`,
    }
  }

  // Get available imports for a connection
  getAvailableImports(connectionName: string): ChatImport[] {
    if (!this.editorStore) return []

    return Object.values(this.editorStore.editors)
      .filter((editor) => editor.connection === connectionName)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((editor) => ({
        id: editor.id,
        name: editor.name.replace(/\//g, '.'), // Convert folder/editor to folder.editor
        alias: '',
      }))
  }

  // Connect a data connection
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
}
