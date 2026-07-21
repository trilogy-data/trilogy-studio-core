import { describe, expect, it, vi } from 'vitest'
import {
  buildDashboardAgentSystemPrompt,
  buildDashboardStateSnapshot,
} from './dashboardAgentPrompt'
import { createDashboardSystemPromptProvider } from './dashboardAgentRuntime'
import { DashboardToolExecutor } from './dashboardToolExecutor'
import { DashboardModel, CELL_TYPES } from '../dashboards/base'

function makeDashboard(overrides: Record<string, any> = {}): DashboardModel {
  return new DashboardModel({
    id: 'dash-1',
    name: 'Test Dashboard',
    connection: 'conn-1',
    layout: [{ i: 'item-1', x: 0, y: 0, w: 8, h: 6, static: false }],
    gridItems: {
      'item-1': {
        type: CELL_TYPES.CHART,
        content: 'SELECT 1',
        name: 'Revenue Chart',
        allowCrossFilter: true,
      },
    },
    ...overrides,
  })
}

const connectionStore = {
  connections: { 'conn-1': { id: 'conn-1', name: 'conn-1', connected: true } },
  connectionByName: (name: string) =>
    name === 'conn-1' ? { id: 'conn-1', name: 'conn-1', connected: true } : undefined,
} as any

const editorStore = { editors: {} } as any

describe('dashboard agent prompt / state split', () => {
  describe('buildDashboardAgentSystemPrompt', () => {
    it('contains no live dashboard state', () => {
      const prompt = buildDashboardAgentSystemPrompt({
        dashboard: makeDashboard(),
        availableConnections: ['conn-1'],
      })

      // Any of these appearing in the system prompt means the cached prefix is
      // invalidated the moment the agent renames the dashboard or edits an item.
      expect(prompt).not.toContain('Test Dashboard')
      expect(prompt).not.toContain('Revenue Chart')
      expect(prompt).not.toContain('item-1')
      expect(prompt).not.toContain('CURRENT DASHBOARD ITEMS')
      // It should still tell the agent how to get that state
      expect(prompt).toContain('get_dashboard_state')
    })

    it('is byte-identical before and after the dashboard is mutated', () => {
      const dashboard = makeDashboard()
      const before = buildDashboardAgentSystemPrompt({
        dashboard,
        availableConnections: ['conn-1'],
      })

      dashboard.name = 'Renamed Dashboard'
      dashboard.gridItems['item-2'] = {
        type: CELL_TYPES.MARKDOWN,
        content: 'hello',
        name: 'New Note',
      } as any

      const after = buildDashboardAgentSystemPrompt({
        dashboard,
        availableConnections: ['conn-1'],
      })

      expect(after).toBe(before)
    })

    it('omits report structure counts from the report preamble', () => {
      const prompt = buildDashboardAgentSystemPrompt({
        dashboard: makeDashboard({ layoutType: 'report' }),
        availableConnections: ['conn-1'],
      })

      expect(prompt).toContain('REPORT AUTHORING MODE')
      expect(prompt).not.toContain('CURRENT REPORT STRUCTURE')
    })
  })

  describe('buildDashboardStateSnapshot', () => {
    it('reports title, connection, data source, and items', () => {
      const snapshot = buildDashboardStateSnapshot({
        dashboard: makeDashboard(),
        dataConnectionName: 'conn-1',
        isDataConnectionActive: true,
        activeImports: [{ id: 'imp-1', name: 'sales', alias: '' }],
      })

      expect(snapshot).toContain('DASHBOARD: "Test Dashboard"')
      expect(snapshot).toContain('ACTIVE DATA CONNECTION: conn-1')
      expect(snapshot).toContain('ACTIVE DATA SOURCE: sales')
      expect(snapshot).toContain('CURRENT DASHBOARD ITEMS (1)')
      expect(snapshot).toContain('[item-1] chart: "Revenue Chart"')
    })

    it('flags a disconnected data connection', () => {
      const snapshot = buildDashboardStateSnapshot({
        dashboard: makeDashboard(),
        dataConnectionName: 'conn-1',
        isDataConnectionActive: false,
      })

      expect(snapshot).toContain('NOT CONNECTED')
    })

    it('filters to a single item when itemId is given', () => {
      const dashboard = makeDashboard()
      dashboard.gridItems['item-2'] = {
        type: CELL_TYPES.MARKDOWN,
        content: 'a note',
        name: 'Note',
      } as any

      const snapshot = buildDashboardStateSnapshot({
        dashboard,
        dataConnectionName: 'conn-1',
        itemId: 'item-2',
      })

      expect(snapshot).toContain('CURRENT STATE OF ITEM [item-2]')
      expect(snapshot).toContain('"Note"')
      expect(snapshot).not.toContain('Revenue Chart')
      expect(snapshot).not.toContain('CURRENT DASHBOARD ITEMS')
    })

    it('lists known ids when the requested item is missing', () => {
      const snapshot = buildDashboardStateSnapshot({
        dashboard: makeDashboard(),
        dataConnectionName: 'conn-1',
        itemId: 'nope',
      })

      expect(snapshot).toContain('not found')
      expect(snapshot).toContain('item-1')
    })

    it('includes report structure counts in report mode', () => {
      const snapshot = buildDashboardStateSnapshot({
        dashboard: makeDashboard({ layoutType: 'report' }),
        dataConnectionName: 'conn-1',
      })

      expect(snapshot).toContain('CURRENT REPORT STRUCTURE:')
    })
  })

  describe('createDashboardSystemPromptProvider', () => {
    it('freezes the state snapshot after the first call', () => {
      const dashboard = makeDashboard()
      const provider = createDashboardSystemPromptProvider(
        () => dashboard,
        connectionStore,
        editorStore,
      )

      const first = provider()
      expect(first).toContain('Test Dashboard')

      // Agent renames the dashboard and adds an item mid-session
      dashboard.name = 'Renamed Dashboard'
      dashboard.gridItems['item-2'] = {
        type: CELL_TYPES.MARKDOWN,
        content: 'hello',
        name: 'New Note',
      } as any

      // The prompt must not change - that is the whole point of the split
      expect(provider()).toBe(first)
      expect(provider()).not.toContain('Renamed Dashboard')
    })

    it('returns an empty prompt when the dashboard is gone', () => {
      const provider = createDashboardSystemPromptProvider(() => null, connectionStore, editorStore)
      expect(provider()).toBe('')
    })
  })

  describe('get_dashboard_state tool', () => {
    function makeExecutor(dashboard: DashboardModel) {
      return new DashboardToolExecutor({
        dashboardStore: { dashboards: { 'dash-1': dashboard } } as any,
        connectionStore: { connections: { 'conn-1': { connected: true } } } as any,
        editorStore: {} as any,
        queryExecutionService: {} as any,
        dashboardId: 'dash-1',
        getActiveImports: () => [],
        setActiveImports: vi.fn(),
        getDashboardQueryExecutor: () => null,
        refreshItem: vi.fn(),
      })
    }

    it('returns state that reflects mutations the frozen prompt does not', async () => {
      const dashboard = makeDashboard()
      const executor = makeExecutor(dashboard)

      dashboard.name = 'Renamed Dashboard'
      const result = await executor.executeToolCall('get_dashboard_state', {})

      expect(result.success).toBe(true)
      expect(result.message).toContain('Renamed Dashboard')
      expect(result.message).toContain('[item-1] chart: "Revenue Chart"')
    })

    it('filters to a single item via item_id', async () => {
      const executor = makeExecutor(makeDashboard())

      const result = await executor.executeToolCall('get_dashboard_state', { item_id: 'item-1' })

      expect(result.success).toBe(true)
      expect(result.message).toContain('CURRENT STATE OF ITEM [item-1]')
      expect(result.message).not.toContain('CURRENT DASHBOARD ITEMS')
    })
  })
})
