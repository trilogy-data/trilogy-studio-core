import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEmbeddedDashboardGroup } from './useEmbeddedDashboardGroup'

describe('useEmbeddedDashboardGroup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('batches sibling chart runs through executeQueriesBatch', async () => {
    const executeQueriesBatch = vi.fn(async (_connectionId, queries) => ({
      cancellation: {
        cancel: () => {},
        isActive: () => true,
      },
      resultPromise: Promise.resolve({
        success: true,
        results: queries.map(() => ({
          success: true,
          executionTime: 0,
          resultSize: 0,
          columnCount: 0,
        })),
        executionTime: 0,
      }),
    }))

    const group = useEmbeddedDashboardGroup({
      dashboardId: 'summary-tree',
      connectionId: 'duckdb-tree',
      queryExecutionService: {
        executeQueriesBatch,
        executeQuery: vi.fn(),
        createConnectionDrilldownQuery: vi.fn(),
      },
      batchDelay: 5,
    })

    group.registerItem({
      itemId: 'species',
      title: 'Species',
      query: 'select species, count(*) as tree_count;',
    })
    group.registerItem({
      itemId: 'native',
      title: 'Native',
      query: 'select native_status, count(*) as tree_count;',
    })

    group.scheduleRun('species')
    group.scheduleRun('native')

    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()

    expect(executeQueriesBatch).toHaveBeenCalledTimes(1)
    expect(executeQueriesBatch.mock.calls[0][1]).toHaveLength(2)
    expect(executeQueriesBatch.mock.calls[0][1].map((query: { query: string }) => query.query)).toEqual([
      'select species, count(*) as tree_count;',
      'select native_status, count(*) as tree_count;',
    ])

    group.dispose()
  })
})
