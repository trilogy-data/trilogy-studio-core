import { describe, expect, it } from 'vitest'
import {
  createCrossFilterController,
  filterAllowedDimensionFilters,
  applyCrossFilterOperationToGridItems,
  buildCrossFilterExpression,
  extractEligibleCrossFilterFields,
} from './crossFilters'
import type { CrossFilterEntry } from './conditions'

// ── helpers ──────────────────────────────────────────────────────────────────

const eq = (value: string | number): CrossFilterEntry => ({ op: 'eq', value })
const range = (lo: string | number, hi: string | number): CrossFilterEntry => ({
  op: 'range',
  value: [lo, hi],
})

// ── controller tests ─────────────────────────────────────────────────────────

describe('cross filter controller', () => {
  it('derives peer SQL filters and excludes the source chart from its own query filters', () => {
    const controller = createCrossFilterController({
      validFields: ['species', 'native_status'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
    })

    expect(controller.getSqlFiltersFor('species-chart', ["city = 'USBTV'"])).toEqual([
      "city = 'USBTV'",
    ])
    expect(controller.getSqlFiltersFor('native-chart', ["city = 'USBTV'"])).toEqual([
      "city = 'USBTV'",
      'species = :species_x7sdl',
    ])
    expect(controller.getChartSelectionsFor('species-chart')).toEqual([{ species: 'Acer rubrum' }])
  })

  it('includes parameters for the SQL filter', () => {
    const controller = createCrossFilterController({
      validFields: ['species'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
    })

    expect(controller.getSqlParametersFor('native-chart')).toEqual({
      ':species_x7sdl': 'Acer rubrum',
    })
  })

  it('toggles exact matches in append mode', () => {
    const controller = createCrossFilterController({
      validFields: ['species'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
      append: true,
    })

    expect(controller.getChartSelectionsFor('species-chart')).toEqual([{ species: 'Acer rubrum' }])

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
      append: true,
    })

    expect(controller.getChartSelectionsFor('species-chart')).toEqual([])
    expect(controller.getSqlFiltersFor('native-chart')).toEqual([])
  })

  it('returns SqlFilterLike objects with parameters via getSqlFilterLikesFor', () => {
    const controller = createCrossFilterController({
      validFields: ['species'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
    })

    const result = controller.getSqlFilterLikesFor('native-chart', ["city = 'USBTV'"])
    expect(result).toEqual([
      { source: 'base', value: "city = 'USBTV'" },
      {
        source: 'cross',
        value: 'species = :species_x7sdl',
        parameters: { ':species_x7sdl': 'Acer rubrum' },
      },
    ])
  })

  it('normalizes local fields for embed clients by default', () => {
    const controller = createCrossFilterController({
      validFields: ['is_evergreen'],
    })

    controller.applyDimensionClick({
      source: 'evergreen-chart',
      filters: { 'local.is_evergreen': eq('true') },
    })

    expect(controller.getSqlFiltersFor('other-chart')).toEqual([
      'is_evergreen = :is_evergreen_jgbzg',
    ])
  })
})

// ── helper function tests ─────────────────────────────────────────────────────

describe('cross filter helpers', () => {
  it('filters allowed dimension fields and optionally strips local prefixes', () => {
    expect(
      filterAllowedDimensionFilters(
        { 'local.species': eq('Acer saccharum'), ignored: eq('x') },
        ['species'],
        { normalizeLocalFields: true },
      ),
    ).toEqual({ species: eq('Acer saccharum') })

    expect(
      filterAllowedDimensionFilters({ 'local.species': eq('Acer saccharum'), ignored: eq('x') }, [
        'species',
      ]),
    ).toEqual({ 'local.species': eq('Acer saccharum') })
  })

  it('drops non-CrossFilterEntry values silently', () => {
    // @ts-ignore — testing runtime guard
    const result = filterAllowedDimensionFilters({ species: 'raw-string', count: 42 }, [
      'species',
      'count',
    ])
    expect(result).toEqual({})
  })

  it('applies source and peer cross filters consistently for dashboard-like items', () => {
    const items = {
      source: {
        allowCrossFilter: true,
        chartFilters: [],
      },
      peer: {
        allowCrossFilter: true,
        conceptFilters: [],
        filters: [],
      },
      locked: {
        allowCrossFilter: false,
        conceptFilters: [],
        filters: [],
      },
    }

    const updated = applyCrossFilterOperationToGridItems(
      items,
      'source',
      { species: eq('Acer rubrum') },
      { species: 'Acer rubrum' },
      'add',
    )

    expect(updated).toEqual(['peer'])
    // Source gets chart filters only
    expect(items.source.chartFilters).toHaveLength(1)
    // Peer gets concept filters and SQL filter with :param placeholder
    expect(items.peer.conceptFilters).toEqual([
      { source: 'source', value: { species: eq('Acer rubrum') } },
    ])
    expect(items.peer.filters).toEqual([
      {
        source: 'cross',
        value: 'species = :species_x7sdl',
        parameters: { ':species_x7sdl': 'Acer rubrum' },
      },
    ])
    expect(items.locked.conceptFilters).toEqual([])
  })

  it('builds SQL with OR semantics for multiple values of the same field', () => {
    const result = buildCrossFilterExpression([
      { source: 'a', value: { species: eq('Acer rubrum') } },
      { source: 'a', value: { species: eq('Acer saccharum') } },
    ])
    expect(result.filterStrings).toEqual([
      '(species = :species_x7sdl_or0 OR species = :species_x7sdl_or1)',
    ])
    expect(result.parameters).toEqual({
      ':species_x7sdl_or0': 'Acer rubrum',
      ':species_x7sdl_or1': 'Acer saccharum',
    })
  })

  it('passes range entries through for BETWEEN operations', () => {
    expect(
      filterAllowedDimensionFilters(
        { 'order.date.month_start': range('2024-01-01', '2024-03-01') },
        ['order.date.month_start'],
      ),
    ).toEqual({ 'order.date.month_start': range('2024-01-01', '2024-03-01') })
  })

  it('generates parameterized BETWEEN SQL for range-valued cross filters', () => {
    const controller = createCrossFilterController({
      validFields: ['order.date.month_start'],
    })

    controller.applyDimensionClick({
      source: 'date-chart',
      filters: { 'order.date.month_start': range('2024-01-01', '2024-03-01') },
    })

    expect(controller.getSqlFiltersFor('other-chart')).toEqual([
      'order.date.month_start between :order_date_month_start_cgjum_min and :order_date_month_start_cgjum_max',
    ])
    expect(controller.getSqlParametersFor('other-chart')).toEqual({
      ':order_date_month_start_cgjum_min': '2024-01-01',
      ':order_date_month_start_cgjum_max': '2024-03-01',
    })
  })

  it('toggles exact range matches in append mode', () => {
    const controller = createCrossFilterController({
      validFields: ['order.date.month_start'],
    })

    controller.applyDimensionClick({
      source: 'date-chart',
      filters: { 'order.date.month_start': range('2024-01-01', '2024-03-01') },
      append: true,
    })
    expect(controller.getChartSelectionsFor('date-chart')).toHaveLength(1)

    controller.applyDimensionClick({
      source: 'date-chart',
      filters: { 'order.date.month_start': range('2024-01-01', '2024-03-01') },
      append: true,
    })
    expect(controller.getChartSelectionsFor('date-chart')).toHaveLength(0)
  })

  it('extracts unique eligible fields from completion items in order', () => {
    expect(
      extractEligibleCrossFilterFields([
        { label: 'species' },
        { label: 'tree_count' },
        { label: 'species' },
        { label: '' },
      ]),
    ).toEqual(['species', 'tree_count'])
  })
})
