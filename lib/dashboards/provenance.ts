/**
 * Computed provenance for dashboard / report blocks.
 *
 * Provenance is intentionally NOT a persisted field on GridItemData. Every
 * piece of it can be derived from data already on the item or its parent
 * dashboard:
 *   - query: from `content` (chart/table) or `content.query` (markdown/memo/claim)
 *   - filters: from item.filters / item.conceptFilters / dashboard.filter
 *   - freshness: dashboard.updatedAt
 *   - confidence: from MemoData / ClaimData when present
 *
 * The report renderer surfaces this as a "show provenance" footer; the agent
 * can audit it via the get_provenance tool. Both go through this single
 * helper so they always agree.
 */

import {
  type Dashboard,
  type DashboardImport,
  type GridItemData,
  type ConfidenceLevel,
  CELL_TYPES,
  isMemoData,
  isClaimData,
  isMarkdownData,
  extractItemQuery,
} from './base'

export interface ProvenanceFilter {
  source: string
  expression: string
  parameters?: Record<string, unknown>
}

export interface Provenance {
  itemId: string
  /** Cell type — useful when the agent inspects multiple items in one call. */
  type: GridItemData['type']
  /** Display name (the cell's `name` field). */
  name: string
  /** The Trilogy / SQL query that produced this block's data, if any. */
  query?: string
  /** Active data import / source the query runs against. */
  dataSource?: string
  /** When the dashboard was last touched — proxies for "freshness". */
  freshness: Date
  /** Effective filters: item-level + global. */
  filters: ProvenanceFilter[]
  /** Bound query parameters. */
  parameters?: Record<string, unknown>
  /** Authored confidence (memo/claim only). */
  confidence?: ConfidenceLevel
  /** Why the chosen confidence (memo only). */
  confidenceRationale?: string
  /** Caveat string (claim only). */
  caveat?: string
  /** Optional drilldown pointer (claim only) — what to investigate next. */
  drilldown?: string
  /** Number of rows in the latest result set, when available. */
  rowCount?: number
  /** Last query error if the most recent run failed. */
  error?: string | null
  /** True when the cell carries no query at all (pure prose markdown, etc). */
  noQuery: boolean
}

/** Build a Provenance record for a single grid item. Pure function — does
 *  not mutate the input. */
export function getProvenance(
  itemId: string,
  item: GridItemData,
  dashboard: Pick<Dashboard, 'updatedAt' | 'filter' | 'imports'>,
): Provenance {
  const query = extractItemQuery(item)

  // Active data source: dashboards carry an imports list; the active import is
  // the first one (matches selectActiveImport semantics in the agent tools).
  const activeImport: DashboardImport | undefined =
    Array.isArray(dashboard.imports) && dashboard.imports.length > 0
      ? dashboard.imports[0]
      : undefined

  const filters: ProvenanceFilter[] = []
  if (dashboard.filter) {
    filters.push({ source: 'global', expression: dashboard.filter })
  }
  for (const f of item.filters || []) {
    filters.push({
      source: f.source,
      expression: f.value,
      parameters: f.parameters as Record<string, unknown> | undefined,
    })
  }

  let confidence: ConfidenceLevel | undefined
  let confidenceRationale: string | undefined
  let caveat: string | undefined
  let drilldown: string | undefined

  if (isMemoData(item.content)) {
    confidence = item.content.confidence
    confidenceRationale = item.content.confidenceRationale
  } else if (isClaimData(item.content)) {
    caveat = item.content.caveat
    drilldown = item.content.drilldown
  }

  const noQuery =
    !query &&
    !(item.type === CELL_TYPES.CHART || item.type === CELL_TYPES.TABLE) &&
    !(isMarkdownData(item.content) && item.content.query)

  return {
    itemId,
    type: item.type,
    name: item.name,
    query,
    dataSource: activeImport?.name,
    freshness: dashboard.updatedAt,
    filters,
    parameters: item.parameters,
    confidence,
    confidenceRationale,
    caveat,
    drilldown,
    rowCount: item.results?.data?.length,
    error: item.error ?? null,
    noQuery,
  }
}

/** Render a provenance record as compact human-readable text — used by the
 *  agent tool and as a fallback when a UI component wants a one-shot string. */
export function formatProvenance(p: Provenance): string {
  const lines: string[] = []
  lines.push(`# Provenance for "${p.name}" [${p.itemId}] (${p.type})`)
  lines.push('')
  if (p.dataSource) lines.push(`- Data source: ${p.dataSource}`)
  lines.push(`- Last updated: ${p.freshness.toISOString()}`)
  if (p.confidence) {
    lines.push(
      `- Confidence: ${p.confidence}${p.confidenceRationale ? ` — ${p.confidenceRationale}` : ''}`,
    )
  }
  if (p.rowCount !== undefined) lines.push(`- Rows returned: ${p.rowCount}`)
  if (p.error) lines.push(`- Last error: ${p.error}`)
  if (p.caveat) lines.push(`- Caveat: ${p.caveat}`)
  if (p.drilldown) lines.push(`- Next drilldown: ${p.drilldown}`)
  if (p.filters.length > 0) {
    lines.push('- Filters:')
    for (const f of p.filters) {
      lines.push(`  - [${f.source}] ${f.expression}`)
    }
  }
  if (p.parameters && Object.keys(p.parameters).length > 0) {
    lines.push(`- Parameters: ${JSON.stringify(p.parameters)}`)
  }
  if (p.query) {
    lines.push('- Query:')
    lines.push('  ```trilogy')
    for (const line of p.query.split('\n')) {
      lines.push(`  ${line}`)
    }
    lines.push('  ```')
  } else if (p.noQuery) {
    lines.push('- Query: (none — this block carries no data binding)')
  }
  return lines.join('\n')
}
