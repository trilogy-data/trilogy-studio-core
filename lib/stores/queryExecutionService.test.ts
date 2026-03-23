import { describe, expect, it, vi } from 'vitest'
import QueryExecutionService, {
  type ExecutionConnection,
  type ExecutionConnectionProvider,
} from './queryExecutionService'
import { Results, ColumnType } from '../editors/results'

function makeProvider(options: {
  connected?: boolean
  queryType?: string
  queryResult?: Results
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
  }

  const provider: ExecutionConnectionProvider = {
    getConnection: vi.fn((connectionId: string) =>
      connectionId === 'worker-duckdb' ? connection : null,
    ),
    ensureConnected,
    getConnectionSources: vi.fn(() => [{ alias: 'core', contents: 'const source <- 1;' }]),
  }

  return {
    provider,
    executeSql,
    ensureConnected,
  }
}

describe('QueryExecutionService', () => {
  it('executes queries through a pluggable execution provider', async () => {
    const resolver = {
      resolve_query: vi.fn(async (...args: any[]) => ({
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
    )
    expect(executeSql).toHaveBeenCalledWith('select 1 as value', undefined)
    expect(result.success).toBe(true)
    expect(result.results?.data).toEqual([{ value: 1 }])
  })

  it('creates drilldown queries through provider-derived connection metadata', async () => {
    const resolver = {
      drilldown_query: vi.fn(async (...args: any[]) => ({
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
    )
    expect(result).toBe('drilldown query')
  })
})
