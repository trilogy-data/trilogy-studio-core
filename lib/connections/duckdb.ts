import * as duckdb from '@duckdb/duckdb-wasm'
import BaseConnection from './base'
import { Database, Schema, Table, Column, AssetType } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import { DateTime } from 'luxon'

// Select a bundle based on browser checks

interface DuckDBType {
  typeId: number
  precision?: number
}

// use a singleton pattern to help avoid memoery issues
const connectionCache: Record<
  string,
  { db: duckdb.AsyncDuckDB; connection: duckdb.AsyncDuckDBConnection }
> = {}

async function createDuckDB(
  connectionName: string = 'default',
): Promise<{ db: duckdb.AsyncDuckDB; connection: duckdb.AsyncDuckDBConnection }> {
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
  connectionCache[connectionName] = { db, connection }

  return { db, connection }
}
// @ts-ignore
export default class DuckDBConnection extends BaseConnection {
  // @ts-ignore
  private connection: duckdb.AsyncDuckDBConnection
  // @ts-ignore
  public db: duckdb.AsyncDuckDB
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
      this.connection = conn.connection
      this.db = conn.db
      return true
    })
  }

  constructor(name: string, model?: string) {
    super(name, 'duckdb', false, model)
    this.query_type = 'duckdb'
  }

  processSchema(schema: any): Map<string, ResultColumn> {
    const headers = new Map<string, ResultColumn>()
    schema.forEach((field: any) => {
      headers.set(field.name, {
        name: field.name,
        type: this.mapDuckDBTypeToColumnType(field.type),
        description: '', // Add a description if necessary
        scale: field.type.scale,
        precision: field.type.precision,
        children: field.type.children ? this.processSchema(field.type.children) : undefined,
      })
    })
    return headers
  }

  parseUint32ArrayToBigInt(arr: Uint32Array): bigint {
    if (arr.length !== 4) {
      throw new Error('Expected Uint32Array of length 4')
    }

    // Convert each 32-bit chunk to BigInt and combine
    // arr[0] is least significant, arr[3] is most significant
    const chunk0 = BigInt(arr[0])
    const chunk1 = BigInt(arr[1]) << 32n
    const chunk2 = BigInt(arr[2]) << 64n
    const chunk3 = BigInt(arr[3]) << 96n

    return chunk0 + chunk1 + chunk2 + chunk3
  }

  handleNumber(value: any): number {
    // Check if it's a Uint32Array from DuckDB
    if (value instanceof Uint32Array && value.length === 4) {
      const bigIntValue = this.parseUint32ArrayToBigInt(value)

      // If it fits in JavaScript's safe integer range, return as number
      if (
        bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER) &&
        bigIntValue >= BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        return Number(bigIntValue)
      }

      // Otherwise return as BigInt
      return Number(bigIntValue)
    }

    // Handle other types normally
    if (typeof value === 'number' || typeof value === 'bigint') {
      return Number(value)
    }

    // Try to parse as number
    const numValue = Number(value)
    if (Number.isFinite(numValue)) {
      return numValue
    }

    throw new Error(`Cannot parse value: ${value}`)
  }
  processRow(row: any, headers: Map<string, ResultColumn>): any {
    let processedRow: Record<string, any> = {}
    Object.keys(row).forEach((key) => {
      const column = headers.get(key)

      if (column) {
        switch (column.type) {
          case ColumnType.INTEGER:
            processedRow[key] =
              row[key] !== null && row[key] !== undefined ? this.handleNumber(row[key]) : null
            break
          case ColumnType.FLOAT:
            const scale = column.scale || 0
            // Convert integer to float by dividing by 10^scale
            if (row[key] !== null && row[key] !== undefined) {
              const top = this.handleNumber(row[key])
              // if it's a bigint, convert scaleFactor to bigint
              processedRow[key] = top / Math.pow(10, scale)
            }
            // else is only for null/undefined
            break
          case ColumnType.DATE:
            processedRow[key] = row[key] ? DateTime.fromMillis(row[key], { zone: 'UTC' }) : null
            break
          case ColumnType.DATETIME:
            processedRow[key] = row[key] ? DateTime.fromMillis(row[key], { zone: 'UTC' }) : null
            break
          case ColumnType.ARRAY:
            const arrayData = Array.from(row[key].toArray())
            const newv = arrayData.map((item: any) => {
              // l i sthe constant returned by duckdb for the array
              return this.processRow({ l: item }, column.children!)
            })
            processedRow[key] = newv
            break
          case ColumnType.STRUCT:
            processedRow[key] = row[key] ? this.processRow(row[key], column.children!) : null
            break
          // row[key] = row[key] ? this.processRow(row[key], column.children!) : null
          // break
          default:
            processedRow[key] = row[key]
            break
        }
      } else {
        console.warn(`Column ${key} not found in headers`)
      }
    })
    return processedRow
  }

  async query_core(sql: string, parameters: Record<string, any> | null = null): Promise<Results> {
    let result
    if (parameters) {
      let params = []
      // duckdb uses ? for parameter placehodlers
      // for each name, value pair in the parameters object, in the right order,
      // replace one instance of the variable name with ? and inject a value into our params list
      // for example select :test, :test2 where :test = 1 would need to interleave [test.value, test2.value, test.value]

      // Create a regex to find all parameter placeholders in the format :paramName
      const paramRegex = /(:[\w]+)/g
      let modifiedSql = sql

      // Find all parameter placeholders in the SQL query
      const matches = Array.from(sql.matchAll(paramRegex))

      // For each match, replace the parameter with ? and add its value to the params array
      for (const match of matches) {
        const paramName = match[1] // Extract the parameter name without the colon
        if (paramName in parameters) {
          // Replace only the first occurrence of the parameter with ?
          modifiedSql = modifiedSql.replace(`:${paramName}`, '?')
          // Add the parameter value to the params array
          params.push(parameters[paramName])
        }
      }

      let prepared = await this.connection.prepare(modifiedSql)
      result = await prepared.query(...params)
      await prepared.close()
    } else {
      result = await this.connection.query(sql)
    }

    const schema = result.schema.fields
    const headers = this.processSchema(schema)
    // Map data rows
    const data = result.toArray().map((row) => row.toJSON())
    const finalData: any[] = []
    data.forEach((row) => {
      finalData.push(this.processRow(row, headers))
    })
    return new Results(headers, finalData)
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
      case 13:
        return ColumnType.STRUCT
      case 12:
        return ColumnType.ARRAY
      default:
        console.log('Unknown DuckDB int type:', duckDBType)
        return ColumnType.UNKNOWN // Use a fallback if necessary
    }
  }

  private mapDuckDBStringTypeToColumnType(duckDBType: string): ColumnType {
    if (duckDBType.startsWith('DECIMAL')) {
      return ColumnType.NUMERIC // or ColumnType.DECIMAL if you have one
    }

    switch (duckDBType) {
      case 'VARCHAR':
        return ColumnType.STRING
      case 'BIGINT':
        return ColumnType.INTEGER
      case 'INTEGER':
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
    const results = await this.connection.query('SHOW DATABASES').then((result) => {
      return this.mapShowDatabasesResult(result.toArray().map((row) => row.toJSON()))
    })
    this.databases = results
    return results
  }

  async getSchemas(database: string): Promise<Schema[]> {
    return await this.connection
      .query('SELECT * FROM information_schema.schemata')
      .then((result) => {
        return this.mapShowSchemaResult(
          result.toArray().map((row) => row.toJSON()),
          database,
        )
      })
  }

  async getTables(database: string, schema: string): Promise<Table[]> {
    return await this.connection
      .query(
        `SELECT * FROM information_schema.tables where table_catalog='${database}' and table_schema='${schema}'`,
      )
      .then((result) => {
        return this.mapShowTablesResult(
          result.toArray().map((row) => row.toJSON()),
          database,
          schema,
        )
      })
  }

  async getColumns(database: string, schema: string, table: string): Promise<Column[]> {
    return await this.connection.query(`DESCRIBE ${database}.${schema}.${table}`).then((result) => {
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
  mapShowSchemaResult(showSchemaResult: any[], database: string): Schema[] {
    let tables: Table[] = []
    return showSchemaResult
      .filter((row) => row.catalog_name === database)
      .map((row) => {
        return new Schema(row.schema_name, tables, database)
      })
  }
  mapShowTablesResult(showTablesResult: any[], database: string, schema: string): Table[] {
    let columns: Column[] = []
    return showTablesResult.map((row) => {
      return new Table(
        row.table_name,
        schema,
        database,
        columns,
        row.TABLE_COMMENT,
        row.table_type === 'VIEW' ? AssetType.VIEW : AssetType.TABLE,
      )
    })
  }

  mapShowDatabasesResult(showDatabaseResult: any[]): Database[] {
    // Convert map to Database[] array
    let schemas: Schema[] = []
    return showDatabaseResult.map((row) => {
      return new Database(row.database_name, schemas)
    })
  }
}
