import { describe, expect, it, vi } from 'vitest'
import QueryExecutionService, {
  ConnectionStoreExecutionConnectionProvider,
  type ExecutionConnection,
  type ExecutionConnectionProvider,
} from './queryExecutionService'
import { Results, ColumnType } from '../editors/results'

function makeProvider(options: {
  connected?: boolean
  queryType?: string
  queryResult?: Results
  registeredFiles?: string[]
  registeredFilesOverride?: string[] | null
}) {
  const queryResult =
    options.queryResult ||
    new Results(
      new Map([
        [
          'value',
          {
            name: 'value',
            type: ColumnType.NUMBER,
          },
        ],
      ]),
      [{ value: 1 }],
    )

  const state = {
    connected: options.connected ?? false,
  }

  const executeSql = vi.fn(async () => queryResult)
  const ensureConnected = vi.fn(async () => {
    state.connected = true
  })

  const connection: ExecutionConnection = {
    name: 'worker-duckdb',
    queryType: options.queryType ?? 'duckdb',
    isConnected: () => state.connected,
    executeSql,
    listRegisteredFiles: () => options.registeredFiles ?? [],
  }

  const provider: ExecutionConnectionProvider = {
    getConnection: vi.fn((connectionId: string) =>
      connectionId === 'worker-duckdb' ? connection : null,
    ),
    ensureConnected,
    getConnectionSources: vi.fn(() => [{ alias: 'core', contents: 'const source <- 1;' }]),
  }

  // Caller can opt into a host-side file-list override (the explorer's
  // workspace-driven flow). `undefined` means "don't define the hook" — this
  // exercises the optional-chaining fallback to the connection's own list.
  if (options.registeredFilesOverride !== undefined) {
    provider.getConnectionRegisteredFiles = vi.fn(() => options.registeredFilesOverride ?? null)
  }

  return {
    provider,
    executeSql,
    ensureConnected,
    connection,
  }
}

describe('QueryExecutionService', () => {
  it('executes queries through a pluggable execution provider', async () => {
    const resolver = {
      resolve_query: vi.fn(async () => ({
        data: {
          generated_sql: 'select 1 as value',
          columns: [{ name: 'value', purpose: 'metric' }],
          generated_output: null,
          select_count: 1,
        },
      })),
    } as any
    const { provider, executeSql, ensureConnected } = makeProvider({ connected: false })
    const service = new QueryExecutionService(resolver, provider, false)

    const { resultPromise } = await service.executeQuery('worker-duckdb', {
      text: 'select value',
      editorType: 'trilogy',
      imports: [{ name: 'core', alias: 'core' }],
      extraContent: [{ alias: 'dashboard', contents: 'const dashboard <- 2;' }],
    })

    const result = await resultPromise

    expect(ensureConnected).toHaveBeenCalledWith('worker-duckdb')
    expect(resolver.resolve_query).toHaveBeenCalledWith(
      'select value',
      'duckdb',
      'trilogy',
      [
        { alias: 'core', contents: 'const source <- 1;' },
        { alias: 'dashboard', contents: 'const dashboard <- 2;' },
      ],
      [{ name: 'core', alias: 'core' }],
      undefined,
      undefined,
      null,
      null,
      null,
    )
    expect(executeSql).toHaveBeenCalledWith('select 1 as value', null)
    expect(result.success).toBe(true)
    expect(result.results?.data).toEqual([{ value: 1 }])
  })

  it('calls failure callbacks when the connection id cannot be resolved', async () => {
    const resolver = {
      resolve_query: vi.fn(),
    } as any
    const { provider } = makeProvider({ connected: true })
    const service = new QueryExecutionService(resolver, provider, false)
    const onFailure = vi.fn()

    const { resultPromise } = await service.executeQuery(
      'missing-connection',
      {
        text: 'select value',
        editorType: 'trilogy',
        imports: [],
      },
      undefined,
      undefined,
      onFailure,
    )

    const result = await resultPromise

    expect(result.success).toBe(false)
    expect(result.error).toBe('Connection missing-connection not found.')
    expect(onFailure).toHaveBeenCalledWith({
      message: 'Connection missing-connection not found.',
      error: true,
      running: false,
    })
    expect(resolver.resolve_query).not.toHaveBeenCalled()
  })

  it('creates drilldown queries through provider-derived connection metadata', async () => {
    const resolver = {
      drilldown_query: vi.fn(async () => ({
        data: {
          text: 'drilldown query',
        },
      })),
    } as any
    const { provider } = makeProvider({ connected: true, queryType: 'duckdb' })
    const service = new QueryExecutionService(resolver, provider, false)

    const result = await service.createConnectionDrilldownQuery(
      'worker-duckdb',
      'select value',
      'trilogy',
      [{ name: 'core', alias: 'core' }],
      ['dimension'],
      'old_dimension',
      'value = 1',
      [{ alias: 'core', contents: 'const source <- 1;' }],
    )

    expect(resolver.drilldown_query).toHaveBeenCalledWith(
      'select value',
      'duckdb',
      'trilogy',
      'old_dimension',
      ['dimension'],
      'value = 1',
      [{ alias: 'core', contents: 'const source <- 1;' }],
      [{ name: 'core', alias: 'core' }],
      null,
      null,
      null,
      null,
      null,
    )
    expect(result).toBe('drilldown query')
  })

  it('resolves and caches eligible cross-filter fields from validation completions', async () => {
    const resolver = {
      validate_query: vi.fn(async () => ({
        data: {
          items: [],
          imports: [],
          completion_items: [{ label: 'species' }, { label: 'tree_count' }, { label: 'species' }],
        },
      })),
    } as any
    const { provider } = makeProvider({ connected: true })
    const service = new QueryExecutionService(resolver, provider, false)

    const first = await service.getEligibleCrossFilterFields('worker-duckdb', {
      imports: [{ name: 'core', alias: 'core' }],
      extraContent: [{ alias: 'dashboard', contents: 'const dashboard <- 2;' }],
    })
    const second = await service.getEligibleCrossFilterFields('worker-duckdb', {
      imports: [{ name: 'core', alias: 'core' }],
      extraContent: [{ alias: 'dashboard', contents: 'const dashboard <- 2;' }],
    })

    expect(first).toEqual(['species', 'tree_count'])
    expect(second).toEqual(['species', 'tree_count'])
    expect(resolver.validate_query).toHaveBeenCalledTimes(1)
    expect(resolver.validate_query).toHaveBeenCalledWith(
      'select 1 as cross_filter_probe;',
      [
        { alias: 'core', contents: 'const source <- 1;' },
        { alias: 'dashboard', contents: 'const dashboard <- 2;' },
      ],
      [{ name: 'core', alias: 'core' }],
      [],
      null,
      null,
      null,
      null,
      null,
    )
  })

  describe('resolver file hints', () => {
    // Position of the `files` arg in resolve_query's positional call signature.
    // Pinned here so a refactor that reorders args fails loudly here instead
    // of silently passing the wrong field through to the resolver.
    const FILES_ARG_INDEX = 8

    function makeResolver() {
      return {
        resolve_query: vi.fn(async () => ({
          data: {
            generated_sql: 'select 1 as value',
            columns: [{ name: 'value', purpose: 'metric' }],
            generated_output: null,
            select_count: 1,
          },
        })),
      } as any
    }

    it('uses the provider override when set, ignoring the connection list', async () => {
      const resolver = makeResolver()
      // Connection reports its own list; the override should win.
      const { provider } = makeProvider({
        connected: true,
        registeredFiles: ['engine-side.csv'],
        registeredFilesOverride: ['movies.csv', 'ratings.csv'],
      })
      const service = new QueryExecutionService(resolver, provider, false)

      const { resultPromise } = await service.executeQuery('worker-duckdb', {
        text: 'select value',
        editorType: 'trilogy',
        imports: [],
      })
      await resultPromise

      const filesArg = resolver.resolve_query.mock.calls[0][FILES_ARG_INDEX]
      expect(filesArg).toEqual(['movies.csv', 'ratings.csv'])
    })

    it('falls back to the connection list when the provider returns null', async () => {
      const resolver = makeResolver()
      const { provider } = makeProvider({
        connected: true,
        registeredFiles: ['movies.csv'],
        registeredFilesOverride: null,
      })
      const service = new QueryExecutionService(resolver, provider, false)

      const { resultPromise } = await service.executeQuery('worker-duckdb', {
        text: 'select value',
        editorType: 'trilogy',
        imports: [],
      })
      await resultPromise

      const filesArg = resolver.resolve_query.mock.calls[0][FILES_ARG_INDEX]
      expect(filesArg).toEqual(['movies.csv'])
    })

    it('falls back to the connection list when the provider has no override hook', async () => {
      const resolver = makeResolver()
      // No `registeredFilesOverride` key → the provider doesn't define
      // getConnectionRegisteredFiles at all (the studio's default shape).
      const { provider } = makeProvider({
        connected: true,
        registeredFiles: ['legacy.csv'],
      })
      const service = new QueryExecutionService(resolver, provider, false)

      const { resultPromise } = await service.executeQuery('worker-duckdb', {
        text: 'select value',
        editorType: 'trilogy',
        imports: [],
      })
      await resultPromise

      const filesArg = resolver.resolve_query.mock.calls[0][FILES_ARG_INDEX]
      expect(filesArg).toEqual(['legacy.csv'])
    })

    it('passes null to the resolver when the override is an empty list', async () => {
      const resolver = makeResolver()
      // Empty array from the override means "the host knows there are no
      // files" — that's still authoritative; we shouldn't fall through to
      // the connection's list in that case.
      const { provider } = makeProvider({
        connected: true,
        registeredFiles: ['should-not-leak.csv'],
        registeredFilesOverride: [],
      })
      const service = new QueryExecutionService(resolver, provider, false)

      const { resultPromise } = await service.executeQuery('worker-duckdb', {
        text: 'select value',
        editorType: 'trilogy',
        imports: [],
      })
      await resultPromise

      const filesArg = resolver.resolve_query.mock.calls[0][FILES_ARG_INDEX]
      expect(filesArg).toBeNull()
    })
  })

  describe('ConnectionStoreExecutionConnectionProvider', () => {
    function fakeConnectionStore(connections: Record<string, any>) {
      return {
        connections,
        getConnectionSources: vi.fn(() => []),
        resetConnection: vi.fn(),
      } as any
    }

    it('routes file hints through the filesResolver when provided', () => {
      const store = fakeConnectionStore({
        'worker-duckdb': {
          name: 'worker-duckdb',
          query_type: 'duckdb',
          connected: true,
          query: vi.fn(),
          listRegisteredFiles: () => ['from-engine.csv'],
        },
      })
      const filesResolver = vi.fn(() => ['movies.csv', 'ratings.csv'])
      const provider = new ConnectionStoreExecutionConnectionProvider(
        store,
        undefined,
        undefined,
        filesResolver,
      )

      expect(provider.getConnectionRegisteredFiles('worker-duckdb')).toEqual([
        'movies.csv',
        'ratings.csv',
      ])
      expect(filesResolver).toHaveBeenCalledWith('worker-duckdb')
    })

    it('returns null when no filesResolver is provided so QES falls through to the connection', () => {
      const store = fakeConnectionStore({})
      const provider = new ConnectionStoreExecutionConnectionProvider(store)

      expect(provider.getConnectionRegisteredFiles('any-id')).toBeNull()
    })
  })
})
