// queryHistoryStorage.ts

export interface QueryRecord {
  id: number
  connectionName: string
  query: string
  timestamp: string
  executionTime: number // in milliseconds
  status: 'success' | 'error'
  errorMessage?: string | null
  resultSize?: number // number of rows returned
  resultColumns?: number // number of columns
}

const MAX_HISTORY_SIZE = 100 // Maximum number of queries to store per connection

class QueryHistoryStorage {
  private dbName: string
  private storeName: string
  private db: IDBDatabase | null

  constructor() {
    this.dbName = 'sqlEditorDB'
    this.storeName = 'queryHistory'
    this.db = null
    this._initDB()
  }

  // Initialize IndexedDB
  private async _initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = (event: Event) => {
        console.error('Error opening IndexedDB:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store for query history if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: true,
          })

          // Create indexes for efficient retrieval
          store.createIndex('connectionName', 'connectionName', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        resolve()
      }
    })
  }

  // Store a query in history
  public async addQuery(
    connectionName: string,
    queryData: Omit<QueryRecord, 'id' | 'connectionName' | 'timestamp'>,
  ): Promise<number> {
    // Ensure DB is initialized
    if (!this.db) await this._initDB()

    const queryRecord: Omit<QueryRecord, 'id'> = {
      connectionName,
      query: queryData.query,
      timestamp: new Date().toISOString(),
      executionTime: queryData.executionTime,
      status: queryData.status,
      errorMessage: queryData.errorMessage || null,
      resultSize: queryData.resultSize || 0,
      resultColumns: queryData.resultColumns || 0,
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      const request = store.add(queryRecord)

      request.onsuccess = () => {
        // After adding, check if we need to trim the history
        this._enforceHistorySizeLimit(connectionName)
          .then(() => resolve(request.result as number))
          .catch(reject)
      }

      request.onerror = (event: Event) => {
        console.error('Error adding query to history:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Get query history for a specific connection
  public async getQueriesForConnection(
    connectionName: string,
    limit: number = MAX_HISTORY_SIZE,
  ): Promise<QueryRecord[]> {
    if (!this.db) await this._initDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('connectionName')

      const request = index.openCursor(IDBKeyRange.only(connectionName), 'prev') // Descending order by primary key

      const results: QueryRecord[] = []

      request.onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor && results.length < limit) {
          results.push(cursor.value as QueryRecord)
          cursor.continue()
        } else {
          resolve(results)
        }
      }

      request.onerror = (event: Event) => {
        console.error('Error retrieving query history:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Clear history for a specific connection
  public async clearConnectionHistory(connectionName: string): Promise<void> {
    if (!this.db) await this._initDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('connectionName')

      const request = index.openCursor(IDBKeyRange.only(connectionName))

      request.onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }

      request.onerror = (event: Event) => {
        console.error('Error clearing history:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }

  // Enforce the maximum history size per connection
  private async _enforceHistorySizeLimit(connectionName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('connectionName')

      // First, count how many records we have for this connection
      const countRequest = index.count(IDBKeyRange.only(connectionName))

      countRequest.onsuccess = () => {
        const count = countRequest.result
        if (count <= MAX_HISTORY_SIZE) {
          resolve()
          return
        }

        // If we have too many records, delete the oldest ones
        const deleteCount = count - MAX_HISTORY_SIZE
        const request = index.openCursor(IDBKeyRange.only(connectionName))

        let processedCount = 0

        request.onsuccess = (event: Event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor && processedCount < deleteCount) {
            cursor.delete()
            processedCount++
            cursor.continue()
          } else {
            resolve()
          }
        }

        request.onerror = (event: Event) => {
          console.error('Error trimming history:', (event.target as IDBRequest).error)
          reject((event.target as IDBRequest).error)
        }
      }

      countRequest.onerror = (event: Event) => {
        console.error('Error counting history records:', (event.target as IDBRequest).error)
        reject((event.target as IDBRequest).error)
      }
    })
  }
}

export default QueryHistoryStorage
