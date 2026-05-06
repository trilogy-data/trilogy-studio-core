import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tableFromArrays, tableToIPC } from 'apache-arrow'
import RemoteWorkerConnection, {
  type RemoteWorkerHost,
  registerRemoteWorkerHost,
} from './remoteWorker'
import { ColumnType } from '../editors/results'
import { AssetType } from './base'

// Build a real Arrow IPC stream so the test exercises tableFromIPC + the
// shared arrowResults helper end-to-end (i.e. catches any breakage in the
// decode path, not just protocol plumbing).
function makeIpcBytes(): Uint8Array {
  const table = tableFromArrays({
    id: Int32Array.from([1, 2, 3]),
    name: ['alpha', 'beta', 'gamma'],
  })
  return tableToIPC(table, 'stream')
}

interface MockState {
  connectArgs: any
  executeArgs: any
  cancelArgs: any
  disconnected: string[]
  ipcBytes: Uint8Array
  failExecute?: Error
}

function makeHost(state: MockState): RemoteWorkerHost {
  return {
    async connect(args) {
      state.connectArgs = args
      return {
        sessionId: 'session-xyz',
        queryType: 'duckdb',
        capabilities: { cancel: true, describe: true },
      }
    },
    async execute(req, onBatch) {
      state.executeArgs = req
      if (state.failExecute) throw state.failExecute
      // Emit in two chunks to verify accumulation.
      const half = Math.floor(state.ipcBytes.byteLength / 2)
      onBatch(state.ipcBytes.slice(0, half))
      onBatch(state.ipcBytes.slice(half))
      return { rowCount: 3, durationMs: 1 }
    },
    async cancel(sessionId, identifier) {
      state.cancelArgs = { sessionId, identifier }
      return true
    },
    async describeDatabases() {
      return [
        {
          name: 'main',
          schemas: [
            {
              name: 'public',
              database: 'main',
              tables: [
                {
                  name: 't',
                  schema: 'public',
                  database: 'main',
                  assetType: 'view',
                  columns: [
                    {
                      name: 'id',
                      type: 'INTEGER',
                      trilogyType: ColumnType.INTEGER,
                      nullable: false,
                      primary: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]
    },
    async describeSchemas(_sid, db) {
      return [{ name: 'public', database: db }]
    },
    async describeTables(_sid, db, schema) {
      return [
        {
          name: 't',
          database: db,
          schema: schema ?? 'public',
          assetType: 'table',
        },
      ]
    },
    async describeColumns() {
      return [
        {
          name: 'id',
          type: 'INTEGER',
          trilogyType: ColumnType.INTEGER,
          nullable: false,
        },
      ]
    },
    async describeTable(_sid, db, schema, table) {
      return {
        name: table,
        database: db,
        schema: schema ?? 'public',
        columns: [],
      }
    },
    async disconnect(sessionId) {
      state.disconnected.push(sessionId)
    },
  }
}

function freshState(): MockState {
  return {
    connectArgs: null,
    executeArgs: null,
    cancelArgs: null,
    disconnected: [],
    ipcBytes: makeIpcBytes(),
  }
}

describe('RemoteWorkerConnection', () => {
  beforeEach(() => {
    registerRemoteWorkerHost(null)
  })

  it('initializes with the driver-derived type and dialect', () => {
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb' })
    expect(conn.type).toBe('remote-worker:duckdb')
    expect(conn.query_type).toBe('duckdb')
  })

  it('throws on query if no host is registered', async () => {
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb' })
    await expect(
      conn.query_core('select 1', null, null),
    ).rejects.toThrow(/no host/i)
  })

  it('connect → query streams IPC bytes and returns Results', async () => {
    const state = freshState()
    const host = makeHost(state)
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb', host })

    await conn.connect()
    expect(state.connectArgs.driver).toBe('duckdb')
    expect(state.connectArgs.connectionId).toBe('local:cn')

    const results = await conn.query_core('select * from t', null, 'q1')
    expect(state.executeArgs.sessionId).toBe('session-xyz')
    expect(state.executeArgs.identifier).toBe('q1')

    expect(results.headers.size).toBe(2)
    expect(results.headers.get('id')?.type).toBe(ColumnType.INTEGER)
    expect(results.headers.get('name')?.type).toBe(ColumnType.STRING)
    expect(results.data.length).toBe(3)
    expect(results.data[0].id).toBe(1)
    expect(results.data[0].name).toBe('alpha')
    expect(results.data[2].name).toBe('gamma')
  })

  it('returns an empty Results when the host emits no batches', async () => {
    const state = freshState()
    const host: RemoteWorkerHost = {
      ...makeHost(state),
      async execute() {
        return { rowCount: 0, durationMs: 0 }
      },
    }
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb', host })
    await conn.connect()
    const results = await conn.query_core('select 1', null, null)
    expect(results.headers.size).toBe(0)
    expect(results.data.length).toBe(0)
  })

  it('surfaces execute errors', async () => {
    const state = freshState()
    state.failExecute = new Error('worker exploded')
    const conn = new RemoteWorkerConnection('cn', {
      driver: 'duckdb',
      host: makeHost(state),
    })
    await conn.connect()
    await expect(conn.query_core('select 1', null, null)).rejects.toThrow(
      'worker exploded',
    )
  })

  it('cancel forwards to the host with the session and identifier', async () => {
    const state = freshState()
    const conn = new RemoteWorkerConnection('cn', {
      driver: 'duckdb',
      host: makeHost(state),
    })
    await conn.connect()
    const ok = await conn.cancelQuery('q1')
    expect(ok).toBe(true)
    expect(state.cancelArgs).toEqual({ sessionId: 'session-xyz', identifier: 'q1' })
  })

  it('skips cancel and returns false when the worker reports no cancel support', async () => {
    const state = freshState()
    const host: RemoteWorkerHost = {
      ...makeHost(state),
      async connect() {
        return {
          sessionId: 's1',
          queryType: 'sqlite',
          capabilities: { cancel: false, describe: true },
        }
      },
      async cancel(sessionId, identifier) {
        state.cancelArgs = { sessionId, identifier }
        return true
      },
    }
    const conn = new RemoteWorkerConnection('cn', { driver: 'sqlite', host })
    await conn.connect()
    const ok = await conn.cancelQuery('q1')
    expect(ok).toBe(false)
    expect(state.cancelArgs).toBeNull()
  })

  it('describe APIs translate DTOs into lib model classes', async () => {
    const state = freshState()
    const conn = new RemoteWorkerConnection('cn', {
      driver: 'duckdb',
      host: makeHost(state),
    })
    await conn.connect()

    const dbs = await conn.getDatabases()
    expect(dbs.length).toBe(1)
    expect(dbs[0].name).toBe('main')
    expect(dbs[0].schemas[0].tables[0].assetType).toBe(AssetType.VIEW)

    const tables = await conn.getTables('main', 'public')
    expect(tables[0].assetType).toBe(AssetType.TABLE)

    const columns = await conn.getColumns('main', 'public', 't')
    expect(columns[0].name).toBe('id')
    expect(columns[0].trilogyType).toBe(ColumnType.INTEGER)
  })

  it('toJSON / fromJSON round-trips driver, config, and queryType', () => {
    const conn = new RemoteWorkerConnection('cn', {
      driver: 'postgres',
      config: { host: 'localhost', port: 5432, db: 'test' },
      queryType: 'postgres',
    })
    const json = conn.toJSON() as any
    expect(json).toEqual({
      id: 'local:cn',
      name: 'cn',
      type: 'remote-worker:postgres',
      model: null,
      driver: 'postgres',
      config: { host: 'localhost', port: 5432, db: 'test' },
      queryType: 'postgres',
    })
    const rehydrated = RemoteWorkerConnection.fromJSON(json)
    expect(rehydrated.driver).toBe('postgres')
    expect(rehydrated.config).toEqual({ host: 'localhost', port: 5432, db: 'test' })
    expect(rehydrated.query_type).toBe('postgres')
  })

  it('uses the registered host when no explicit host is passed', async () => {
    const state = freshState()
    registerRemoteWorkerHost(makeHost(state))
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb' })
    await conn.connect()
    expect(state.connectArgs.connectionId).toBe('local:cn')
  })

  it('delete() fires host.disconnect() with the session id', async () => {
    const state = freshState()
    const conn = new RemoteWorkerConnection('cn', {
      driver: 'duckdb',
      host: makeHost(state),
    })
    await conn.connect()
    conn.delete()
    // disconnect is fire-and-forget; flush the microtask queue.
    await new Promise((r) => setTimeout(r, 0))
    expect(state.disconnected).toEqual(['session-xyz'])
    expect(conn.deleted).toBe(true)
  })

  it('clears connected/sessionId when execute returns "session not found"', async () => {
    const state = freshState()
    const host: RemoteWorkerHost = {
      ...makeHost(state),
      async execute() {
        throw new Error('session not found: session-xyz')
      },
    }
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb', host })
    await conn.connect()
    conn.connected = true // simulate post-connect state from BaseConnection

    await expect(conn.query_core('select 1', null, 'q1')).rejects.toThrow(
      /session not found/,
    )
    expect(conn.connected).toBe(false)
    // Internal sessionId is private but we can prove it's cleared by
    // observing that the next query without reconnect throws our pre-check.
    await expect(conn.query_core('select 2', null, 'q2')).rejects.toThrow(
      /before connect/,
    )
  })

  it('clears connected when describeDatabases reports session not found', async () => {
    const state = freshState()
    const host: RemoteWorkerHost = {
      ...makeHost(state),
      async describeDatabases() {
        throw new Error('session not found: gone')
      },
    }
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb', host })
    await conn.connect()
    conn.connected = true

    await expect(conn.getDatabases()).rejects.toThrow(/session not found/)
    expect(conn.connected).toBe(false)
  })

  it('does NOT clear connected for unrelated execute errors', async () => {
    const state = freshState()
    state.failExecute = new Error('SQL parse error near "selct"')
    const conn = new RemoteWorkerConnection('cn', {
      driver: 'duckdb',
      host: makeHost(state),
    })
    await conn.connect()
    conn.connected = true

    await expect(conn.query_core('selct 1', null, 'q')).rejects.toThrow(
      /SQL parse error/,
    )
    // Connection is still live — the user should retry the query, not
    // reconnect the session.
    expect(conn.connected).toBe(true)
  })

  it('cancel returns false if the host throws session-not-found rather than tripping reconnect', async () => {
    const state = freshState()
    const host: RemoteWorkerHost = {
      ...makeHost(state),
      async cancel() {
        throw new Error('session not found: cancel after disconnect')
      },
    }
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb', host })
    await conn.connect()
    conn.connected = true

    const ok = await conn.cancelQuery('q-stale')
    expect(ok).toBe(false)
    // Crucial: a cancel against a dead session must not reset connection
    // state — there's no in-flight query to recover, and the user might be
    // mid-cleanup of UI state that depends on `connected` staying true.
    expect(conn.connected).toBe(true)
  })

  it('updates query_type from the host on connect', async () => {
    const state = freshState()
    const host: RemoteWorkerHost = {
      ...makeHost(state),
      async connect() {
        return {
          sessionId: 's',
          queryType: 'postgres',
          capabilities: { cancel: true, describe: true },
        }
      },
    }
    // Constructor-supplied driver is duckdb, but the host advertises
    // postgres. The host wins so the resolver targets the right dialect.
    const conn = new RemoteWorkerConnection('cn', { driver: 'duckdb', host })
    await conn.connect()
    expect(conn.query_type).toBe('postgres')
  })
})

// Make sure unused-vi import doesn't break tsc; vi is referenced above.
void vi
