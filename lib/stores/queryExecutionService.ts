import { Results, type ResultColumn, ColumnType } from '../editors/results'
import type { ContentInput } from '../stores/resolver'
import type {
  Import,
  MultiQueryComponent,
  QueryResponse,
  BatchQueryResponse,
  ValidateResponse,
} from './resolver'
import useQueryHistoryService from './connectionHistoryStore'
import type { ModelConfigStoreType } from './modelStore'
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import { TrilogyResolver } from '.'

export interface QueryInput {
  text: string
  editorType: 'trilogy' | 'sql' | 'preql'
  imports: Import[]
  extraFilters?: string[]
  parameters?: Record<string, any>
  extraContent?: ContentInput[]
}

export interface QueryUpdate {
  message: string
  error?: boolean
  running?: boolean
  generatedSql?: string
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

export interface BatchQueryResult {
  success: boolean
  results: QueryResult[]
  executionTime: number
}

interface QueryCancellation {
  cancel: () => void
  isActive: () => boolean
}

export default class QueryExecutionService {
  private trilogyResolver: TrilogyResolver
  private connectionStore: ConnectionStoreType
  private modelStore: ModelConfigStoreType
  private editorStore: EditorStoreType
  private storeHistory: boolean

  constructor(
    trilogyResolver: TrilogyResolver,
    connectionStore: ConnectionStoreType,
    modelStore: ModelConfigStoreType,
    editorStore: EditorStoreType,
    storeHistory: boolean = true,
  ) {
    this.trilogyResolver = trilogyResolver
    this.connectionStore = connectionStore
    this.modelStore = modelStore
    this.editorStore = editorStore
    this.storeHistory = storeHistory
  }

  async executeQueriesBatch(
    connectionId: string,
    queries: MultiQueryComponent[],
    editorType: 'trilogy' | 'sql' | 'preql',
    imports: Import[] = [],
    extraFilters?: string[],
    parameters: Record<string, any> = {},
    onStarted?: () => void,
    onProgress?: (message: QueryUpdate) => void,
    onFailure?: Record<string, (message: any) => void>,
    onSuccess?: Record<string, (message: any) => void>,
    dryRun: boolean = false,
    extraContent?: ContentInput[],
  ): Promise<{
    resultPromise: Promise<BatchQueryResult>
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
      resultPromise: this.executeQueriesBatchInternal(
        connectionId,
        queries,
        editorType,
        imports,
        extraFilters || [],
        parameters,
        startTime,
        controller,
        onStarted,
        onProgress,
        onFailure,
        onSuccess,
        dryRun,
        extraContent,
      ),
    }
  }

  private async executeQueriesBatchInternal(
    connectionId: string,
    queries: MultiQueryComponent[],
    editorType: 'trilogy' | 'sql' | 'preql',
    imports: Import[] = [],
    extraFilters: string[],
    parameters: Record<string, any> = {},
    startTime: number,
    controller: AbortController,
    onStarted?: () => void,
    onProgress?: (message: QueryUpdate) => void,
    onFailure?: Record<string, (message: any) => void>,
    onSuccess?: Record<string, (message: any) => void>,
    dryRun: boolean = false,
    extraContent?: ContentInput[],
  ): Promise<BatchQueryResult> {
    // Notify query started if callback provided
    if (onStarted) onStarted()

    // Check connection
    const conn = this.connectionStore.connections[connectionId]
    if (!conn) {
      return {
        success: false,
        executionTime: new Date().getTime() - startTime,
        results: queries.map((_) => ({
          success: false,
          generated_sql: '',
          columns: [],
          error: `Connection ${connectionId} not found.`,
          executionTime: 0,
          results: new Results(new Map(), []),
          resultSize: 0,
          columnCount: 0,
        })),
      }
    }

    if (dryRun) {
      return {
        success: true,
        results: queries.map((query) => ({
          success: true,
          generated_sql: query.query,
          columns: [],
          executionTime: new Date().getTime() - startTime,
          results: new Results(new Map(), []),
          resultSize: 0,
          columnCount: 0,
        })),
        executionTime: new Date().getTime() - startTime,
      }
    }

    if (!conn.connected) {
      try {
        if (onProgress)
          onProgress({
            message: 'Connection is not active... Attempting to automatically reconnect.',
            error: true,
          })
        await this.connectionStore.resetConnection(connectionId)
        if (onProgress) onProgress({ message: 'Reconnect Successful', running: true })
      } catch (connectionError) {
        if (onFailure) {
          Object.values(onFailure).forEach((callback) =>
            callback({
              message: 'Connection failed to reconnect.',
              error: true,
              running: false,
            }),
          )
        }
        return {
          success: false,
          executionTime: new Date().getTime() - startTime,
          results: queries.map((_) => ({
            success: false,
            generated_sql: '',
            columns: [],
            error: `Connection ${connectionId} not active, failed to reconnect.`,
            executionTime: new Date().getTime() - startTime,
            results: new Results(new Map(), []),
            columnCount: 0,
            resultSize: 0,
          })),
        }
      }
    }

    let sources: ContentInput[] =
      conn && conn.model
        ? this.modelStore.models[conn.model].sources.map((source) => ({
          alias: source.alias,
          contents: this.editorStore.editors[source.editor]
            ? this.editorStore.editors[source.editor].contents
            : '',
        }))
        : []
    if (extraContent) {
      sources = sources.concat(extraContent)
    }
    try {
      // Resolve batch queries
      //@ts-ignore
      const batchResponse: BatchQueryResponse = await Promise.race([
        this.trilogyResolver.resolve_queries_batch(
          queries,
          conn.query_type,
          sources,
          imports,
          extraFilters,
        ),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Query batch cancelled by user')),
          )
        }),
      ])

      // If we have SQL queries to execute, process them
      const results = []

      // Only execute if not in dry run mode
      if (batchResponse && Array.isArray(batchResponse.data.queries)) {
        for (let i = 0; i < batchResponse.data.queries.length; i++) {
          const queryResult = batchResponse.data.queries[i]
          if (queryResult.generated_sql) {
            // Execute each SQL query
            try {
              //@ts-ignore
              const sqlResponse: Results = await Promise.race([
                conn.query(queryResult.generated_sql, parameters),
                new Promise((_, reject) => {
                  controller.signal.addEventListener('abort', () =>
                    reject(new Error('Query execution cancelled by user')),
                  )
                }),
              ])

              // Handle Trilogy specific column enrichment
              if (editorType === 'trilogy' || editorType === 'preql') {
                this.enrichTrilogyColumns(queryResult.columns || [], sqlResponse)
              }

              // Add to results
              let resultObj = {
                success: true,
                generatedSql: queryResult.generated_sql,
                results: sqlResponse,
                resultSize: sqlResponse.data.length,
                columnCount: sqlResponse.headers.size,
                executionTime: new Date().getTime() - startTime,
              }

              if (onSuccess && queryResult.label && onSuccess[queryResult.label]) {
                onSuccess[queryResult.label](resultObj)
              }
              results.push(resultObj)
              // Record query in history
              if (this.storeHistory) {
                useQueryHistoryService(connectionId).recordQuery({
                  query: queries[i].query,
                  generatedQuery: queryResult.generated_sql,
                  executionTime: new Date().getTime() - startTime,
                  status: 'success',
                  resultSize: sqlResponse.data.length,
                  resultColumns: sqlResponse.headers.size,
                  errorMessage: null,
                  extraFilters: extraFilters,
                })
              }
            } catch (error) {
              const errorMessage = controller.signal.aborted
                ? 'Query execution cancelled by user'
                : error instanceof Error
                  ? error.message
                  : 'Unknown error occurred during execution'
              let resultObj = {
                success: false,
                error: errorMessage,
                generatedSql: queryResult.generated_sql,
                results: new Results(new Map(), []),
                resultSize: 0,
                columnCount: 0,
                executionTime: new Date().getTime() - startTime,
              }
              results.push(resultObj)
              console.error('Error callback for ', queryResult.label, onFailure)
              console.error('Error details:', error)
              if (onFailure && queryResult.label && onFailure[queryResult.label]) {
                onFailure[queryResult.label](resultObj)
              }

              // Record error in history
              if (this.storeHistory) {
                useQueryHistoryService(connectionId).recordQuery({
                  query: queries[i].query,
                  generatedQuery: queryResult.generated_sql,
                  executionTime: new Date().getTime() - startTime,
                  status: 'error',
                  resultSize: 0,
                  resultColumns: 0,
                  errorMessage: errorMessage,
                  extraFilters: extraFilters,
                })
              }
            }
          } else if (queryResult.error) {
            // Query resolution error
            let resultObj = {
              success: false,
              error: queryResult.error,
              generatedSql: '',
              executionTime: new Date().getTime() - startTime,
              results: new Results(new Map(), []),
              resultSize: 0,
              columnCount: 0,
            }
            if (onFailure && queryResult.label && onFailure[queryResult.label]) {
              onFailure[queryResult.label](resultObj)
            }
            results.push(resultObj)
          } else {
            // No SQL was generated for this query
            let resultObj = {
              success: false,
              error: 'No SQL was generated for this query',
              generatedSql: '',
              executionTime: new Date().getTime() - startTime,
              results: new Results(new Map(), []),
              resultSize: 0,
              columnCount: 0,
            }
            results.push(resultObj)
            if (onFailure && queryResult.label && onFailure[queryResult.label]) {
              onFailure[queryResult.label](resultObj)
            }
          }
        }
      }

      const finalResult = {
        success: true,
        results: results,
        executionTime: new Date().getTime() - startTime,
      }

      // if (onSuccess) {
      //   onSuccess(finalResult)
      // }

      return finalResult
    } catch (error) {
      const errorMessage = controller.signal.aborted
        ? 'Query batch cancelled by user'
        : error instanceof Error
          ? error.message
          : 'Unknown error occurred'

      if (onFailure) {
        Object.values(onFailure).forEach((callback) =>
          callback({
            message: errorMessage,
            error: true,
            running: false,
          }),
        )
      }

      return {
        success: false,
        executionTime: new Date().getTime() - startTime,
        results: [],
      }
    }
  }
  async formatQuery(
    text: string,
    queryType: string,
    editorType: 'trilogy' | 'sql' | 'preql',
    imports: Import[] = [],
    extraContent?: ContentInput[],
  ): Promise<string | null> {
    try {
      const formatted = await this.trilogyResolver.format_query(
        text,
        queryType,
        editorType,
        extraContent,
        imports,
      )

      if (formatted.data && formatted.data.text) {
        return formatted.data.text
      }
      return null
    } catch (error) {
      console.error('Error formatting query:', error)
      throw error
    }
  }

  async createDrilldownQuery(text: string,
    queryType: string,
    editorType: 'trilogy' | 'sql' | 'preql',
    imports: Import[] = [],
    extraFilters: string[] = [],
    drilldown_add: string,
    drilldown_remove: string,
    extraContent?: ContentInput[],): Promise<string | null> {
    try {
      const formatted = await this.trilogyResolver.drilldown_query(
        text,
        queryType,
        editorType,
        drilldown_remove,
        drilldown_add,
        extraContent,
        imports,
        extraFilters,
      )

      if (formatted.data && formatted.data.text) {
        return formatted.data.text
      }
      return null
    } catch (error) {
      console.error('Error formatting query:', error)
      throw error
    }
  }

  async generateQuery(connectionId: string, queryInput: QueryInput): Promise<QueryResponse | null> {
    const conn = this.connectionStore.connections[connectionId]

    let sources = conn.model
      ? this.modelStore.models[conn.model].sources.map((source) => ({
        alias: source.alias,
        contents: this.editorStore.editors[source.editor]
          ? this.editorStore.editors[source.editor].contents
          : '',
      }))
      : []

    if (queryInput.extraContent) {
      sources = sources.concat(queryInput.extraContent)
    }

    return this.trilogyResolver.resolve_query(
      queryInput.text,
      conn.query_type,
      queryInput.editorType,
      sources,
      queryInput.imports,
      queryInput.extraFilters,
      queryInput.parameters,
    )
  }

  async validateQuery(
    connectionId: string,
    queryInput: QueryInput,
    log: boolean = true,
    sources: ContentInput[] | null = null,
  ): Promise<ValidateResponse | null> {
    // Skip validation for SQL queries
    if (queryInput.editorType === 'sql') {
      return null
    }

    try {
      if (log) {
        // Log validation attempt if logging is enabled
        console.log(`Validating ${queryInput.editorType} query`)
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
    if (queryInput.extraContent) {
      sources = sources.concat(queryInput.extraContent)
    }
    // Call the trilogyResolver to validate the query
    const validation: ValidateResponse = await this.trilogyResolver.validate_query(
      queryInput.text,
      sources,
      queryInput.imports,
      queryInput.extraFilters,
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
    dryRun: boolean = false,
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
        dryRun,
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
    dryRun: boolean = false,
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

    if (!conn.connected && !dryRun) {
      try {
        if (onProgress)
          onProgress({
            message: 'Connection is not active... Attempting to automatically reconnect.',
            error: true,
          })
        await this.connectionStore.resetConnection(connectionId)
        if (onProgress) onProgress({ message: 'Reconnect Successful', running: true })
        // Return special status to indicate retry needed
      } catch (connectionError) {
        if (onFailure) {
          onFailure({
            message: 'Connection failed to reconnect.',
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
    let sources: ContentInput[] =
      conn && conn.model
        ? this.modelStore.models[conn.model].sources.map((source) => ({
          alias: source.alias,
          contents: this.editorStore.editors[source.editor]?.contents || '',
        }))
        : []

    if (queryInput.extraContent) {
      sources = sources.concat(queryInput.extraContent)
    }
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
          queryInput.parameters,
        ),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Query cancelled by user')),
          )
        }),
      ])

      // Check if SQL was generated
      if (resolveResponse && resolveResponse.data.generated_output) {
        let columns = resolveResponse.data.columns || []
        let rval = {
          success: true,
          // hardcode result types for now
          generatedSql: resolveResponse.data.generated_sql,
          results: new Results(
            new Map(
              columns.map((col) => [
                col.name,
                { name: col.name, type: ColumnType.STRING, purpose: col.purpose } as ResultColumn,
              ]),
            ),
            resolveResponse.data.generated_output,
          ),
          executionTime: new Date().getTime() - startTime,
          resultSize: resolveResponse.data.generated_output.length,
          columnCount: columns.length,
        }
        console.log(rval)
        if (onSuccess) {
          onSuccess(rval)
        }
        return rval
      } else if (!resolveResponse || !resolveResponse.data.generated_sql || dryRun) {
        let rval = {
          success: true,
          results: new Results(new Map(), []),
          executionTime: new Date().getTime() - startTime,
          resultSize: 0,
          columnCount: 0,
        }
        if (onSuccess) {
          onSuccess(rval)
        }
        return rval
      }

      generatedSql = resolveResponse.data.generated_sql

      const headers = resolveResponse.data.columns

      // Second step: Execute query
      //@ts-ignore
      const sqlResponse: Results = await Promise.race([
        conn.query(generatedSql, queryInput.parameters),
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
      if (this.storeHistory) {
        useQueryHistoryService(connectionId).recordQuery({
          query: queryInput.text,
          generatedQuery: generatedSql,
          executionTime: new Date().getTime() - startTime,
          status: 'success',
          resultSize: resultSize,
          resultColumns: columnCount,
          errorMessage: null,
          extraFilters: queryInput.extraFilters,
        })
      }
      if (onSuccess) {
        onSuccess({
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
      if (this.storeHistory) {
        useQueryHistoryService(connectionId).recordQuery({
          query: queryInput.text,
          generatedQuery: generatedSql,
          executionTime: new Date().getTime() - startTime,
          status: 'error',
          resultSize: resultSize,
          resultColumns: columnCount,
          errorMessage: errorMessage,
        })
      }
      if (onFailure) {
        onFailure({
          message: errorMessage,
          error: true,
          running: false,
          generatedSql,
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
      // sql responses should transform . into _
      let column = sqlResponse.headers.get(header.name.replace('local.', '').replaceAll('.', '_'))
      if (column) {
        column.traits = header.traits || []
        column.address = header.name
        column.purpose = header.purpose
        sqlResponse.headers.set(column.name, column)
      }
    }
  }
}
