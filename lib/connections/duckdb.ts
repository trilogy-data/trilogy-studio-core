import * as duckdb from '@duckdb/duckdb-wasm'
import BaseConnection from './base'
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()

// Select a bundle based on browser checks

async function createDuckDB() {
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)
  // Instantiate the asynchronus version of DuckDB-wasm
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
  )
  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  return await db.connect()
}

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
    return createDuckDB().then((conn) => {
      this.connection = conn
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
      })
    })

    // Map data rows
    const data = result.toArray().map((row) => row.toJSON())
    // Return the SqlResult
    return new Results(headers, data)
  }

  // Helper to map DuckDB column types to your ColumnType enum
  private mapDuckDBTypeToColumnType(duckDBType: string): ColumnType {
    switch (duckDBType) {
      case 'VARCHAR':
        return ColumnType.STRING
      case 'INT32':
      case 'INT64':
        return ColumnType.INTEGER
      case 'FLOAT':
      case 'DOUBLE':
        return ColumnType.FLOAT
      case 'BOOLEAN':
        return ColumnType.BOOLEAN
      default:
        return ColumnType.UNKNOWN // Use a fallback if necessary
    }
  }
}
