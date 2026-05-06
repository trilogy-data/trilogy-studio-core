import { invoke } from '@tauri-apps/api/core'
import type {
  RemoteWorkerHost,
  RemoteWorkerConnectArgs,
  RemoteWorkerConnectResult,
  RemoteWorkerExecuteRequest,
  RemoteWorkerExecuteSummary,
  ArrowBatchHandler,
  RemoteDatabaseDTO,
  RemoteSchemaDTO,
  RemoteTableDTO,
  RemoteColumnDTO,
} from '@lib/connections'

/**
 * RemoteWorkerHost backed by Tauri commands wired in src-tauri/src/lib.rs.
 *
 * Phase 2 keeps the protocol simple: `remote_execute` returns the entire
 * Arrow IPC stream as a single `tauri::ipc::Response` byte buffer (which
 * `invoke()` surfaces as ArrayBuffer — bypassing JSON serialization). The
 * host emits it as a single onBatch call. A future phase will switch to a
 * `Channel<Vec<u8>>` to stream batches as they arrive on the worker side.
 */
export const tauriRemoteWorkerHost: RemoteWorkerHost = {
  async connect(args: RemoteWorkerConnectArgs): Promise<RemoteWorkerConnectResult> {
    return invoke<RemoteWorkerConnectResult>('remote_connect', {
      connectionId: args.connectionId,
      driver: args.driver,
      config: args.config,
    })
  },

  async execute(
    request: RemoteWorkerExecuteRequest,
    onBatch: ArrowBatchHandler,
  ): Promise<RemoteWorkerExecuteSummary> {
    const start = performance.now()
    const buf = await invoke<ArrayBuffer>('remote_execute', {
      sessionId: request.sessionId,
      sql: request.sql,
      parameters: request.parameters ?? null,
      identifier: request.identifier,
    })
    if (buf && buf.byteLength > 0) {
      onBatch(new Uint8Array(buf))
    }
    return {
      // The worker computes its own row count; we don't surface it through
      // the single-shot path yet. Caller can derive from Results.data.length.
      rowCount: 0,
      durationMs: performance.now() - start,
    }
  },

  async cancel(sessionId: string, identifier: string): Promise<boolean> {
    return invoke<boolean>('remote_cancel', { sessionId, identifier })
  },

  async disconnect(sessionId: string): Promise<void> {
    await invoke('remote_disconnect', { sessionId })
  },

  async describeDatabases(sessionId: string): Promise<RemoteDatabaseDTO[]> {
    return invoke<RemoteDatabaseDTO[]>('remote_describe_databases', { sessionId })
  },

  async describeSchemas(sessionId: string, database: string): Promise<RemoteSchemaDTO[]> {
    return invoke<RemoteSchemaDTO[]>('remote_describe_schemas', { sessionId, database })
  },

  async describeTables(
    sessionId: string,
    database: string,
    schema: string | null,
  ): Promise<RemoteTableDTO[]> {
    return invoke<RemoteTableDTO[]>('remote_describe_tables', {
      sessionId,
      database,
      schema,
    })
  },

  async describeColumns(
    sessionId: string,
    database: string,
    schema: string,
    table: string,
  ): Promise<RemoteColumnDTO[]> {
    return invoke<RemoteColumnDTO[]>('remote_describe_columns', {
      sessionId,
      database,
      schema,
      table,
    })
  },

  async describeTable(
    sessionId: string,
    database: string,
    schema: string | null,
    table: string,
  ): Promise<RemoteTableDTO> {
    return invoke<RemoteTableDTO>('remote_describe_table', {
      sessionId,
      database,
      schema,
      table,
    })
  },
}
