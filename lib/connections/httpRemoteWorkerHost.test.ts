import { describe, it, expect, afterEach } from 'vitest'
import { tableFromArrays, tableToIPC } from 'apache-arrow'
import { createHttpRemoteWorkerHost } from './httpRemoteWorkerHost'
import RemoteWorkerConnection, {
  registerRemoteWorkerHost,
  setDefaultRemoteWorkerHost,
  type RemoteWorkerHost,
} from './remoteWorker'
import { newDatabricksConnection } from '../stores/connectionStore'

const BASE = 'https://engine.example'

function ipcBytes(): Uint8Array {
  return tableToIPC(tableFromArrays({ id: Int32Array.from([1, 2, 3]) }), 'stream')
}

interface Call {
  url: string
  headers: Record<string, string>
  body: any
}

type Responder = (call: Call) => Response | Promise<Response>

function fakeFetch(responder: Responder) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }
    calls.push(call)
    return responder(call)
  }) as typeof fetch
  return { calls, impl }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const arrow = (rows = 3) =>
  new Response(ipcBytes() as BodyInit, {
    status: 200,
    headers: { 'Content-Type': 'application/vnd.apache.arrow.stream', 'X-Row-Count': String(rows) },
  })

const connectOk = () =>
  json(200, { queryType: 'databricks', capabilities: { cancel: true, describe: true } })

function host(responder: Responder, getHeaders?: () => Record<string, string>) {
  const fetch = fakeFetch(responder)
  return {
    calls: fetch.calls,
    host: createHttpRemoteWorkerHost({
      getBaseUrl: () => BASE + '/',
      getHeaders,
      fetch: fetch.impl,
      pollDelayMs: 0,
    }),
  }
}

async function connect(h: RemoteWorkerHost, config: Record<string, any> = { engineKey: 'k1' }) {
  return (await h.connect({ connectionId: 'c', driver: 'databricks', config })).sessionId
}

describe('createHttpRemoteWorkerHost', () => {
  it('sends the engine key as a bearer and strips host-only fields from the config', async () => {
    const { host: h, calls } = host(() => connectOk())
    const result = await h.connect({
      connectionId: 'c',
      driver: 'databricks',
      config: { engineKey: 'k1', engineUrl: 'https://own.example/engine/', catalog: 'main' },
    })
    expect(result.queryType).toBe('databricks')
    expect(calls[0].url).toBe('https://own.example/engine/v1/connect')
    expect(calls[0].headers['Authorization']).toBe('Bearer k1')
    expect(calls[0].body).toEqual({ driver: 'databricks', config: { catalog: 'main' } })
  })

  it('submits, polls a 202, and hands the Arrow bytes to onBatch', async () => {
    let polls = 0
    const { host: h, calls } = host((call) => {
      if (call.url.endsWith('/v1/connect')) return connectOk()
      if (call.url.endsWith('/v1/statements')) return json(202, { statementId: 'st-1' })
      polls += 1
      return polls < 2 ? json(202, { statementId: 'st-1' }) : arrow()
    })
    const sessionId = await connect(h)
    const batches: Uint8Array[] = []
    const summary = await h.execute(
      { sessionId, sql: 'SELECT 1', parameters: { p0: 1 }, identifier: 'q1' },
      (b) => batches.push(b),
    )
    expect(summary.rowCount).toBe(3)
    expect(batches).toHaveLength(1)
    expect(calls.map((c) => c.url.replace(BASE, ''))).toEqual([
      '/v1/connect',
      '/v1/statements',
      '/v1/statements/st-1',
      '/v1/statements/st-1',
    ])
    // Every call carries the config (the server is stateless).
    expect(calls[1].body).toEqual({
      driver: 'databricks',
      config: {},
      sql: 'SELECT 1',
      parameters: { p0: 1 },
    })
    expect(calls[2].body).toEqual({ driver: 'databricks', config: {} })
  })

  it('cancels a running statement by id', async () => {
    const gate: { release: (() => void) | null } = { release: null }
    const { host: h, calls } = host(async (call) => {
      if (call.url.endsWith('/v1/connect')) return connectOk()
      if (call.url.endsWith('/cancel')) return json(200, { canceled: true })
      if (call.url.endsWith('/v1/statements')) return json(202, { statementId: 'st-9' })
      // Hold the poll until the test has issued the cancel.
      await new Promise<void>((resolve) => (gate.release = resolve))
      return json(409, { code: 'canceled', message: 'query canceled by user' })
    })
    const sessionId = await connect(h)
    const running = h.execute({ sessionId, sql: 'SELECT slow', identifier: 'q9' }, () => {})
    // Wait until the first poll is in flight, so the statement id is known.
    while (!gate.release) await new Promise((r) => setTimeout(r, 0))
    await expect(h.cancel(sessionId, 'q9')).resolves.toBe(true)
    gate.release!()
    await expect(running).rejects.toThrow('query canceled by user')
    expect(calls.some((c) => c.url === `${BASE}/v1/statements/st-9/cancel`)).toBe(true)
    // Unknown identifiers are a no-op.
    await expect(h.cancel(sessionId, 'nope')).resolves.toBe(false)
  })

  it('surfaces the server message, with a hint on 401', async () => {
    const { host: h } = host(() => json(401, { detail: 'Invalid engine API key.' }))
    await expect(connect(h)).rejects.toThrow('Invalid engine API key. Check the engine API key.')
  })

  it('explains a 404 as an engine that is not enabled', async () => {
    const { host: h } = host(() => json(404, { detail: 'Not Found' }))
    await expect(connect(h)).rejects.toThrow(/not have the engine enabled/)
  })

  it('reports an unknown session with the reconnect contract string', async () => {
    const { host: h } = host(() => connectOk())
    await expect(h.describeDatabases('gone')).rejects.toThrow('session not found: gone')
  })

  it('passes serve-token headers and describe arguments through', async () => {
    const { host: h, calls } = host(
      (call) => (call.url.endsWith('/v1/connect') ? connectOk() : json(200, [{ name: 'orders' }])),
      () => ({ 'X-Trilogy-Token': 'serve-tok' }),
    )
    const sessionId = await connect(h, {})
    await h.describeTables(sessionId, 'main', 'sales')
    expect(calls[1].url).toBe(`${BASE}/v1/describe/tables`)
    expect(calls[1].headers['X-Trilogy-Token']).toBe('serve-tok')
    expect(calls[1].headers['Authorization']).toBeUndefined()
    expect(calls[1].body).toEqual({
      driver: 'databricks',
      config: {},
      database: 'main',
      schema: 'sales',
    })
  })
})

describe('Databricks RemoteWorkerConnection on the web', () => {
  afterEach(() => {
    registerRemoteWorkerHost(null)
    setDefaultRemoteWorkerHost(null)
  })

  it('only declares the secrets that were entered', () => {
    expect(newDatabricksConnection('a', { engineKey: 'k' }).secretFields).toEqual(['engineKey'])
    const own = newDatabricksConnection('b', {
      engineKey: 'k',
      host: ' dbc-1.cloud.databricks.com ',
      httpPath: '/sql/1.0/warehouses/w',
      token: 't',
      catalog: '',
    })
    expect(own.secretFields).toEqual(['engineKey', 'token'])
    expect(own.config).toEqual({
      engineKey: 'k',
      host: 'dbc-1.cloud.databricks.com',
      httpPath: '/sql/1.0/warehouses/w',
      token: 't',
    })
    expect(own.type).toBe('remote-worker:databricks')
    expect(own.query_type).toBe('databricks')
  })

  it('stores several secrets as one credential and restores them', () => {
    const conn = newDatabricksConnection('b', {
      engineKey: 'k',
      host: 'h',
      httpPath: '/sql/1.0/warehouses/w',
      token: 't',
      saveCredential: true,
    })
    const secret = conn.getSecret()!
    expect(JSON.parse(secret)).toEqual({ engineKey: 'k', token: 't' })

    const persisted = conn.toJSON() as any
    expect(persisted.config.engineKey).toBe('saved')
    expect(persisted.config.token).toBe('saved')

    const restored = RemoteWorkerConnection.fromJSON(persisted)
    // Manager.vue restores only when getSecret() is the placeholder.
    expect(restored.getSecret()).toBe('saved')
    restored.setSecret(secret)
    expect(restored.config.engineKey).toBe('k')
    expect(restored.config.token).toBe('t')
  })

  it('clears a placeholder the stored credential does not cover', () => {
    const conn = newDatabricksConnection('b', { engineKey: 'k', host: 'h', token: 't' })
    conn.config = { ...conn.config, engineKey: 'saved', token: 'saved' }
    // A credential saved before the token existed: a bare engine key.
    conn.setSecret('k-only')
    expect(conn.config.engineKey).toBe('k-only')
    expect(conn.config.token).toBe('')
  })

  it('uses the default host only when no shell registered one', async () => {
    const used: string[] = []
    const fake = (name: string): RemoteWorkerHost =>
      ({
        async connect() {
          used.push(name)
          return {
            sessionId: 's',
            queryType: 'databricks',
            capabilities: { cancel: true, describe: true },
          }
        },
      }) as unknown as RemoteWorkerHost
    setDefaultRemoteWorkerHost(fake('http'))
    await newDatabricksConnection('a', { engineKey: 'k' }).connect()
    registerRemoteWorkerHost(fake('tauri'))
    await newDatabricksConnection('b', { engineKey: 'k' }).connect()
    expect(used).toEqual(['http', 'tauri'])
  })
})
