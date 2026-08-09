import { describe, expect, it } from 'vitest'
import { DashboardQueryExecutor } from './dashboardQueryExecutor'

/**
 * Lifecycle of an item's `loading` flag.
 *
 * A dashboard item's spinner is only ever turned off as a side effect of
 * delivering `results` or an `error`, and those deliveries are gated on the
 * result still being the latest for that item. Nothing times out. So any path
 * that drops a delivery strands the item spinning forever — which is exactly
 * what a shared (deduplicated) query used to do.
 */

interface PendingBatch {
  labels: string[]
  succeed: (label: string, rows?: unknown[]) => void
  fail: (label: string, error: string) => void
  /** Deliver an arbitrary failure payload, as the batch executor really does. */
  failWith: (label: string, payload: unknown) => void
  finish: () => void
}

function makeExecutor(itemQueries: Record<string, string>) {
  // Item state the executor reads and writes, standing in for the store.
  const items: Record<string, { loading: boolean; results: unknown; error: string | null }> =
    Object.fromEntries(
      Object.keys(itemQueries).map((id) => [id, { loading: false, results: null, error: null }]),
    )

  const batches: PendingBatch[] = []

  const service = {
    async executeQueriesBatch(
      _connectionId: string,
      queries: { label: string }[],
      _editorType: string,
      _imports?: unknown,
      _extraFilters?: unknown,
      _parameters?: unknown,
      _onStarted?: unknown,
      _onProgress?: unknown,
      onFailure?: Record<string, (m: any) => void>,
      onSuccess?: Record<string, (m: any) => void>,
    ) {
      let release: () => void = () => {}
      const resultPromise = new Promise<any>((resolve) => {
        release = () => resolve({ success: true, results: [], executionTime: 0 })
      })
      batches.push({
        labels: queries.map((q) => q.label),
        succeed: (label, rows = []) => onSuccess?.[label]?.({ success: true, results: rows }),
        fail: (label, error) => onFailure?.[label]?.({ error }),
        failWith: (label, payload) => onFailure?.[label]?.(payload),
        finish: release,
      })
      return { resultPromise, cancellation: { cancel: () => {}, isActive: () => true } }
    },
    async executeQuery() {
      throw new Error('not used')
    },
    async createConnectionDrilldownQuery() {
      return null
    },
  }

  const executor = new DashboardQueryExecutor(
    service as any,
    'conn',
    'dash-1',
    () => ({ imports: [], layout: [] }) as any,
    (itemId: string) => ({ structured_content: { query: itemQueries[itemId] } }) as any,
    (itemId: string, _dashboardId: string, updates: any) => {
      const item = items[itemId]
      if (updates.loading !== undefined) item.loading = updates.loading
      if (updates.results !== undefined) {
        item.results = updates.results
        item.loading = false
        item.error = null
      }
      if (updates.error !== undefined) {
        item.error = updates.error
        if (updates.error) item.loading = false
      }
    },
  )

  return { executor, items, batches }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('DashboardQueryExecutor loading lifecycle', () => {
  it('stops the spinner when a query succeeds', async () => {
    const { executor, items, batches } = makeExecutor({ a: 'select 1;' })

    executor.runBatch(['a'])
    expect(items.a.loading).toBe(true)
    await flush()

    batches[0].succeed(batches[0].labels[0], [{ x: 1 }])
    expect(items.a.loading).toBe(false)
    expect(items.a.results).toEqual([{ x: 1 }])
  })

  it('stops the spinner when a query fails', async () => {
    const { executor, items, batches } = makeExecutor({ a: 'select 1;' })

    executor.runBatch(['a'])
    await flush()

    batches[0].fail(batches[0].labels[0], 'boom')
    expect(items.a.loading).toBe(false)
    expect(items.a.error).toBe('boom')
  })

  it('stops both spinners when two items share one deduplicated query', async () => {
    // findDuplicateQuery matches on query text/filters/parameters and NOT on
    // itemId, so identical queries collapse to a single in-flight query that
    // has to settle every item it feeds.
    const { executor, items, batches } = makeExecutor({ a: 'select 1;', b: 'select 1;' })

    executor.runBatch(['a', 'b'])
    await flush()
    expect(batches[0].labels).toHaveLength(1)

    batches[0].succeed(batches[0].labels[0], [{ x: 1 }])

    expect(items.a.loading).toBe(false)
    expect(items.b.loading).toBe(false)
  })

  it('stops the co-tenant spinner even when the shared query is superseded', async () => {
    // The regression: item b re-runs with a different query, which moves b's
    // "latest" pointer off the shared query. The shared query then looked
    // outdated, its result was discarded for BOTH items, and item a — whose
    // query had genuinely succeeded — spun forever.
    const { executor, items, batches } = makeExecutor({ a: 'select 1;', b: 'select 1;' })

    executor.runBatch(['a', 'b'])
    await flush()
    const shared = batches[0].labels[0]

    // b now wants something else, and that second query is still in flight.
    const queries: Record<string, string> = { a: 'select 1;', b: 'select 2;' }
    ;(executor as any).getItemData = (itemId: string) => ({
      structured_content: { query: queries[itemId] },
    })
    executor.runBatch(['b'])
    await flush()

    batches[0].succeed(shared, [{ x: 1 }])

    expect(items.a.loading).toBe(false)
    // b is still waiting on its newer query, so its spinner must stay up.
    expect(items.b.loading).toBe(true)
  })

  it('leaves the spinner up while a second refresh is still running', async () => {
    const { executor, items, batches } = makeExecutor({ a: 'select 1;' })

    executor.runBatch(['a'])
    await flush()
    const first = batches[0].labels[0]

    // A second refresh with a different query, still in flight.
    ;(executor as any).getItemData = () => ({ structured_content: { query: 'select 2;' } })
    executor.runBatch(['a'])
    await flush()

    batches[0].succeed(first, [{ x: 1 }])
    expect(items.a.loading).toBe(true)

    // Only when the newer query lands does the spinner stop.
    const second = batches[1].labels[0]
    batches[1].succeed(second, [{ x: 2 }])
    expect(items.a.loading).toBe(false)
    expect(items.a.results).toEqual([{ x: 2 }])
  })

  it('surfaces the message from a batch-level failure payload', async () => {
    // The batch executor calls the per-query failure callbacks with two
    // different shapes. A batch-wide failure (resolution error, cancelled
    // batch, failed reconnect) sends a QueryUpdate, where `error` is the
    // boolean "this is an error" flag and the text is in `message` — reading
    // `error` blindly rendered the item as "Error true".
    const { executor, items, batches } = makeExecutor({ a: 'select 1;' })

    executor.runBatch(['a'])
    await flush()

    batches[0].failWith(batches[0].labels[0], {
      message: 'Connection failed to reconnect.',
      error: true,
      running: false,
    })

    expect(items.a.error).toBe('Connection failed to reconnect.')
    expect(items.a.loading).toBe(false)
  })

  it('clears an empty query immediately without queueing it', () => {
    const { executor, items, batches } = makeExecutor({ a: '   ' })

    executor.runBatch(['a'])

    expect(items.a.loading).toBe(false)
    expect(batches).toHaveLength(0)
  })

  /**
   * runSingle backs the per-item refresh button; runBatch backs the header's
   * refresh-all. They were near-duplicate bodies and only runBatch grew the
   * empty-query guard, so refreshing a query-less markdown item raised a
   * spinner nothing would ever lower. Both now share one enqueue path.
   */
  describe('items with no query', () => {
    it('settles a query-less item on runSingle instead of spinning forever', () => {
      const { executor, items, batches } = makeExecutor({ a: '' })

      expect(executor.runSingle('a')).toBeNull()
      expect(items.a.loading).toBe(false)
      expect(batches).toHaveLength(0)
    })

    it('omits query-less items from the ids runBatch reports', async () => {
      const { executor, items } = makeExecutor({ a: 'select 1;', b: '   ' })

      const queryIds = executor.runBatch(['a', 'b'])

      expect(queryIds).toHaveLength(1)
      expect(items.a.loading).toBe(true)
      expect(items.b.loading).toBe(false)
      await flush()
    })

    it('treats an item carrying only unstructured content as runnable', () => {
      // The guard and the request body have to read the same field: the guard
      // used to test structured_content.query while the request fell back to
      // `content`, so this shape threw on `.query` of undefined.
      const { executor, items } = makeExecutor({ a: 'select 1;' })
      ;(executor as any).getItemData = () => ({ content: 'select 1;' })

      expect(executor.runSingle('a')).not.toBeNull()
      expect(items.a.loading).toBe(true)
    })
  })

  it('runs a single query immediately rather than waiting for the batch sweep', async () => {
    const { executor, batches } = makeExecutor({ a: 'select 1;' })

    executor.runSingle('a')
    await flush()

    // runBatch would still be sitting behind its debounce here.
    expect(batches).toHaveLength(1)
  })
})
