import BaseConnection from './base'
import { Database, Schema, Table, Column, AssetType } from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'
import type initSqlJs from 'sql.js'
import type { SqlJsStatic, Database as SqlJsDatabase } from 'sql.js'

export interface SQLiteAssetUrls {
  wasmUrl: string
}

let configuredSQLiteAssetUrls: SQLiteAssetUrls | null = null

export function configureSQLiteAssets(assetUrls: SQLiteAssetUrls | null): void {
  configuredSQLiteAssetUrls = assetUrls
}

// Singleton cache to avoid creating multiple instances
const connectionCache: Record<string, { sql: SqlJsStatic; db: SqlJsDatabase }> = {}

async function createSQLite(
  connectionName: string = 'default',
): Promise<{ sql: SqlJsStatic; db: SqlJsDatabase }> {
  if (connectionCache[connectionName]) {
    return connectionCache[connectionName]
  }

  // Lazy-load sql.js — only fetched when a SQLite connection is created
  const sqlModule = await import('sql.js')
  const initSqlJsFn = sqlModule.default as typeof initSqlJs

  const configuredAssets = configuredSQLiteAssetUrls
  const useBundledAssets = !configuredAssets && import.meta.env.VITE_SQLITE_BUNDLED === 'true'

  let config: { locateFile?: (file: string) => string } = {}
  if (configuredAssets) {
    config.locateFile = () => configuredAssets.wasmUrl
  } else if (useBundledAssets) {
    // When bundled, Vite handles the WASM file via ?url import
    const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url')
    config.locateFile = () => wasmUrl
  } else {
    // CDN fallback
    config.locateFile = (file: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
  }

  const sql = await initSqlJsFn(config)
  const db = new sql.Database()

  connectionCache[connectionName] = { sql, db }
  return { sql, db }
}

export default class SQLiteConnection extends BaseConnection {
  private db!: SqlJsDatabase
  private sql!: SqlJsStatic

  static fromJSON(fields: { name: string; model: string | null }): SQLiteConnection {
    let base = new SQLiteConnection(fields.name)
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
    const conn = await createSQLite(this.name)
    this.db = conn.db
    this.sql = conn.sql
    return true
  }

  constructor(name: string, model?: string) {
    super(name, 'sqlite', false, model)
    this.query_type = 'sqlite'
    this.hasSchema = false
  }

  // FILE PROCESSING METHODS

  private sanitizeTableName(name: string): string {
    const sanitized = name.replace(/[^a-zA-Z0-9]/g, '_')
    return /^\d/.test(sanitized) ? `t_${sanitized}` : sanitized
  }

  private getFileType(file: File): 'csv' | 'db' {
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      return 'csv'
    }
    return 'db'
  }

  private inferColumnType(values: (string | null)[]): string {
    // Sample non-null values to infer type
    const samples = values.filter((v) => v !== null && v !== '')
    if (samples.length === 0) return 'TEXT'

    const allInteger = samples.every((v) => /^-?\d+$/.test(v!))
    if (allInteger) return 'INTEGER'

    const allNumeric = samples.every((v) => /^-?\d+\.?\d*([eE][+-]?\d+)?$/.test(v!))
    if (allNumeric) return 'REAL'

    return 'TEXT'
  }

  private parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    if (lines.length === 0) return { headers: [], rows: [] }

    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (inQuotes) {
          if (char === '"' && line[i + 1] === '"') {
            current += '"'
            i++
          } else if (char === '"') {
            inQuotes = false
          } else {
            current += char
          }
        } else {
          if (char === '"') {
            inQuotes = true
          } else if (char === ',') {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine)
    return { headers, rows }
  }

  async processCSV(file: File, tableName: string, onProgress?: (message: string) => void) {
    onProgress?.('Analyzing CSV structure...')

    const text = await file.text()
    const { headers, rows } = this.parseCSV(text)

    if (headers.length === 0) {
      throw new Error('CSV file has no columns')
    }

    // Infer types from first 100 rows
    const sampleRows = rows.slice(0, 100)
    const columnTypes = headers.map((_, colIdx) => {
      const values = sampleRows.map((row) => row[colIdx] ?? null)
      return this.inferColumnType(values)
    })

    const columnDefs = headers
      .map((h, i) => `"${h.replace(/[^a-zA-Z0-9_]/g, '_')}" ${columnTypes[i]}`)
      .join(', ')

    this.db.run(`DROP TABLE IF EXISTS ${tableName}`)
    this.db.run(`CREATE TABLE ${tableName} (${columnDefs})`)

    onProgress?.('Importing CSV data...')

    // Batch insert in chunks of 500
    const placeholders = headers.map((_, i) => `:v${i}`).join(', ')
    const insertSQL = `INSERT INTO ${tableName} VALUES (${placeholders})`

    this.db.run('BEGIN TRANSACTION')
    try {
      for (const row of rows) {
        const params: Record<string, any> = {}
        headers.forEach((_, i) => {
          const val = row[i]
          if (val === undefined || val === '') {
            params[`:v${i}`] = null
          } else if (columnTypes[i] === 'INTEGER') {
            params[`:v${i}`] = parseInt(val, 10)
          } else if (columnTypes[i] === 'REAL') {
            params[`:v${i}`] = parseFloat(val)
          } else {
            params[`:v${i}`] = val
          }
        })
        this.db.run(insertSQL, params)
      }
      this.db.run('COMMIT')
    } catch (e) {
      this.db.run('ROLLBACK')
      throw e
    }
  }

  async processSQLiteFile(file: File, onProgress?: (message: string) => void): Promise<string> {
    onProgress?.(`Loading database ${file.name}...`)

    const buffer = await file.arrayBuffer()
    const data = new Uint8Array(buffer)

    // Replace the current in-memory database with the loaded one
    this.db.close()
    this.db = new this.sql.Database(data)

    // Update the cache
    connectionCache[this.name] = { sql: this.sql, db: this.db }

    return 'main'
  }

  async importFile(
    file: File,
    onProgress?: (message: string) => void,
  ): Promise<{ type: 'table' | 'database'; name: string }> {
    onProgress?.(`Processing ${file.name}...`)
    const fileType = this.getFileType(file)

    if (fileType === 'db') {
      await this.processSQLiteFile(file, onProgress)
      // Refresh databases to pick up new tables
      await this.getDatabases()
      return { type: 'database', name: 'main' }
    } else {
      const fileName = file.name.replace('.csv', '')
      const tableName = this.sanitizeTableName(fileName)
      onProgress?.(`Creating table ${tableName}...`)
      await this.processCSV(file, tableName, onProgress)
      await this.refreshDatabase('main')
      return { type: 'table', name: tableName }
    }
  }

  // QUERY EXECUTION

  async query_core(
    sql: string,
    parameters: Record<string, any> | null = null,
    _identifier: string | null = null,
  ): Promise<Results> {
    const results = this.db.exec(sql, parameters ?? undefined)

    if (results.length === 0) {
      return new Results(new Map(), [])
    }

    const result = results[0]
    const headers = new Map<string, ResultColumn>()
    result.columns.forEach((col) => {
      headers.set(col, {
        name: col,
        type: this.inferColumnTypeFromValues(result.values, result.columns.indexOf(col)),
        description: '',
      })
    })

    const data = result.values.map((row) => {
      const obj: Record<string, any> = {}
      result.columns.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj
    })

    return new Results(headers, data)
  }

  private inferColumnTypeFromValues(values: any[][], colIndex: number): ColumnType {
    for (const row of values) {
      const val = row[colIndex]
      if (val === null || val === undefined) continue
      if (typeof val === 'number') {
        return Number.isInteger(val) ? ColumnType.INTEGER : ColumnType.FLOAT
      }
      if (typeof val === 'boolean') return ColumnType.BOOLEAN
      return ColumnType.STRING
    }
    return ColumnType.STRING
  }

  async cancelQuery(_identifier: string): Promise<boolean> {
    // sql.js runs synchronously in the main thread — no cancellation possible
    return false
  }

  async getDatabases(): Promise<Database[]> {
    const databases = [new Database('main', [])]
    this.databases = databases
    return databases
  }

  async getSchemas(_database: string): Promise<Schema[]> {
    return [new Schema('main', [], 'main')]
  }

  async getTables(_database: string, _schema: string | null): Promise<Table[]> {
    const results = this.db.exec(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )

    if (results.length === 0) return []

    return results[0].values.map(
      (row) =>
        new Table(
          row[0] as string,
          'main',
          'main',
          [],
          null,
          row[1] === 'view' ? AssetType.VIEW : AssetType.TABLE,
        ),
    )
  }

  async getColumns(_database: string, _schema: string, table: string): Promise<Column[]> {
    const results = this.db.exec(`PRAGMA table_info("${table}")`)
    if (results.length === 0) return []

    return results[0].values.map((row) => {
      const colName = row[1] as string
      const colType = (row[2] as string) || 'TEXT'
      const notNull = row[3] as number
      const defaultVal = row[4] as string | null
      const pk = row[5] as number

      return new Column(
        colName,
        colType,
        this.mapSQLiteTypeToColumnType(colType),
        notNull === 0,
        pk > 0,
        false,
        defaultVal,
        false,
      )
    })
  }

  async getTable(database: string, table: string, schema: string | null): Promise<Table> {
    const schemaName = schema || 'main'

    const cachedTable = this.getLocalTable(database, schemaName, table)
    if (cachedTable) return cachedTable

    const tables = await this.getTables(database, schemaName)
    const foundTable = tables.find((t) => t.name === table)
    if (!foundTable) {
      throw new Error(`Table ${table} not found in database ${database}`)
    }

    foundTable.columns = await this.getColumns(database, schemaName, table)
    return foundTable
  }

  async getTableSample(
    _database: string,
    _schema: string,
    table: string,
    limit: number = 100,
  ): Promise<Results> {
    const sql = `SELECT * FROM "${table}" LIMIT ${limit}`
    return this.query(sql)
  }

  private mapSQLiteTypeToColumnType(sqliteType: string): ColumnType {
    const upper = sqliteType.toUpperCase()
    if (upper.includes('INT')) return ColumnType.INTEGER
    if (upper.includes('REAL') || upper.includes('FLOAT') || upper.includes('DOUBLE'))
      return ColumnType.FLOAT
    if (upper.includes('BOOL')) return ColumnType.BOOLEAN
    if (upper.includes('DATE') && upper.includes('TIME')) return ColumnType.DATETIME
    if (upper.includes('DATE')) return ColumnType.DATE
    if (upper.includes('NUMERIC') || upper.includes('DECIMAL')) return ColumnType.NUMERIC
    return ColumnType.STRING
  }
}
