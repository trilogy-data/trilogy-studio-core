import { defineStore } from 'pinia'
import Connection, { computeConnectionId } from '../connections/base'
import {
  DuckDBConnection,
  BigQueryOauthConnection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
  SQLiteConnection,
} from '../connections'
import { EditorTag } from '../editors'
import useEditorStore from './editorStore'
import useModelConfigStore from './modelStore'
import { rehydrateRemoteModel } from '../remotes/rehydrateRemoteModel'
import type { ContentInput } from '../stores/resolver'
// Track in-progress operations
const pendingOperations = new Map()

const connectionTimeout = 60000 // 60 seconds - includes startup time;

async function runStartup(connection: Connection) {
  let editors = useEditorStore()
  const startupEditors = editors.getConnectionEditors(connection.id, [EditorTag.STARTUP_SCRIPT])

  await Promise.all(
    startupEditors.map(async (editor) => {
      console.log(`running startup script ${editor.name}`)
      await connection.query(editor.contents)
    }),
  )
}

// Returns synchronously (undefined) when no rehydration is needed so callers
// still invoke connection.reset() in the same microtask — required by tests
// that assert reset is called eagerly.
function ensureConnectionModel(connection: Connection): Promise<boolean> | void {
  if (!connection.model) return
  const modelStore = useModelConfigStore()
  if (modelStore.models[connection.model]) return
  return rehydrateRemoteModel(connection.model)
}

export const connectionTypes = [
  { label: 'DuckDB', value: 'duckdb' },
  { label: 'BigQuery (OAuth)', value: 'bigquery-oauth' },
  { label: 'BigQuery (Service Account)', value: 'bigquery' },
  // { label: 'Snowflake (Basic Auth)', value: 'snowflake-basic' },
  { label: 'Snowflake (Key Pair Auth)', value: 'snowflake' },
  { label: 'SQLite', value: 'sqlite' },
  { label: 'MotherDuck (Token)', value: 'motherduck' },
  // { label: 'SQL Server (Basic Auth)', value: 'sqlserver' },
]

const useConnectionStore = defineStore('connections', {
  state: () => ({
    connections: {} as Record<string, Connection>,
  }),
  getters: {
    connectionList: (state) => Object.keys(state.connections).map((key) => state.connections[key]),
    unsavedConnections: (state) => {
      return Object.values(state.connections).filter((connection) => connection.changed).length
    },
    /**
     * Resolve a display name to a connection. Local matches win over remote so
     * legacy entities (dashboards, chats) that persisted only the name stay
     * pointed at the local-side connection they originally referenced.
     * Returns undefined when no match exists.
     */
    connectionByName: (state) => (name: string) => {
      const matches = Object.values(state.connections).filter((c) => c.name === name)
      if (matches.length === 0) return undefined
      const local = matches.find((c) => c.storage !== 'remote')
      return local || matches[0]
    },
  },
  actions: {
    addConnection(connection: Connection) {
      this.connections[connection.id] = connection
      return connection
    },
    async connectConnection(id: string) {
      if (!this.connections[id]) {
        throw new Error(`Connection with id "${id}" not found.`)
      }

      // Check if there's already a pending operation for this connection
      const operationKey = `connect:${id}`
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
      const resetPromise = async () => {
        const rehydrate = ensureConnectionModel(this.connections[id])
        if (rehydrate) await rehydrate
        await this.connections[id].reset()
        await runStartup(this.connections[id])
      }

      // Use Promise.race to implement timeout
      const operationPromise = Promise.race([resetPromise(), timeoutPromise]).finally(() => {
        // Clean up when operation completes or fails (including timeout)
        pendingOperations.delete(operationKey)
      })

      // Store the operation promise
      pendingOperations.set(operationKey, operationPromise)

      return operationPromise
    },
    async resetConnection(id: string) {
      if (!this.connections[id]) {
        throw new Error(`Connection with id "${id}" not found.`)
      }

      // Check if there's already a pending operation for this connection
      const operationKey = `reset:${id}`
      if (pendingOperations.has(operationKey)) {
        // Return the existing promise to deduplicate calls
        return pendingOperations.get(operationKey)
      }

      // Create a new operation with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(`Reset operation timed out after ${connectionTimeout / 1000} seconds`),
            ),
          connectionTimeout,
        )
      })

      // The actual reset operation
      const rehydrate = ensureConnectionModel(this.connections[id])
      const resetStart = rehydrate
        ? rehydrate.then(() => this.connections[id].reset())
        : this.connections[id].reset()
      const resetPromise = resetStart.then(async () => {
        try {
          await runStartup(this.connections[id])
        } catch (error) {
          this.connections[id].setError((error as Error).message)
          throw error
        }
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
    // Soft-deletes: leaves the connection in the map with `deleted: true` so
    // that the next saveConnections() pass can purge it from localStorage.
    // Call purgeDeletedConnections() after the save to hard-remove from memory.
    deleteConnection(id: string) {
      if (this.connections[id]) {
        this.connections[id].delete()
      }
    },
    // Hard-removes any connection currently marked as deleted. Callers should
    // run this after saveConnections() so that the persistence layer has had
    // a chance to observe the `deleted` flag and drop the entry from storage.
    purgeDeletedConnections() {
      for (const id of Object.keys(this.connections)) {
        if (this.connections[id].deleted) {
          delete this.connections[id]
        }
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
    getConnectionSources(id: string) {
      const conn = this.connections[id]
      const modelStore = useModelConfigStore()
      const editorStore = useEditorStore()
      let sources: ContentInput[] =
        conn && conn.model
          ? modelStore.models[conn.model].sources.map((source) => ({
              alias: source.alias,
              contents: editorStore.editors[source.editor]
                ? editorStore.editors[source.editor].contents
                : '',
            }))
          : []
      return sources
    },
    /**
     * Create a new local connection. The display name must be unique among
     * local connections (its derived id, `local:<name>`, is the store key).
     * Remote connections share the local namespace by storage prefix, so the
     * same display name on a remote import does not conflict.
     */
    newConnection(name: string, type: string, options: Record<string, any>): Connection {
      const id = computeConnectionId({ name, storage: 'local' })
      if (this.connections[id]) {
        throw new Error(`Connection with name "${name}" already exists.`)
      }
      let connection: Connection
      if (type === 'duckdb') {
        connection = new DuckDBConnection(name)
      } else if (type === 'sqlite') {
        connection = new SQLiteConnection(name)
      } else if (type === 'bigquery-oauth') {
        connection = new BigQueryOauthConnection(name, options.projectId)
      } else if (type === 'bigquery') {
        connection = new BigQueryOauthConnection(name, options.projectId)
      } else if (type === 'snowflake') {
        connection = new SnowflakeJwtConnection(name, {
          account: options.account,
          username: options.username,
          privateKey: options.privateKey,
          warehouse: options.warehouse,
          role: options.role,
          database: options.database,
          schema: options.schema,
        })
      } else if (type === 'motherduck') {
        connection = new MotherDuckConnection(name, options.mdToken, options.saveCredential)
      } else {
        throw new Error(`Connection type "${type}" not found.`)
      }
      this.connections[connection.id] = connection
      if (options.model) {
        connection.model = options.model
      } else {
        const modelStore = useModelConfigStore()
        connection.model = modelStore.newModelConfig(name).name
      }
      return connection
    },
  },
})

export type ConnectionStoreType = ReturnType<typeof useConnectionStore>
export default useConnectionStore
