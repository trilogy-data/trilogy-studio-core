import { defineStore } from 'pinia'
import Connection from '../connections/base'
import { DuckDBConnection, BigQueryOauthConnection, MotherDuckConnection } from '../connections'

const useConnectionStore = defineStore('connections', {
  state: () => ({
    connections: {} as Record<string, Connection>,
  }),

  actions: {
    addConnection(connection: Connection) {
      this.connections[connection.name] = connection
      return connection
    },

    resetConnection(name: string) {
      if (this.connections[name]) {
        return this.connections[name].reset()
      } else {
        throw new Error(`Connection with name "${name}" not found.`)
      }
    },

    removeConnection(name: string) {
      if (this.connections[name]) {
        // this.connections[name].close()
        delete this.connections[name]
      }
    },

    connectionStateToStatus(connection: Connection | null) {
      if (!connection) {
        return 'disabled'
      }
      if (connection.error) {
        return 'failed'
      }
      if (connection.running) {
        return 'running'
      } else if (connection.connected) {
        return 'connected'
      } else {
        return 'disabled'
      }
    },

    newConnection(name: string, type: string, options: Record<string, any>) {
      if (this.connections[name]) {
        throw new Error(`Connection with name "${name}" already exists.`)
      }
      if (type === 'duckdb') {
        this.connections[name] = new DuckDBConnection(name)
      } else if (type === 'bigquery-oauth') {
        this.connections[name] = new BigQueryOauthConnection(name, options.projectId)
      } else if (type === 'bigquery') {
        this.connections[name] = new BigQueryOauthConnection(name, options.projectId)
      } else if (type === 'motherduck') {
        this.connections[name] = new MotherDuckConnection(
          name,
          options.mdToken,
          options.saveCredential,
        )
      }
      // else if (type === 'sqlserver') {
      //   this.connections[name] = new SQLServerConnection(name, options.username, options.password);
      // }
      else {
        throw new Error(`Connection type "${type}" not found.`)
      }
    },
  },
})

export type ConnectionStoreType = ReturnType<typeof useConnectionStore>

export default useConnectionStore
