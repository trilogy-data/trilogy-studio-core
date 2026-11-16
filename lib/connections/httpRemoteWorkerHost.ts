// HTTP RemoteWorkerHost: runs RemoteWorkerConnection queries on a remote
// engine (the engine/ service, or `trilogy serve`'s /engine) instead of an
// in-process bridge. This is how the web studio reaches warehouses the browser
// can't call directly; Databricks sends no CORS headers.
//
// The server is stateless (see engine/src/lib.rs): every call carries
// the connection config. The "session" lives here instead, as a sessionId →
// config map, so the RemoteWorkerHost interface is unchanged and a server
// restart or scale-to-zero costs nothing.
//
// Execute is submit-then-poll: POST /v1/statements answers with Arrow bytes or
// `202 {statementId}`, and we poll POST /v1/statements/{id} until bytes come
// back. Cancel uses the statement id, so it works wherever the poll lands.
//
// Two config keys belong to the host rather than the driver, and are stripped
// before the config goes on the wire:
//   - engineKey: the engine's API key, sent as `Authorization: Bearer`.
//   - engineUrl: overrides the base URL (e.g. a self-hosted engine).

import type {
  ArrowBatchHandler,
  RemoteColumnDTO,
  RemoteDatabaseDTO,
  RemoteSchemaDTO,
  RemoteTableDTO,
  RemoteWorkerConnectArgs,
  RemoteWorkerConnectResult,
  RemoteWorkerExecuteRequest,
  RemoteWorkerExecuteSummary,
  RemoteWorkerHost,
} from './remoteWorker'

export const ENGINE_KEY_FIELD = 'engineKey'
export const ENGINE_URL_FIELD = 'engineUrl'

export interface HttpRemoteWorkerHostOptions {
  /** Engine base URL, without the `/v1` suffix. Read on every call. */
  getBaseUrl: () => string
  /** Extra headers on every call (e.g. `X-Trilogy-Token` for `trilogy serve`). */
  getHeaders?: () => Record<string, string>
  fetch?: typeof fetch
  /** Pause between polls of a running statement, in ms. */
  pollDelayMs?: number
}

interface Session {
  driver: string
  config: Record<string, any>
  baseUrl: string
  apiKey: string | null
}

interface RunningStatement {
  sessionId: string
  statementId: string | null
  canceled: boolean
}

export class EngineRequestError extends Error {
  status: number
  code: string | null
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'EngineRequestError'
    this.status = status
    this.code = code
  }
}

const CANCELED_MESSAGE = 'query canceled by user'

function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function newSessionId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `http-${random}`
}

export function createHttpRemoteWorkerHost(options: HttpRemoteWorkerHostOptions): RemoteWorkerHost {
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const pollDelayMs = options.pollDelayMs ?? 250
  const sessions = new Map<string, Session>()
  const running = new Map<string, RunningStatement>()

  function sessionFor(sessionId: string): Session {
    const session = sessions.get(sessionId)
    // Same prefix as the Rust bridge's SessionNotFound: RemoteWorkerConnection
    // matches on it to reconnect.
    if (!session) throw new Error(`session not found: ${sessionId}`)
    return session
  }

  async function call(
    session: Pick<Session, 'baseUrl' | 'apiKey'>,
    path: string,
    body: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.getHeaders?.() ?? {}),
    }
    if (session.apiKey) headers['Authorization'] = `Bearer ${session.apiKey}`
    let response: Response
    try {
      response = await fetchImpl(`${session.baseUrl}/v1${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw new Error(
        `Could not reach the query engine at ${session.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (!response.ok) {
      throw await toError(response, session.baseUrl)
    }
    return response
  }

  async function toError(response: Response, baseUrl: string): Promise<EngineRequestError> {
    let message = ''
    let code: string | null = null
    try {
      const payload = await response.json()
      message = payload?.message ?? payload?.detail ?? ''
      code = payload?.code ?? null
    } catch {
      // Non-JSON body: fall through to the status line.
    }
    if (response.status === 404 && !code) {
      message = `No query engine at ${baseUrl} (HTTP 404). The server may not have the engine enabled.`
    } else if (response.status === 401) {
      message = `${message || 'Unauthorized'} Check the engine API key.`
    }
    return new EngineRequestError(
      message || `Query engine request failed (HTTP ${response.status})`,
      response.status,
      code,
    )
  }

  function payload(session: Session, extra: Record<string, unknown> = {}) {
    return { driver: session.driver, config: session.config, ...extra }
  }

  async function readArrow(
    response: Response,
    onBatch: ArrowBatchHandler,
    started: number,
  ): Promise<RemoteWorkerExecuteSummary> {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > 0) onBatch(bytes)
    return {
      rowCount: Number(response.headers.get('X-Row-Count') ?? 0),
      durationMs: Math.round(performance.now() - started),
    }
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  async function describe<T>(
    sessionId: string,
    kind: string,
    fields: Record<string, unknown>,
  ): Promise<T> {
    const session = sessionFor(sessionId)
    const response = await call(session, `/describe/${kind}`, payload(session, fields))
    return (await response.json()) as T
  }

  return {
    async connect(args: RemoteWorkerConnectArgs): Promise<RemoteWorkerConnectResult> {
      const {
        [ENGINE_KEY_FIELD]: apiKey,
        [ENGINE_URL_FIELD]: engineUrl,
        ...config
      } = args.config ?? {}
      const baseUrl = trimBase(engineUrl || options.getBaseUrl())
      if (!baseUrl) throw new Error('No query engine URL configured.')
      const session: Session = { driver: args.driver, config, baseUrl, apiKey: apiKey || null }
      const response = await call(session, '/connect', payload(session))
      const result = await response.json()
      const sessionId = newSessionId()
      sessions.set(sessionId, session)
      return {
        sessionId,
        queryType: result.queryType ?? args.driver,
        capabilities: result.capabilities ?? { cancel: true, describe: true },
      }
    },

    async execute(
      request: RemoteWorkerExecuteRequest,
      onBatch: ArrowBatchHandler,
    ): Promise<RemoteWorkerExecuteSummary> {
      const session = sessionFor(request.sessionId)
      const started = performance.now()
      const state: RunningStatement = {
        sessionId: request.sessionId,
        statementId: null,
        canceled: false,
      }
      running.set(request.identifier, state)
      try {
        let response = await call(
          session,
          '/statements',
          payload(session, { sql: request.sql, parameters: request.parameters ?? null }),
        )
        while (response.status === 202) {
          const { statementId } = await response.json()
          state.statementId = statementId
          if (state.canceled) {
            await call(
              session,
              `/statements/${encodeURIComponent(statementId)}/cancel`,
              payload(session),
            ).catch(() => undefined)
            throw new Error(CANCELED_MESSAGE)
          }
          await sleep(pollDelayMs)
          response = await call(
            session,
            `/statements/${encodeURIComponent(statementId)}`,
            payload(session),
          )
        }
        if (state.canceled) throw new Error(CANCELED_MESSAGE)
        return await readArrow(response, onBatch, started)
      } catch (err) {
        if (err instanceof EngineRequestError && err.code === 'canceled') {
          throw new Error(CANCELED_MESSAGE)
        }
        throw err
      } finally {
        running.delete(request.identifier)
      }
    },

    async executeScript(sessionId: string, sql: string): Promise<void> {
      const session = sessionFor(sessionId)
      await call(session, '/script', payload(session, { sql }))
    },

    async cancel(sessionId: string, identifier: string): Promise<boolean> {
      const state = running.get(identifier)
      if (!state || state.sessionId !== sessionId) return false
      state.canceled = true
      // Not submitted yet (or still inside the first wait): the execute loop
      // cancels as soon as it learns the statement id.
      if (!state.statementId) return true
      const session = sessionFor(sessionId)
      await call(
        session,
        `/statements/${encodeURIComponent(state.statementId)}/cancel`,
        payload(session),
      )
      return true
    },

    describeDatabases(sessionId: string): Promise<RemoteDatabaseDTO[]> {
      return describe(sessionId, 'databases', {})
    },
    describeSchemas(sessionId: string, database: string): Promise<RemoteSchemaDTO[]> {
      return describe(sessionId, 'schemas', { database })
    },
    describeTables(
      sessionId: string,
      database: string,
      schema: string | null,
    ): Promise<RemoteTableDTO[]> {
      return describe(sessionId, 'tables', { database, schema })
    },
    describeColumns(
      sessionId: string,
      database: string,
      schema: string,
      table: string,
    ): Promise<RemoteColumnDTO[]> {
      return describe(sessionId, 'columns', { database, schema, table })
    },
    describeTable(
      sessionId: string,
      database: string,
      schema: string | null,
      table: string,
    ): Promise<RemoteTableDTO> {
      return describe(sessionId, 'table', { database, schema, table })
    },

    async disconnect(sessionId: string): Promise<void> {
      sessions.delete(sessionId)
    },
  }
}
