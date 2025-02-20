import BaseConnection from './base'
import { MDConnection } from '@motherduck/wasm-client'
import { Results, ColumnType } from '../editors/results'
// @ts-ignore
export default class MotherDuckConnection extends BaseConnection {
  // @ts-ignore
  private connection: MDConnection
  private mdToken: string

  constructor(name: string, mdToken: string, model?: string) {
    super(name, 'motherduck', true, model)
    this.mdToken = mdToken
    this.query_type = 'duckdb'
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
      mdToken: this.mdToken,
    }
  }

  static fromJSON(fields: {
    name: string
    mdToken: string
    model: string | null
  }): MotherDuckConnection {
    let base = new MotherDuckConnection(fields.name, fields.mdToken)
    if (fields.model) {
      base.model = fields.model
    }
    return base
  }

  async connect() {
    this.connection = MDConnection.create({
      mdToken: this.mdToken,
    })
  }

  // Example of a custom method for MotherDuck
  async query(sql: string): Promise<Results> {
    const result = await this.connection.evaluateQuery(sql)
    let headers = new Map(
      result.data
        .columnNames()
        .map((header) => [header, { name: header, type: ColumnType.STRING, description: '' }]),
    )
    //rows are simple arrays of json objects
    return new Results(headers, result.data.toRows())
  }
}
