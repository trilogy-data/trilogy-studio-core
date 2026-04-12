import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput, QueryResult } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import { Chat, type ChatArtifact, type ChatImport, generateArtifactId } from '../chats/chat'
import type { ChartConfig, Results } from '../editors/results'
import { MAX_TOOL_RESULT_ROWS, truncateResultRows } from './toolLoopCore'
import { fetchConceptsForImport } from './importConcepts'
import {
  validateChartConfigForData,
  formatChartConfigValidationError,
} from '../dashboards/helpers'
import {
  type ToolCallResult,
  connectDataConnection as sharedConnectDataConnection,
  buildExtraContent,
} from './sharedToolHelpers'

export type { ToolCallResult } from './sharedToolHelpers'

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
  /** Specific chat ID to operate on. When set, all operations target this chat
   *  instead of relying on the global `chatStore.activeChatId`. */
  private chatId: string | null

  constructor(
    queryExecutionService: QueryExecutionService,
    connectionStore: ConnectionStoreType,
    chatStore?: ChatStoreType,
    editorStore?: EditorStoreType,
    chatId?: string,
  ) {
    this.queryExecutionService = queryExecutionService
    this.connectionStore = connectionStore
    this.chatStore = chatStore || null
    this.editorStore = editorStore || null
    this.chatId = chatId || null
  }

  /** Resolve the chat ID — prefer the explicit chatId, fall back to global active. */
  private get resolvedChatId(): string {
    return this.chatId || this.chatStore?.activeChatId || ''
  }

  /** Resolve the chat instance — prefer explicit chatId lookup, fall back to global activeChat getter. */
  private get resolvedChat(): Chat | null {
    if (!this.chatStore) return null
    if (this.chatId) {
      return this.chatStore.chats?.[this.chatId] || null
    }
    return this.chatStore.activeChat || null
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
      case 'create_markdown':
        return this.createMarkdown(
          toolInput.markdown,
          toolInput.title,
          toolInput.query,
          toolInput.connection,
        )
      case 'list_artifacts':
        return this.listArtifacts()
      case 'get_artifact':
        return this.getArtifact(toolInput.artifact_id)
      case 'get_artifact_rows':
        return this.getArtifactRows(toolInput.artifact_id, toolInput.start_row, toolInput.end_row)
      case 'update_artifact':
        return this.updateArtifact(
          toolInput.artifact_id,
          toolInput.markdown,
          toolInput.title,
          toolInput.chartConfig,
        )
      case 'hide_artifact':
        return this.hideArtifacts(toolInput.artifact_ids)
      case 'reorder_artifacts':
        return this.reorderArtifacts(toolInput.artifact_ids)
      case 'return_to_user':
        return {
          success: true,
          message: toolInput.message || 'Done.',
          terminatesLoop: true,
        }
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available tools: run_trilogy_query, chart_trilogy_query, select_active_import, list_available_imports, connect_data_connection, create_markdown, list_artifacts, get_artifact, get_artifact_rows, update_artifact, hide_artifact (accepts array), reorder_artifacts, return_to_user`,
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
    const activeImports = this.resolvedChat?.imports || []
    const importsForQuery = activeImports.map((imp) => ({
      name: imp.name,
      alias: imp.alias || '',
    }))

    const extraContent = buildExtraContent(
      this.connectionStore,
      this.editorStore,
      connectionName,
      activeImports,
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

      // Validate chart config against actual results if one was provided
      let effectiveChartConfig = chartConfig
      let validationWarning: string | null = null
      if (chartConfig && artifactType === 'chart') {
        const results = queryResult.results as Results
        if (results && results.headers) {
          const validation = validateChartConfigForData(results.data, results.headers, chartConfig)
          if (!validation.valid) {
            // Auto-correct to suggested config
            effectiveChartConfig = validation.suggestedConfig as ChartConfig
            validationWarning = `Auto-corrected to default configuration.\n${formatChartConfigValidationError(validation)}`
          }
        }
      }

      // Build artifact with results data - store Results object directly
      const artifactId = generateArtifactId()
      const artifact: ChatArtifact = {
        id: artifactId,
        type: artifactType,
        data: queryResult.results,
        config: {
          query,
          connectionName,
          generatedSql: queryResult.generatedSql,
          executionTime: queryResult.executionTime,
          resultSize: queryResult.resultSize,
          columnCount: queryResult.columnCount,
          ...(effectiveChartConfig && { chartConfig: effectiveChartConfig }),
        },
      }

      if (validationWarning) {
        return {
          success: false,
          error: validationWarning,
          artifact,
          artifactId,
          executionTime: queryResult.executionTime,
          query,
          generatedSql: queryResult.generatedSql,
        }
      }

      return {
        success: true,
        artifact,
        artifactId,
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
    const activeImports = this.resolvedChat?.imports || []
    const importsForQuery = activeImports.map((imp) => ({
      name: imp.name,
      alias: imp.alias || '',
    }))

    const extraContent = buildExtraContent(
      this.connectionStore,
      this.editorStore,
      connectionName,
      activeImports,
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
    if (!this.resolvedChatId || !this.editorStore) {
      return {
        success: false,
        error: 'No active chat or editor store not available',
      }
    }

    const chat = this.resolvedChat
    if (!chat?.dataConnectionName) {
      return {
        success: false,
        error: 'No data connection selected for this chat. Please select a data connection first.',
      }
    }

    // Handle clearing the selection
    if (!importName || importName.trim() === '') {
      this.chatStore.setImports(this.resolvedChatId, [])
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
    this.chatStore.setImports(this.resolvedChatId, [importToSelect])

    // Fetch and return the full concept output
    const conceptsOutput = await this.getConceptsForImport(importToSelect, chat.dataConnectionName)

    return {
      success: true,
      message: `Successfully selected "${importToSelect.name}" as the active data source.\n\n${conceptsOutput}`,
      triggersSymbolRefresh: true, // Signal that symbols should be refreshed
    }
  }

  // Helper to fetch concepts for a specific import and format them.
  // Delegates to shared helper so the dashboard agent surface uses the same logic.
  private getConceptsForImport(imp: ChatImport, connectionName: string): Promise<string> {
    return fetchConceptsForImport(
      {
        connectionStore: this.connectionStore,
        editorStore: this.editorStore,
        queryExecutionService: this.queryExecutionService,
      },
      imp,
      connectionName,
    )
  }

  private listAvailableImports(): ToolCallResult {
    const chat = this.resolvedChat
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
    return sharedConnectDataConnection(this.connectionStore, connectionName, {
      onConnected: (name) => {
        if (this.resolvedChatId && this.chatStore) {
          this.chatStore.updateChatDataConnection(this.resolvedChatId, name)
        }
      },
    })
  }

  // Create a markdown artifact, optionally backed by a query for data-driven content
  private async createMarkdown(
    markdown: string,
    title?: string,
    query?: string,
    connectionName?: string,
  ): Promise<ToolCallResult> {
    if (!markdown || typeof markdown !== 'string') {
      return {
        success: false,
        error: 'Markdown content is required and must be a non-empty string',
      }
    }

    const artifactId = generateArtifactId()
    let queryResults = null

    // If a query is provided, execute it to get data for template substitution
    if (query && query.trim()) {
      if (!connectionName) {
        // Fall back to chat's data connection
        const chat = this.resolvedChat
        connectionName = chat?.dataConnectionName || ''
      }
      if (!connectionName) {
        return {
          success: false,
          error:
            'A connection name is required when a query is provided. Specify connection or set a data connection for this chat.',
        }
      }

      // Execute the query to get results
      const queryResult = await this.executeTrilogyQuery(
        query,
        connectionName,
        'results',
        undefined,
      )
      if (!queryResult.success) {
        return {
          success: false,
          error: `Query execution failed: ${queryResult.error}`,
        }
      }
      queryResults = queryResult.artifact?.data || null
    }

    const artifact: ChatArtifact = {
      id: artifactId,
      type: 'markdown',
      data: {
        markdown,
        query: query || '',
        queryResults,
      },
      config: {
        title: title || 'Markdown',
        connectionName: connectionName || '',
      },
    }

    return {
      success: true,
      artifact,
      artifactId,
      message: `Created markdown artifact "${title || 'Markdown'}" (ID: ${artifactId}).`,
    }
  }

  // List all artifacts in the current chat
  private listArtifacts(): ToolCallResult {
    const chat = this.resolvedChat
    if (!chat) {
      return {
        success: false,
        error: 'No active chat session.',
      }
    }

    if (chat.artifacts.length === 0) {
      return {
        success: true,
        message: 'No artifacts in the current chat session.',
      }
    }

    const visible = chat.artifacts.filter((a) => !a.hidden)
    const hidden = chat.artifacts.filter((a) => a.hidden)

    const formatArtifact = (a: (typeof chat.artifacts)[0], index: number): string => {
      const parts: string[] = [`- ID: ${a.id}, Type: ${a.type}`]
      if (a.config?.title) parts.push(`Title: "${a.config.title}"`)
      if (a.config?.resultSize) parts.push(`${a.config.resultSize} rows`)
      if (a.config?.query) parts.push(`Query: "${a.config.query.substring(0, 80)}..."`)
      if (a.type === 'markdown' && a.data?.markdown) {
        parts.push(`Content: "${a.data.markdown.substring(0, 80)}..."`)
      }
      const active = index === chat.activeArtifactIndex ? ' (currently selected)' : ''
      return parts.join(', ') + active
    }

    const visibleSection =
      visible.length > 0
        ? `Visible (${visible.length}):\n${visible.map((a) => formatArtifact(a, chat.artifacts.indexOf(a))).join('\n')}`
        : 'Visible: none'

    const hiddenSection =
      hidden.length > 0
        ? `\n\nHidden (${hidden.length}) — can be restored by the user or referenced by ID:\n${hidden.map((a) => formatArtifact(a, chat.artifacts.indexOf(a))).join('\n')}`
        : ''

    return {
      success: true,
      message: `Artifacts in current chat (${chat.artifacts.length} total):\n${visibleSection}${hiddenSection}`,
    }
  }

  // Get the full contents and metadata of an artifact by ID
  private getArtifact(artifactId: string): ToolCallResult {
    const chat = this.resolvedChat
    if (!chat) {
      return {
        success: false,
        error: 'No active chat session.',
      }
    }

    const artifact = chat.getArtifactById(artifactId)
    if (!artifact) {
      return {
        success: false,
        error: `Artifact "${artifactId}" not found. Use list_artifacts to see available artifacts.`,
      }
    }

    const details: Record<string, any> = {
      id: artifact.id,
      type: artifact.type,
    }

    if (artifact.config) {
      details.config = { ...artifact.config }
    }

    if (artifact.type === 'markdown') {
      details.markdown = artifact.data?.markdown || ''
      details.query = artifact.data?.query || ''
      details.hasQueryResults = !!artifact.data?.queryResults
    } else if (artifact.data) {
      const jsonData =
        typeof artifact.data.toJSON === 'function' ? artifact.data.toJSON() : artifact.data
      const { head, tail, totalRows, cutCount } = truncateResultRows(jsonData)
      if (cutCount > 0) {
        const half = MAX_TOOL_RESULT_ROWS / 2
        details.data = { ...jsonData, data: head }
        details._truncated = `${cutCount} of ${totalRows} rows cut off (showing first ${half} and last ${half}). Use get_artifact_rows to fetch any range.`
        details._tail = tail
      } else {
        details.data = jsonData
      }
    }

    return {
      success: true,
      message: `Artifact "${artifactId}" (${artifact.type}):\n${JSON.stringify(details, null, 2)}`,
    }
  }

  // Fetch a specific row range from a results or chart artifact
  private getArtifactRows(artifactId: string, startRow: number, endRow: number): ToolCallResult {
    const chat = this.resolvedChat
    if (!chat) {
      return { success: false, error: 'No active chat session.' }
    }

    const artifact = chat.getArtifactById(artifactId)
    if (!artifact) {
      return {
        success: false,
        error: `Artifact "${artifactId}" not found. Use list_artifacts to see available artifacts.`,
      }
    }

    if (artifact.type !== 'results' && artifact.type !== 'chart') {
      return {
        success: false,
        error: `Artifact "${artifactId}" does not contain tabular data (type: ${artifact.type}). Only results and chart artifacts support row fetching.`,
      }
    }

    const jsonData =
      typeof artifact.data?.toJSON === 'function' ? artifact.data.toJSON() : artifact.data
    const rows: any[] = jsonData?.data

    if (!Array.isArray(rows)) {
      return { success: false, error: `Artifact "${artifactId}" has no row data.` }
    }

    const totalRows = rows.length
    const clampedStart = Math.max(0, Math.min(startRow, totalRows - 1))
    const clampedEnd = Math.max(clampedStart, Math.min(endRow, totalRows - 1))
    const slice = rows.slice(clampedStart, clampedEnd + 1)

    return {
      success: true,
      message:
        `Rows ${clampedStart}-${clampedEnd} of ${totalRows} total from artifact "${artifactId}":\n` +
        JSON.stringify({ headers: jsonData.headers, data: slice }, null, 2),
    }
  }

  // Update an existing artifact by ID
  private updateArtifact(
    artifactId: string,
    markdown?: string,
    title?: string,
    chartConfig?: ChartConfig,
  ): ToolCallResult {
    const chat = this.resolvedChat
    if (!chat) {
      return {
        success: false,
        error: 'No active chat session.',
      }
    }

    const artifact = chat.getArtifactById(artifactId)
    if (!artifact) {
      return {
        success: false,
        error: `Artifact "${artifactId}" not found. Use list_artifacts to see available artifacts.`,
      }
    }

    const updates: string[] = []

    if (markdown !== undefined && artifact.type === 'markdown') {
      artifact.data = { ...artifact.data, markdown }
      updates.push('markdown content')
    }

    if (title !== undefined) {
      artifact.config = { ...artifact.config, title }
      updates.push('title')
    }

    if (chartConfig !== undefined && (artifact.type === 'chart' || artifact.type === 'results')) {
      // Validate chart config against the artifact's actual data
      const results = artifact.data as Results | null
      if (results && results.headers) {
        const validation = validateChartConfigForData(results.data, results.headers, chartConfig)
        if (!validation.valid) {
          // Auto-correct to suggested config
          const corrected = validation.suggestedConfig as ChartConfig
          artifact.config = { ...artifact.config, chartConfig: corrected }
          chat.updatedAt = new Date()
          chat.changed = true
          return {
            success: false,
            error:
              `Auto-corrected artifact "${artifactId}" chart config to default configuration.\n` +
              formatChartConfigValidationError(validation),
          }
        }
      }
      artifact.config = { ...artifact.config, chartConfig }
      updates.push('chart configuration')
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: `No applicable updates for artifact "${artifactId}" (type: ${artifact.type}).`,
      }
    }

    chat.updatedAt = new Date()
    chat.changed = true

    return {
      success: true,
      message: `Updated artifact "${artifactId}": ${updates.join(', ')}.`,
    }
  }

  // Reorder artifacts by providing desired order of IDs
  private reorderArtifacts(artifactIds: string[]): ToolCallResult {
    const chat = this.resolvedChat
    if (!chat) {
      return { success: false, error: 'No active chat session.' }
    }

    if (!Array.isArray(artifactIds) || artifactIds.length === 0) {
      return {
        success: false,
        error: 'artifact_ids must be a non-empty array of artifact IDs.',
      }
    }

    const missing = artifactIds.filter((id) => !chat.artifacts.find((a) => a.id === id))
    if (missing.length > 0) {
      return {
        success: false,
        error: `Artifact IDs not found: ${missing.join(', ')}. Use list_artifacts to see available artifacts.`,
      }
    }

    const idSet = new Set(artifactIds)
    const activeArtifact = chat.getActiveArtifact()

    const specifiedArtifacts = artifactIds.map((id) => chat.artifacts.find((a) => a.id === id)!)
    const unspecified = chat.artifacts.filter((a) => !idSet.has(a.id))
    chat.artifacts = [...specifiedArtifacts, ...unspecified]

    // Maintain active artifact index after reorder
    if (activeArtifact) {
      chat.activeArtifactIndex = chat.artifacts.findIndex((a) => a.id === activeArtifact.id)
    }

    chat.updatedAt = new Date()
    chat.changed = true

    return {
      success: true,
      message: `Reordered ${chat.artifacts.length} artifacts. New order: ${chat.artifacts.map((a) => `"${a.config?.title || a.type}" (${a.id})`).join(', ')}.`,
    }
  }

  // Hide one or more artifacts by ID (soft-delete — user can restore from the Hidden section)
  private hideArtifacts(artifactIds: string | string[]): ToolCallResult {
    const chat = this.resolvedChat
    if (!chat) {
      return { success: false, error: 'No active chat session.' }
    }

    const ids = Array.isArray(artifactIds) ? artifactIds : [artifactIds]
    if (ids.length === 0) {
      return { success: false, error: 'artifact_ids must be a non-empty array of artifact IDs.' }
    }

    const notFound: string[] = []
    const hidden: string[] = []

    for (const id of ids) {
      if (chat.hideArtifact(id)) {
        hidden.push(id)
      } else {
        notFound.push(id)
      }
    }

    if (hidden.length === 0) {
      return {
        success: false,
        error: `No artifacts found with IDs: ${notFound.join(', ')}. Use list_artifacts to see available artifacts.`,
      }
    }

    const message =
      notFound.length > 0
        ? `Hidden ${hidden.length} artifact(s). Not found: ${notFound.join(', ')}. Hidden artifacts remain accessible to you via list_artifacts and can be restored by the user.`
        : `Hidden ${hidden.length} artifact(s). They remain accessible via list_artifacts and can be restored by the user.`

    return { success: true, message }
  }
}
