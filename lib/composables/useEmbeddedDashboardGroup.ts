import { reactive } from 'vue'
import type { ChartConfig } from '../editors/results'
import { CELL_TYPES, type Dashboard, type DashboardImport, type GridItemDataResponse } from '../dashboards/base'
import { DashboardQueryExecutor } from '../dashboards/dashboardQueryExecutor'
import type { ContentInput } from '../stores/resolver'
import type { DashboardExecutionService } from '../stores/queryExecutionService'

type DashboardFilterEntry = Array<{ source: string; value: string }>
type DashboardValueFilterEntry = Array<{ source: string; value: Record<string, string> }>

interface EmbeddedDashboardGroupItemState {
  type: typeof CELL_TYPES.CHART
  content: string
  drilldown: string | null
  name: string
  allowCrossFilter: boolean
  width: number
  height: number
  chartConfig?: ChartConfig
  drilldownChartConfig: ChartConfig | null
  conceptFilters: DashboardValueFilterEntry
  chartFilters: DashboardValueFilterEntry
  filters: DashboardFilterEntry
  parameters: Record<string, unknown>
  rootContent: ContentInput[]
  results: GridItemDataResponse['results']
  loading: boolean
  error: string | null
  loadStartTime: number | null
}

export interface EmbeddedDashboardGroupItemOptions {
  itemId: string
  title: string
  query: string
  priority?: number
  width?: number
  height?: number
  chartConfig?: ChartConfig
  allowCrossFilter?: boolean
  filters?: DashboardFilterEntry
  chartFilters?: DashboardValueFilterEntry
  conceptFilters?: DashboardValueFilterEntry
  parameters?: Record<string, unknown>
  rootContent?: ContentInput[]
}

export interface UseEmbeddedDashboardGroupOptions {
  dashboardId: string
  connectionId: string
  queryExecutionService: DashboardExecutionService
  imports?: DashboardImport[]
  batchDelay?: number
  maxConcurrentQueries?: number
}

function createItemState(options: EmbeddedDashboardGroupItemOptions): EmbeddedDashboardGroupItemState {
  return reactive({
    type: CELL_TYPES.CHART,
    content: options.query,
    drilldown: null,
    name: options.title,
    allowCrossFilter: options.allowCrossFilter ?? true,
    width: options.width ?? 0,
    height: options.height ?? 320,
    chartConfig: options.chartConfig,
    drilldownChartConfig: null,
    conceptFilters: options.conceptFilters ?? [],
    chartFilters: options.chartFilters ?? [],
    filters: options.filters ?? [],
    parameters: options.parameters ?? {},
    rootContent: options.rootContent ?? [],
    results: null,
    loading: false,
    error: null,
    loadStartTime: null,
  })
}

export function useEmbeddedDashboardGroup(options: UseEmbeddedDashboardGroupOptions) {
  const dashboard = reactive<Dashboard>({
    id: options.dashboardId,
    name: options.dashboardId,
    storage: 'local',
    connection: options.connectionId,
    layout: [],
    gridItems: {},
    nextId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    filter: null,
    imports: options.imports ?? [],
    version: 1,
    description: '',
    state: 'published',
  })

  const executor = new DashboardQueryExecutor(
    options.queryExecutionService,
    options.connectionId,
    options.dashboardId,
    () => dashboard,
    getItemData,
    setItemData,
    {
      batchDelay: options.batchDelay ?? 10,
      maxConcurrentQueries: options.maxConcurrentQueries,
    },
  )

  const pendingItemIds = new Set<string>()
  let pendingBatchTimer: ReturnType<typeof setTimeout> | null = null

  function ensureLayout(itemId: string, priority: number, width = 12, height = 10) {
    const existing = dashboard.layout.find((item: { i: string }) => item.i === itemId)
    if (existing) {
      existing.y = priority
      existing.w = width
      existing.h = height
      return
    }

    dashboard.layout.push({
      x: 0,
      y: priority,
      w: width,
      h: height,
      i: itemId,
      static: true,
    })
  }

  function registerItem(itemOptions: EmbeddedDashboardGroupItemOptions) {
    const priority = itemOptions.priority ?? 0
    ensureLayout(itemOptions.itemId, priority)
    const existing = dashboard.gridItems[itemOptions.itemId] as EmbeddedDashboardGroupItemState | undefined
    if (!existing) {
      dashboard.gridItems[itemOptions.itemId] = createItemState(itemOptions)
      return
    }

    existing.name = itemOptions.title
    existing.content = itemOptions.query
    existing.chartConfig = itemOptions.chartConfig
    existing.allowCrossFilter = itemOptions.allowCrossFilter ?? true
    existing.filters = itemOptions.filters ?? []
    existing.chartFilters = itemOptions.chartFilters ?? []
    existing.conceptFilters = itemOptions.conceptFilters ?? []
    existing.parameters = itemOptions.parameters ?? {}
    existing.rootContent = itemOptions.rootContent ?? []
  }

  function setImports(imports: DashboardImport[]) {
    dashboard.imports = imports
  }

  function setConnection(connectionId: string) {
    dashboard.connection = connectionId
    executor.setConnection(connectionId)
  }

  function scheduleRun(itemId: string) {
    pendingItemIds.add(itemId)
    if (pendingBatchTimer) {
      return
    }

    pendingBatchTimer = setTimeout(() => {
      const itemIds = Array.from(pendingItemIds)
      pendingItemIds.clear()
      pendingBatchTimer = null
      if (itemIds.length === 1) {
        executor.runSingle(itemIds[0])
      } else if (itemIds.length > 1) {
        executor.runBatch(itemIds)
      }
    }, options.batchDelay ?? 10)
  }

  function runBatch(itemIds: string[]) {
    itemIds.forEach((itemId) => pendingItemIds.add(itemId))
    if (pendingBatchTimer) {
      clearTimeout(pendingBatchTimer)
      pendingBatchTimer = null
    }
    const finalIds = Array.from(pendingItemIds)
    pendingItemIds.clear()
    if (finalIds.length > 0) {
      executor.runBatch(finalIds)
    }
  }

  function getItemData(itemId: string, dashboardId: string): GridItemDataResponse {
    if (dashboardId !== options.dashboardId) {
      throw new Error(`Unexpected dashboard id ${dashboardId}`)
    }

    const item = dashboard.gridItems[itemId] as EmbeddedDashboardGroupItemState | undefined
    if (!item) {
      return {
        type: CELL_TYPES.CHART,
        content: '',
        structured_content: { markdown: '', query: '' },
        rootContent: [],
        name: '',
        allowCrossFilter: true,
        hasDrilldown: false,
      }
    }

    return {
      type: CELL_TYPES.CHART,
      content: item.content,
      structured_content: { markdown: '', query: item.drilldown || item.content },
      rootContent: item.rootContent,
      name: item.name,
      allowCrossFilter: item.allowCrossFilter,
      width: item.width,
      height: item.height,
      chartConfig: item.drilldown ? item.drilldownChartConfig || undefined : item.chartConfig,
      connectionName: dashboard.connection,
      imports: dashboard.imports,
      conceptFilters: item.conceptFilters,
      chartFilters: item.chartFilters,
      filters: item.filters,
      parameters: item.parameters,
      results: item.results,
      loading: item.loading,
      error: item.error,
      loadStartTime: item.loadStartTime,
      hasDrilldown: Boolean(item.drilldown),
    }
  }

  function setItemData(itemId: string, dashboardId: string, data: Record<string, unknown>) {
    if (dashboardId !== options.dashboardId) {
      return
    }

    const item = dashboard.gridItems[itemId] as EmbeddedDashboardGroupItemState | undefined
    if (!item) {
      return
    }

    if ('name' in data) item.name = (data.name as string) ?? item.name
    if ('content' in data) item.content = (data.content as string) ?? item.content
    if ('chartConfig' in data) item.chartConfig = (data.chartConfig as ChartConfig | undefined) ?? undefined
    if ('drilldown' in data) item.drilldown = (data.drilldown as string | null) ?? null
    if ('drilldownChartConfig' in data)
      item.drilldownChartConfig = (data.drilldownChartConfig as ChartConfig | null) ?? null
    if ('allowCrossFilter' in data) item.allowCrossFilter = Boolean(data.allowCrossFilter)
    if ('width' in data) item.width = Number(data.width ?? item.width)
    if ('height' in data) item.height = Number(data.height ?? item.height)
    if ('filters' in data) item.filters = (data.filters as DashboardFilterEntry) ?? []
    if ('chartFilters' in data) item.chartFilters = (data.chartFilters as DashboardValueFilterEntry) ?? []
    if ('conceptFilters' in data)
      item.conceptFilters = (data.conceptFilters as DashboardValueFilterEntry) ?? []
    if ('parameters' in data) item.parameters = (data.parameters as Record<string, unknown>) ?? {}
    if ('results' in data) {
      item.results = data.results as GridItemDataResponse['results']
      item.loading = false
      item.error = null
      item.loadStartTime = null
    }
    if ('loading' in data) {
      item.loading = Boolean(data.loading)
      item.loadStartTime = item.loading ? Date.now() : null
    }
    if ('error' in data) {
      item.error = (data.error as string | null) ?? null
      if (item.error) {
        item.loading = false
        item.loadStartTime = null
      }
    }
  }

  function getDashboardQueryExecutor(dashboardId: string) {
    if (dashboardId !== options.dashboardId) {
      throw new Error(`Unexpected dashboard id ${dashboardId}`)
    }
    return executor
  }

  function dispose() {
    if (pendingBatchTimer) {
      clearTimeout(pendingBatchTimer)
      pendingBatchTimer = null
    }
    pendingItemIds.clear()
    executor.clearQueue()
  }

  return {
    dashboard,
    executor,
    registerItem,
    scheduleRun,
    runBatch,
    setImports,
    setConnection,
    getItemData,
    setItemData,
    getDashboardQueryExecutor,
    dispose,
  }
}

export type EmbeddedDashboardGroup = ReturnType<typeof useEmbeddedDashboardGroup>
