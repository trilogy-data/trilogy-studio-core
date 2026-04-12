import type { ToolCallResult } from './chatToolExecutor'
import type { DashboardModel } from '../dashboards/base'
import { CELL_TYPES, type CellType, type MarkdownData } from '../dashboards/base'
import type { DashboardStoreType } from '../stores/dashboardStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { QueryInput, QueryResult } from '../stores/queryExecutionService'
import type { ChatImport } from '../chats/chat'
import type { ContentInput } from '../stores/resolver'
import type { DashboardQueryExecutor } from '../dashboards/dashboardQueryExecutor'
import { truncateResultRows } from './toolLoopCore'
import { validateChartConfigForData, formatChartConfigValidationError } from '../dashboards/helpers'
import type { ChartConfig, Results } from '../editors/results'
import { fetchConceptsForImport } from './importConcepts'

export interface DashboardToolExecutorDeps {
  dashboardStore: DashboardStoreType
  connectionStore: ConnectionStoreType
  editorStore: EditorStoreType
  queryExecutionService: QueryExecutionService
  /** The dashboard being operated on */
  dashboardId: string
  /** Currently active imports (managed by the chat panel) */
  getActiveImports: () => ChatImport[]
  /** Set active imports */
  setActiveImports: (imports: ChatImport[]) => void
  /** Get or create the dashboard query executor */
  getDashboardQueryExecutor: () => DashboardQueryExecutor | null
  /** Trigger query re-execution for a specific item; returns a queryId if available */
  refreshItem: (itemId: string) => string | undefined
  /**
   * Optional callback to render the live dashboard to a PNG. When provided,
   * the agent's `capture_dashboard_screenshot` tool returns the image so the
   * model can visually review the layout before handing off. The `overflows`
   * field reports any items whose content is being clipped or hidden behind
   * a scrollbar (the screenshot only shows what is visible), so the agent
   * can be told about content the image cannot reveal.
   */
  captureDashboardImage?: () => Promise<{
    base64: string
    mediaType: string
    width: number
    height: number
    overflows: Array<{
      itemId: string
      visiblePx: number
      contentPx: number
      overflowPx: number
      visibleRatio: number
    }>
  }>
}

export class DashboardToolExecutor {
  private deps: DashboardToolExecutorDeps

  constructor(deps: DashboardToolExecutorDeps) {
    this.deps = deps
  }

  private get dashboard(): DashboardModel | null {
    return this.deps.dashboardStore.dashboards[this.deps.dashboardId] || null
  }

  private get connectionName(): string {
    return this.dashboard?.connection || ''
  }

  async executeToolCall(
    toolName: string,
    toolInput: Record<string, any>,
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case 'list_dashboard_items':
        return this.listDashboardItems()
      case 'get_dashboard_item':
        return this.getDashboardItem(toolInput.item_id)
      case 'add_dashboard_item':
        return this.addDashboardItem(toolInput)
      case 'update_dashboard_item':
        return this.updateDashboardItem(toolInput)
      case 'remove_dashboard_item':
        return this.removeDashboardItem(toolInput.item_id)
      case 'move_dashboard_item':
        return this.moveDashboardItem(toolInput)
      case 'get_dashboard_info':
        return this.getDashboardInfo()
      case 'update_dashboard_info':
        return this.updateDashboardInfo(toolInput)
      case 'set_dashboard_title':
        return this.updateDashboardInfo({ name: toolInput.title })
      case 'capture_dashboard_screenshot':
        return this.captureDashboardScreenshot()
      case 'run_trilogy_query':
        return this.runTrilogyQuery(toolInput.query, toolInput.connection)
      case 'select_active_import':
        return this.selectActiveImport(toolInput.import_name)
      case 'list_available_imports':
        return this.listAvailableImports()
      case 'connect_data_connection':
        return this.connectDataConnection(toolInput.connection)
      case 'return_to_user':
        return {
          success: true,
          message: toolInput.message || 'Done.',
          terminatesLoop: true,
        }
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        }
    }
  }

  private listDashboardItems(): ToolCallResult {
    const dashboard = this.dashboard
    if (!dashboard) {
      return { success: false, error: 'Dashboard not found.' }
    }

    const items = Object.entries(dashboard.gridItems)
    if (items.length === 0) {
      return { success: true, message: 'The dashboard is empty. No items to list.' }
    }

    const layoutMap = new Map(dashboard.layout.map((l) => [l.i, l]))

    const itemDescriptions = items.map(([id, item]) => {
      const layout = layoutMap.get(id)
      const isStructured = typeof item.content === 'object' && item.content !== null
      const md = isStructured ? (item.content as MarkdownData) : null
      const content = isStructured
        ? md?.markdown?.substring(0, 120) || ''
        : (item.content as string).substring(0, 120)
      const pos = layout ? `(x=${layout.x}, y=${layout.y}, w=${layout.w}, h=${layout.h})` : ''
      const querySuffix = md?.query ? `\n  Query: ${md.query.substring(0, 120)}${md.query.length >= 120 ? '...' : ''}` : ''
      return `- [${id}] ${item.type}: "${item.name}" ${pos}\n  Content: ${content}${content.length >= 120 ? '...' : ''}${querySuffix}`
    })

    return {
      success: true,
      message: `Dashboard items (${items.length}):\n${itemDescriptions.join('\n')}`,
    }
  }

  private getDashboardItem(itemId: string): ToolCallResult {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    const item = dashboard.gridItems[itemId]
    if (!item) {
      return {
        success: false,
        error: `Item "${itemId}" not found. Use list_dashboard_items to see available items.`,
      }
    }

    const layout = dashboard.layout.find((l) => l.i === itemId)
    // For markdown items, surface markdown text and query as separate fields
    // so the agent can update either independently via update_dashboard_item.
    const isStructured = typeof item.content === 'object' && item.content !== null
    const mdContent = isStructured ? (item.content as MarkdownData) : null
    const details: Record<string, any> = {
      id: itemId,
      type: item.type,
      name: item.name,
      content: isStructured ? mdContent?.markdown || '' : item.content,
      query: mdContent?.query || null,
      chartConfig: item.chartConfig || null,
      position: layout
        ? { x: layout.x, y: layout.y, w: layout.w, h: layout.h }
        : null,
      loading: item.loading || false,
      error: item.error || null,
    }

    if (item.results) {
      const jsonData =
        typeof (item.results as any).toJSON === 'function'
          ? (item.results as any).toJSON()
          : item.results
      const { head, totalRows, cutCount } = truncateResultRows(jsonData)
      if (cutCount > 0) {
        details.resultPreview = { ...jsonData, data: head }
        details.resultTruncated = `Showing first ${head.length} of ${totalRows} rows`
      } else {
        details.results = jsonData
      }
    }

    return {
      success: true,
      message: JSON.stringify(details, null, 2),
    }
  }

  /**
   * Wait for a query to complete and validate the chart config against the results.
   * If validation fails, auto-corrects to the default config and returns warnings.
   */
  private async validateChartConfigAfterQuery(
    itemId: string,
    queryId: string,
    chartConfig: ChartConfig,
  ): Promise<string | null> {
    const executor = this.deps.getDashboardQueryExecutor()
    if (!executor) return null

    try {
      const result = await executor.waitForQuery(queryId)

      // Extract results - handle both direct Results and wrapped { results: Results }
      const results: Results | null = result?.results ?? result ?? null
      if (!results || !results.headers) return null

      const validation = validateChartConfigForData(results.data, results.headers, chartConfig)
      if (validation.valid) return null

      // Validation failed - auto-correct to suggested config
      const suggested = validation.suggestedConfig as ChartConfig
      if (suggested && suggested.chartType) {
        this.deps.dashboardStore.updateItemChartConfig(
          this.deps.dashboardId,
          itemId,
          suggested,
        )
      }

      return `Auto-corrected to default configuration.\n${formatChartConfigValidationError(validation)}`
    } catch {
      // Query failed or was cancelled - validation not possible, skip silently
      return null
    }
  }

  private async addDashboardItem(input: Record<string, any>): Promise<ToolCallResult> {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    const type = input.type as string
    if (!type || !['chart', 'table', 'markdown', 'filter'].includes(type)) {
      return { success: false, error: `Invalid item type: "${type}". Must be chart, table, markdown, or filter.` }
    }

    const content = input.content as string
    if (!content) {
      return { success: false, error: 'Content is required.' }
    }

    const cellType = type as CellType
    const markdownQuery = typeof input.query === 'string' ? input.query : ''
    const hasMarkdownQuery = cellType === CELL_TYPES.MARKDOWN && markdownQuery.length > 0
    const w = input.width || (cellType === CELL_TYPES.MARKDOWN ? 20 : 10)
    const h = input.height || (cellType === CELL_TYPES.MARKDOWN ? (hasMarkdownQuery ? 6 : 4) : 8)
    const name = input.name || type.charAt(0).toUpperCase() + type.slice(1)

    // Find the next available y position to avoid overlap
    const maxY = dashboard.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)

    const itemId = this.deps.dashboardStore.addItemToDashboard(
      this.deps.dashboardId,
      cellType,
      0,
      maxY,
      w,
      h,
      content,
      name,
    )

    // For markdown items with a query, store as MarkdownData so the renderer
    // executes the query and exposes its results to the template engine.
    if (hasMarkdownQuery) {
      const mdData: MarkdownData = { markdown: content, query: markdownQuery }
      this.deps.dashboardStore.updateMultipleItemProperties(this.deps.dashboardId, itemId, {
        content: mdData,
      })
    }

    // Set chart config if provided
    if (input.chartConfig && cellType === CELL_TYPES.CHART) {
      this.deps.dashboardStore.updateItemChartConfig(this.deps.dashboardId, itemId, input.chartConfig)
    }

    // Trigger query execution for chart/table/markdown-with-query items
    let queryId: string | undefined
    if (cellType === CELL_TYPES.CHART || cellType === CELL_TYPES.TABLE || hasMarkdownQuery) {
      queryId = this.deps.refreshItem(itemId)
    }

    let message = `Added ${type} item "${name}" (ID: ${itemId}) at position (0, ${maxY}, ${w}x${h}).${hasMarkdownQuery ? ' Markdown is bound to query results for dynamic data.' : ''}`

    // If a chartConfig was explicitly provided, validate it against query results
    if (input.chartConfig && cellType === CELL_TYPES.CHART && queryId) {
      const warning = await this.validateChartConfigAfterQuery(itemId, queryId, input.chartConfig)
      if (warning) {
        return {
          success: false,
          error: `${message}\n\nHowever, the chart configuration is invalid:\n${warning}`,
        }
      }
    }

    return {
      success: true,
      message,
    }
  }

  private async updateDashboardItem(input: Record<string, any>): Promise<ToolCallResult> {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    const itemId = input.item_id as string
    if (!dashboard.gridItems[itemId]) {
      return {
        success: false,
        error: `Item "${itemId}" not found. Use list_dashboard_items to see available items.`,
      }
    }

    const updates: string[] = []
    const existingItem = dashboard.gridItems[itemId]
    const targetType = (input.type as CellType | undefined) || existingItem.type
    const isMarkdown = targetType === CELL_TYPES.MARKDOWN

    // For markdown items, content + query collapse into MarkdownData. Handle both
    // together so the agent can update either field independently without losing
    // the other.
    if (isMarkdown && (input.content !== undefined || input.query !== undefined)) {
      const existingContent = existingItem.content
      const existingMarkdown =
        typeof existingContent === 'string'
          ? existingContent
          : (existingContent as MarkdownData)?.markdown || ''
      const existingQuery =
        typeof existingContent === 'string'
          ? ''
          : (existingContent as MarkdownData)?.query || ''
      const nextMarkdown = input.content !== undefined ? (input.content as string) : existingMarkdown
      const nextQuery = input.query !== undefined ? (input.query as string) : existingQuery
      const nextContent: string | MarkdownData = nextQuery
        ? { markdown: nextMarkdown, query: nextQuery }
        : nextMarkdown
      this.deps.dashboardStore.updateMultipleItemProperties(this.deps.dashboardId, itemId, {
        content: nextContent,
      })
      if (input.content !== undefined) updates.push('content')
      if (input.query !== undefined) updates.push('query')
    } else if (input.content !== undefined) {
      this.deps.dashboardStore.updateItemContent(this.deps.dashboardId, itemId, input.content)
      updates.push('content')
    }

    if (input.name !== undefined) {
      this.deps.dashboardStore.updateItemName(this.deps.dashboardId, itemId, input.name)
      updates.push('name')
    }

    if (input.type !== undefined) {
      this.deps.dashboardStore.updateItemType(this.deps.dashboardId, itemId, input.type)
      updates.push('type')
    }

    if (input.chartConfig !== undefined) {
      this.deps.dashboardStore.updateItemChartConfig(
        this.deps.dashboardId,
        itemId,
        input.chartConfig,
      )
      updates.push('chartConfig')
    }

    if (updates.length === 0) {
      return { success: true, message: `No updates provided for item "${itemId}".` }
    }

    // Re-execute query if content/query/type changed for query-backed items
    const item = dashboard.gridItems[itemId]
    let queryId: string | undefined
    const itemHasQuery =
      item.type === CELL_TYPES.CHART ||
      item.type === CELL_TYPES.TABLE ||
      (item.type === CELL_TYPES.MARKDOWN &&
        typeof item.content === 'object' &&
        !!(item.content as MarkdownData).query)
    if (
      (updates.includes('content') || updates.includes('type') || updates.includes('query')) &&
      itemHasQuery
    ) {
      queryId = this.deps.refreshItem(itemId)
    }

    let message = `Updated item "${itemId}": ${updates.join(', ')}.`

    // If chartConfig was updated on a chart item, validate against query results
    if (updates.includes('chartConfig') && item.type === CELL_TYPES.CHART) {
      // If query was also re-executed, wait for that; otherwise use existing results
      if (queryId) {
        const warning = await this.validateChartConfigAfterQuery(itemId, queryId, input.chartConfig)
        if (warning) {
          return {
            success: false,
            error: `${message}\n\nHowever, the chart configuration is invalid:\n${warning}`,
          }
        }
      } else if (item.results) {
        // Validate against existing results without re-executing query
        const results = item.results as Results
        if (results.headers) {
          const validation = validateChartConfigForData(results.data, results.headers, input.chartConfig)
          if (!validation.valid) {
            const suggested = validation.suggestedConfig as ChartConfig
            if (suggested && suggested.chartType) {
              this.deps.dashboardStore.updateItemChartConfig(
                this.deps.dashboardId,
                itemId,
                suggested,
              )
            }
            return {
              success: false,
              error: `${message}\n\nAuto-corrected to default configuration.\n${formatChartConfigValidationError(validation)}`,
            }
          }
        }
      }
    }

    return {
      success: true,
      message,
    }
  }

  private removeDashboardItem(itemId: string): ToolCallResult {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    if (!dashboard.gridItems[itemId]) {
      return {
        success: false,
        error: `Item "${itemId}" not found. Use list_dashboard_items to see available items.`,
      }
    }

    const name = dashboard.gridItems[itemId].name
    this.deps.dashboardStore.removeItemFromDashboard(this.deps.dashboardId, itemId)

    return {
      success: true,
      message: `Removed item "${name}" (${itemId}) from the dashboard.`,
    }
  }

  private moveDashboardItem(input: Record<string, any>): ToolCallResult {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    const itemId = input.item_id as string
    if (!dashboard.gridItems[itemId]) {
      return {
        success: false,
        error: `Item "${itemId}" not found. Use list_dashboard_items to see available items.`,
      }
    }

    this.deps.dashboardStore.updateItemLayoutDimensions(
      this.deps.dashboardId,
      itemId,
      input.x ?? null,
      input.y ?? null,
      input.w ?? null,
      input.h ?? null,
    )

    const layout = dashboard.layout.find((l) => l.i === itemId)
    const pos = layout
      ? `(x=${layout.x}, y=${layout.y}, w=${layout.w}, h=${layout.h})`
      : 'updated'

    return {
      success: true,
      message: `Moved item "${itemId}" to ${pos}.`,
    }
  }

  private getDashboardInfo(): ToolCallResult {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    const info = {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      connection: dashboard.connection,
      state: dashboard.state,
      itemCount: Object.keys(dashboard.gridItems).length,
      imports: dashboard.imports,
      filter: dashboard.filter,
      createdAt: dashboard.createdAt,
      updatedAt: dashboard.updatedAt,
    }

    return {
      success: true,
      message: JSON.stringify(info, null, 2),
    }
  }

  private updateDashboardInfo(input: Record<string, any>): ToolCallResult {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    const updates: string[] = []

    if (input.name !== undefined) {
      this.deps.dashboardStore.updateDashboardName(this.deps.dashboardId, input.name)
      updates.push('name')
    }

    if (input.description !== undefined) {
      this.deps.dashboardStore.updateDashboardDescription(this.deps.dashboardId, input.description)
      updates.push('description')
    }

    if (updates.length === 0) {
      return { success: true, message: 'No updates provided.' }
    }

    return {
      success: true,
      message: `Updated dashboard: ${updates.join(', ')}.`,
    }
  }

  private async captureDashboardScreenshot(): Promise<ToolCallResult> {
    const dashboard = this.dashboard
    if (!dashboard) return { success: false, error: 'Dashboard not found.' }

    if (!this.deps.captureDashboardImage) {
      return {
        success: false,
        error:
          'Screenshot capture is not available in this environment. Review the dashboard via list_dashboard_items / get_dashboard_item instead.',
      }
    }

    try {
      const { base64, mediaType, width, height, overflows } =
        await this.deps.captureDashboardImage()

      // Build a textual layout summary as a fallback for non-vision providers
      // (Anthropic will additionally see the actual image attached below).
      const layoutLines = dashboard.layout
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((l) => {
          const item = dashboard.gridItems[l.i]
          const name = item?.name || '(untitled)'
          const type = item?.type || '?'
          return `- [${l.i}] ${type} "${name}" at (x=${l.x}, y=${l.y}, w=${l.w}, h=${l.h})`
        })

      // Format overflow diagnostics. The screenshot only renders what is
      // visible inside each grid cell, so any item whose content is clipped
      // or scrollable looks "complete" in the image even though information
      // is hidden. Surface this explicitly so the agent considers resizing.
      const overflowSection = (overflows || [])
        .filter((o) => o.overflowPx > 0)
        .sort((a, b) => b.overflowPx - a.overflowPx)
        .map((o) => {
          const item = dashboard.gridItems[o.itemId]
          const layout = dashboard.layout.find((l) => l.i === o.itemId)
          const name = item?.name || '(untitled)'
          const type = item?.type || '?'
          const pct = Math.round(o.visibleRatio * 100)
          const sizeHint = layout ? ` Current size: w=${layout.w}, h=${layout.h}.` : ''
          return `- [${o.itemId}] ${type} "${name}": showing ~${pct}% of content (${o.visiblePx}px visible of ${o.contentPx}px, ${o.overflowPx}px hidden).${sizeHint}`
        })

      // Collect items whose query failed (syntax error, resolution error, etc.).
      // These render as an error placeholder in the screenshot which the model
      // tends to skim past, so list them explicitly by id.
      const brokenItems = Object.entries(dashboard.gridItems)
        .filter(([, item]) => typeof item.error === 'string' && item.error.trim() !== '')
        .map(([id, item]) => {
          const name = item.name || '(untitled)'
          const type = item.type || '?'
          const errMsg = (item.error || '').replace(/\s+/g, ' ').trim()
          const errPreview = errMsg.length > 400 ? errMsg.slice(0, 400) + '...' : errMsg
          const mdContent =
            typeof item.content === 'object' && item.content !== null
              ? (item.content as MarkdownData)
              : null
          const query = mdContent?.query || (typeof item.content === 'string' ? item.content : '')
          const queryPreview = query
            ? `\n    Query: ${query.substring(0, 200)}${query.length > 200 ? '...' : ''}`
            : ''
          return `- [${id}] ${type} "${name}": ${errPreview}${queryPreview}`
        })

      const itemCount = Object.keys(dashboard.gridItems).length
      let summary =
        `Captured dashboard "${dashboard.name}" as PNG (${width}x${height}px, ${itemCount} item${itemCount === 1 ? '' : 's'}). ` +
        `The image is attached below for visual review.\n\n` +
        `Layout:\n${layoutLines.join('\n') || '(empty)'}`

      if (brokenItems.length > 0) {
        summary +=
          `\n\nBROKEN ITEMS DETECTED — the following items currently have a query or rendering error and are NOT displaying real data in the screenshot (they render as an error placeholder, which is easy to miss at a glance). You MUST fix these before calling return_to_user — either correct the Trilogy query syntax via update_dashboard_item, or remove the item if it cannot be salvaged. Do not ignore them:\n` +
          brokenItems.join('\n')
      }

      if (overflowSection.length > 0) {
        summary +=
          `\n\nCONTENT OVERFLOW DETECTED — the following items have content that is clipped or behind a scrollbar in the rendered image. You may be able to see signs of this in the screenshot (a scrollbar, text cut mid-line, missing bottom padding), but the diagnostic below pins down which items and by how much. Increase the height (h) of these items via move_dashboard_item, or shorten their content/query, before handing off:\n` +
          overflowSection.join('\n')
      }

      summary +=
        `\n\nReview the screenshot for visual issues (overlap, awkward sizing, empty regions, illegible charts, missing/unclear titles, truncated content) AND confirm every broken item listed above has been fixed or removed before calling return_to_user.`

      return {
        success: true,
        message: summary,
        imageData: {
          data: base64,
          mediaType,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to capture dashboard: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async runTrilogyQuery(query: string, connectionName?: string): Promise<ToolCallResult> {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return { success: false, error: 'Query is required and must be a non-empty string' }
    }

    const connName = connectionName || this.connectionName
    if (!connName) {
      return { success: false, error: 'No connection name specified and no dashboard connection set.' }
    }

    const connection = this.deps.connectionStore.connections[connName]
    if (!connection) {
      return {
        success: false,
        error: `Connection "${connName}" not found. Available: ${Object.keys(this.deps.connectionStore.connections).join(', ') || 'None'}`,
      }
    }

    if (!connection.connected) {
      return {
        success: false,
        error: `Connection "${connName}" is not connected. Use connect_data_connection first.`,
      }
    }

    const extraContent = this.buildExtraContent(connName)
    const activeImports = this.deps.getActiveImports()
    const importsForQuery = activeImports.map((imp) => ({
      name: imp.name,
      alias: imp.alias || '',
    }))

    const queryInput: QueryInput = {
      text: query.trim(),
      editorType: 'trilogy',
      imports: importsForQuery,
      extraContent,
    }

    try {
      const result = await this.deps.queryExecutionService.executeQuery(connName, queryInput)
      const queryResult: QueryResult = await result.resultPromise

      if (!queryResult.success) {
        return {
          success: false,
          error: queryResult.error || 'Query execution failed',
          query,
          generatedSql: queryResult.generatedSql,
        }
      }

      if (!queryResult.results) {
        return { success: false, error: 'Query returned no results', query }
      }

      const jsonData =
        typeof (queryResult.results as any).toJSON === 'function'
          ? (queryResult.results as any).toJSON()
          : queryResult.results
      const { head, totalRows, cutCount } = truncateResultRows(jsonData)

      let dataMessage: string
      if (cutCount > 0) {
        dataMessage = JSON.stringify({ ...jsonData, data: head }, null, 2)
        dataMessage += `\n\n(Showing first ${head.length} of ${totalRows} rows)`
      } else {
        dataMessage = JSON.stringify(jsonData, null, 2)
      }

      return {
        success: true,
        message: `Query executed successfully (${queryResult.executionTime}ms, ${totalRows} rows):\n${dataMessage}`,
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

  private async selectActiveImport(importName: string): Promise<ToolCallResult> {
    if (!importName || importName.trim() === '') {
      this.deps.setActiveImports([])
      return {
        success: true,
        message: 'Cleared active data source selection.',
        triggersSymbolRefresh: true,
      }
    }

    const connectionName = this.connectionName
    if (!connectionName) {
      return {
        success: false,
        error: 'No data connection selected for this dashboard. Connect a data connection first.',
      }
    }

    const available = this.getAvailableImports()
    const importToSelect = available.find(
      (i) => i.name === importName || i.name.endsWith(`.${importName}`),
    )

    if (!importToSelect) {
      return {
        success: false,
        error: `Import "${importName}" not found. Available: ${available.map((i) => i.name).join(', ') || 'none'}`,
      }
    }

    const activeImports = this.deps.getActiveImports()
    const alreadyActive =
      activeImports.length === 1 && activeImports[0].id === importToSelect.id

    if (!alreadyActive) {
      this.deps.setActiveImports([importToSelect])
    }

    const conceptsOutput = await fetchConceptsForImport(
      {
        connectionStore: this.deps.connectionStore,
        editorStore: this.deps.editorStore,
        queryExecutionService: this.deps.queryExecutionService,
      },
      importToSelect,
      connectionName,
    )

    const prefix = alreadyActive
      ? `"${importToSelect.name}" is already the active data source.`
      : `Successfully selected "${importToSelect.name}" as the active data source.`

    return {
      success: true,
      message: `${prefix}\n\n${conceptsOutput}`,
      triggersSymbolRefresh: !alreadyActive,
    }
  }

  private listAvailableImports(): ToolCallResult {
    const available = this.getAvailableImports()
    const activeImports = this.deps.getActiveImports()
    const activeImport = activeImports.length > 0 ? activeImports[0] : null

    if (available.length === 0) {
      return {
        success: true,
        message: `No data sources available on connection "${this.connectionName}".`,
      }
    }

    const currentStatus = activeImport
      ? `Current active data source: ${activeImport.name}\n\n`
      : 'No data source currently selected.\n\n'

    return {
      success: true,
      message: `${currentStatus}Available data sources:\n${available.map((i) => `- ${i.name}${activeImport?.id === i.id ? ' (active)' : ''}`).join('\n')}`,
    }
  }

  private async connectDataConnection(connectionName: string): Promise<ToolCallResult> {
    if (!connectionName) {
      return {
        success: false,
        error: `Connection name required. Available: ${Object.keys(this.deps.connectionStore.connections).join(', ') || 'None'}`,
      }
    }

    const connection = this.deps.connectionStore.connections[connectionName]
    if (!connection) {
      return {
        success: false,
        error: `Connection "${connectionName}" not found. Available: ${Object.keys(this.deps.connectionStore.connections).join(', ') || 'None'}`,
      }
    }

    if (connection.connected) {
      return { success: true, message: `Connection "${connectionName}" is already active.` }
    }

    try {
      await this.deps.connectionStore.connectConnection(connectionName)
      return {
        success: true,
        message: `Successfully connected to "${connectionName}".`,
        triggersSymbolRefresh: true,
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  private getAvailableImports(): ChatImport[] {
    const connectionName = this.connectionName
    if (!connectionName || !this.deps.editorStore) return []

    return Object.values(this.deps.editorStore.editors)
      .filter((editor) => editor.connection === connectionName && !editor.deleted)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((editor) => ({
        id: editor.id,
        name: editor.name.replace(/\//g, '.'),
        alias: '',
      }))
  }

  private buildExtraContent(connectionName: string): ContentInput[] {
    const allConnectionEditors = this.deps.editorStore
      ? Object.values(this.deps.editorStore.editors)
          .filter((editor) => editor.connection === connectionName && !editor.deleted)
          .map((editor) => ({ alias: editor.name, contents: editor.contents }))
      : []

    const connectionSources = this.deps.connectionStore.getConnectionSources(connectionName)
    const extraContentMap = new Map<string, string>()

    connectionSources.forEach((s) => extraContentMap.set(s.alias, s.contents))
    allConnectionEditors.forEach((s) => extraContentMap.set(s.alias, s.contents))

    const activeImports = this.deps.getActiveImports()
    activeImports.forEach((imp) => {
      const alias = imp.alias || imp.name
      const contents = this.deps.editorStore?.editors[imp.id]?.contents || ''
      if (contents) {
        extraContentMap.set(alias, contents)
      }
    })

    return Array.from(extraContentMap.entries()).map(([alias, contents]) => ({ alias, contents }))
  }
}
