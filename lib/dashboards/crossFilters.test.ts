import { describe, expect, it } from 'vitest'
import {
  createCrossFilterController,
  filterAllowedDimensionFilters,
  applyCrossFilterOperationToGridItems,
  buildCrossFilterExpression,
  extractEligibleCrossFilterFields,
} from './crossFilters'

describe('cross filter controller', () => {
  it('derives peer SQL filters and excludes the source chart from its own query filters', () => {
    const controller = createCrossFilterController({
      validFields: ['species', 'native_status'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: 'Acer rubrum' },
      chart: { species: 'Acer rubrum' },
    })

    expect(controller.getSqlFiltersFor('species-chart', ["city = 'USBTV'"])).toEqual([
      "city = 'USBTV'",
    ])
    expect(controller.getSqlFiltersFor('native-chart', ["city = 'USBTV'"])).toEqual([
      "city = 'USBTV'",
      "species='''Acer rubrum'''",
    ])
    expect(controller.getChartSelectionsFor('species-chart')).toEqual([{ species: 'Acer rubrum' }])
  })

  it('toggles exact matches in append mode', () => {
    const controller = createCrossFilterController({
      validFields: ['species'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: 'Acer rubrum' },
      chart: { species: 'Acer rubrum' },
      append: true,
    })

    expect(controller.getChartSelectionsFor('species-chart')).toEqual([{ species: 'Acer rubrum' }])

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: 'Acer rubrum' },
      chart: { species: 'Acer rubrum' },
      append: true,
    })

    expect(controller.getChartSelectionsFor('species-chart')).toEqual([])
    expect(controller.getSqlFiltersFor('native-chart')).toEqual([])
  })

  it('normalizes local fields for embed clients by default', () => {
    const controller = createCrossFilterController({
      validFields: ['is_evergreen'],
    })

    controller.applyDimensionClick({
      source: 'evergreen-chart',
      filters: { 'local.is_evergreen': 'true' },
    })

    expect(controller.getSqlFiltersFor('other-chart')).toEqual(["is_evergreen='''true'''"])
  })
})

describe('cross filter helpers', () => {
  it('filters allowed dimension fields and optionally strips local prefixes', () => {
    expect(
      filterAllowedDimensionFilters(
        { 'local.species': 'Acer saccharum', ignored: 'x' },
        ['species'],
        { normalizeLocalFields: true },
      ),
    ).toEqual({ species: 'Acer saccharum' })

    expect(
      filterAllowedDimensionFilters({ 'local.species': 'Acer saccharum', ignored: 'x' }, [
        'species',
      ]),
    ).toEqual({ 'local.species': 'Acer saccharum' })
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
      { species: 'Acer rubrum' },
      { species: 'Acer rubrum' },
      'add',
    )

    expect(updated).toEqual(['peer'])
    expect(items.source.chartFilters).toEqual([
      { source: 'source', value: { species: 'Acer rubrum' } },
    ])
    expect(items.peer.conceptFilters).toEqual([
      { source: 'source', value: { species: 'Acer rubrum' } },
    ])
    expect(items.peer.filters).toEqual([{ source: 'cross', value: "species='''Acer rubrum'''" }])
    expect(items.locked.conceptFilters).toEqual([])
  })

  it('builds SQL with OR semantics for multiple values of the same field', () => {
    expect(
      buildCrossFilterExpression([
        { source: 'a', value: { species: 'Acer rubrum' } },
        { source: 'a', value: { species: 'Acer saccharum' } },
      ]),
    ).toEqual("(species='''Acer rubrum''' OR species='''Acer saccharum''')")
  })

  it('passes array values through for between operations', () => {
    expect(
      filterAllowedDimensionFilters(
        { 'order.date.month_start': ['2024-01-01', '2024-03-01'] },
        ['order.date.month_start'],
      ),
    ).toEqual({ 'order.date.month_start': ['2024-01-01', '2024-03-01'] })
  })

  it('generates BETWEEN SQL for array-valued cross filters', () => {
    const controller = createCrossFilterController({
      validFields: ['order.date.month_start'],
    })

    controller.applyDimensionClick({
      source: 'date-chart',
      filters: { 'order.date.month_start': ['2024-01-01', '2024-03-01'] },
    })

    expect(controller.getSqlFiltersFor('other-chart')).toEqual([
      "order.date.month_start between '2024-01-01' and '2024-03-01'",
    ])
  })

  it('toggles exact array matches in append mode', () => {
    const controller = createCrossFilterController({
      validFields: ['order.date.month_start'],
    })

    controller.applyDimensionClick({
      source: 'date-chart',
      filters: { 'order.date.month_start': ['2024-01-01', '2024-03-01'] },
      append: true,
    })
    expect(controller.getChartSelectionsFor('date-chart')).toHaveLength(1)

    controller.applyDimensionClick({
      source: 'date-chart',
      filters: { 'order.date.month_start': ['2024-01-01', '2024-03-01'] },
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
