import { describe, it, expect } from 'vitest'
import {
  parseCrossFilterEntry,
  parseGuestMessage,
  clampHeight,
  buildColumns,
  buildFilterRefs,
  buildFreeformState,
  resolveFilterFieldAddresses,
} from './protocol'
import { MAX_FREEFORM_HEIGHT, MIN_FREEFORM_HEIGHT } from './types'
import type { Results, ResultColumn } from '../../editors/results'
import { ColumnType } from '../../editors/results'

function makeResults(
  rows: Record<string, unknown>[],
  columns: (string | { name: string; address: string })[],
): Results {
  const headers = new Map<String, ResultColumn>()
  for (const column of columns) {
    const name = typeof column === 'string' ? column : column.name
    headers.set(name, {
      name,
      type: ColumnType.STRING,
      ...(typeof column === 'string' ? {} : { address: column.address }),
    })
  }
  return { headers, data: rows } as unknown as Results
}

describe('parseCrossFilterEntry', () => {
  it('accepts the four typed operations', () => {
    expect(parseCrossFilterEntry({ op: 'eq', value: 'a' })).toEqual({ op: 'eq', value: 'a' })
    expect(parseCrossFilterEntry({ op: 'in', value: [1, 2] })).toEqual({ op: 'in', value: [1, 2] })
    expect(parseCrossFilterEntry({ op: 'range', value: [1, 2] })).toEqual({
      op: 'range',
      value: [1, 2],
    })
    expect(parseCrossFilterEntry({ op: 'is_null' })).toEqual({ op: 'is_null' })
  })

  it('rejects anything that is not one of them', () => {
    // The whole point of the typed union: a widget cannot smuggle SQL through.
    expect(parseCrossFilterEntry({ op: 'raw', value: "1=1 OR 'a'='a'" })).toBeNull()
    expect(parseCrossFilterEntry("region = 'west'")).toBeNull()
    expect(parseCrossFilterEntry({ op: 'eq', value: { nested: true } })).toBeNull()
    expect(parseCrossFilterEntry({ op: 'eq', value: null })).toBeNull()
    expect(parseCrossFilterEntry({ op: 'eq', value: true })).toBeNull()
    expect(parseCrossFilterEntry({ op: 'eq', value: NaN })).toBeNull()
    expect(parseCrossFilterEntry(null)).toBeNull()
  })

  it('bounds list and string sizes', () => {
    expect(parseCrossFilterEntry({ op: 'in', value: [] })).toBeNull()
    expect(parseCrossFilterEntry({ op: 'in', value: new Array(201).fill('x') })).toBeNull()
    expect(parseCrossFilterEntry({ op: 'eq', value: 'x'.repeat(513) })).toBeNull()
    expect(parseCrossFilterEntry({ op: 'range', value: [1] })).toBeNull()
  })
})

describe('parseGuestMessage', () => {
  it('parses well-formed messages', () => {
    expect(parseGuestMessage({ type: 'ready' })).toEqual({ type: 'ready' })
    expect(parseGuestMessage({ type: 'refresh' })).toEqual({ type: 'refresh' })
    expect(parseGuestMessage({ type: 'resize', height: 300 })).toEqual({
      type: 'resize',
      height: 300,
    })
    expect(parseGuestMessage({ type: 'log', level: 'warn', message: 'hi' })).toEqual({
      type: 'log',
      level: 'warn',
      message: 'hi',
    })
    expect(
      parseGuestMessage({
        type: 'filter',
        mode: 'set',
        filters: { region: { op: 'eq', value: 'w' } },
      }),
    ).toEqual({ type: 'filter', mode: 'set', filters: { region: { op: 'eq', value: 'w' } } })
  })

  it('drops unknown, malformed, and prototype-polluting messages', () => {
    expect(parseGuestMessage({ type: 'evaluate', code: 'alert(1)' })).toBeNull()
    expect(parseGuestMessage({ type: 'filter', mode: 'nuke', filters: {} })).toBeNull()
    expect(parseGuestMessage({ type: 'filter', mode: 'set', filters: {} })).toBeNull()
    expect(parseGuestMessage({ type: 'resize', height: 'tall' })).toBeNull()
    expect(parseGuestMessage({ type: 'log', level: 'fatal', message: 'x' })).toBeNull()
    expect(
      parseGuestMessage({
        type: 'filter',
        mode: 'set',
        filters: { __proto__: { op: 'eq', value: 'x' } },
      }),
    ).toBeNull()
    expect(parseGuestMessage('ready')).toBeNull()
    expect(parseGuestMessage(null)).toBeNull()
  })

  it('rejects a filter map with one bad entry rather than partially applying it', () => {
    expect(
      parseGuestMessage({
        type: 'filter',
        mode: 'set',
        filters: { good: { op: 'eq', value: 'a' }, bad: { op: 'raw', value: 'x' } },
      }),
    ).toBeNull()
  })

  it('caps the number of fields in one message', () => {
    const filters: Record<string, unknown> = {}
    for (let i = 0; i < 9; i++) filters[`f${i}`] = { op: 'eq', value: i }
    expect(parseGuestMessage({ type: 'filter', mode: 'set', filters })).toBeNull()
  })

  it('clears without requiring filters', () => {
    expect(parseGuestMessage({ type: 'filter', mode: 'clear' })).toEqual({
      type: 'filter',
      mode: 'clear',
      filters: {},
    })
  })

  it('clamps resize requests', () => {
    expect(parseGuestMessage({ type: 'resize', height: -50 })).toEqual({
      type: 'resize',
      height: MIN_FREEFORM_HEIGHT,
    })
    expect(parseGuestMessage({ type: 'resize', height: 1e9 })).toEqual({
      type: 'resize',
      height: MAX_FREEFORM_HEIGHT,
    })
  })
})

describe('clampHeight', () => {
  it('bounds and rounds', () => {
    expect(clampHeight(120.6)).toBe(121)
    expect(clampHeight(0)).toBe(MIN_FREEFORM_HEIGHT)
    expect(clampHeight(99999)).toBe(MAX_FREEFORM_HEIGHT)
  })
})

describe('buildFreeformState', () => {
  it('flattens headers into a plain column array', () => {
    const results = makeResults([{ a: 1, b: 2 }], ['a', 'b'])
    expect(buildColumns(results)).toEqual([
      { name: 'a', type: 'string' },
      { name: 'b', type: 'string' },
    ])
    expect(buildColumns(null)).toEqual([])
  })

  it('truncates oversized result sets and flags it', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ a: i }))
    const state = buildFreeformState({
      status: 'ready',
      results: makeResults(rows, ['a']),
      maxRows: 4,
    })
    expect(state.rows).toHaveLength(4)
    expect(state.rowCount).toBe(4)
    expect(state.truncated).toBe(true)
  })

  it('copies rows so reactive proxies never reach postMessage', () => {
    const row = { a: 1 }
    const state = buildFreeformState({ status: 'ready', results: makeResults([row], ['a']) })
    expect(state.rows[0]).toEqual(row)
    expect(state.rows[0]).not.toBe(row)
    expect(() => structuredClone(state)).not.toThrow()
  })

  it('describes filters by field without exposing the SQL expression', () => {
    const refs = buildFilterRefs([
      { source: 'global', value: 'region = :region_x', parameters: { ':region_x': 'west' } },
    ])
    expect(refs).toEqual([{ source: 'global', fields: ['region_x'] }])
    expect(JSON.stringify(refs)).not.toContain('region =')
  })

  it('reports empty state without a result set', () => {
    const state = buildFreeformState({ status: 'loading', results: null })
    expect(state).toMatchObject({ status: 'loading', rows: [], rowCount: 0, truncated: false })
  })
})

describe('resolveFilterFieldAddresses', () => {
  const results = makeResults([{ rows: 1 }], [{ name: 'rows', address: 'local.rows' }])

  it('maps a rendered column name onto its concept address', () => {
    // Cross-filters are keyed on the address; a widget only ever sees the name.
    expect(resolveFilterFieldAddresses({ rows: { op: 'eq', value: 1 } }, results)).toEqual({
      'local.rows': { op: 'eq', value: 1 },
    })
  })

  it('leaves an address the widget already supplied alone', () => {
    expect(resolveFilterFieldAddresses({ 'local.rows': { op: 'eq', value: 1 } }, results)).toEqual({
      'local.rows': { op: 'eq', value: 1 },
    })
  })

  it('passes unknown fields through for the allowlist to reject', () => {
    expect(resolveFilterFieldAddresses({ bogus: { op: 'eq', value: 1 } }, results)).toEqual({
      bogus: { op: 'eq', value: 1 },
    })
  })

  it('is a no-op without results or addresses', () => {
    const filters = { rows: { op: 'eq' as const, value: 1 } }
    expect(resolveFilterFieldAddresses(filters, null)).toBe(filters)
    expect(resolveFilterFieldAddresses(filters, makeResults([], ['rows']))).toBe(filters)
  })
})

describe('buildColumns addresses', () => {
  it('exposes the concept address so widgets can introspect it', () => {
    const results = makeResults([], [{ name: 'rows', address: 'local.rows' }])
    expect(buildColumns(results)[0]).toMatchObject({ name: 'rows', address: 'local.rows' })
  })
})
