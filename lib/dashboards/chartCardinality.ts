import { type Row, type ResultColumn } from '../editors/results'

/**
 * How many distinct values a column may carry before a role stops being
 * readable. The default picker refuses to bind a column past its role's
 * capacity when a better column exists, and `auditChartConfig` reports a
 * config that does.
 */
export const ROLE_CAPACITY = {
  /** Category axis of a bar, horizontal bar or heatmap. */
  axis: 50,
  /** Discrete legend: colour series, donut slices. */
  legend: 20,
  /** Panels along one trellis dimension. */
  facet: 12,
} as const

export type DiscreteRole = keyof typeof ROLE_CAPACITY

/** Panels a trellis may produce across both dimensions. */
export const MAX_TRELLIS_CELLS = 24

/** A vertical bar chart past this many categories becomes a horizontal one. */
export const MAX_VERTICAL_BAR_CATEGORIES = 7

/** Rows the headline tile grid stays legible for (one tile per row and column). */
export const MAX_HEADLINE_ROWS = 20

/** Rows scanned when counting distinct values; past this the count is a floor. */
export const CARDINALITY_SAMPLE_ROWS = 5000

export const columnCardinality = (data: readonly Row[], field: string): number => {
  const seen = new Set<unknown>()
  const limit = Math.min(data.length, CARDINALITY_SAMPLE_ROWS)
  for (let i = 0; i < limit; i++) {
    const value = data[i]?.[field]
    if (value === undefined || value === null) continue
    seen.add(typeof value === 'object' ? String(value) : value)
  }
  return seen.size
}

export const cardinalityMap = (
  data: readonly Row[],
  columns: readonly ResultColumn[],
): Map<string, number> =>
  new Map(columns.map((col) => [col.name, columnCardinality(data, col.name)]))

export const fitsRole = (
  cardinality: Map<string, number>,
  field: string,
  role: DiscreteRole,
): boolean => (cardinality.get(field) ?? 0) <= ROLE_CAPACITY[role]
