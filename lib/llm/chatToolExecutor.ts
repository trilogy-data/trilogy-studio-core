import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput, QueryResult } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ChatArtifact, ChatImport } from '../chats/chat'
import type { ChartConfig } from '../editors/results'
import type { ContentInput } from '../stores/resolver'

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

  async executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<ToolCallResult> {
    switch (toolName) {
      case 'run_trilogy_query':
        return this.executeTrilogyQuery(toolInput.query, toolInput.connection, 'results', undefined)
      case 'chart_trilogy_query':
        return this.executeTrilogyQuery(
          toolInput.query,
          toolInput.connection,
          'chart',
          toolInput.chartConfig,
        )
      case 'select_active_import':
        return this.selectActiveImport(toolInput.import_name)
      case 'list_available_imports':
        return this.listAvailableImports()
      case 'connect_data_connection':
        return this.connectDataConnection(toolInput.connection)
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available tools: run_trilogy_query, chart_trilogy_query, select_active_import, list_available_imports, connect_data_connection`,
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

    // Build extra content: connection sources + all editors for this connection
    // This ensures cross-file dependencies (like 'import etl') can be resolved
    console.log(`[ChatToolExecutor] Building extraContent for connection: "${connectionName}"`)
    const allConnectionEditors = this.editorStore
      ? Object.values(this.editorStore.editors)
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
      `[ChatToolExecutor] Found ${allConnectionEditors.length} editors for this connection:`,
      allConnectionEditors.map((e) => e.alias),
    )

    const connectionSources = this.connectionStore.getConnectionSources(connectionName)
    console.log(
      `[ChatToolExecutor] Found ${connectionSources.length} connection sources:`,
      connectionSources.map((s) => s.alias),
    )

    // Combine and remove duplicates (preferring connection editors for latest content)
    const extraContentMap = new Map<string, string>()

    // Start with connection sources
    connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))

    // Add/overwrite with all editors for this connection
    allConnectionEditors.forEach((s) => extraContentMap.set(s.alias, s.contents))

    // Also include chat imports (though they should already be in allConnectionEditors)
    activeImports.forEach((imp) => {
      const alias = imp.alias || imp.name
      const contents = this.editorStore?.editors[imp.id]?.contents || ''
      if (contents) {
        extraContentMap.set(alias, contents)
      }
    })

    const extraContent: ContentInput[] = Array.from(extraContentMap.entries()).map(
      ([alias, contents]) => ({
        alias,
        contents,
      }),
    )

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

    // Build extra content matching executeTrilogyQuery logic
    const allConnectionEditors = this.editorStore
      ? Object.values(this.editorStore.editors)
          .filter((editor) => editor.connection === connectionName && !editor.deleted)
          .map((editor) => ({
            alias: editor.name,
            contents: editor.contents,
          }))
      : []

    const connectionSources = this.connectionStore.getConnectionSources(connectionName)
    const extraContentMap = new Map<string, string>()

    connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))
    allConnectionEditors.forEach((s) => extraContentMap.set(s.alias, s.contents))
    activeImports.forEach((imp) => {
      const alias = imp.alias || imp.name
      const contents = this.editorStore?.editors[imp.id]?.contents || ''
      if (contents) {
        extraContentMap.set(alias, contents)
      }
    })

    const extraContent: ContentInput[] = Array.from(extraContentMap.entries()).map(
      ([alias, contents]) => ({
        alias,
        contents,
      }),
    )

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

  // Import management tools - single import model
  private async selectActiveImport(importName: string): Promise<ToolCallResult> {
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

    // Handle clearing the selection
    if (!importName || importName.trim() === '') {
      this.chatStore.setImports(this.chatStore.activeChatId, [])
      return {
        success: true,
        message: 'Cleared active data source selection.',
        triggersSymbolRefresh: true,
      }
    }

    // Find the import in available imports
    const available = this.getAvailableImports(chat.dataConnectionName)
    const importToSelect = available.find(
      (i) => i.name === importName || i.name.endsWith(`.${importName}`),
    )

    if (!importToSelect) {
      return {
        success: false,
        error: `Import "${importName}" not found. Available imports: ${available.map((i) => i.name).join(', ') || 'none'}`,
      }
    }

    // Check if already the active import
    if (chat.imports.length === 1 && chat.imports[0].id === importToSelect.id) {
      // Already active, but still fetch and return the concepts
      const conceptsOutput = await this.getConceptsForImport(
        importToSelect,
        chat.dataConnectionName,
      )
      return {
        success: true,
        message: `"${importToSelect.name}" is already the active data source.\n\n${conceptsOutput}`,
        triggersSymbolRefresh: false, // No change needed
      }
    }

    // Set as the single active import (replaces any previous selection)
    this.chatStore.setImports(this.chatStore.activeChatId, [importToSelect])

    // Fetch and return the full concept output
    const conceptsOutput = await this.getConceptsForImport(importToSelect, chat.dataConnectionName)

    return {
      success: true,
      message: `Successfully selected "${importToSelect.name}" as the active data source.\n\n${conceptsOutput}`,
      triggersSymbolRefresh: true, // Signal that symbols should be refreshed
    }
  }

  // Helper to fetch concepts for a specific import and format them
  private async getConceptsForImport(imp: ChatImport, connectionName: string): Promise<string> {
    try {
      // Build extra content for the import
      const editorContent = this.editorStore?.editors[imp.id]?.contents || ''
      if (!editorContent) {
        return 'No fields found in this data source.'
      }

      // Get all connection sources and editors for dependency resolution
      const allConnectionEditors = this.editorStore
        ? Object.values(this.editorStore.editors)
            .filter((editor) => editor.connection === connectionName && !editor.deleted)
            .map((editor) => ({
              alias: editor.name,
              contents: editor.contents,
            }))
        : []

      const connectionSources = this.connectionStore.getConnectionSources(connectionName)
      const extraContentMap = new Map<string, string>()

      connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))
      allConnectionEditors.forEach((s) => extraContentMap.set(s.alias, s.contents))

      const extraContent: ContentInput[] = Array.from(extraContentMap.entries()).map(
        ([alias, contents]) => ({
          alias,
          contents,
        }),
      )

      // Validate to get completion items
      const queryInput: QueryInput = {
        text: 'SELECT 1',
        editorType: 'trilogy' as const,
        imports: [{ name: imp.name, alias: imp.alias || '' }],
        extraContent,
      }

      const validation = await this.queryExecutionService.validateQuery(
        connectionName,
        queryInput,
        false,
      )

      if (validation?.data?.completion_items) {
        const concepts = validation.data.completion_items.filter(
          (item) => item.trilogyType === 'concept',
        )

        if (concepts.length === 0) {
          return 'No fields found in this data source.'
        }

        // Format concepts with full details including descriptions
        const conceptsList = concepts
          .map((c) => {
            let entry = `- ${c.label} (${c.datatype || c.type})`
            if (c.description) {
              entry += `: ${c.description}`
            }
            if (c.calculation) {
              entry += ` [calculated: ${c.calculation}]`
            }
            return entry
          })
          .join('\n')

        return `AVAILABLE FIELDS (${concepts.length} total):\n${conceptsList}`
      }

      return 'Unable to fetch field information for this data source.'
    } catch (error) {
      console.error('Failed to fetch concepts for import:', error)
      return 'Error fetching field information for this data source.'
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
    const activeImport = chat.imports.length > 0 ? chat.imports[0] : null

    if (available.length === 0) {
      return {
        success: true,
        message: `No data sources available on connection "${chat.dataConnectionName}".`,
      }
    }

    const currentStatus = activeImport
      ? `Current active data source: ${activeImport.name}\n\n`
      : 'No data source currently selected.\n\n'

    return {
      success: true,
      message: `${currentStatus}Available data sources for connection "${chat.dataConnectionName}":\n${available.map((i) => `- ${i.name}${activeImport?.id === i.id ? ' (active)' : ''}`).join('\n')}\n\nUse select_active_import to select a data source.`,
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
      // Even if already connected, update the chat's data connection if different
      if (this.chatStore?.activeChatId) {
        const chat = this.chatStore.activeChat
        if (chat && chat.dataConnectionName !== connectionName) {
          this.chatStore.updateChatDataConnection(this.chatStore.activeChatId, connectionName)
        }
      }
      return {
        success: true,
        message: `Connection "${connectionName}" is already active and set as the data connection for this chat.`,
      }
    }

    try {
      await this.connectionStore.connectConnection(connectionName)

      // Update the chat's data connection after successful connection
      if (this.chatStore?.activeChatId) {
        this.chatStore.updateChatDataConnection(this.chatStore.activeChatId, connectionName)
      }

      return {
        success: true,
        message: `Successfully connected to "${connectionName}" and set as the data connection for this chat. You can now run queries against this connection.`,
        triggersSymbolRefresh: true, // Refresh symbols since data connection changed
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to connect to "${connectionName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }
}
