import { describe, it, expect } from 'vitest'
import { filterDatePartConcepts, conceptsToFieldPrompt } from './prompts'
import type { ModelConceptInput } from './models'

describe('filterDatePartConcepts', () => {
  it('should return empty array for empty input', () => {
    expect(filterDatePartConcepts([])).toEqual([])
  })

  it('should keep concepts that do not end with date parts', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'customer.name', type: 'string' },
      { name: 'revenue', type: 'float' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual(concepts)
  })

  it('should filter out concepts ending with .year', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.year', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .quarter', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.quarter', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .month', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.month', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .week', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.week', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .day', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.day', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .day_of_week', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.day_of_week', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .hour', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.hour', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .minute', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.minute', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out concepts ending with .second', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.second', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([{ name: 'order.id', type: 'int' }])
  })

  it('should filter out multiple date part concepts', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.year', type: 'int' },
      { name: 'order.month', type: 'int' },
      { name: 'order.day', type: 'int' },
      { name: 'customer.name', type: 'string' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([
      { name: 'order.id', type: 'int' },
      { name: 'customer.name', type: 'string' },
    ])
  })

  it('should not filter concepts that contain date parts but do not end with them', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'year.total', type: 'int' },
      { name: 'monthly_revenue', type: 'float' },
      { name: 'day_count', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual(concepts)
  })

  it('should preserve all properties of non-filtered concepts', () => {
    const concepts: ModelConceptInput[] = [
      {
        name: 'order.revenue',
        type: 'float',
        description: 'Total revenue',
        calculation: 'sum(amount)',
        keys: ['order.id'],
      },
      { name: 'order.year', type: 'int' },
    ]
    expect(filterDatePartConcepts(concepts)).toEqual([
      {
        name: 'order.revenue',
        type: 'float',
        description: 'Total revenue',
        calculation: 'sum(amount)',
        keys: ['order.id'],
      },
    ])
  })
})

describe('conceptsToFieldPrompt', () => {
  it('should filter out date part concepts from the prompt', () => {
    const concepts: ModelConceptInput[] = [
      { name: 'order.id', type: 'int' },
      { name: 'order.year', type: 'int' },
    ]
    const result = conceptsToFieldPrompt(concepts)
    expect(result).toBe('[name: order.id | type:int]')
    expect(result).not.toContain('order.year')
  })
})
