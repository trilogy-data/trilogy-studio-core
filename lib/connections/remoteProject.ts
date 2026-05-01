import BaseConnection, { Database, Schema, Table, Column } from './base'
import { Results } from '../editors/results'

export default class RemoteProjectConnection extends BaseConnection {
  remoteStoreId: string
  remoteEngine: string

  constructor(name: string, remoteStoreId: string, remoteEngine: string, model?: string) {
    super(name, 'remote', false, model)
    this.remoteStoreId = remoteStoreId
    this.remoteEngine = remoteEngine
    this.query_type = remoteEngine || 'duckdb'
    this.storage = 'remote'
    this.connected = true
    this.recomputeId()
  }

  static fromJSON(fields: {
    name: string
    remoteStoreId: string
    remoteEngine: string
    model?: string | null
  }): RemoteProjectConnection {
    return new RemoteProjectConnection(
      fields.name,
      fields.remoteStoreId,
      fields.remoteEngine,
      fields.model || undefined,
    )
  }

  async connect(): Promise<boolean> {
    return false
  }

  async getDatabases(): Promise<Database[]> {
    return []
  }

  async getSchemas(_: string): Promise<Schema[]> {
    return []
  }

  async getTables(_: string, __: string | null): Promise<Table[]> {
    return []
  }

  async getColumns(_: string, __: string, ___: string): Promise<Column[]> {
    return []
  }

  async getTable(_: string, table: string, __: string | null): Promise<Table> {
    return new Table(table, '', '', [])
  }

  async query_core(): Promise<Results> {
    throw new Error('Remote store connections do not execute queries directly.')
  }

  async cancelQuery(_: string): Promise<boolean> {
    return false
  }

  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      model: this.model,
      remoteStoreId: this.remoteStoreId,
      remoteEngine: this.remoteEngine,
    }
  }
}
