import BaseConnection from './base'

import { Results, ColumnType } from '../editors/results'

// @ts-ignore
export default class MotherDuckConnection extends BaseConnection {
  // @ts-ignore
  private connection: MDConnection
  public mdToken: string
  public saveCredential: boolean

  constructor(name: string, mdToken: string, model?: string, saveCredential: boolean = false) {
    super(name, 'motherduck', true, model, saveCredential)
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
      mdToken: this.saveCredential ? 'saved' : '',
    }
  }

  // integrate with generic interface
  getSecret(): string | null {
    return this.mdToken
  }
  setSecret(secret: string): void {
    this.mdToken = secret
  }

  static async fromJSON(fields: {
    name: string
    mdToken: string
    model: string | null
  }): Promise<MotherDuckConnection> {
    let base = new MotherDuckConnection(fields.name, '')
    if (fields.model) {
      base.model = fields.model
    }
    return base
  }

  async connect(): Promise<boolean> {
    if (!this.mdToken) {
      console.log('Missing MotherDuck token.')
      this.error = 'Missing MotherDuck token.'
      return false
    }
    //lazy import of import { MDConnection } from '@motherduck/wasm-client'
    // to avoid loading the library if not needed
    const { MDConnection } = await import('@motherduck/wasm-client')
    this.connection = MDConnection.create({
      mdToken: this.mdToken,
    })
    this.error = null
    return true
  }

  // Example of a custom method for MotherDuck
  async query(sql: string): Promise<Results> {
    const result = await this.connection.evaluateQuery(sql)
    let headers = new Map(
      result.data
        .columnNames()
        //@ts-ignore
        .map((header) => [header, { name: header, type: ColumnType.STRING, description: '' }]),
    )
    //rows are simple arrays of json objects
    // @ts-ignore
    return new Results(headers, result.data.toRows())
  }
}
