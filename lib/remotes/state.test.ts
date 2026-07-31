import { describe, expect, it } from 'vitest'
import {
  buildStateKey,
  formatPartitionValues,
  latestObservedWatermark,
  parseStateKey,
  partitionColumnNames,
  rollupAssetStatus,
  sortAssetsByAttention,
  sortPartitionsByAttention,
  stateTargetCovers,
  summarizePartitions,
  toStateTarget,
  type StateAsset,
  type StateDatasource,
  type StatePartition,
  type StateWatermark,
} from './state'

const watermark = (probedAt: string, value: string): StateWatermark => ({
  key: 'update_time',
  type: 'update_time',
  value_raw: value,
  value,
  value_type: 'str',
  concept_address: null,
  column: null,
  probed_at: probedAt,
})

const datasource = (overrides: Partial<StateDatasource> = {}): StateDatasource => ({
  datasource_id: 'ds',
  script: 'example.preql',
  is_root: false,
  refresh_kind: 'sql',
  status: 'fresh',
  stale_reason: null,
  observed_watermarks: [],
  expected_watermarks: [],
  columns: [],
  observations: [],
  plan: null,
  partition_by: [],
  partitions: [],
  partitions_complete: true,
  ...overrides,
})

const asset = (overrides: Partial<StateAsset> = {}): StateAsset => ({
  address: 'asset',
  managed: true,
  owner_script: 'reporting.preql',
  status: 'fresh',
  datasources: [],
  ...overrides,
})

const partition = (overrides: Partial<StatePartition> = {}): StatePartition => ({
  partition_id: 'flight_month=2000-01-01',
  values: { flight_month: '2000-01-01' },
  observed: true,
  expected: true,
  status: 'fresh',
  stale_reason: null,
  row_count: 9,
  observed_watermarks: [],
  expected_watermarks: [],
  probed_at: '2026-07-31T18:17:53.051909+00:00',
  run_id: null,
  ...overrides,
})

describe('partitionColumnNames', () => {
  it('reads column names out of partition_by objects', () => {
    const result = partitionColumnNames(
      datasource({
        partition_by: [
          { column: 'flight_month', concept_address: 'local.flight_month' },
          { column: 'carrier', concept_address: null },
        ],
      }),
    )

    expect(result).toEqual(['flight_month', 'carrier'])
  })
})

describe('formatPartitionValues', () => {
  it('renders the partition key as column=value pairs', () => {
    expect(formatPartitionValues(partition())).toBe('flight_month=2000-01-01')
  })

  it('renders multi-column keys', () => {
    expect(
      formatPartitionValues(partition({ values: { flight_month: '2000-01-01', carrier: 'AA' } })),
    ).toBe('flight_month=2000-01-01, carrier=AA')
  })

  it('falls back to the partition id when values are empty', () => {
    expect(formatPartitionValues(partition({ values: {}, partition_id: 'p-1' }))).toBe('p-1')
  })

  it('renders a null value without printing null', () => {
    expect(formatPartitionValues(partition({ values: { flight_month: null } }))).toBe(
      'flight_month=—',
    )
  })
})

describe('summarizePartitions', () => {
  it('counts statuses, missing partitions and total rows', () => {
    const result = summarizePartitions(
      datasource({
        partitions_complete: false,
        partitions: [
          partition({ status: 'fresh', row_count: 10 }),
          partition({ status: 'stale', row_count: 5 }),
          partition({ status: 'unknown', row_count: null }),
          partition({ status: 'stale', observed: false, expected: true, row_count: 0 }),
        ],
      }),
    )

    expect(result).toEqual({
      total: 4,
      fresh: 1,
      stale: 2,
      unknown: 1,
      missing: 1,
      rowCount: 15,
      complete: false,
    })
  })

  it('leaves rowCount null when no partition reports one', () => {
    const result = summarizePartitions(datasource({ partitions: [partition({ row_count: null })] }))

    expect(result.rowCount).toBeNull()
  })
})

describe('sortPartitionsByAttention', () => {
  it('puts stale before unknown before fresh', () => {
    const partitions = [
      partition({ partition_id: 'c', status: 'fresh' }),
      partition({ partition_id: 'b', status: 'unknown' }),
      partition({ partition_id: 'a', status: 'stale' }),
    ]

    expect(sortPartitionsByAttention(partitions).map((entry) => entry.partition_id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('surfaces unobserved partitions ahead of observed ones at equal status', () => {
    const partitions = [
      partition({ partition_id: 'observed', status: 'stale', observed: true }),
      partition({ partition_id: 'missing', status: 'stale', observed: false }),
    ]

    expect(sortPartitionsByAttention(partitions)[0].partition_id).toBe('missing')
  })
})

describe('latestObservedWatermark', () => {
  it('returns null when nothing has been observed', () => {
    expect(latestObservedWatermark(datasource())).toBeNull()
  })

  it('picks the most recently probed watermark regardless of array order', () => {
    const result = latestObservedWatermark(
      datasource({
        observed_watermarks: [
          watermark('2026-07-31T16:59:32.781965+00:00', 'older'),
          watermark('2026-07-31T17:05:53.629588+00:00', 'newer'),
          watermark('2026-07-31T16:52:02.055898+00:00', 'oldest'),
        ],
      }),
    )

    expect(result?.value).toBe('newer')
  })
})

describe('rollupAssetStatus', () => {
  it('falls back to the asset status when it has no datasources', () => {
    expect(rollupAssetStatus(asset({ status: 'unknown' }))).toBe('unknown')
  })

  it('surfaces a stale datasource under an otherwise fresh asset', () => {
    const result = rollupAssetStatus(
      asset({
        status: 'fresh',
        datasources: [datasource({ status: 'fresh' }), datasource({ status: 'stale' })],
      }),
    )

    expect(result).toBe('stale')
  })

  it('keeps the asset status when it is worse than every datasource', () => {
    const result = rollupAssetStatus(
      asset({ status: 'stale', datasources: [datasource({ status: 'fresh' })] }),
    )

    expect(result).toBe('stale')
  })
})

describe('sortAssetsByAttention', () => {
  it('orders stale before unknown before fresh, then alphabetically', () => {
    const assets = [
      asset({ address: 'zeta', status: 'fresh' }),
      asset({ address: 'beta', status: 'unknown' }),
      asset({ address: 'alpha', status: 'stale' }),
      asset({ address: 'apple', status: 'fresh' }),
    ]

    expect(sortAssetsByAttention(assets).map((entry) => entry.address)).toEqual([
      'alpha',
      'beta',
      'apple',
      'zeta',
    ])
  })

  it('does not mutate the input array', () => {
    const assets = [asset({ address: 'zeta' }), asset({ address: 'alpha', status: 'stale' })]
    sortAssetsByAttention(assets)

    expect(assets[0].address).toBe('zeta')
  })
})

describe('stateTargetCovers', () => {
  it('covers the exact target', () => {
    expect(stateTargetCovers('models', 'models')).toBe(true)
  })

  it('covers descendants of a directory snapshot', () => {
    expect(stateTargetCovers('models', 'models/daily.preql')).toBe(true)
  })

  it('treats the root snapshot as covering everything', () => {
    expect(stateTargetCovers('.', 'models/daily.preql')).toBe(true)
    expect(stateTargetCovers('', 'anything.preql')).toBe(true)
  })

  it('does not cover siblings or prefix look-alikes', () => {
    expect(stateTargetCovers('models', 'reporting/daily.preql')).toBe(false)
    expect(stateTargetCovers('models', 'models_archive/daily.preql')).toBe(false)
  })
})

describe('state keys', () => {
  it('round-trips a store id and target', () => {
    const parsed = parseStateKey(buildStateKey('store-1', 'models/daily.preql'))

    expect(parsed).toEqual({ storeId: 'store-1', target: 'models/daily.preql' })
  })

  it('normalizes an empty target to the store root', () => {
    expect(parseStateKey(buildStateKey('store-1', ''))?.target).toBe('.')
    expect(toStateTarget('')).toBe('.')
  })

  it('returns null for a key without a separator', () => {
    expect(parseStateKey('store-1')).toBeNull()
  })
})
