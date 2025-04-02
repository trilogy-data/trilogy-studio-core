import { Results, ColumnType } from '../editors/results'
import type { ContentInput } from '../stores/resolver'
import type { Import } from '../stores/resolver'
import useQueryHistoryService from './connectionHistoryStore'
import type { ModelConfigStoreType } from './modelStore'
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import { AxiosTrilogyResolver } from '.'
import { type ValidateResponse, type QueryResponse } from './resolver'
export interface QueryInput {
  text: string
  queryType: string
  editorType: string
  imports: Import[]
  extraFilters?: string[]
}

export interface QueryUpdate {
  text: string
  error?: boolean
  running?: boolean
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
  private trilogyResolver: AxiosTrilogyResolver
  private connectionStore: ConnectionStoreType
  private modelStore: ModelConfigStoreType
  private editorStore: EditorStoreType

  constructor(
    trilogyResolver: AxiosTrilogyResolver,
    connectionStore: ConnectionStoreType,
    modelStore: ModelConfigStoreType,
    editorStore: EditorStoreType,
  ) {
    this.trilogyResolver = trilogyResolver
    this.connectionStore = connectionStore
    this.modelStore = modelStore
    this.editorStore = editorStore
  }

  async validateQuery(
    connectionId: string,
    queryInput: QueryInput,
    log: boolean = true,
    sources: ContentInput[] | null = null,
  ): Promise<ValidateResponse | null> {
    // Skip validation for SQL queries
    if (queryInput.queryType === 'sql') {
      return null
    }

    try {
      if (log) {
        // Log validation attempt if logging is enabled
        console.log(`Validating ${queryInput.queryType} query`)
      }
    } catch (error) {
      console.log(error)
    }

    // Check connection
    const conn = this.connectionStore.connections[connectionId]
    if (!conn) {
      return null
    }

    // Get sources if not provided
    if (!sources) {
      sources = conn.model
        ? this.modelStore.models[conn.model].sources.map((source) => ({
            alias: source.alias,
            contents: this.editorStore.editors[source.editor]
              ? this.editorStore.editors[source.editor].contents
              : '',
          }))
        : []
    }

    // Call the trilogyResolver to validate the query
    const validation: ValidateResponse = await this.trilogyResolver.validate_query(
      queryInput.text,
      sources,
      queryInput.imports,
    )
    // Return the imports from the validation result
    return validation
  }
  async executeQuery(
    connectionId: string,
    queryInput: QueryInput,
    onStarted?: () => void,
    onProgress?: (message: QueryUpdate) => void,
    onFailure?: (message: QueryUpdate) => void,
    onSuccess?: (message: QueryResult) => void,
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
        onFailure,
        onSuccess,
      ),
    }
  }

  private async executeQueryInternal(
    connectionId: string,
    queryInput: QueryInput,
    startTime: number,
    controller: AbortController,
    onStarted?: () => void,
    onProgress?: (message: QueryUpdate) => void,
    onFailure?: (message: QueryUpdate) => void,
    onSuccess?: (message: QueryResult) => void,
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
          onProgress({
            text: 'Connection is not active... Attempting to automatically reconnect.',
            error: true,
          })
        await this.connectionStore.resetConnection(connectionId)
        if (onProgress) onProgress({ text: 'Reconnect Successful', running: true })
        // Return special status to indicate retry needed
      } catch (connectionError) {
        if (onFailure) {
          onFailure({
            text: 'Connection failed to reconnect.',
            error: true,
            running: false,
          })
        }
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

    let resolveResponse: QueryResponse | null = null
    try {
      // First step: Resolve query

      //@ts-ignore
      resolveResponse = await Promise.race([
        this.trilogyResolver.resolve_query(
          queryInput.text,
          conn.query_type,
          queryInput.editorType,
          sources,
          queryInput.imports,
          queryInput.extraFilters,
        ),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Query cancelled by user')),
          )
        }),
      ])

      // Check if SQL was generated
      if (!resolveResponse) {
        if (onSuccess) {
          onSuccess({
            success: true,
            results: new Results(new Map(), []),
            executionTime: new Date().getTime() - startTime,
            resultSize: 0,
            columnCount: 0,
          })
        }
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
      if (queryInput.editorType === 'trilogy' || queryInput.editorType === 'preql') {
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
      if (onSuccess) {
        onSuccess( {
          success: true,
          generatedSql,
          results: sqlResponse,
          executionTime: new Date().getTime() - startTime,
          resultSize,
          columnCount,
        })
      }
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
      if (onFailure) {
        onFailure({
          text: errorMessage,
          error: true,
          running: false,
        })
      }
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
      if (column) {
        column.traits = header.traits || []
        sqlResponse.headers.set(header.name, column)
      }

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
