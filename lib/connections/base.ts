// BaseConnection.ts

import { Results, ColumnType } from '../editors/results'

export enum AssetType {
  TABLE = 'table',
  VIEW = 'view',
}

export const EscapePlaceholder = '!`'

export class Column {
  name: string
  type: string
  trilogyType: ColumnType
  nullable: boolean
  primary: boolean
  unique: boolean
  default: string | null
  autoincrement: boolean
  description: string | null = null

  constructor(
    name: string,
    type: string,
    trilogyType: ColumnType,
    nullable: boolean,
    primary: boolean,
    unique: boolean,
    default_: string | null,
    autoincrement: boolean,
    description: string | null = null,
  ) {
    this.name = name
    this.type = type
    this.trilogyType = trilogyType
    this.nullable = nullable
    this.primary = primary
    this.unique = unique
    this.default = default_
    this.autoincrement = autoincrement
    this.description = description
  }
}
export class Table {
  name: string
  schema: string
  database: string
  columns: Column[]
  description: string | null = null
  assetType: AssetType = AssetType.TABLE

  constructor(
    name: string,
    schema: string,
    database: string,
    columns: Column[],
    description: string | null = null,
    assetType: AssetType = AssetType.TABLE,
  ) {
    this.name = name
    this.columns = columns
    this.description = description
    this.assetType = assetType
    this.schema = schema
    this.database = database
  }
}

export class Schema {
  name: string
  tables: Table[]
  database: string
  description: string | null = null

  constructor(name: string, tables: Table[], database: string, description: string | null = null) {
    this.name = name
    this.tables = tables
    this.database = database
    this.description = description
  }
}
export class Database {
  name: string
  schemas: Schema[]
  constructor(name: string, schemas: Schema[]) {
    this.name = name
    this.schemas = schemas
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
  // Configuration for exponential backoff polling
  initialPollingIntervalMs: number = 1000
  maxPollingIntervalMs: number = 60000 // Cap at 1 minute per poll
  maxTotalWaitTimeMs: number = 3600000 // Maximum 1 hour total wait time
  backoffFactor: number = 1.5 // Multiplier for exponential growth
  changed: boolean = false
  deleted: boolean = false

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
    this.changed = false
  }

  abstract getDatabases(): Promise<Database[]>
  abstract getSchemas(database: string): Promise<Schema[]>
  abstract getTables(database: string, schema: string | null): Promise<Table[]>
  abstract getColumns(database: string, schema: string, table: string): Promise<Column[]>

  abstract getTable(database: string, table: string, schema: string | null): Promise<Table>

  setAttribute<K extends keyof this>(key: K, value: this[K]): void
  setAttribute(key: string, value: any): void
  setAttribute(key: string, value: any): void {
    if (!(key in this)) {
      throw new Error(`Attribute "${key}" does not exist on BaseConnection.`)
    }
    if ((this as any)[key] === value) {
      return // No change, do nothing
    }
    this.changed = true
    ;(this as any)[key] = value
  }
  getSecret(): string | null {
    return null
  }

  delete() {
    this.deleted = true
    this.changed = true
  }
  // @ts-ignore
  setSecret(secret: string): void {
    // Do nothing
    // subclasses should implement this if needed
  }

  getSecretName(): string {
    return `trilogy-connection-${this.type}-${this.name}`
  }

  abstract query_core(
    sql: string,
    parameters: Record<string, any> | null,
    identifier: string | null,
  ): Promise<Results>

  async refreshDatabase(database: string): Promise<Database | null> {
    let db = this.databases?.find((db) => db.name === database)

    let schemas = await this.getSchemas(database)
    if (db) {
      db.schemas = schemas
      return db
    }
    return null
  }

  async refreshSchema(database: string, schema: string): Promise<Schema | null> {
    let db = this.databases?.find((db) => db.name === database)
    if (!db) {
      db = new Database(database, [])
      this.databases?.push(db)
    }
    let schemas = await this.getSchemas(database)
    let schemaObj = schemas.find((s) => s.name === schema)
    if (!schemaObj) {
      schemaObj = new Schema(schema, [], database)
      schemas.push(schemaObj)
    }
    let tables = await this.getTables(database, schema)
    if (db) {
      db.schemas = schemas
      schemaObj.tables = tables.filter((t) => t.schema === schema)
      return schemaObj
    }
    return null
  }

  async refreshColumns(database: string, schema: string, table: string): Promise<Column[]> {
    let tableInstance = this.getLocalTable(database, schema, table)
    if (!tableInstance) {
      tableInstance = await this.getTable(database, table, schema)
      if (!tableInstance) {
        throw new Error(`Table ${table} not found in schema ${schema} of database ${database}.`)
      }
    }
    let columns = await this.getColumns(database, schema, tableInstance?.name || '')
    tableInstance.columns = columns
    return columns
  }

  async getTableSample(
    database: string,
    schema: string,
    table: string,
    limit: number = 100,
  ): Promise<Results> {
    let sql = `SELECT * FROM ${database}.${schema}.${table} LIMIT ${limit}`

    return this.query(sql)
  }

  getLocalTable(database: string, schema: string, table: string): Table | null {
    if (!this.databases) {
      return null
    }
    const db = this.databases.find((d) => d.name === database)
    if (!db || !db.schemas) {
      return null
    }
    return db.schemas.find((t) => t.name === schema)?.tables.find((t) => t.name === table) || null
  }

  replaceEscapedStrings(sql: string): string {
    // Replace escaped single quote placeholder with the language appropriate escape path
    return sql.replace(new RegExp(EscapePlaceholder, 'g'), "''")
  }

  async query(
    sql: string,
    parameters: Record<string, any> | null = null,
    identifier: string | null = null,
  ) {
    if (!sql) {
      throw new Error('Query is empty.')
    }
    if (!this.connected) {
      console.error(`Cannot execute query. ${this.name} is not connected.`)
      throw new Error('Connection not established.')
    }

    this.running = true

    try {
      const results = await this.query_core(this.replaceEscapedStrings(sql), parameters, identifier)
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

  async setError(error: string) {
    this.error = error
    this.connected = false
  }

  abstract toJSON(): object

  // @ts-ignore
  static fromJSON(fields: object) {
    throw new Error('Method not implemented.')
  }
}
