export { default as Connection, Table, Database, Schema, Column, AssetType } from './base'
export { default as MotherDuckConnection } from './motherduck'
export { default as DuckDBConnection, configureDuckDBAssets } from './duckdb'
export type { DuckDBAssetUrls } from './duckdb'
export { default as BigQueryOauthConnection } from './bigquery_oauth'
export { SnowflakeJwtConnection } from './snowflake'
export { default as SQLiteConnection, configureSQLiteAssets } from './sqlite'
export type { SQLiteAssetUrls } from './sqlite'
export { default as RemoteProjectConnection } from './remoteProject'
export {
  default as RemoteWorkerConnection,
  registerRemoteWorkerHost,
  getRemoteWorkerHost,
} from './remoteWorker'
export type {
  RemoteWorkerHost,
  RemoteWorkerCapabilities,
  RemoteWorkerConnectArgs,
  RemoteWorkerConnectResult,
  RemoteWorkerExecuteRequest,
  RemoteWorkerExecuteSummary,
  RemoteWorkerConnectionOptions,
  RemoteDatabaseDTO,
  RemoteSchemaDTO,
  RemoteTableDTO,
  RemoteColumnDTO,
  ArrowBatchHandler,
} from './remoteWorker'
export { buildConnectionTree, filterConnectionTree } from './helpers'
// export {default as SQLServerConnection} from './sql_server';
// export {default as BigQueryServiceConnection} from './bigquery_sa';
