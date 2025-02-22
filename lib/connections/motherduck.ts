import BaseConnection from './base'
import { MDConnection } from '@motherduck/wasm-client'
import { Results, ColumnType } from '../editors/results'
import { getDatabaseCredential, storeDatabaseCredential } from '../data/secure'
// @ts-ignore
export default class MotherDuckConnection extends BaseConnection {
  // @ts-ignore
  private connection: MDConnection
  private mdToken: string
  private saveCredential: boolean

  constructor(name: string, mdToken: string, saveCredential: boolean = false, model?: string) {
    super(name, 'motherduck', true, model)
    this.mdToken = mdToken
    this.query_type = 'duckdb'
    this.secureFields = ['mdToken']
    this.saveCredential = saveCredential
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
      // secure field
      mdToken: '',
    }
  }

  static async fromJSON(fields: {
    name: string
    mdToken: string
    model: string | null
  }): Promise<MotherDuckConnection> {
    let mdToken = await getDatabaseCredential(`trilogy-motherduck-${fields.name}`)
    if (!mdToken) {
      mdToken = { label:`trilogy-motherduck-${fields.name}`, value: '' }
    }
    let base = new MotherDuckConnection(fields.name, mdToken.value)
    if (fields.model) {
      base.model = fields.model
    }
    return base
  }

  async connect():Promise<boolean> {
    if (!this.mdToken) {
      console.log('Missing MotherDuck token.')
      this.error = 'Missing MotherDuck token.'
      return false
    }
    this.connection = MDConnection.create({
      mdToken: this.mdToken,
    })
    this.error = null;
    if (this.saveCredential) {
      await storeDatabaseCredential(`trilogy-motherduck-${this.name}`, this.mdToken)
    }
    return true

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
