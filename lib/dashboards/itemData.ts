import {
  CELL_TYPES,
  type DashboardModel,
  type GridItemDataResponse,
  type MarkdownData,
  type MemoData,
  type ClaimData,
} from './base'
import type { ContentInput } from '../stores/resolver'
import type { EditorStoreType } from '../stores/editorStore'
import type { DashboardStoreType } from '../stores/dashboardStore'

/**
 * Store-backed item-data accessors shared by the mounted dashboard runtime
 * (useDashboard) and the headless agent runtime (dashboardAgentRuntime).
 * Everything here reads/writes the persisted dashboard model — no component
 * state — so query executors built on these work without a mounted view.
 */

/** Placeholder response for missing dashboards/items. */
export function emptyItemDataResponse(itemId: string): GridItemDataResponse {
  return {
    type: CELL_TYPES.CHART,
    content: '',
    structured_content: { markdown: '', query: '' },
    name: `Item ${itemId}`,
    allowCrossFilter: true,
    width: 0,
    height: 0,
    imports: [],
    filters: [],
    rootContent: [],
    hasDrilldown: false,
  }
}

/** Import source contents for the resolver, read from the editor store. */
export function buildRootContent(
  dashboard: DashboardModel,
  editorStore: EditorStoreType,
): ContentInput[] {
  return dashboard.imports.map((imp) => ({
    alias: imp.name,
    // legacy handling
    contents:
      editorStore.editors[imp.id]?.contents || editorStore.editors[imp.name]?.contents || '',
  }))
}

function isMarkdownData(obj: any): obj is MarkdownData {
  return (
    obj && typeof obj === 'object' && typeof obj.markdown === 'string' && typeof obj.query === 'string'
  )
}
function isMemoLike(obj: any): obj is MemoData {
  return obj && typeof obj === 'object' && 'headline' in obj && 'verdict' in obj
}
function isClaimLike(obj: any): obj is ClaimData {
  return obj && typeof obj === 'object' && 'claim' in obj && !('headline' in obj)
}

/** Resolve a grid item into the response shape cells and the query executor
 *  consume. Pure over the dashboard model. */
export function buildItemDataResponse(
  dashboard: DashboardModel,
  itemId: string,
  opts: {
    rootContent: ContentInput[]
    onRefresh?: (itemId: string) => void
  },
): GridItemDataResponse {
  const item = dashboard.gridItems[itemId]

  if (!item) {
    return {
      ...emptyItemDataResponse(itemId),
      imports: dashboard.imports,
      connectionName: dashboard.connection || '',
    }
  }

  const itemFilters = item.filters || []
  let finalFilters = itemFilters

  if (dashboard.filter) {
    const hasGlobalFilter = itemFilters.some(
      (f) => f.source === 'global' && f.value === dashboard.filter,
    )

    if (!hasGlobalFilter) {
      finalFilters = [{ value: dashboard.filter, source: 'global' }, ...itemFilters]
    }
  }

  let hasDrilldown = false
  let content = isMarkdownData(item.content)
    ? item.content
    : isMemoLike(item.content) || isClaimLike(item.content)
      ? // Structured-payload cells expose their query under `query` so the
        // dashboard query executor can wire `data` for templating.
        { markdown: '', query: (item.content as MemoData | ClaimData).query || '' }
      : {
          markdown: item.type === 'markdown' ? (item.content as string) : '',
          query: item.type !== 'markdown' ? (item.content as string) : '',
        }
  if (item.drilldown) {
    hasDrilldown = true
    content = isMarkdownData(item.drilldown)
      ? item.drilldown
      : {
          markdown: item.type === 'markdown' ? (item.drilldown as string) : '',
          query: item.type !== 'markdown' ? (item.drilldown as string) : '',
        }
  }
  let config = item.chartConfig
  if (hasDrilldown) {
    config = item.drilldownChartConfig || undefined
  }

  // Flat string `content` is preserved for cells that key off it (chart/
  // table use the raw query; markdown uses the markdown body). Memo/claim
  // cells leave it empty here — their dedicated payloads carry the data.
  let flatContent = ''
  if (typeof item.content === 'string') {
    flatContent = item.content
  } else if (isMarkdownData(item.content)) {
    flatContent = item.content.markdown
  }

  return {
    type: item.type,
    content: flatContent,
    // display the drilldown if set
    structured_content: content,
    memoData: isMemoLike(item.content) ? (item.content as MemoData) : undefined,
    claimData: isClaimLike(item.content) ? (item.content as ClaimData) : undefined,
    name: item.name,
    allowCrossFilter: item.allowCrossFilter !== false, // Default to true if not explicitly false
    width: item.width || 0,
    height: item.height || 0,
    chartConfig: config,
    filters: finalFilters,
    chartFilters: item.chartFilters || [],
    conceptFilters: item.conceptFilters || [],
    parameters: item.parameters || {},
    onRefresh: opts.onRefresh,
    rootContent: opts.rootContent,
    results: item.results || null,
    connectionName: dashboard.connection || '',
    imports: dashboard.imports,
    error: item.error || '',
    loading: item.loading || false,
    loadStartTime: item.loadStartTime || null, // Include load start time if available
    hasDrilldown,
  }
}

/** Batch-apply an item-data update payload to the store-backed model.
 *  Mirrors the write half of useDashboard.setItemData. */
export function applyItemDataToStore(
  dashboardStore: DashboardStoreType,
  dashboardId: string,
  itemId: string,
  data: any,
): void {
  const updates: Parameters<typeof dashboardStore.updateMultipleItemProperties>[2] = {}

  if (data.name) {
    updates.name = data.name
  }
  if (data.chartConfig) {
    updates.chartConfig = data.chartConfig
  }
  if (data.content) {
    updates.content = data.content
  }
  if (data.dimensions) {
    updates.layoutDimensions = {
      w: data.dimensions.width,
      h: data.dimensions.height,
    }
  }
  if (data.width && data.height) {
    updates.width = data.width
    updates.height = data.height
  }
  if (data.loading !== undefined) {
    updates.loading = data.loading
  }
  if (data.results !== undefined) {
    updates.results = data.results
  }
  if (data.error !== undefined) {
    updates.error = data.error
  }
  if (data.drilldown !== undefined) {
    updates.drilldown = data.drilldown
  }
  if (data.drilldownChartConfig !== undefined) {
    updates.drilldownChartConfig = data.drilldownChartConfig
  }
  if (data.allowCrossFilter !== undefined) {
    updates.allowCrossFilter = data.allowCrossFilter
  }

  if (Object.keys(updates).length > 0) {
    dashboardStore.updateMultipleItemProperties(dashboardId, itemId, updates)
  }
}
