import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useResolvedCrossFilterController } from './useResolvedCrossFilterController'
import type { CrossFilterEntry } from '../dashboards/conditions'

const eq = (v: string | number): CrossFilterEntry => ({ op: 'eq', value: v })

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useResolvedCrossFilterController', () => {
  it('ignores selections until eligibility has resolved', async () => {
    let resolveFields: (fields: string[]) => void = () => {}
    const queryExecutionService = {
      getEligibleCrossFilterFields: vi.fn(
        () =>
          new Promise<string[]>((resolve) => {
            resolveFields = resolve
          }),
      ),
    }

    const controller = useResolvedCrossFilterController({
      queryExecutionService,
      connectionId: 'duckdb',
      imports: [{ name: 'trees', alias: '' }],
    })

    await nextTick()

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
      append: false,
    })

    expect(controller.getSelections()).toEqual([])

    resolveFields(['species'])
    await flushPromises()
    await nextTick()

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
      append: false,
    })

    expect(controller.getSelections()).toEqual([
      {
        source: 'species-chart',
        filters: { species: eq('Acer rubrum') },
        chart: { species: 'Acer rubrum' },
        append: false,
      },
    ])
  })

  it('filters clicked fields using resolved eligibility', async () => {
    const queryExecutionService = {
      getEligibleCrossFilterFields: vi.fn(async () => ['species']),
    }

    const controller = useResolvedCrossFilterController({
      queryExecutionService,
      connectionId: 'duckdb',
      imports: [{ name: 'trees', alias: '' }],
    })

    await flushPromises()
    await nextTick()

    controller.applyDimensionClick({
      source: 'mixed-chart',
      filters: {
        species: eq('Acer rubrum'),
        tree_count: eq('42'),
      },
      chart: {
        species: 'Acer rubrum',
        tree_count: '42',
      },
      append: false,
    })

    expect(controller.getSelections()).toEqual([
      {
        source: 'mixed-chart',
        filters: { species: eq('Acer rubrum') },
        chart: {
          species: 'Acer rubrum',
          tree_count: '42',
        },
        append: false,
      },
    ])
  })

  it('allows static valid fields for immediate safe usage', () => {
    const queryExecutionService = {
      getEligibleCrossFilterFields: vi.fn(async () => []),
    }

    const controller = useResolvedCrossFilterController({
      queryExecutionService,
      connectionId: 'duckdb',
      staticValidFields: ['species'],
    })

    controller.applyDimensionClick({
      source: 'species-chart',
      filters: { species: eq('Acer rubrum') },
      chart: { species: 'Acer rubrum' },
      append: false,
    })

    expect(controller.getSelections()).toEqual([
      {
        source: 'species-chart',
        filters: { species: eq('Acer rubrum') },
        chart: { species: 'Acer rubrum' },
        append: false,
      },
    ])
  })
})
