// BaseConnection.ts

import { Results } from '../editors/results'

export class Column {
  name: string
  type: string
  nullable: boolean
  primary: boolean
  unique: boolean
  default: string | null
  autoincrement: boolean

  constructor(
    name: string,
    type: string,
    nullable: boolean,
    primary: boolean,
    unique: boolean,
    default_: string | null,
    autoincrement: boolean,
  ) {
    this.name = name
    this.type = type
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

  constructor(name: string, columns: Column[]) {
    this.name = name
    this.columns = columns
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
  abstract getColumns(database: string, table: string): Promise<Column[]>
  abstract getTable(database: string, table: string): Promise<Table>

  abstract query_core(sql: string): Promise<Results>

  async query(sql: string) {
    if (!sql) {
      throw new Error('Query is empty.')
    }
    if (!this.connected) {
      console.error(`Cannot execute query. ${this.name} is not connected.`)
      throw new Error('Connection not established.')
    }

    this.running = true
    try {
      const results = await this.query_core(sql)
      this.running = false
      return results
    } catch (error) {
      this.running = false
      // this.error = error.message
      throw error
    }
  }

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
