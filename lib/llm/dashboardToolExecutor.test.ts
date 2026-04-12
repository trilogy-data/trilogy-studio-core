import { describe, expect, it, vi } from 'vitest'
import { DashboardToolExecutor } from './dashboardToolExecutor'
import { DashboardModel, CELL_TYPES } from '../dashboards/base'
import { ChartConfig, ColumnType, Results } from '../editors/results'

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