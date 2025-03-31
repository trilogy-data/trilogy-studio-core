import { Results, ColumnType } from '../editors/results'
import type { ContentInput } from '../stores/resolver'
import type { Import } from '../stores/resolver'
import useQueryHistoryService from './connectionHistoryStore'
import type { ModelConfigStoreType } from './modelStore'
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
export interface QueryInput {
  text: string
  queryType: string
  editorType: string
  imports: Import[]
}

export interface QueryResult {
  success: boolean
  generatedSql?: string
  results?: Results
  error?: string
  executionTime: number
  resultSize: number
  columnCount: number
}

interface QueryCancellation {
  cancel: () => void
  isActive: () => boolean
}

export default class QueryExecutionService {
  private trilogyResolver: any
  private connectionStore: ConnectionStoreType
  private modelStore: ModelConfigStoreType
  private editorStore: EditorStoreType

  constructor(
    trilogyResolver: any,
    connectionStore: ConnectionStoreType,
    modelStore: ModelConfigStoreType,
    editorStore: EditorStoreType,
  ) {
    this.trilogyResolver = trilogyResolver
    this.connectionStore = connectionStore
    this.modelStore = modelStore
    this.editorStore = editorStore
  }

  async executeQuery(
    connectionId: string,
    queryInput: QueryInput,
    onStarted?: () => void,
    onProgress?: (message: string) => void,
  ): Promise<{
    resultPromise: Promise<QueryResult>
    cancellation: QueryCancellation
  }> {
    const startTime = new Date().getTime()

    // Create cancellation controller
    const controller = new AbortController()
    const cancellation: QueryCancellation = {
      cancel: () => controller.abort(),
      isActive: () => !controller.signal.aborted,
    }

    // Return the cancellation controller immediately
    // along with a promise for the eventual result
    return {
      cancellation,
      resultPromise: this.executeQueryInternal(
        connectionId,
        queryInput,
        startTime,
        controller,
        onStarted,
        onProgress,
      ),
    }
  }

  private async executeQueryInternal(
    connectionId: string,
    queryInput: QueryInput,
    startTime: number,
    controller: AbortController,
    onStarted?: () => void,
    onProgress?: (message: string) => void,
  ): Promise<QueryResult> {
    let resultSize = 0
    let columnCount = 0
    let generatedSql = ''

    // Notify query started if callback provided
    if (onStarted) onStarted()

    // Check connection
    const conn = this.connectionStore.connections[connectionId]
    if (!conn) {
      return {
        success: false,
        error: `Connection ${connectionId} not found.`,
        executionTime: 0,
        resultSize: 0,
        columnCount: 0,
      }
    }

    if (!conn.connected) {
      try {
        if (onProgress)
          onProgress('Connection is not active... Attempting to automatically reconnect.')
        await this.connectionStore.resetConnection(connectionId)
        // Return special status to indicate retry needed
        return {
          success: false,
          error: 'CONNECTION_RETRY_NEEDED',
          executionTime: 0,
          resultSize: 0,
          columnCount: 0,
        }
      } catch (connectionError) {
        return {
          success: false,
          error: 'Connection is not active.',
          executionTime: 0,
          resultSize: 0,
          columnCount: 0,
        }
      }
    }
    const sources: ContentInput[] =
      conn && conn.model
        ? this.modelStore.models[conn.model].sources.map((source) => ({
            alias: source.alias,
            contents: this.editorStore.editors[source.editor]
              ? this.editorStore.editors[source.editor].contents
              : '',
          }))
        : []

    try {
      // First step: Resolve query
      const resolveResponse = await Promise.race([
        this.trilogyResolver.resolve_query(
          queryInput.text,
          conn.query_type,
          queryInput.editorType,
          sources,
          queryInput.imports,
        ),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Query cancelled by user')),
          )
        }),
      ])

      // Check if SQL was generated
      if (!resolveResponse.data.generated_sql) {
        return {
          success: true,
          results: new Results(new Map(), []),
          executionTime: new Date().getTime() - startTime,
          resultSize: 0,
          columnCount: 0,
        }
      }

      generatedSql = resolveResponse.data.generated_sql
      const headers = resolveResponse.data.columns

      // Second step: Execute query
      //@ts-ignore
      const sqlResponse: Results = await Promise.race([
        conn.query(generatedSql),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Query cancelled by user')),
          )
        }),
      ])

      // Handle Trilogy specific column enrichment
      if (queryInput.editorType === 'trilogy') {
        this.enrichTrilogyColumns(headers, sqlResponse)
      }

      resultSize = sqlResponse.data.length
      columnCount = sqlResponse.headers.size
      useQueryHistoryService(connectionId).recordQuery({
        query: generatedSql,
        executionTime: new Date().getTime() - startTime,
        status: 'success',
        resultSize: resultSize,
        resultColumns: columnCount,
        errorMessage: null,
      })
      return {
        success: true,
        generatedSql,
        results: sqlResponse,
        executionTime: new Date().getTime() - startTime,
        resultSize,
        columnCount,
      }
    } catch (error) {
      const errorMessage = controller.signal.aborted
        ? 'Query cancelled by user'
        : error instanceof Error
          ? error.message
          : 'Unknown error occurred'
      useQueryHistoryService(connectionId).recordQuery({
        query: generatedSql,
        executionTime: new Date().getTime() - startTime,
        status: 'error',
        resultSize: resultSize,
        resultColumns: columnCount,
        errorMessage: errorMessage,
      })
      return {
        success: false,
        error: errorMessage,
        executionTime: new Date().getTime() - startTime,
        resultSize,
        columnCount,
      }
    }
  }

  private enrichTrilogyColumns(headers: any[], sqlResponse: Results): void {
    for (let i = 0; i < headers.length; i++) {
      let header = headers[i]
      let column = sqlResponse.headers.get(header.name)

      if (column && (header.datatype?.traits || []).includes('money')) {
        column.type = ColumnType.MONEY
        sqlResponse.headers.set(header.name, column)
      } else if (column && (header.datatype?.traits || []).includes('percent')) {
        column.type = ColumnType.PERCENT
        sqlResponse.headers.set(header.name, column)
      }
    }
  }
}
