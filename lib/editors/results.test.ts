import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { Results, ColumnType } from './results'
import type { ResultColumn } from './results'

describe('Results serialization round-trip', () => {
  it('serializes and deserializes luxon DateTime values correctly', () => {
    const dt = DateTime.fromISO('2024-03-15T10:30:00.000Z', { zone: 'UTC' })
    const headers = new Map<string, ResultColumn>([
      ['event_date', { name: 'event_date', type: ColumnType.DATE }],
      ['created_at', { name: 'created_at', type: ColumnType.DATETIME }],
      ['name', { name: 'name', type: ColumnType.STRING }],
    ])
    const results = new Results(headers, [{ event_date: dt, created_at: dt, name: 'test' }])

    // Simulate localStorage round-trip
    const serialized = JSON.stringify(results.toJSON())
    const parsed = JSON.parse(serialized)
    const restored = Results.fromJSON(parsed)

    const row = restored.data[0] as Record<string, any>

    // Dates should come back as luxon DateTime, not strings or weird objects
    expect(DateTime.isDateTime(row.event_date)).toBe(true)
    expect(DateTime.isDateTime(row.created_at)).toBe(true)
    expect(row.event_date.toISO()).toBe('2024-03-15T10:30:00.000Z')
    expect(row.created_at.toISO()).toBe('2024-03-15T10:30:00.000Z')

    // Non-date values should be unchanged
    expect(row.name).toBe('test')
  })

  it('handles null date values without throwing', () => {
    const headers = new Map<string, ResultColumn>([
      ['event_date', { name: 'event_date', type: ColumnType.DATE }],
    ])
    const results = new Results(headers, [{ event_date: null }])

    const serialized = JSON.stringify(results.toJSON())
    const parsed = JSON.parse(serialized)
    const restored = Results.fromJSON(parsed)

    const row = restored.data[0] as Record<string, any>
    expect(row.event_date).toBeNull()
  })

  it('handles TIMESTAMP column type', () => {
    const dt = DateTime.fromISO('2024-06-01T00:00:00.000Z', { zone: 'UTC' })
    const headers = new Map<string, ResultColumn>([
      ['ts', { name: 'ts', type: ColumnType.TIMESTAMP }],
    ])
    const results = new Results(headers, [{ ts: dt }])

    const serialized = JSON.stringify(results.toJSON())
    const parsed = JSON.parse(serialized)
    const restored = Results.fromJSON(parsed)

    const row = restored.data[0] as Record<string, any>
    expect(DateTime.isDateTime(row.ts)).toBe(true)
    expect(row.ts.toISO()).toBe('2024-06-01T00:00:00.000Z')
  })
})
