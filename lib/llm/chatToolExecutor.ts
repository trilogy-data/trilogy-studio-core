import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput } from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import { Chat, type ChatArtifact, type ChatImport, generateArtifactId } from '../chats/chat'
import type { ChartConfig, Results } from '../editors/results'
import { MAX_TOOL_RESULT_ROWS, truncateResultRows } from './toolLoopCore'
import { validateChartConfigForData, formatChartConfigValidationError } from '../dashboards/helpers'
import {
  type ToolCallResult,
  type ImportStateAccessor,
  type QueryCoreSuccess,
  connectDataConnection as sharedConnectDataConnection,
  buildExtraContent,
  getArtifactRowsFromData,
  getAvailableImports as sharedGetAvailableImports,
  selectActiveImport as sharedSelectActiveImport,
  listAvailableImports as sharedListAvailableImports,
  executeTrilogyQueryCore,
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
    const activeImports = this.resolvedChat?.imports || []
    const coreResult = await executeTrilogyQueryCore(
      this.queryExecutionService,
      this.connectionStore,
      this.editorStore,
      connectionName,
      query,
      activeImports,
    )

    // Error case — return the ToolCallResult directly
    if (!coreResult.success) {
      return coreResult as ToolCallResult
    }

    const { queryResult } = coreResult as QueryCoreSuccess

    // Validate chart config against actual results if one was provided
    let effectiveChartConfig = chartConfig
    let validationWarning: string | null = null
    if (chartConfig && artifactType === 'chart') {
      const results = queryResult.results as Results
      if (results && results.headers) {
        const validation = validateChartConfigForData(results.data, results.headers, chartConfig)
        if (!validation.valid) {
          effectiveChartConfig = validation.suggestedConfig as ChartConfig
          validationWarning = `Auto-corrected to default configuration.\n${formatChartConfigValidationError(validation)}`
        }
      }
    }

    // Build artifact with results data
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
  }

  // Validate a query without executing it (dry run)
  async validateQuery(query: string, connectionName: string): Promise<ToolCallResult> {
    if (!query || !connectionName) {
      return {
        success: false,
        error: 'Query and connection name are required',
      }
    }

    const connection = this.connectionStore.connectionByName(connectionName)
    if (!connection) {
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
      const validation = await this.queryExecutionService.validateQuery(connection.id, queryInput)

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
    return Object.values(this.connectionStore.connections)
      .filter((c) => c.connected)
      .map((c) => c.name)
  }

  // Get all connections (including disconnected)
  getAllConnections(): string[] {
    return Object.values(this.connectionStore.connections).map((c) => c.name)
  }

  /** Build the import state accessor that bridges chat store to the shared helpers. */
  private get importAccessor(): ImportStateAccessor {
    return {
      getActiveImports: () => this.resolvedChat?.imports || [],
      setActiveImports: (imports) => {
        if (this.resolvedChatId && this.chatStore) {
          this.chatStore.setImports(this.resolvedChatId, imports)
        }
      },
      getConnectionName: () => this.resolvedChat?.dataConnectionName || '',
    }
  }

  private async selectActiveImport(importName: string): Promise<ToolCallResult> {
    if (!this.resolvedChatId || !this.editorStore) {
      return {
        success: false,
        error: 'No active chat or editor store not available',
      }
    }

    return sharedSelectActiveImport(
      importName,
      this.importAccessor,
      {
        connectionStore: this.connectionStore,
        editorStore: this.editorStore,
        queryExecutionService: this.queryExecutionService,
      },
      this.editorStore,
      this.connectionStore,
    )
  }

  private listAvailableImports(): ToolCallResult {
    return sharedListAvailableImports(this.importAccessor, this.editorStore, this.connectionStore)
  }

  // Get available imports for a connection
  getAvailableImports(connectionName: string): ChatImport[] {
    return sharedGetAvailableImports(this.editorStore, connectionName, this.connectionStore)
  }

  // Connect a data connection
  private async connectDataConnection(connectionName: string): Promise<ToolCallResult> {
    return sharedConnectDataConnection(this.connectionStore, connectionName, {
      onConnected: (name) => {
        if (this.resolvedChatId && this.chatStore) {
          const conn = this.connectionStore.connectionByName(name)
          this.chatStore.updateChatDataConnection(this.resolvedChatId, name, conn?.id || '')
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

    return getArtifactRowsFromData(artifactId, artifact.data, startRow, endRow)
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
