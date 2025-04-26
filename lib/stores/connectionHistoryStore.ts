// useQueryHistory.ts
import { ref, onMounted, watch } from 'vue'
import type { Ref } from 'vue'
import QueryHistoryStorage from '../data/connectionHistoryStorage'
import type { QueryRecord } from '../data/connectionHistoryStorage'
export interface QueryData {
  query: string
  generatedQuery?: string | null
  executionTime: number
  status: 'success' | 'error'
  errorMessage?: string | null
  resultSize?: number
  resultColumns?: number
  extraFilters?: string[] | undefined
}

interface QueryHistoryReturn {
  history: Ref<QueryRecord[]>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  recordQuery: (queryData: QueryData) => Promise<void>
  clearHistory: () => Promise<void>
  executeWithHistory: <T>(sqlFn: (query: string) => Promise<T>, query: string) => Promise<T>
  refreshHistory: () => Promise<void>
}

// Create a singleton instance of the storage
const historyStorage = new QueryHistoryStorage()

export default function useQueryHistory(connectionName: string): QueryHistoryReturn {
  const history = ref<QueryRecord[]>([])
  const isLoading = ref<boolean>(true)
  const error = ref<string | null>(null)

  // Load query history for this connection
  const loadHistory = async (): Promise<void> => {
    isLoading.value = true
    try {
      const queries = await historyStorage.getQueriesForConnection(connectionName)
      history.value = queries
      error.value = null
    } catch (err) {
      console.error('Failed to load query history:', err)
      error.value = 'Failed to load query history'
    } finally {
      isLoading.value = false
    }
  }

  // Record a new query
  const recordQuery = async (queryData: QueryData): Promise<void> => {
    try {
      await historyStorage.addQuery(connectionName, queryData)
      // Refresh the history after recording
      await loadHistory()
    } catch (err) {
      console.error('Failed to record query:', err)
      error.value = 'Failed to record query'
    }
  }

  // Clear history for this connection
  const clearHistory = async (): Promise<void> => {
    isLoading.value = true
    try {
      await historyStorage.clearConnectionHistory(connectionName)
      history.value = []
      error.value = null
    } catch (err) {
      console.error('Failed to clear query history:', err)
      error.value = 'Failed to clear query history'
    } finally {
      isLoading.value = false
    }
  }

  // Helper for SQL connection to wrap queries with history recording
  const executeWithHistory = async <T>(
    sqlFn: (query: string) => Promise<T>,
    query: string,
  ): Promise<T> => {
    const startTime = performance.now()
    let status: 'success' | 'error' = 'success'
    let errorMessage: string | null = null
    let resultSize = 0
    let resultColumns = 0
    let result: T | null = null

    try {
      // Execute the actual SQL query
      result = await sqlFn(query)

      // Get result metadata
      if (result && Array.isArray(result)) {
        resultSize = result.length
        if (resultSize > 0 && typeof result[0] === 'object') {
          resultColumns = Object.keys(result[0]).length
        }
      }
    } catch (err) {
      status = 'error'
      errorMessage = err instanceof Error ? err.message : String(err)
      throw err // Re-throw to allow normal error handling
    } finally {
      const endTime = performance.now()
      const executionTime = endTime - startTime

      // Record the query regardless of success/failure
      await recordQuery({
        query,
        executionTime,
        status,
        errorMessage,
        resultSize,
        resultColumns,
      })
    }

    return result as T
  }

  // Load history on initial render or when connection changes
  onMounted(() => {
    if (connectionName) {
      loadHistory()
    }
  })

  // Watch for changes to connection name
  watch(
    () => connectionName,
    (newConnectionName) => {
      if (newConnectionName) {
        loadHistory()
      }
    },
  )

  return {
    history: history,
    isLoading: isLoading,
    error: error,
    recordQuery,
    clearHistory,
    executeWithHistory,
    refreshHistory: loadHistory,
  }
}
