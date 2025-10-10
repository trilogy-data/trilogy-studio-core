import * as duckdb from '@duckdb/duckdb-wasm'
import BaseConnection from './base'
import { Database, Schema, Table, Column, AssetType } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import { DateTime } from 'luxon'
import { ARRAY_IMPLICIT_COLUMN } from './constants'
import * as arrow from 'apache-arrow'

// Select a bundle based on browser checks
function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox')
}

interface DuckDBType {
  typeId: number
  precision?: number
}

// use a singleton pattern to help avoid memory issues
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
  await db.open(
    isFirefox()
      ? {
          filesystem: {
            reliableHeadRequests: false,
            allowFullHTTPReads: true,
          },
        }
      : {},
  )
  const connection = await db.connect()

  // Cache the connection
  connectionCache[connectionName] = { db, connection }

  return { db, connection }
}

export default class DuckDBConnection extends BaseConnection {
  // @ts-ignore
  private connection: duckdb.AsyncDuckDBConnection
  // @ts-ignore
  public db: duckdb.AsyncDuckDB
  private currentQueryIdentifier: string | null = null

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
    const conn = await createDuckDB(this.name)
    this.connection = conn.connection
    this.db = conn.db
    return true
  }

  constructor(name: string, model?: string) {
    super(name, 'duckdb', false, model)
    this.query_type = 'duckdb'
  }

  // FILE PROCESSING METHODS

  private sanitizeTableName(name: string): string {
    // Replace non-alphanumeric characters with underscores
    const sanitized = name.replace(/[^a-zA-Z0-9]/g, '_')
    // Ensure the name doesn't start with a number
    return /^\d/.test(sanitized) ? `t_${sanitized}` : sanitized
  }

  private getFileType(file: File): 'csv' | 'parquet' | 'db' {
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      return 'csv'
    } else if (file.name.endsWith('.parquet')) {
      return 'parquet'
    } else {
      return 'db'
    }
  }

  private mapArrowTypeToDuckDB(arrowType: arrow.DataType): string {
    const typeId = arrowType.typeId

    switch (typeId) {
      case arrow.Type.Int8:
      case arrow.Type.Int16:
      case arrow.Type.Int32:
      case arrow.Type.Uint8:
      case arrow.Type.Uint16:
      case arrow.Type.Uint32:
        return 'INTEGER'
      case arrow.Type.Int64:
      case arrow.Type.Uint64:
        return 'BIGINT'
      case arrow.Type.Float:
        return 'DOUBLE'
      case arrow.Type.Timestamp:
        return 'TIMESTAMP'
      case arrow.Type.Date:
        return 'DATE'
      case arrow.Type.Bool:
        return 'BOOLEAN'
      case arrow.Type.Utf8:
      case arrow.Type.Binary:
      default:
        return 'VARCHAR'
    }
  }

  async processCSV(file: File, tableName: string, onProgress?: (message: string) => void) {
    const tempConnection = await this.db.connect()

    try {
      onProgress?.(`Analyzing CSV structure...`)

      // First, peek at the file to determine headers and types
      const sampleQuery = await tempConnection.query(`
        SELECT * FROM read_csv_auto('${file.name}', AUTO_DETECT=TRUE, SAMPLE_SIZE=1000) LIMIT 5
      `)

      // Get column names and types from the sample
      const columnInfo = sampleQuery.schema.fields.map((field) => ({
        name: field.name,
        type: this.mapArrowTypeToDuckDB(field.type),
      }))

      if (columnInfo.length === 0) {
        throw new Error('CSV file has no columns')
      }

      // Create the table with the detected schema
      const columns = columnInfo
        .map((col) => `"${col.name.replace(/[^a-zA-Z0-9_]/g, '_')}" ${col.type}`)
        .join(', ')

      await tempConnection.query(`CREATE TABLE ${tableName} (${columns})`)

      // Insert the data using DuckDB's native CSV reader
      onProgress?.(`Importing CSV data...`)

      await tempConnection.query(`
        INSERT INTO ${tableName} 
        SELECT * FROM read_csv_auto('${file.name}', 
          AUTO_DETECT=TRUE, 
          HEADER=TRUE,
          SAMPLE_SIZE=-1)
      `)
    } finally {
      await tempConnection.close()
    }
  }

  async processParquet(file: File, tableName: string, onProgress?: (message: string) => void) {
    const tempConnection = await this.db.connect()

    try {
      onProgress?.(`Analyzing Parquet structure...`)

      // For Parquet, we can directly create a table from the file
      await tempConnection.query(`
        CREATE TABLE ${tableName} AS 
        SELECT * FROM read_parquet('${file.name}')
      `)
    } finally {
      await tempConnection.close()
    }
  }

  async processDuckDBFile(file: File, onProgress?: (message: string) => void): Promise<string> {
    onProgress?.(`Attaching database ${file.name}...`)

    // Generate database alias from file name
    const fileName = file.name.replace('.db', '')

    const dbAlias = this.sanitizeTableName(fileName)
    await this.connection.query(`use memory; DETACH DATABASE IF EXISTS ${dbAlias}`)
    // Register the file in DuckDB's virtual file system
    await this.db.registerFileHandle(
      file.name,
      file,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true,
    )

    try {
      // Attach the database
      await this.connection.query(`ATTACH '${file.name}' AS ${dbAlias}`)

      // Update databases
      let databases = await this.getDatabases()
      console.log('Databases after attach:', databases)
      let tables = await this.refreshDatabase(dbAlias)
      console.log(`Tables after attach:`, tables)

      return dbAlias
    } catch (error) {
      throw new Error(`Failed to attach database: ${error}`)
    }
  }

  async importFile(
    file: File,
    onProgress?: (message: string) => void,
  ): Promise<{ type: 'table' | 'database'; name: string }> {
    onProgress?.(`Processing ${file.name}...`)
    const fileType = this.getFileType(file)

    if (fileType === 'db') {
      const dbAlias = await this.processDuckDBFile(file, onProgress)
      return { type: 'database', name: dbAlias }
    } else {
      // Generate table name from file name
      const fileName = file.name.replace(`.${fileType}`, '')
      const tableName = this.sanitizeTableName(fileName)
      onProgress?.(`Creating table ${tableName}...`)

      // Register the file in DuckDB's virtual file system
      await this.db.registerFileHandle(
        file.name,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      )

      if (fileType === 'csv') {
        await this.processCSV(file, tableName, onProgress)
      } else {
        await this.processParquet(file, tableName, onProgress)
      }

      // Refresh the memory database
      await this.refreshDatabase('memory')
      return { type: 'table', name: tableName }
    }
  }

  // EXISTING METHODS

  processSchema(schema: any): Map<string, ResultColumn> {
    const headers = new Map<string, ResultColumn>()
    schema.forEach((field: any) => {
      headers.set(field.name, {
        name: field.name,
        type: this.mapDuckDBTypeToColumnType(field.type),
        description: '',
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

    const chunk0 = BigInt(arr[0])
    const chunk1 = BigInt(arr[1]) << 32n
    const chunk2 = BigInt(arr[2]) << 64n
    const chunk3 = BigInt(arr[3]) << 96n

    return chunk0 + chunk1 + chunk2 + chunk3
  }

  handleNumber(value: any): number {
    if (value instanceof Uint32Array && value.length === 4) {
      const bigIntValue = this.parseUint32ArrayToBigInt(value)

      if (
        bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER) &&
        bigIntValue >= BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        return Number(bigIntValue)
      }

      return Number(bigIntValue)
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return Number(value)
    }

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
            if (row[key] !== null && row[key] !== undefined) {
              const top = this.handleNumber(row[key])
              processedRow[key] = top / Math.pow(10, scale)
            }
            break
          case ColumnType.DATE:
            processedRow[key] = row[key] ? DateTime.fromMillis(row[key], { zone: 'UTC' }) : null
            break
          case ColumnType.DATETIME:
            processedRow[key] = row[key] ? DateTime.fromMillis(row[key], { zone: 'UTC' }) : null
            break
          case ColumnType.ARRAY:
            const arrayData = row[key] ? Array.from(row[key].toArray()) : null
            if (!arrayData) {
              processedRow[key] = null
              break
            }
            const newv = arrayData.map((item: any) => {
              return this.processRow({ [ARRAY_IMPLICIT_COLUMN]: item }, column.children!)
            })
            processedRow[key] = newv
            break
          case ColumnType.STRUCT:
            processedRow[key] = row[key] ? this.processRow(row[key], column.children!) : null
            break
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

  async query_core(
    sql: string,
    parameters: Record<string, any> | null = null,
    identifier: string | null = null,
  ): Promise<Results> {
    console.log('Executing duckdb query', identifier)

    // Track the currently executing query
    this.currentQueryIdentifier = identifier

    try {
      let result
      if (parameters) {
        let params = []
        const paramRegex = /(:[\w]+)/g
        let modifiedSql = sql

        const matches = Array.from(sql.matchAll(paramRegex))

        for (const match of matches) {
          const paramName = match[1]
          if (paramName in parameters) {
            modifiedSql = modifiedSql.replace(`:${paramName}`, '?')
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
      const data = result.toArray().map((row) => row.toJSON())
      const finalData: any[] = []
      data.forEach((row) => {
        finalData.push(this.processRow(row, headers))
      })

      return new Results(headers, finalData)
    } finally {
      // Clear the identifier when query completes (successfully or with error)
      if (this.currentQueryIdentifier === identifier) {
        this.currentQueryIdentifier = null
      }
    }
  }

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
        return ColumnType.UNKNOWN
    }
  }

  private mapDuckDBStringTypeToColumnType(duckDBType: string): ColumnType {
    if (duckDBType.startsWith('DECIMAL')) {
      return ColumnType.NUMERIC
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
        return ColumnType.UNKNOWN
    }
  }

  async getTable(database: string, table: string, schema: string | null): Promise<Table> {
    const schemaName = schema || 'main'

    // First try to get it from local cache
    const cachedTable = this.getLocalTable(database, schemaName, table)
    if (cachedTable) {
      return cachedTable
    }

    // If not in cache, fetch it from the database
    const tables = await this.getTables(database, schemaName)
    const foundTable = tables.find((t) => t.name === table)

    if (!foundTable) {
      throw new Error(`Table ${table} not found in schema ${schemaName} of database ${database}`)
    }

    // Fetch columns for the table
    const columns = await this.getColumns(database, schemaName, table)
    foundTable.columns = columns

    return foundTable
  }

  async cancelQuery(identifier: string): Promise<boolean> {
    // Check if the identifier matches the currently executing query
    if (this.currentQueryIdentifier !== identifier) {
      console.warn(
        `Cannot cancel query ${identifier}: it is not currently executing (current: ${this.currentQueryIdentifier})`,
      )
      return false
    }

    try {
      // DuckDB WASM's cancelSent() cancels the last query sent on this connection
      const result = await this.connection.cancelSent()
      if (result) {
        console.log(`Successfully cancelled query: ${identifier}`)
        this.currentQueryIdentifier = null
      } else {
        console.warn(`Failed to cancel query: ${identifier} (query may have already completed)`)
      }
      return result
    } catch (error) {
      console.error(`Error cancelling query ${identifier}:`, error)
      return false
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
    let schemas: Schema[] = []
    return showDatabaseResult.map((row) => {
      return new Database(row.database_name, schemas)
    })
  }
}
