// RemoteWorkerConnection — connects to an out-of-process driver hosted by
// the embedding shell (e.g. a Tauri sidecar / Rust worker). The lib defines
// the connection abstraction and the host interface; the shell registers a
// concrete host implementation at boot. This keeps lib free of Tauri /
// Electron / WebSocket specifics, mirroring the existing KvBackend pattern.
//
// Wire model:
//   1. connect()   → host.connect({connectionId, driver, config}) → sessionId
//   2. query_core  → host.execute({sessionId, sql, params, id}, onBatch)
//                    The host streams Arrow IPC bytes to onBatch; we
//                    accumulate, decode, and run them through the shared
//                    arrowResults helper to produce a Results.
//   3. cancel      → host.cancel(sessionId, id) (driver-specific interrupt)
//   4. describe_*  → introspection used by the connection panel UI
//   5. delete()    → host.disconnect(sessionId)

import { tableFromIPC } from 'apache-arrow'
import BaseConnection, { Database, Schema, Table, Column, AssetType } from './base'
import { Results, ColumnType } from '../editors/results'
import { arrowBatchesToResults } from './arrowResults'

// --- Host adapter ----------------------------------------------------------

export interface RemoteWorkerCapabilities {
  cancel: boolean
  describe: boolean
}

export interface RemoteWorkerConnectArgs {
  connectionId: string
  driver: string
  config: Record<string, any>
}

export interface RemoteWorkerConnectResult {
  sessionId: string
  // Trilogy dialect the worker speaks ('duckdb' | 'postgres' | 'sqlite' | …).
  // Drives which SQL the resolver compiles to.
  queryType: string
  capabilities: RemoteWorkerCapabilities
}

export interface RemoteWorkerExecuteRequest {
  sessionId: string
  sql: string
  parameters?: Record<string, any> | null
  identifier: string
}

export interface RemoteWorkerExecuteSummary {
  rowCount: number
  durationMs: number
}

export type ArrowBatchHandler = (ipcBytes: Uint8Array) => void

export interface RemoteDatabaseDTO {
  name: string
  schemas?: RemoteSchemaDTO[]
}

export interface RemoteSchemaDTO {
  name: string
  database: string
  description?: string | null
  tables?: RemoteTableDTO[]
}

export interface RemoteTableDTO {
  name: string
  schema: string
  database: string
  description?: string | null
  assetType?: 'table' | 'view'
  columns?: RemoteColumnDTO[]
}

export interface RemoteColumnDTO {
  name: string
  type: string
  trilogyType: ColumnType
  nullable?: boolean
  primary?: boolean
  unique?: boolean
  default?: string | null
  autoincrement?: boolean
  description?: string | null
}

export interface RemoteWorkerHost {
  connect(args: RemoteWorkerConnectArgs): Promise<RemoteWorkerConnectResult>

  execute(
    request: RemoteWorkerExecuteRequest,
    onBatch: ArrowBatchHandler,
  ): Promise<RemoteWorkerExecuteSummary>

  /**
   * Run a SQL string for side effects only — no result rows. Used for
   * connection startup scripts (multi-statement DDL like `CREATE TEMP TABLE
   * …; CREATE TEMP TABLE …;`) where the worker's prepare/query_arrow path
   * doesn't apply because duckdb-rs's `prepare()` is single-statement only.
   * Optional on hosts that don't expose a batch path.
   */
  executeScript?(sessionId: string, sql: string): Promise<void>

  cancel(sessionId: string, identifier: string): Promise<boolean>

  describeDatabases(sessionId: string): Promise<RemoteDatabaseDTO[]>
  describeSchemas(sessionId: string, database: string): Promise<RemoteSchemaDTO[]>
  describeTables(
    sessionId: string,
    database: string,
    schema: string | null,
  ): Promise<RemoteTableDTO[]>
  describeColumns(
    sessionId: string,
    database: string,
    schema: string,
    table: string,
  ): Promise<RemoteColumnDTO[]>
  describeTable(
    sessionId: string,
    database: string,
    schema: string | null,
    table: string,
  ): Promise<RemoteTableDTO>

  disconnect(sessionId: string): Promise<void>

  /**
   * Tell the remote engine which directory to resolve relative file
   * references against — i.e. what `read_csv('foo.csv')` (basename, the
   * shape the trilogy resolver renders for explorer queries) should be
   * anchored at. The DuckDB worker maps this to `SET file_search_path`;
   * other drivers may no-op. Optional on hosts that don't ship a driver
   * with a notion of file CWD.
   */
  setWorkingDirectory?(sessionId: string, directory: string): Promise<void>
}

// --- Host registration -----------------------------------------------------

let registeredHost: RemoteWorkerHost | null = null

// Embedding shells call this once at boot so subsequent fromJSON-rehydrated
// connections can locate the worker bridge without each call site threading
// the host through. Tests pass a host directly to the constructor instead.
export function registerRemoteWorkerHost(host: RemoteWorkerHost | null): void {
  registeredHost = host
}

export function getRemoteWorkerHost(): RemoteWorkerHost | null {
  return registeredHost
}

// --- Connection ------------------------------------------------------------

export interface RemoteWorkerConnectionOptions {
  driver: string
  config?: Record<string, any>
  // Optional override for the SQL dialect the resolver should target.
  // Normally queryType is supplied by the host on connect; this lets the
  // caller persist a known dialect and skip the connect-time roundtrip
  // when rehydrating offline.
  queryType?: string
  host?: RemoteWorkerHost
}

function fromColumnDTO(dto: RemoteColumnDTO): Column {
  return new Column(
    dto.name,
    dto.type,
    dto.trilogyType,
    dto.nullable ?? true,
    dto.primary ?? false,
    dto.unique ?? false,
    dto.default ?? null,
    dto.autoincrement ?? false,
    dto.description ?? null,
  )
}

function fromTableDTO(dto: RemoteTableDTO): Table {
  const columns = (dto.columns ?? []).map(fromColumnDTO)
  return new Table(
    dto.name,
    dto.schema,
    dto.database,
    columns,
    dto.description ?? null,
    dto.assetType === 'view' ? AssetType.VIEW : AssetType.TABLE,
  )
}

function fromSchemaDTO(dto: RemoteSchemaDTO): Schema {
  const tables = (dto.tables ?? []).map(fromTableDTO)
  return new Schema(dto.name, tables, dto.database, dto.description ?? null)
}

function fromDatabaseDTO(dto: RemoteDatabaseDTO): Database {
  const schemas = (dto.schemas ?? []).map(fromSchemaDTO)
  return new Database(dto.name, schemas)
}

export default class RemoteWorkerConnection extends BaseConnection {
  driver: string
  config: Record<string, any>
  private sessionId: string | null = null
  private capabilities: RemoteWorkerCapabilities | null = null
  private explicitHost: RemoteWorkerHost | null
  // The directory the engine should resolve `read_csv('foo.csv')`-style
  // basename file references against. The host pushes this whenever the
  // owning project's directory changes; we cache it here so a reconnect
  // (idle reap, worker restart) re-applies it transparently.
  private pendingWorkingDirectory: string | null = null

  constructor(name: string, opts: RemoteWorkerConnectionOptions, model?: string) {
    super(name, `remote-worker:${opts.driver}`, false, model)
    this.driver = opts.driver
    this.config = opts.config ?? {}
    this.query_type = opts.queryType || opts.driver
    this.explicitHost = opts.host ?? null
  }

  // Push the working directory through to the remote worker. Stores the
  // value either way so we can re-apply on reconnect. No-op when the host
  // doesn't implement the optional method (drivers without a file CWD
  // notion). Errors during push are swallowed — the working directory is a
  // hint, not a correctness boundary; if the host loses it we'll just see
  // a "file not found" at query time, which is the same failure mode as
  // before the call.
  async setWorkingDirectory(directory: string): Promise<void> {
    this.pendingWorkingDirectory = directory
    console.log(
      `[setWorkingDirectory] conn=${this.name} sessionId=${this.sessionId} dir=${directory}`,
    )
    if (!this.sessionId) {
      console.log(`[setWorkingDirectory] cached (not connected yet)`)
      return
    }
    const host = this.explicitHost ?? registeredHost
    if (!host || typeof host.setWorkingDirectory !== 'function') {
      console.log(`[setWorkingDirectory] host has no setWorkingDirectory — skipping`)
      return
    }
    try {
      await host.setWorkingDirectory(this.sessionId, directory)
      console.log(`[setWorkingDirectory] pushed OK to host`)
    } catch (err) {
      console.warn(`RemoteWorkerConnection "${this.name}" failed to set working directory: ${err}`)
    }
  }

  static fromJSON(fields: {
    name: string
    driver: string
    config?: Record<string, any>
    queryType?: string
    model?: string | null
  }): RemoteWorkerConnection {
    return new RemoteWorkerConnection(
      fields.name,
      {
        driver: fields.driver,
        config: fields.config ?? {},
        queryType: fields.queryType,
      },
      fields.model || undefined,
    )
  }

  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      model: this.model,
      driver: this.driver,
      config: this.config,
      queryType: this.query_type,
    }
  }

  private resolveHost(): RemoteWorkerHost {
    const host = this.explicitHost ?? registeredHost
    if (!host) {
      throw new Error(
        `RemoteWorkerConnection "${this.name}" has no host. Call registerRemoteWorkerHost() before connecting.`,
      )
    }
    return host
  }

  // Recognize the stable error string emitted by the Rust BridgeError::SessionNotFound
  // (see protocol.rs — the prefix is contracted, don't drift). When the host
  // reports the session is gone (idle reaped / worker restart / desync), drop
  // local state so the lib's existing reconnect path (ensureConnected →
  // resetConnection → connect) re-establishes a fresh session on the next call.
  private isSessionNotFoundError(err: unknown): boolean {
    if (!err) return false
    const msg = err instanceof Error ? err.message : String(err)
    return /session not found/i.test(msg)
  }

  private async withSessionRecovery<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (err) {
      if (this.isSessionNotFoundError(err)) {
        // Tear down: the next query() call will see connected=false and
        // route through QueryExecutionService's ensureConnected hook.
        this.sessionId = null
        this.connected = false
      }
      throw err
    }
  }

  async connect(): Promise<boolean> {
    const host = this.resolveHost()
    const res = await host.connect({
      connectionId: this.id,
      driver: this.driver,
      config: this.config,
    })
    this.sessionId = res.sessionId
    if (res.queryType) {
      this.query_type = res.queryType
    }
    this.capabilities = res.capabilities
    // Re-apply any working directory the host pushed before we had a
    // session (first-run / reconnect after idle reap). Best-effort.
    if (this.pendingWorkingDirectory !== null && typeof host.setWorkingDirectory === 'function') {
      console.log(
        `[setWorkingDirectory] re-applying on connect: dir=${this.pendingWorkingDirectory} sessionId=${res.sessionId}`,
      )
      try {
        await host.setWorkingDirectory(res.sessionId, this.pendingWorkingDirectory)
        console.log(`[setWorkingDirectory] re-apply on connect OK`)
      } catch (err) {
        console.warn(
          `RemoteWorkerConnection "${this.name}" failed to re-apply working directory on connect: ${err}`,
        )
      }
    } else {
      console.log(
        `[setWorkingDirectory] connect: no cached dir to re-apply (pending=${this.pendingWorkingDirectory}, hostHasMethod=${typeof host.setWorkingDirectory === 'function'})`,
      )
    }
    return true
  }

  async query_core(
    sql: string,
    parameters: Record<string, any> | null,
    identifier: string | null,
  ): Promise<Results> {
    const host = this.resolveHost()
    if (!this.sessionId) {
      throw new Error('RemoteWorkerConnection.query_core called before connect.')
    }
    const sessionId = this.sessionId
    const id = identifier || `rwc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const chunks: Uint8Array[] = []
    await this.withSessionRecovery(() =>
      host.execute(
        {
          sessionId,
          sql,
          parameters,
          identifier: id,
        },
        (bytes) => {
          if (bytes && bytes.byteLength > 0) chunks.push(bytes)
        },
      ),
    )
    if (chunks.length === 0) {
      return new Results(new Map(), [])
    }
    const decodeStart = performance.now()
    const total = chunks.reduce((acc, c) => acc + c.byteLength, 0)
    const all = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      all.set(c, offset)
      offset += c.byteLength
    }
    const afterConcat = performance.now()
    const table = tableFromIPC(all)
    const afterIpc = performance.now()
    const results = arrowBatchesToResults(table.batches as any)
    const end = performance.now()
    console.debug(
      `[remote_decode] id=${id} concat=${(afterConcat - decodeStart).toFixed(2)}ms tableFromIPC=${(afterIpc - afterConcat).toFixed(2)}ms toResults=${(end - afterIpc).toFixed(2)}ms total=${(end - decodeStart).toFixed(2)}ms bytes=${total}`,
    )
    return results
  }

  // Multi-statement DDL goes through the host's executeScript path, which on
  // the rust worker hits `conn.execute_batch(sql)`. The default `query()`
  // path goes through `prepare()` which is single-statement only in
  // duckdb-rs 1.3.2, so a startup script with several `CREATE TEMP TABLE`
  // statements would fail there.
  override async runScript(sql: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('RemoteWorkerConnection.runScript called before connect.')
    }
    const host = this.resolveHost()
    if (typeof host.executeScript !== 'function') {
      // Host doesn't expose a batch path — fall back to the query path. The
      // caller will see a multi-statement error if the script needs it.
      await this.query(sql)
      return
    }
    const sessionId = this.sessionId
    await this.withSessionRecovery(() => host.executeScript!(sessionId, sql))
  }

  async cancelQuery(identifier: string): Promise<boolean> {
    if (!this.sessionId) return false
    if (this.capabilities && !this.capabilities.cancel) return false
    const host = this.resolveHost()
    // Cancel deliberately doesn't go through the session-recovery wrapper:
    // a session-not-found here means there's no query to cancel, so we just
    // return false rather than tripping a reconnect.
    try {
      return await host.cancel(this.sessionId, identifier)
    } catch {
      return false
    }
  }

  async getDatabases(): Promise<Database[]> {
    const host = this.resolveHost()
    if (!this.sessionId) throw new Error('Not connected.')
    const sessionId = this.sessionId
    const dtos = await this.withSessionRecovery(() => host.describeDatabases(sessionId))
    const databases = dtos.map(fromDatabaseDTO)
    this.databases = databases
    return databases
  }

  async getSchemas(database: string): Promise<Schema[]> {
    const host = this.resolveHost()
    if (!this.sessionId) throw new Error('Not connected.')
    const sessionId = this.sessionId
    const dtos = await this.withSessionRecovery(() => host.describeSchemas(sessionId, database))
    return dtos.map(fromSchemaDTO)
  }

  async getTables(database: string, schema: string | null): Promise<Table[]> {
    const host = this.resolveHost()
    if (!this.sessionId) throw new Error('Not connected.')
    const sessionId = this.sessionId
    const dtos = await this.withSessionRecovery(() =>
      host.describeTables(sessionId, database, schema),
    )
    return dtos.map(fromTableDTO)
  }

  async getColumns(database: string, schema: string, table: string): Promise<Column[]> {
    const host = this.resolveHost()
    if (!this.sessionId) throw new Error('Not connected.')
    const sessionId = this.sessionId
    const dtos = await this.withSessionRecovery(() =>
      host.describeColumns(sessionId, database, schema, table),
    )
    return dtos.map(fromColumnDTO)
  }

  async getTable(database: string, table: string, schema: string | null): Promise<Table> {
    const host = this.resolveHost()
    if (!this.sessionId) throw new Error('Not connected.')
    const sessionId = this.sessionId
    const dto = await this.withSessionRecovery(() =>
      host.describeTable(sessionId, database, schema, table),
    )
    return fromTableDTO(dto)
  }

  // Best-effort cleanup: when the connection store soft-deletes us, fire and
  // forget a disconnect so the worker can reclaim the session. We don't await
  // because delete() is synchronous in the base class.
  override delete(): void {
    super.delete()
    const sessionId = this.sessionId
    this.sessionId = null
    if (!sessionId) return
    const host = this.explicitHost ?? registeredHost
    if (!host) return
    host.disconnect(sessionId).catch((err) => {
      console.warn(`RemoteWorkerConnection disconnect failed: ${err}`)
    })
  }
}
