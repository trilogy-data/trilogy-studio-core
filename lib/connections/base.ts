// BaseConnection.ts

import { Results, ColumnType } from '../editors/results'

export enum AssetType {
  TABLE = 'table',
  VIEW = 'view',
}

export class Column {
  name: string
  type: string
  trilogyType: ColumnType
  nullable: boolean
  primary: boolean
  unique: boolean
  default: string | null
  autoincrement: boolean

  constructor(
    name: string,
    type: string,
    trilogyType: ColumnType,
    nullable: boolean,
    primary: boolean,
    unique: boolean,
    default_: string | null,
    autoincrement: boolean,
  ) {
    this.name = name
    this.type = type
    this.trilogyType = trilogyType
    this.nullable = nullable
    this.primary = primary
    this.unique = unique
    this.default = default_
    this.autoincrement = autoincrement
  }
}
export class Table {
  name: string
  columns: Column[]
  description: string | null = null
  assetType: AssetType = AssetType.TABLE
  schema: string | null = null
  database: string | null = null

  constructor(
    name: string,
    columns: Column[],
    description: string | null = null,
    assetType: AssetType = AssetType.TABLE,
    // Optional parameters for schema and database
    schema: string | null = null, // e.g., 'public' for PostgreSQL
    database: string | null = null, // e.g., 'my_database' for SQL databases
  ) {
    this.name = name
    this.columns = columns
    this.description = description
    this.assetType = assetType
    this.schema = schema
    this.database = database
  }
}

export class Database {
  name: string
  tables: Table[]
  constructor(name: string, tables: Table[]) {
    this.name = name
    this.tables = tables
  }
}

export default abstract class BaseConnection {
  name: string
  type: string
  storage: string
  model: string | null = null
  connected: boolean
  error: string | null = null
  query_type: string = 'abstract'
  running: boolean = false
  databases: Database[] | null = null
  secureFields: string[] = []
  saveCredential: boolean = false

  constructor(
    name: string,
    type: string,
    autoConnect: boolean = true,
    model?: string,
    saveCredential: boolean = false,
  ) {
    this.name = name
    this.type = type
    this.model = model || null
    // hardcoded for dev
    this.storage = 'local'
    this.query_type = 'abstract'
    this.saveCredential = saveCredential
    this.connected = false // Default to disconnected
    if (autoConnect) {
      this.connect()
        .then((res) => {
          if (res) {
            this.connected = true
          }
        })
        .catch((error) => {
          if (error instanceof Error) {
            this.error = error.message
          }
          throw error
        })
    }
    this.secureFields = []
  }

  abstract getDatabases(): Promise<Database[]>
  abstract getTables(database: string): Promise<Table[]>
  abstract getColumns(database: string, table: string, schema: string | null): Promise<Column[]>
  abstract getTable(database: string, table: string, schema: string | null): Promise<Table>

  abstract query_core(sql: string, identifier:string | null): Promise<Results>

  async refreshDatabase(database: string): Promise<Database | null> {
    let db = this.databases?.find((db) => db.name === database)

    let tables = await this.getTables(database)
    if (db) {
      db.tables = tables
      return db
    }
    return null
  }

  async getTableSample(
    database: string,
    table: string,
    limit: number = 100,
    schema: string | null = null,
  ): Promise<Results> {
    let sql = `SELECT * FROM ${database}.${table} LIMIT ${limit}`
    if (schema) {
      sql = `SELECT * FROM ${database}.${schema}.${table} LIMIT ${limit}`
    }

    return this.query(sql)
  }

  getLocalTable(database: string, table: string) {
    if (!this.databases) {
      return null
    }
    const db = this.databases.find((d) => d.name === database)
    if (!db) {
      return null
    }
    return db.tables.find((t) => t.name === table)
  }

  async query(sql: string, identifier:string | null = null) {
    if (!sql) {
      throw new Error('Query is empty.')
    }
    if (!this.connected) {
      console.error(`Cannot execute query. ${this.name} is not connected.`)
      throw new Error('Connection not established.')
    }

    this.running = true
    try {
      const results = await this.query_core(sql, identifier)
      this.running = false
      return results
    } catch (error) {
      this.running = false
      // this.error = error.message
      throw error
    }
  }

  abstract cancelQuery(identifier: string): Promise<boolean>

  abstract connect(): Promise<boolean>

  setModel(model: string) {
    this.model = model
  }

  async reset() {
    try {
      this.connected = false
      this.error = null
      await this.connect()
      this.connected = true
    } catch (error) {
      if (error instanceof Error) {
        this.error = error.message
      }
      throw error
    }
  }

  abstract toJSON(): object

  // @ts-ignore
  static fromJSON(fields: object) {
    throw new Error('Method not implemented.')
  }
}
