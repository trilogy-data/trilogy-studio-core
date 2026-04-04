import { describe, expect, it } from 'vitest'
import { DashboardModel, CELL_TYPES } from './base'
import type { CrossFilterEntry } from './conditions'

const eq = (v: string | number): CrossFilterEntry => ({ op: 'eq', value: v })

describe('DashboardModel transient state persistence', () => {
  it('omits transient query state when serializing dashboards', () => {
    const dashboard = new DashboardModel({
      id: 'dashboard-1',
      name: 'Revenue Dashboard',
      connection: 'duckdb',
      gridItems: {
        '0': {
          type: CELL_TYPES.CHART,
          content: 'select 1 as value',
          name: 'Revenue',
          allowCrossFilter: true,
          loading: true,
          error: 'stale error',
          loadStartTime: 123456,
          results: {} as any,
        },
      },
    })

    const serialized = dashboard.serialize()
    const serializedItem = serialized.gridItems['0']

    expect(serializedItem).not.toHaveProperty('results')
    expect(serializedItem).not.toHaveProperty('loading')
    expect(serializedItem).not.toHaveProperty('error')
    expect(serializedItem).not.toHaveProperty('loadStartTime')
  })

  it('clears transient query state when hydrating stored dashboards', () => {
    const hydrated = DashboardModel.fromSerialized({
      id: 'dashboard-1',
      name: 'Revenue Dashboard',
      storage: 'local',
      connection: 'duckdb',
      layout: [],
      nextId: 1,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      filter: null,
      imports: [],
      version: 1,
      description: '',
      state: 'editing',
      gridItems: {
        '0': {
          type: CELL_TYPES.CHART,
          content: 'select 1 as value',
          name: 'Revenue',
          allowCrossFilter: true,
          loading: true,
          error: 'stale error',
          loadStartTime: 123456,
          results: {} as any,
        },
      },
    })

    expect(hydrated.gridItems['0'].results).toBeNull()
    expect(hydrated.gridItems['0'].loading).toBe(false)
    expect(hydrated.gridItems['0'].error).toBeNull()
    expect(hydrated.gridItems['0'].loadStartTime).toBeNull()
  })

  it('applies native cross filters to peers without filtering the source item query', () => {
    const dashboard = new DashboardModel({
      id: 'dashboard-1',
      name: 'Revenue Dashboard',
      connection: 'duckdb',
      gridItems: {
        source: {
          type: CELL_TYPES.CHART,
          content: 'select species, count(*) as tree_count',
          name: 'Species',
          allowCrossFilter: true,
          filters: [],
          chartFilters: [],
        },
        peer: {
          type: CELL_TYPES.CHART,
          content: 'select native_status, count(*) as tree_count',
          name: 'Native',
          allowCrossFilter: true,
          filters: [],
          conceptFilters: [],
        },
      },
    })

    const updated = dashboard.updateItemCrossFilters(
      'source',
      { species: eq('Acer rubrum') },
      { species: 'Acer rubrum' },
      'add',
    )

    expect(updated).toEqual(['peer'])
    expect(dashboard.gridItems.source.filters).toEqual([])
    expect(dashboard.gridItems.source.chartFilters).toHaveLength(1)
    expect(dashboard.gridItems.peer.filters).toEqual([
      {
        source: 'cross',
        value: 'species = :species',
        parameters: { ':species': 'Acer rubrum' },
      },
    ])
  })

  it('toggles append selections off for both source highlights and peer filters', () => {
    const dashboard = new DashboardModel({
      id: 'dashboard-1',
      name: 'Revenue Dashboard',
      connection: 'duckdb',
      gridItems: {
        source: {
          type: CELL_TYPES.CHART,
          content: 'select species, count(*) as tree_count',
          name: 'Species',
          allowCrossFilter: true,
          filters: [],
          chartFilters: [],
        },
        peer: {
          type: CELL_TYPES.CHART,
          content: 'select native_status, count(*) as tree_count',
          name: 'Native',
          allowCrossFilter: true,
          filters: [],
          conceptFilters: [],
        },
      },
    })

    dashboard.updateItemCrossFilters(
      'source',
      { species: eq('Acer rubrum') },
      { species: 'Acer rubrum' },
      'append',
    )
    dashboard.updateItemCrossFilters(
      'source',
      { species: eq('Acer rubrum') },
      { species: 'Acer rubrum' },
      'append',
    )

    expect(dashboard.gridItems.source.chartFilters).toEqual([])
    expect(dashboard.gridItems.peer.conceptFilters).toEqual([])
    expect(dashboard.gridItems.peer.filters).toEqual([])
  })
})
