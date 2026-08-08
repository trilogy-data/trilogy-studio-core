import { describe, expect, it, vi } from 'vitest'
import { DashboardToolExecutor } from './dashboardToolExecutor'
import { DashboardModel, CELL_TYPES } from '../dashboards/base'
import { ColumnType, Results } from '../editors/results'
import type { ChartConfig } from '../editors/results'

function makeHeatmapResults(xCount: number, yCount: number): Results {
  const headers = new Map([
    ['member', { name: 'member', type: ColumnType.STRING }],
    ['month', { name: 'month', type: ColumnType.STRING }],
    ['value', { name: 'value', type: ColumnType.NUMBER }],
  ])

  const rows = Array.from({ length: xCount * yCount }, (_, index) => ({
    member: `member-${index % xCount}`,
    month: `month-${Math.floor(index / xCount)}`,
    value: index,
  }))

  return new Results(headers, rows)
}

function makeExecutor({
  results,
  chartConfig,
}: {
  results: Results
  chartConfig: ChartConfig
}): DashboardToolExecutor {
  const dashboard = new DashboardModel({
    id: 'dash-1',
    name: 'Test Dashboard',
    connection: 'conn-1',
    layout: [{ i: 'item-1', x: 0, y: 0, w: 8, h: 6, static: false }],
    gridItems: {
      'item-1': {
        type: CELL_TYPES.CHART,
        content: 'SELECT 1',
        name: 'Heatmap Card',
        allowCrossFilter: true,
        chartConfig,
        results,
      },
    },
  })

  return new DashboardToolExecutor({
    dashboardStore: {
      dashboards: { 'dash-1': dashboard },
    } as any,
    connectionStore: {} as any,
    editorStore: {} as any,
    queryExecutionService: {} as any,
    dashboardId: 'dash-1',
    getActiveImports: () => [],
    setActiveImports: vi.fn(),
    getDashboardQueryExecutor: () => null,
    refreshItem: vi.fn(),
    captureDashboardImage: async () => ({
      base64: 'ZmFrZQ==',
      mediaType: 'image/png',
      width: 1200,
      height: 800,
      overflows: [],
    }),
  })
}

describe('DashboardToolExecutor capture_dashboard_screenshot', () => {
  it('adds heatmap x/y axis warnings when either dimension exceeds the threshold', async () => {
    const executor = makeExecutor({
      results: makeHeatmapResults(26, 27),
      chartConfig: {
        chartType: 'heatmap',
        xField: 'member',
        yField: 'month',
      },
    })

    const result = await executor.executeToolCall('capture_dashboard_screenshot', {})

    expect(result.success).toBe(true)
    expect(result.message).toContain('CHART DENSITY WARNINGS')
    expect(result.message).toContain('x-axis field "member" has 26 distinct values')
    expect(result.message).toContain('y-axis field "month" has 27 distinct values')
  })

  it('does not add heatmap warnings when both dimensions stay within the threshold', async () => {
    const executor = makeExecutor({
      results: makeHeatmapResults(25, 25),
      chartConfig: {
        chartType: 'heatmap',
        xField: 'member',
        yField: 'month',
      },
    })

    const result = await executor.executeToolCall('capture_dashboard_screenshot', {})

    expect(result.success).toBe(true)
    expect(result.message).not.toContain('CHART DENSITY WARNINGS')
  })
})

/** Bare executor over an empty dashboard, for exercising the item CRUD tools. */
function makeEmptyExecutor(): { executor: DashboardToolExecutor; dashboard: DashboardModel } {
  const dashboard = new DashboardModel({
    id: 'dash-1',
    name: 'Test Dashboard',
    connection: 'conn-1',
  })

  const store = {
    dashboards: { 'dash-1': dashboard },
    addItemToDashboard: (
      _id: string,
      type: any,
      x: number,
      y: number,
      w: number,
      h: number,
      content: any,
      name: any,
    ) => dashboard.addItem(type, x, y, w, h, content, name),
    updateMultipleItemProperties: (_id: string, itemId: string, updates: any) =>
      dashboard.updateItemMultipleProperties(itemId, updates),
    updateItemContent: (_id: string, itemId: string, content: any) =>
      dashboard.updateItemContent(itemId, content),
    updateItemName: (_id: string, itemId: string, name: string) =>
      dashboard.updateItemName(itemId, name),
    updateItemType: (_id: string, itemId: string, type: any) =>
      dashboard.updateItemType(itemId, type),
    updateItemChartConfig: (_id: string, itemId: string, config: any) =>
      dashboard.updateItemChartConfig(itemId, config),
    setDashboardTheme: (_id: string, theme: any) => dashboard.setTheme(theme),
  }

  const executor = new DashboardToolExecutor({
    dashboardStore: store as any,
    connectionStore: {} as any,
    editorStore: {} as any,
    queryExecutionService: {} as any,
    dashboardId: 'dash-1',
    getActiveImports: () => [],
    setActiveImports: vi.fn(),
    getDashboardQueryExecutor: () => null,
    refreshItem: vi.fn(),
    captureDashboardImage: async () => ({
      base64: 'ZmFrZQ==',
      mediaType: 'image/png',
      width: 1200,
      height: 800,
      overflows: [],
    }),
  })

  return { executor, dashboard }
}

describe('DashboardToolExecutor freeform items', () => {
  const html = '<div id="root"></div><script>trilogy.ready()<\/script>'

  it('stores the query and markup as separate fields', async () => {
    const { executor, dashboard } = makeEmptyExecutor()

    const result = await executor.executeToolCall('add_dashboard_item', {
      type: 'freeform',
      name: 'Custom widget',
      content: 'SELECT product.name, product.revenue;',
      html,
    })

    expect(result.success).toBe(true)
    const item = Object.values(dashboard.gridItems)[0]
    expect(item.type).toBe(CELL_TYPES.FREEFORM)
    // The agent authors data and rendering separately; the persisted shape
    // keeps them separate so either can be revised without the other.
    expect(item.content).toEqual({ html, query: 'SELECT product.name, product.revenue;' })
  })

  it('rejects a freeform item with no markup', async () => {
    const { executor } = makeEmptyExecutor()

    const result = await executor.executeToolCall('add_dashboard_item', {
      type: 'freeform',
      content: 'SELECT 1;',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('html')
  })

  it('rejects markup beyond the size cap', async () => {
    const { executor } = makeEmptyExecutor()

    const result = await executor.executeToolCall('add_dashboard_item', {
      type: 'freeform',
      content: 'SELECT 1;',
      html: 'x'.repeat(300_000),
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('limit')
  })

  it('updates markup without clobbering the query, and vice versa', async () => {
    const { executor, dashboard } = makeEmptyExecutor()
    await executor.executeToolCall('add_dashboard_item', {
      type: 'freeform',
      content: 'SELECT 1;',
      html,
    })
    const itemId = Object.keys(dashboard.gridItems)[0]

    await executor.executeToolCall('update_dashboard_item', {
      item_id: itemId,
      html: '<p>revised<\/p>',
    })
    expect(dashboard.gridItems[itemId].content).toEqual({
      html: '<p>revised<\/p>',
      query: 'SELECT 1;',
    })

    await executor.executeToolCall('update_dashboard_item', {
      item_id: itemId,
      content: 'SELECT 2;',
    })
    expect(dashboard.gridItems[itemId].content).toEqual({
      html: '<p>revised<\/p>',
      query: 'SELECT 2;',
    })
  })

  it('surfaces the query as content and the markup as html when read back', async () => {
    const { executor, dashboard } = makeEmptyExecutor()
    await executor.executeToolCall('add_dashboard_item', {
      type: 'freeform',
      content: 'SELECT 1;',
      html,
    })
    const itemId = Object.keys(dashboard.gridItems)[0]

    const result = await executor.executeToolCall('get_dashboard_item', { item_id: itemId })
    expect(result.success).toBe(true)
    expect(result.message).toContain('SELECT 1;')
    expect(result.message).toContain('trilogy.ready()')
  })
})

describe('DashboardToolExecutor set_dashboard_theme', () => {
  it('applies enum knobs and reports the resulting theme back', async () => {
    const { executor, dashboard } = makeEmptyExecutor()

    const result = await executor.executeToolCall('set_dashboard_theme', {
      preset: 'paper',
      density: 'compact',
    })

    expect(result.success).toBe(true)
    expect(dashboard.theme).toEqual({ preset: 'paper', density: 'compact' })
    // The agent's only view of the styling between screenshots is this string.
    expect(result.message).toContain('preset paper')
    expect(result.message).toContain('density compact')
  })

  it('merges over the existing theme instead of replacing it', async () => {
    const { executor, dashboard } = makeEmptyExecutor()
    await executor.executeToolCall('set_dashboard_theme', { preset: 'dense' })

    await executor.executeToolCall('set_dashboard_theme', { accentColor: '#2563eb' })

    expect(dashboard.theme).toEqual({ preset: 'dense', accentColor: '#2563eb' })
  })

  it('rejects an out-of-vocabulary value rather than silently dropping it', async () => {
    const { executor, dashboard } = makeEmptyExecutor()

    const result = await executor.executeToolCall('set_dashboard_theme', { preset: 'brutalist' })

    // Sanitization alone would report success and change nothing, which reads
    // to the agent as "applied" and invites an identical retry.
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid preset "brutalist"')
    expect(result.error).toContain('paper')
    expect(dashboard.theme).toBeUndefined()
  })

  it('rejects a color that could reach the network', async () => {
    const { executor, dashboard } = makeEmptyExecutor()

    const result = await executor.executeToolCall('set_dashboard_theme', {
      cardBackground: 'url(https://evil.example/pixel.png)',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid cardBackground')
    expect(dashboard.theme).toBeUndefined()
  })

  it('clears a single color when passed an empty string', async () => {
    const { executor, dashboard } = makeEmptyExecutor()
    await executor.executeToolCall('set_dashboard_theme', {
      preset: 'flat',
      cardBackground: '#101820',
    })

    const result = await executor.executeToolCall('set_dashboard_theme', { cardBackground: '' })

    expect(result.success).toBe(true)
    expect(dashboard.theme).toEqual({ preset: 'flat' })
  })

  it('clears the whole theme on reset', async () => {
    const { executor, dashboard } = makeEmptyExecutor()
    await executor.executeToolCall('set_dashboard_theme', { preset: 'paper' })

    const result = await executor.executeToolCall('set_dashboard_theme', { reset: true })

    expect(result.success).toBe(true)
    expect(dashboard.theme).toBeUndefined()
  })

  it('reports the current theme when called with nothing to change', async () => {
    const { executor } = makeEmptyExecutor()
    await executor.executeToolCall('set_dashboard_theme', { preset: 'dense' })

    const result = await executor.executeToolCall('set_dashboard_theme', {})

    expect(result.success).toBe(true)
    expect(result.message).toContain('No theme changes provided')
    expect(result.message).toContain('preset dense')
  })

  it('surfaces the theme in get_dashboard_info', async () => {
    const { executor } = makeEmptyExecutor()
    await executor.executeToolCall('set_dashboard_theme', { preset: 'paper' })

    const result = await executor.executeToolCall('get_dashboard_info', {})

    expect(result.message).toContain('preset paper')
  })
})
