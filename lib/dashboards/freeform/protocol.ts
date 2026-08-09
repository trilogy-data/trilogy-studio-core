import type { Results } from '../../editors/results'
import type { CrossFilterEntry, CrossFilterScalar } from '../conditions'
import type { SqlFilterLike } from '../crossFilters'
import {
  MAX_FREEFORM_ROWS,
  MIN_FREEFORM_HEIGHT,
  MAX_FREEFORM_HEIGHT,
  type FreeformColumn,
  type FreeformFilterRef,
  type FreeformState,
  type FreeformStatus,
  type GuestMessage,
} from './types'

/**
 * Everything crossing the sandbox boundary is validated here. The guest is
 * untrusted code: assume every message is hostile, malformed, or both. This
 * module is deliberately free of DOM/Vue dependencies so it can be unit
 * tested in isolation.
 */

/** Caps on a single filter message — a widget shouldn't be able to blow up
 *  the generated SQL or the UI by emitting thousands of predicates. */
const MAX_FILTER_FIELDS = 8
const MAX_IN_VALUES = 200
const MAX_STRING_VALUE_LENGTH = 512
const MAX_LOG_LENGTH = 2_000

function isScalar(value: unknown): value is CrossFilterScalar {
  if (typeof value === 'string') return value.length <= MAX_STRING_VALUE_LENGTH
  if (typeof value === 'number') return Number.isFinite(value)
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  return false
}

/** Coerce an untrusted value into a CrossFilterEntry, or null if it isn't one.
 *  This is the only door through which widget input becomes a filter, and it
 *  admits nothing but the four typed operations — never a SQL string. */
export function parseCrossFilterEntry(raw: unknown): CrossFilterEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const op = (raw as { op?: unknown }).op
  const value = (raw as { value?: unknown }).value

  switch (op) {
    case 'is_null':
      return { op: 'is_null' }
    case 'eq':
      return isScalar(value) ? { op: 'eq', value } : null
    case 'range': {
      if (!Array.isArray(value) || value.length !== 2) return null
      if (!isScalar(value[0]) || !isScalar(value[1])) return null
      return { op: 'range', value: [value[0], value[1]] }
    }
    case 'in': {
      if (!Array.isArray(value) || value.length === 0) return null
      if (value.length > MAX_IN_VALUES) return null
      if (!value.every(isScalar)) return null
      return { op: 'in', value: value as CrossFilterScalar[] }
    }
    default:
      return null
  }
}

function parseFilterMap(raw: unknown): Record<string, CrossFilterEntry> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > MAX_FILTER_FIELDS) return null

  const parsed: Record<string, CrossFilterEntry> = {}
  for (const [field, value] of entries) {
    // Field names are validated again downstream against the dashboard's
    // concept allowlist; this only rejects obvious junk keys early.
    if (!field || typeof field !== 'string' || field.length > 256) return null
    if (field === '__proto__' || field === 'constructor' || field === 'prototype') return null
    const entry = parseCrossFilterEntry(value)
    if (!entry) return null
    parsed[field] = entry
  }
  return parsed
}

/** Validate a raw port message into a GuestMessage, or null to drop it. */
export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const type = (raw as { type?: unknown }).type

  switch (type) {
    case 'ready':
      return { type: 'ready' }

    case 'refresh':
      return { type: 'refresh' }

    case 'resize': {
      const height = (raw as { height?: unknown }).height
      if (typeof height !== 'number' || !Number.isFinite(height)) return null
      return { type: 'resize', height: clampHeight(height) }
    }

    case 'filter': {
      const mode = (raw as { mode?: unknown }).mode
      if (mode !== 'set' && mode !== 'append' && mode !== 'clear') return null
      if (mode === 'clear') return { type: 'filter', mode, filters: {} }
      const filters = parseFilterMap((raw as { filters?: unknown }).filters)
      if (!filters || Object.keys(filters).length === 0) return null
      return { type: 'filter', mode, filters }
    }

    case 'log': {
      const level = (raw as { level?: unknown }).level
      const message = (raw as { message?: unknown }).message
      if (level !== 'log' && level !== 'warn' && level !== 'error') return null
      if (typeof message !== 'string') return null
      return { type: 'log', level, message: message.slice(0, MAX_LOG_LENGTH) }
    }

    default:
      return null
  }
}

export function clampHeight(height: number): number {
  return Math.min(MAX_FREEFORM_HEIGHT, Math.max(MIN_FREEFORM_HEIGHT, Math.round(height)))
}

/** Flatten `Results.headers` (a Map, keyed by String objects in places) into a
 *  plain array — a stable, structured-cloneable contract for widget authors. */
export function buildColumns(results: Results | null | undefined): FreeformColumn[] {
  if (!results?.headers) return []
  const columns: FreeformColumn[] = []
  results.headers.forEach((column) => {
    columns.push({
      name: column.name,
      type: String(column.type),
      ...(column.address ? { address: column.address } : {}),
      ...(column.description ? { description: column.description } : {}),
    })
  })
  return columns
}

/**
 * Map guest-supplied field keys onto concept addresses.
 *
 * Cross-filters are keyed on a concept's fully-qualified address (`local.rows`),
 * but a widget naturally reaches for the column name it rendered (`rows`).
 * Requiring the address would make every widget depend on namespace trivia the
 * author can't see, so resolve names here — against this item's own result
 * columns, nothing wider. Unresolvable keys pass through untouched and are
 * rejected downstream by the concept allowlist.
 */
export function resolveFilterFieldAddresses(
  filters: Record<string, CrossFilterEntry>,
  results: Results | null | undefined,
): Record<string, CrossFilterEntry> {
  const byName = new Map<string, string>()
  results?.headers?.forEach((column) => {
    if (column.address && column.name && column.address !== column.name) {
      byName.set(column.name, column.address)
    }
  })
  if (byName.size === 0) return filters

  const resolved: Record<string, CrossFilterEntry> = {}
  for (const [field, entry] of Object.entries(filters)) {
    resolved[byName.get(field) || field] = entry
  }
  return resolved
}

/** Describe the filters constraining this item without leaking SQL text. The
 *  widget gets to know *that* it is filtered and by which fields, so it can
 *  render "filtered by region" affordances, but never the generated predicate. */
export function buildFilterRefs(filters: SqlFilterLike[] | undefined): FreeformFilterRef[] {
  if (!filters?.length) return []
  return filters.map((filter) => ({
    source: filter.source,
    fields: Object.keys(filter.parameters || {}).map((key) => key.replace(/^:/, '')),
  }))
}

export interface BuildStateOptions {
  status: FreeformStatus
  results: Results | null | undefined
  filters?: SqlFilterLike[]
  error?: string | null
  maxRows?: number
}

/** Build the state snapshot pushed to the widget. Rows are shallow-copied into
 *  plain objects: `Results.data` is readonly and may be reactive, and handing a
 *  Vue proxy to structuredClone throws. */
export function buildFreeformState(options: BuildStateOptions): FreeformState {
  const maxRows = options.maxRows ?? MAX_FREEFORM_ROWS
  const sourceRows = options.results?.data ?? []
  const truncated = sourceRows.length > maxRows
  const rows = (truncated ? sourceRows.slice(0, maxRows) : sourceRows).map((row) => ({ ...row }))

  return {
    status: options.status,
    columns: buildColumns(options.results),
    rows,
    rowCount: rows.length,
    truncated,
    filters: buildFilterRefs(options.filters),
    error: options.error || null,
  }
}
