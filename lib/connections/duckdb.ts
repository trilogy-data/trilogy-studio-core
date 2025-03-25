import * as duckdb from '@duckdb/duckdb-wasm'
import BaseConnection from './base'
import { Database, Table, Column, AssetType } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import { DateTime } from 'luxon'

// Select a bundle based on browser checks

interface DuckDBType {
  typeId: number
  precision?: number
}

// use a singleton pattern to help avoid memoery issues
const connectionCache: Record<string, duckdb.AsyncDuckDBConnection> = {}

async function createDuckDB(
  connectionName: string = 'default',
): Promise<duckdb.AsyncDuckDBConnection> {
  // Return existing connection if it exists in the cache
  if (connectionCache[connectionName]) {
    return connectionCache[connectionName]
  }

  // Get the appropriate bundle for the current environment
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  // Create a new DuckDB instance
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
  )
  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)

  // Initialize the database
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  const connection = await db.connect()

  // Cache the connection
  connectionCache[connectionName] = connection

  return connection
}
// @ts-ignore
export default class DuckDBConnection extends BaseConnection {
  // @ts-ignore
  private connection: duckdb.AsyncDuckDBConnection
  static fromJSON(fields: { name: string; model: string | null }): DuckDBConnection {
    let base = new DuckDBConnection(fields.name)
    if (fields.model) {
      base.model = fields.model
    }
    return base
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
    }
  }

  async connect() {
    return createDuckDB(this.name).then((conn) => {
      this.connection = conn
      return true
    })
  }

  constructor(name: string, model?: string) {
    super(name, 'duckdb', false, model)
    this.query_type = 'duckdb'
  }

  // Example of a custom method for MotherDuck
  async query_core(sql: string): Promise<Results> {
    const result = await this.connection.query(sql)
    // Map headers (columns) from the result schema
    const schema = result.schema.fields // Assuming `fields` is the column metadata
    const headers = new Map<string, ResultColumn>()

    schema.forEach((field: any) => {
      headers.set(field.name, {
        name: field.name,
        type: this.mapDuckDBTypeToColumnType(field.type),
        description: '', // Add a description if necessary
        scale: field.type.scale,
        precision: field.type.precision,
      })
    })

    // Map data rows
    const data = result.toArray().map((row) => row.toJSON())
    //if any field type is a integer, convert it from BigInt to Number
    let tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        switch (headers.get(key)?.type) {
          case ColumnType.INTEGER:
            row[key] = Number(row[key])
            break
          case ColumnType.FLOAT:
            const scale = headers.get(key)?.scale || 0

            // Convert integer to float by dividing by 10^scale
            if (row[key] !== null && row[key] !== undefined) {
              const scaleFactor = Math.pow(10, scale)
              row[key] = Number(row[key]) / scaleFactor
            }
            break
          case ColumnType.DATE:
            row[key] = DateTime.fromMillis(row[key], { zone: 'UTC' })
            break
          case ColumnType.DATETIME:
            row[key] = DateTime.fromMillis(row[key], { zone: tz })
            break
          default:
            break
        }
      })
    })
    return new Results(headers, data)
  }

  // Helper to map DuckDB column types to your ColumnType enum
  private mapDuckDBTypeToColumnType(duckDBType: DuckDBType): ColumnType {
    switch (duckDBType.typeId) {
      case 5:
        return ColumnType.STRING
      case 2:
        return ColumnType.INTEGER
      case 3:
        return ColumnType.FLOAT
      case 6:
        return ColumnType.BOOLEAN
      case 7:
        return ColumnType.FLOAT
      case 8:
        return ColumnType.DATE
      case 10:
        return ColumnType.DATETIME
      default:
        console.log('Unknown DuckDB type:', duckDBType)
        return ColumnType.UNKNOWN // Use a fallback if necessary
    }
  }

  private mapDuckDBStringTypeToColumnType(duckDBType: string): ColumnType {
    switch (duckDBType) {
      case 'VARCHAR':
        return ColumnType.STRING
      case 'BIGINT':
        return ColumnType.INTEGER
      case 'DOUBLE':
        return ColumnType.FLOAT
      case 'BOOLEAN':
        return ColumnType.BOOLEAN
      case 'FLOAT':
        return ColumnType.FLOAT
      case 'DATE':
        return ColumnType.DATE
      case 'TIMESTAMP':
        return ColumnType.DATETIME
      default:
        console.log('Unknown DuckDB type:', duckDBType)
        return ColumnType.UNKNOWN // Use a fallback if necessary
    }
  }

  async getDatabases(): Promise<Database[]> {
    return await this.connection.query('SHOW DATABASES').then((result) => {
      return this.mapShowDatabasesResult(result.toArray().map((row) => row.toJSON()))
    })
  }

  async getTables(database: string): Promise<Table[]> {
    return await this.connection.query('SELECT * FROM information_schema.tables').then((result) => {
      return this.mapShowTablesResult(
        result.toArray().map((row) => row.toJSON()),
        database,
      )
    })
  }

  async getColumns(database: string, table: string): Promise<Column[]> {
    return await this.connection.query(`DESCRIBE ${database}.${table}`).then((result) => {
      return this.mapDescribeResult(result.toArray().map((row) => row.toJSON()))
    })
  }

  mapDescribeResult(describeResult: any[]): Column[] {
    return describeResult.map((row) => {
      const name = row.column_name
      const type = row.column_type
      const nullable = row.null === 'YES'
      const key = row.key
      const defaultValue = row.default
      const extra = row.extra
      return new Column(
        name,
        type,
        // the sql results will be with a string
        this.mapDuckDBStringTypeToColumnType(type),
        nullable,
        key === 'PRI',
        key === 'UNI',
        defaultValue,
        extra === 'auto_increment',
      )
    })
  }

  mapShowTablesResult(showTablesResult: any[], database: string): Table[] {
    let columns: Column[] = []

    //desc.TABLE_COMMENT, desc.table_type === 'VIEW' ? AssetType.VIEW : AssetType.TABLE)
    return showTablesResult
      .filter((row) => row.table_catalog === database)
      .map((row) => {
        return new Table(
          row.table_name,
          columns,
          row.TABLE_COMMENT,
          row.table_type === 'VIEW' ? AssetType.VIEW : AssetType.TABLE,
        )
      })
  }

  mapShowDatabasesResult(showDatabaseResult: any[]): Database[] {
    // Convert map to Database[] array
    let tables: Table[] = []
    return showDatabaseResult.map((row) => {
      return new Database(row.database_name, tables)
    })
  }
}
