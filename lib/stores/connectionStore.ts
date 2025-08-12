import { defineStore } from 'pinia'
import Connection from '../connections/base'
import {
  DuckDBConnection,
  BigQueryOauthConnection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
} from '../connections'
import { EditorTag } from '../editors'
import useEditorStore from './editorStore'
import useModelConfigStore from './modelStore'

// Track in-progress operations
const pendingOperations = new Map()

const connectionTimeout = 60000 // 60 seconds - includes startup time;

async function runStartup(connection: Connection) {
  let editors = useEditorStore()
  return editors
    .getConnectionEditors(connection.name, [EditorTag.STARTUP_SCRIPT])
    .forEach(async (editor) => {
      console.log(`running startup script ${editor.name}`)
      await connection.query(editor.contents)
    })
}

const useConnectionStore = defineStore('connections', {
  state: () => ({
    connections: {} as Record<string, Connection>,
  }),
  getters: {
    connectionList: (state) => Object.keys(state.connections).map((key) => state.connections[key]),
    unsavedConnections: (state) => {
      return Object.values(state.connections).filter((connection) => connection.changed).length
    },
  },
  actions: {
    addConnection(connection: Connection) {
      this.connections[connection.name] = connection
      return connection
    },
    async connectConnection(name: string) {
      if (!this.connections[name]) {
        throw new Error(`Connection with name "${name}" not found.`)
      }

      // Check if there's already a pending operation for this connection
      const operationKey = `connect:${name}`
      if (pendingOperations.has(operationKey)) {
        // Return the existing promise to deduplicate calls
        return pendingOperations.get(operationKey)
      }

      // Create a new operation with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Connection timed out after 30 seconds')),
          connectionTimeout,
        )
      })

      // The actual connection operation
      const resetPromise = this.connections[name].reset().then(() => {
        return runStartup(this.connections[name])
      })

      // Use Promise.race to implement timeout
      const operationPromise = Promise.race([resetPromise, timeoutPromise]).finally(() => {
        // Clean up when operation completes or fails (including timeout)
        pendingOperations.delete(operationKey)
      })

      // Store the operation promise
      pendingOperations.set(operationKey, operationPromise)

      return operationPromise
    },
    async resetConnection(name: string) {
      if (!this.connections[name]) {
        throw new Error(`Connection with name "${name}" not found.`)
      }

      // Check if there's already a pending operation for this connection
      const operationKey = `reset:${name}`
      if (pendingOperations.has(operationKey)) {
        // Return the existing promise to deduplicate calls
        return pendingOperations.get(operationKey)
      }

      // Create a new operation with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`Reset operation timed out after ${connectionTimeout / 1000} seconds`)),
          connectionTimeout,
        )
      })

      // The actual reset operation
      const resetPromise = this.connections[name]
        .reset()
        .then(() => {
          return runStartup(this.connections[name])
        })

      // Use Promise.race to implement timeout
      const operationPromise = Promise.race([resetPromise, timeoutPromise]).finally(() => {
        // Clean up when operation completes, fails, OR times out
        pendingOperations.delete(operationKey)
      })

      // Store the operation promise
      pendingOperations.set(operationKey, operationPromise)

      return operationPromise
    },
    deleteConnection(name: string) {
      if (this.connections[name]) {
        this.connections[name].delete()
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
      }
      // else if (type === 'snowflake-basic') {
      //   this.connections[name] = new SnowflakeBasicAuthConnection(name, {
      //     account: options.account,
      //     username: options.username,
      //     password: options.password,
      //     warehouse: options.warehouse,
      //     role: options.role,
      //     database: options.database,
      //     schema: options.schema,
      //   })
      // }
      else if (type === 'snowflake') {
        this.connections[name] = new SnowflakeJwtConnection(name, {
          account: options.account,
          username: options.username,
          privateKey: options.privateKey,
          warehouse: options.warehouse,
          role: options.role,
          database: options.database,
          schema: options.schema,
        })
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
      if (options.model) {
        this.connections[name].model = options.model
      } else {
        const modelStore = useModelConfigStore()
        this.connections[name].model = modelStore.newModelConfig(name).name
      }
    },
  },
})

export type ConnectionStoreType = ReturnType<typeof useConnectionStore>
export default useConnectionStore
