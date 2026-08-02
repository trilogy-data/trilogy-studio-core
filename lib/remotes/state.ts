// Types for the Trilogy local server's `GET /state` endpoint (0.3.306+).
//
// From 0.3.308 the server serves these from an on-disk cache and invalidates
// on model edits and finished jobs, so a plain read is cheap. A cache miss or
// `refresh=true` still re-parses the target and re-probes the warehouse —
// seconds per call, and real query spend on a billed warehouse — so reads stay
// tied to explicit user action rather than navigation or polling.

// The endpoint declares an untyped response in its OpenAPI schema, so the
// status values below are the ones observed in practice rather than a
// published enum. Keep the string fallback until the server publishes one.
export type StateStatus = 'fresh' | 'stale' | 'unknown' | (string & {})

export interface StateWatermark {
  key: string
  type: string
  value_raw: string | null
  value: string | null
  value_type: string
  concept_address: string | null
  column: string | null
  probed_at: string
}

export interface StateColumn {
  column: string
  concrete: boolean
  concept_address: string | null
  modifiers: string[]
}

export interface StateObservation {
  phase: string
  probed_at: string
  observed_watermarks: StateWatermark[]
  expected_watermarks: StateWatermark[]
}

/** Partitioning key — an object, not a bare column name. */
export interface StatePartitionColumn {
  column: string
  concept_address: string | null
}

export interface StatePartition {
  partition_id: string
  values: Record<string, string | number | boolean | null>
  observed: boolean
  expected: boolean
  status: StateStatus
  stale_reason: string | null
  row_count: number | null
  observed_watermarks: StateWatermark[]
  expected_watermarks: StateWatermark[]
  probed_at: string | null
  run_id: string | null
}

export interface StateDatasource {
  datasource_id: string
  script: string
  is_root: boolean
  refresh_kind: string | null
  status: StateStatus
  stale_reason: string | null
  observed_watermarks: StateWatermark[]
  expected_watermarks: StateWatermark[]
  columns: StateColumn[]
  observations: StateObservation[]
  // `plan` is still null on every store seen so far; leave it opaque rather
  // than guessing at a shape we cannot verify.
  plan: unknown | null
  partition_by: StatePartitionColumn[]
  partitions: StatePartition[]
  partitions_complete: boolean
}

export interface StateAsset {
  address: string
  managed: boolean
  owner_script: string | null
  status: StateStatus
  datasources: StateDatasource[]
}

export interface StateSummary {
  total: number
  managed: number
  stale: number
  fresh: number
  unknown: number
}

export interface StateSnapshot {
  schema_version: number
  snapshot_ts: string
  run_id: string | null
  project: string | null
  target: string
  dialect: string
  assets: StateAsset[]
  summary: StateSummary
}

// Worst-first, so a rollup surfaces the status that needs attention.
const STATUS_SEVERITY: Record<string, number> = {
  stale: 3,
  unknown: 2,
  fresh: 1,
}

const severityOf = (status: StateStatus): number => STATUS_SEVERITY[status] ?? 0

/** The most recently probed observed watermark for a datasource, if any. */
export const latestObservedWatermark = (
  datasource: Pick<StateDatasource, 'observed_watermarks'>,
): StateWatermark | null =>
  datasource.observed_watermarks.reduce<StateWatermark | null>((latest, watermark) => {
    if (!latest) {
      return watermark
    }
    return watermark.probed_at > latest.probed_at ? watermark : latest
  }, null)

/**
 * Asset status, falling back to the worst datasource status.
 *
 * The server reports status at both levels and they can disagree — an asset
 * marked `fresh` whose datasources are not all fresh should read as the
 * datasource status that needs attention.
 */
export const rollupAssetStatus = (asset: StateAsset): StateStatus => {
  const worstDatasource = asset.datasources.reduce<StateStatus | null>(
    (worst, datasource) =>
      !worst || severityOf(datasource.status) > severityOf(worst) ? datasource.status : worst,
    null,
  )

  if (!worstDatasource) {
    return asset.status
  }

  return severityOf(worstDatasource) > severityOf(asset.status) ? worstDatasource : asset.status
}

/** Partition key columns, for display — `partition_by` holds objects. */
export const partitionColumnNames = (datasource: Pick<StateDatasource, 'partition_by'>): string[] =>
  datasource.partition_by.map((entry) => entry.column)

/** A partition's key as `column=value` pairs, for display. */
export const formatPartitionValues = (partition: StatePartition): string => {
  const pairs = Object.entries(partition.values).map(
    ([column, value]) => `${column}=${value ?? '—'}`,
  )
  return pairs.length ? pairs.join(', ') : partition.partition_id
}

export interface StatePartitionSummary {
  total: number
  fresh: number
  stale: number
  unknown: number
  missing: number
  rowCount: number | null
  complete: boolean
}

/**
 * Roll a partition list up to counts. Datasources can carry dozens of
 * partitions, so the table shows this instead of every row.
 */
export const summarizePartitions = (
  datasource: Pick<StateDatasource, 'partitions' | 'partitions_complete'>,
): StatePartitionSummary => {
  const summary: StatePartitionSummary = {
    total: datasource.partitions.length,
    fresh: 0,
    stale: 0,
    unknown: 0,
    missing: 0,
    rowCount: null,
    complete: datasource.partitions_complete,
  }

  datasource.partitions.forEach((partition) => {
    if (partition.status === 'fresh') {
      summary.fresh += 1
    } else if (partition.status === 'stale') {
      summary.stale += 1
    } else {
      summary.unknown += 1
    }

    // Expected but never observed — the gap a partitioned refresh needs to fill.
    if (partition.expected && !partition.observed) {
      summary.missing += 1
    }

    if (typeof partition.row_count === 'number') {
      summary.rowCount = (summary.rowCount ?? 0) + partition.row_count
    }
  })

  return summary
}

/** Worst-status first, then by partition id, so gaps surface immediately. */
export const sortPartitionsByAttention = (partitions: StatePartition[]): StatePartition[] =>
  [...partitions].sort((left, right) => {
    const bySeverity = severityOf(right.status) - severityOf(left.status)
    if (bySeverity !== 0) {
      return bySeverity
    }

    const byMissing = Number(!left.observed) - Number(!right.observed)
    return byMissing !== 0 ? -byMissing : left.partition_id.localeCompare(right.partition_id)
  })

/** Sort worst-status first so problems sit at the top of the table. */
export const sortAssetsByAttention = (assets: StateAsset[]): StateAsset[] =>
  [...assets].sort((left, right) => {
    const bySeverity = severityOf(rollupAssetStatus(right)) - severityOf(rollupAssetStatus(left))
    return bySeverity !== 0 ? bySeverity : left.address.localeCompare(right.address)
  })

const STATE_KEY_SEPARATOR = '::'

export const buildStateKey = (storeId: string, target: string): string =>
  `${storeId}${STATE_KEY_SEPARATOR}${target || '.'}`

export const parseStateKey = (key: string): { storeId: string; target: string } | null => {
  const separatorIndex = key.indexOf(STATE_KEY_SEPARATOR)
  if (separatorIndex === -1) {
    return null
  }

  return {
    storeId: key.slice(0, separatorIndex),
    target: key.slice(separatorIndex + STATE_KEY_SEPARATOR.length),
  }
}

/** `/state` takes a target query param; the store root is addressed as `.`. */
export const toStateTarget = (target: string): string => target || '.'

/**
 * Whether a loaded snapshot covers the target a job just ran against.
 *
 * A run on `models/daily.preql` invalidates the snapshot for `models` and for
 * the store root as well as the file's own, so completion has to re-probe
 * every loaded ancestor — not just the exact target.
 */
export const stateTargetCovers = (snapshotTarget: string, jobTarget: string): boolean => {
  const snapshot = toStateTarget(snapshotTarget)
  const job = toStateTarget(jobTarget)

  if (snapshot === job) {
    return true
  }

  // The root covers everything below it.
  if (snapshot === '.') {
    return true
  }

  return job.startsWith(`${snapshot}/`)
}
