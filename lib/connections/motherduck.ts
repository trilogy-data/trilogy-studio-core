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

  // MotherDuck overrides query() rather than query_core() because the MDConnection
  // WASM client exposes evaluateQuery() rather than prepare().  Parameters are
  // substituted positionally via replaceEscapedStrings + manual ? substitution
  // when provided; if the WASM client gains native prepare() support this should
  // be refactored to use query_core() instead.
  async query(
    sql: string,
    parameters: Record<string, any> | null = null,
    _identifier: string | null = null,
  ): Promise<Results> {
    let execSql = this.replaceEscapedStrings(sql)

    if (parameters && Object.keys(parameters).length > 0) {
      // Substitute :name placeholders with quoted values as a best-effort fallback.
      // Negative lookbehind avoids ::type casts.
      const paramRegex = /(?<!:):([a-zA-Z_]\w*)/g
      execSql = execSql.replace(paramRegex, (_match, name) => {
        if (!(name in parameters)) return `:${name}`
        const v = parameters[name]
        if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
        return String(v)
      })
    }

    const result = await this.connection.evaluateQuery(execSql)
    let headers = new Map(
      result.data
        .columnNames()
        //@ts-ignore
        .map((header: string) => [
          header,
          { name: header, type: ColumnType.STRING, description: '' },
        ]),
    )
    //rows are simple arrays of json objects
    // @ts-ignore
    return new Results(headers, result.data.toRows())
  }
}
