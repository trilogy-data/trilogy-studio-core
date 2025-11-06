import { QueryExecutionService } from '../stores'
import type { Dashboard, GridItemDataResponse } from '../dashboards/base'
import type { ContentInput, MultiQueryComponent } from '../stores/resolver'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { Results } from '../editors/results'

export interface QueryExecutorDependencies {
  queryExecutionService: QueryExecutionService
  connectionStore: ConnectionStoreType
  editorStore: EditorStoreType
  connectionName: string
  dashboardId: string
  getDashboardData: (dashboardId: string) => Dashboard
  getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse
  setItemData: (itemId: string, dashboardId: string, content: any) => void

  options?: {
    maxConcurrentQueries?: number
    retryAttempts?: number
    batchDelay?: number
  }
}

interface QueryRequest {
  itemId: string
  dashboardId: string

  // connectionName: string;
  queryInput: {
    text: string
    extraFilters?: string[]
    parameters?: Record<string, any>
    extraContent?: ContentInput[]
  }

  priority: number // Lower number = higher priority
  onSuccess: (result: any) => void
  onError: (error: string) => void
  onProgress: (message: any) => void
}

interface QueuedQuery extends QueryRequest {
  id: string
  timestamp: number
  retryCount: number
}

interface QueryWaiter {
  resolve: (result: any) => void
  reject: (error: string) => void
}

export class DashboardQueryExecutor {
  private queryQueue: Map<string, QueuedQuery> = new Map()
  private activeQueries: Set<string> = new Set()
  private queryWaiters: Map<string, QueryWaiter> = new Map()
  // Track the latest query ID for each itemId
  private latestQueryByItemId: Map<string, string> = new Map()
  // Track which itemIds are associated with each query ID (for cleanup)
  private itemIdByQueryId: Map<string, string> = new Map()

  public queryExecutionService: QueryExecutionService
  public connectionStore: ConnectionStoreType
  private editorStore: EditorStoreType
  public connectionName: string
  private dashboardId: string
  private getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse
  private setItemData: (itemId: string, dashboardId: string, content: any) => void
  private getDashboardData: (dashboardId: string) => Dashboard
  private maxConcurrentQueries: number
  private retryAttempts: number
  private batchDelay: number // ms to wait before executing batch
  private batchTimeout: NodeJS.Timeout | null = null
  private connectionPromise: Promise<void> | null = null
  private connectionChecked: boolean = false

  constructor(
    queryExecutionService: any,
    connectionStore: ConnectionStoreType,
    editorStore: EditorStoreType,
    connectionName: string,
    dashboardId: string,
    getDashboardData: (dashboardId: string) => Dashboard,
    getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse,
    setItemData: (itemId: string, dashboardId: string, content: any) => void,
    options: {
      maxConcurrentQueries?: number
      retryAttempts?: number
      batchDelay?: number
    } = {},
  ) {
    this.queryExecutionService = queryExecutionService
    this.connectionStore = connectionStore
    this.editorStore = editorStore
    this.connectionName = connectionName
    this.maxConcurrentQueries = options.maxConcurrentQueries || 10
    this.retryAttempts = options.retryAttempts || 2
    this.batchDelay = options.batchDelay || 0
    this.dashboardId = dashboardId
    this.getItemData = getItemData
    this.setItemData = setItemData
    this.getDashboardData = getDashboardData
    // Check and ensure connection on instantiation
    this.ensureConnection()
  }

  /**
   * Ensure connection is established and cache the promise to avoid multiple connection attempts
   */
  private async ensureConnection(): Promise<void> {
    if (this.connectionChecked && this.isConnectionActive()) {
      return
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this.checkAndConnect()
    return this.connectionPromise
  }

  /**
   * Check if connection is active, and connect if not
   */
  private async checkAndConnect(): Promise<void> {
    try {
      const conn = this.connectionStore.connections[this.connectionName]
      if (!conn) {
        throw new Error(`Connection "${this.connectionName}" not found in store`)
      }

      if (!conn.connected) {
        console.log(`Connection "${this.connectionName}" not connected, attempting to connect...`)
        await this.connectionStore.resetConnection(this.connectionName)
        if (!conn.connected) {
          throw new Error(`Connection "${this.connectionName}" failed to connect`)
        }
      }

      this.connectionChecked = true
      this.connectionPromise = null // Reset for future checks
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to establish connection'
      console.error(`Failed to connect "${this.connectionName}":`, errorMessage)

      // Fail all queued queries
      this.failAllQueries(errorMessage)

      this.connectionPromise = null
      throw error
    }
  }

  /**
   * Check if the current connection is active
   */
  private isConnectionActive(): boolean {
    const conn = this.connectionStore.connections[this.connectionName]
    return conn?.connected === true
  }

  /**
   * Fail all queued and waiting queries with the given error message
   */
  private failAllQueries(errorMessage: string): void {
    // Fail all queued queries
    this.queryQueue.forEach((query) => {
      query.onError(errorMessage)
    })
    this.queryQueue.clear()

    // Reject all waiting promises
    this.queryWaiters.forEach((waiter) => {
      waiter.reject(errorMessage)
    })
    this.queryWaiters.clear()

    // Clear active queries
    this.activeQueries.clear()

    // Clear tracking maps
    this.latestQueryByItemId.clear()
    this.itemIdByQueryId.clear()
  }

  /**
   * Cancel pending queries for a specific itemId
   */
  private cancelPendingQueriesForItem(itemId: string): void {
    const currentLatestQueryId = this.latestQueryByItemId.get(itemId)

    // Find and cancel all queries for this itemId except the current latest
    const queriesToCancel: string[] = []

    this.queryQueue.forEach((query, queryId) => {
      if (query.itemId === itemId && queryId !== currentLatestQueryId) {
        queriesToCancel.push(queryId)
      }
    })

    this.activeQueries.forEach((queryId) => {
      const itemIdForQuery = this.itemIdByQueryId.get(queryId)
      if (itemIdForQuery === itemId && queryId !== currentLatestQueryId) {
        queriesToCancel.push(queryId)
      }
    })

    // Cancel the identified queries
    queriesToCancel.forEach((queryId) => {
      console.log(`Cancelling outdated query ${queryId} for itemId ${itemId}`)
      this.cancelQuery(queryId)
    })
  }

  /**
   * Check if a query ID is the latest for its itemId
   */
  private isLatestQueryForItem(queryId: string): boolean {
    const itemId = this.itemIdByQueryId.get(queryId)
    if (!itemId) return false

    const latestQueryId = this.latestQueryByItemId.get(itemId)
    return latestQueryId === queryId
  }

  /**
   * Cleanup tracking data for a completed query
   */
  private cleanupQueryTracking(queryId: string): void {
    const itemId = this.itemIdByQueryId.get(queryId)
    if (itemId) {
      // Only remove from latestQueryByItemId if this was indeed the latest query
      if (this.latestQueryByItemId.get(itemId) === queryId) {
        this.latestQueryByItemId.delete(itemId)
      }
      this.itemIdByQueryId.delete(queryId)
    }
  }

  /**
   * Get default priority based on chart position and type
   */
  private getDefaultPriority(itemId: string): number {
    return this.getDashboardData(this.dashboardId).layout.find((item) => item.i === itemId)?.y || 0
  }

  public setConnection(connectionName: string): void {
    this.connectionName = connectionName
    this.connectionChecked = false // Reset connection check for new connection
    this.connectionPromise = null
  }

  /**
   * Wait for a specific query to complete
   * @param queryId The ID of the query to wait for
   * @returns Promise that resolves with the query result or rejects with an error
   */
  public waitForQuery(queryId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check if query is already completed by checking if it's not in queue or active
      if (!this.queryQueue.has(queryId) && !this.activeQueries.has(queryId)) {
        reject(new Error(`Query ${queryId} not found or already completed`))
        return
      }

      // Store the promise resolvers
      this.queryWaiters.set(queryId, { resolve, reject })
    })
  }

  /**
   * Queue a single query for execution
   */
  public runSingle(itemId: string): string {
    let inputs = this.getItemData(itemId, this.dashboardId)
    let filters = (this.getItemData(itemId, this.dashboardId).filters || []).map(
      (filter) => filter.value,
    )
    let dashboard = this.getDashboardData(this.dashboardId)
    this.setItemData(itemId, this.dashboardId, {
      loading: true,
      error: null,
    })

    let request = {
      dashboardId: this.dashboardId,
      queryInput: {
        text: inputs.structured_content ? inputs.structured_content.query : inputs.content,
        extraFilters: filters,
        parameters: inputs.parameters || [],
        extraContent: dashboard.imports.map((imp) => ({
          alias: imp.name,
          // legacy handling
          contents:
            this.editorStore.editors[imp.id]?.contents ||
            this.editorStore.editors[imp.name]?.contents ||
            '',
        })),
      },
      priority: this.getDefaultPriority(itemId),
      itemId,
      onSuccess: (result: any) => {
        // Only update if this is still the latest query for this itemId
        if (this.isLatestQueryForItem(finalQueryId)) {
          this.setItemData(itemId, this.dashboardId, {
            results: result.results,
          })
        } else {
          console.log(`Ignoring outdated query result for itemId ${itemId}`)
        }
      },
      onError: (error: string) => {
        // Only update if this is still the latest query for this itemId
        if (this.isLatestQueryForItem(finalQueryId)) {
          this.setItemData(itemId, this.dashboardId, { error })
        } else {
          console.log(`Ignoring outdated query error for itemId ${itemId}`)
        }
      },
      onProgress: (_: any) => {
        ;() => {}
      },
    }

    // Generate a potential query ID first
    const potentialQueryId = this.generateQueryId(request)

    // Cancel any pending queries for this itemId FIRST
    this.cancelPendingQueriesForItem(itemId)

    // Check for duplicate queries BEFORE setting up tracking
    const existingQuery = this.findDuplicateQuery(request)
    let finalQueryId: string

    if (existingQuery) {
      console.log(`Deduplicating query for ${request.itemId}`)
      finalQueryId = existingQuery.id

      // Add callbacks to existing query
      this.addCallbacksToExistingQuery(existingQuery, request)
    } else {
      // Create new query since no duplicate was found
      finalQueryId = potentialQueryId
      const queuedQuery: QueuedQuery = {
        ...request,
        id: finalQueryId,
        timestamp: Date.now(),
        retryCount: 0,
      }

      this.queryQueue.set(finalQueryId, queuedQuery)

      // Execute immediately if capacity allows
      if (this.activeQueries.size < this.maxConcurrentQueries) {
        console.log(`Executing query immediately for ${request.itemId}`)
        this.executeQuery(finalQueryId)
      }
    }

    // NOW set up tracking for the final query (whether new or deduplicated)
    this.latestQueryByItemId.set(itemId, finalQueryId)
    this.itemIdByQueryId.set(finalQueryId, itemId)

    return finalQueryId
  }

  /**
   * Queue multiple queries for batch execution with prioritization
   */
  public runBatch(itemIds: string[]): string[] {
    const queryIds: string[] = []

    // Clear any pending batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
    }

    // Process each itemId similar to runSingle
    itemIds.forEach((itemId) => {
      let inputs = this.getItemData(itemId, this.dashboardId)
      let filters = (inputs.filters || []).map((filter) => filter.value)
      let query = inputs.structured_content.query
      if (query.trim().length === 0) {
        this.setItemData(itemId, this.dashboardId, {
          error: null,
          loading: false,
        })
        return
      }
      let dashboard = this.getDashboardData(this.dashboardId)
      this.setItemData(itemId, this.dashboardId, {
        loading: true,
        error: null,
      })

      let request = {
        dashboardId: this.dashboardId,
        queryInput: {
          text: inputs.structured_content ? inputs.structured_content.query : inputs.content,
          extraFilters: filters,
          parameters: inputs.parameters || [],
          extraContent: dashboard.imports.map((imp) => ({
            alias: imp.name,
            // legacy handling
            contents:
              this.editorStore.editors[imp.id]?.contents ||
              this.editorStore.editors[imp.name]?.contents ||
              '',
          })),
        },
        priority: this.getDefaultPriority(itemId),
        itemId,
        onSuccess: (result: any) => {
          // Only update if this is still the latest query for this itemId
          if (this.isLatestQueryForItem(finalQueryId)) {
            this.setItemData(itemId, this.dashboardId, {
              results: result.results,
            })
          } else {
            console.log(`Ignoring outdated batch query result for itemId ${itemId}`)
          }
        },
        onError: (error: string) => {
          // Only update if this is still the latest query for this itemId
          if (this.isLatestQueryForItem(finalQueryId)) {
            this.setItemData(itemId, this.dashboardId, { error })
          } else {
            console.log(`Ignoring outdated batch query error for itemId ${itemId}`)
          }
        },
        onProgress: (_: any) => {
          ;() => {}
        },
      }

      // Generate a potential query ID first
      const potentialQueryId = this.generateQueryId(request)

      // Cancel any pending queries for this itemId FIRST
      this.cancelPendingQueriesForItem(itemId)

      // Check for duplicates BEFORE setting up tracking
      const existingQuery = this.findDuplicateQuery(request)
      let finalQueryId: string

      if (existingQuery) {
        console.log(`Deduplicating batch query for ${request.itemId}`)
        finalQueryId = existingQuery.id
        this.addCallbacksToExistingQuery(existingQuery, request)
      } else {
        // Create new query since no duplicate was found
        finalQueryId = potentialQueryId
        const queuedQuery: QueuedQuery = {
          ...request,
          id: finalQueryId,
          timestamp: Date.now(),
          retryCount: 0,
        }

        this.queryQueue.set(finalQueryId, queuedQuery)
      }

      // NOW set up tracking for the final query (whether new or deduplicated)
      this.latestQueryByItemId.set(itemId, finalQueryId)
      this.itemIdByQueryId.set(finalQueryId, itemId)

      queryIds.push(finalQueryId)
    })

    // Schedule batch execution with delay to allow for more queries to be added
    this.batchTimeout = setTimeout(() => {
      this.processBatch()
    }, this.batchDelay)

    return queryIds
  }

  /**
   * Cancel a queued or active query
   */
  public cancelQuery(queryId: string): boolean {
    // If there's a waiter for this query, reject it
    const waiter = this.queryWaiters.get(queryId)
    if (waiter) {
      waiter.reject('Query was cancelled')
      this.queryWaiters.delete(queryId)
    }

    // Clean up tracking
    this.cleanupQueryTracking(queryId)

    if (this.queryQueue.has(queryId)) {
      this.queryQueue.delete(queryId)
      return true
    }

    if (this.activeQueries.has(queryId)) {
      this.activeQueries.delete(queryId)
      // Note: Actual query cancellation would need to be implemented in queryExecutionService
      return true
    }

    return false
  }

  /**
   * Clear all queued queries
   */
  public clearQueue(): void {
    // Reject all waiting promises
    this.queryWaiters.forEach((waiter, _) => {
      waiter.reject('Queue was cleared')
    })
    this.queryWaiters.clear()

    this.queryQueue.clear()
    this.latestQueryByItemId.clear()
    this.itemIdByQueryId.clear()

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }
  }

  /**
   * Get status of all queries
   */
  public getStatus(): {
    queued: number
    active: number
    queuedQueries: QueuedQuery[]
    latestQueryByItemId: Record<string, string>
  } {
    return {
      queued: this.queryQueue.size,
      active: this.activeQueries.size,
      queuedQueries: Array.from(this.queryQueue.values()),
      latestQueryByItemId: Object.fromEntries(this.latestQueryByItemId),
    }
  }

  public async createDrilldownQuery(
    query: string,
    add: string[],
    remove: string,
    filter: string,
  ): Promise<any> {
    let queryType = this.connectionStore.connections[this.connectionName].query_type
    let dashboard = this.getDashboardData(this.dashboardId)
    let sources = this.connectionStore.getConnectionSources(this.connectionName).concat(dashboard.imports.map((imp) => ({
            alias: imp.name,
            // legacy handling
            contents:
              this.editorStore.editors[imp.id]?.contents ||
              this.editorStore.editors[imp.name]?.contents ||
              '',
          })))
        

    let newQuery = await this.queryExecutionService.createDrilldownQuery(
      query,
      queryType,
      'trilogy',
      this.getDashboardData(this.dashboardId).imports,
      add,
      remove,
      filter,
      sources,
    )
    return newQuery
  }

  private generateQueryId(request: QueryRequest): string {
    return `${request.dashboardId}-${request.itemId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private findDuplicateQuery(request: QueryRequest): QueuedQuery | null {
    for (const [, queuedQuery] of this.queryQueue) {
      if (
        queuedQuery.dashboardId === request.dashboardId &&
        queuedQuery.queryInput.text === request.queryInput.text &&
        JSON.stringify(queuedQuery.queryInput.extraFilters) ===
          JSON.stringify(request.queryInput.extraFilters) &&
        JSON.stringify(queuedQuery.queryInput.parameters) ===
          JSON.stringify(request.queryInput.parameters)
      ) {
        return queuedQuery
      }
    }
    return null
  }

  private addCallbacksToExistingQuery(existingQuery: QueuedQuery, newRequest: QueryRequest): void {
    // Store original callbacks
    const originalOnSuccess = existingQuery.onSuccess
    const originalOnError = existingQuery.onError
    const originalOnProgress = existingQuery.onProgress

    // Create combined callbacks
    existingQuery.onSuccess = (result: any) => {
      originalOnSuccess(result)
      newRequest.onSuccess(result)
    }

    existingQuery.onError = (error: string) => {
      originalOnError(error)
      newRequest.onError(error)
    }

    existingQuery.onProgress = (message: any) => {
      originalOnProgress(message)
      newRequest.onProgress(message)
    }

    // Use higher priority (lower number)
    existingQuery.priority = Math.min(existingQuery.priority, newRequest.priority)
  }

  private processBatch(): void {
    if (this.queryQueue.size === 0) return

    // Sort queries by priority (lower number = higher priority)
    const sortedQueries = Array.from(this.queryQueue.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }
      // Secondary sort by timestamp for FIFO within same priority
      return a.timestamp - b.timestamp
    })

    // Execute queries up to concurrent limit
    const availableSlots = this.maxConcurrentQueries - this.activeQueries.size
    const queriesToExecute = sortedQueries.slice(0, availableSlots)

    this.executeBatchQueries(queriesToExecute)
    // queriesToExecute.forEach((query) => {
    //   this.executeQuery(query.id)
    // })
  }

  private async executeBatchQueries(queries: QueuedQuery[]): Promise<void> {
    if (queries.length === 0) return

    try {
      await this.ensureConnection()
      const conn = this.connectionStore.connections[this.connectionName]
      if (!conn) {
        throw new Error(`Connection "${this.connectionName}" not found!`)
      }

      // Double-check connection is still active
      if (!conn.connected) {
        throw new Error(`Connection "${this.connectionName}" is not connected`)
      }

      const dashboardData = this.getDashboardData(this.dashboardId)

      // Build query arguments and move queries from queue to active
      const queryArgsList: MultiQueryComponent[] = []
      const validQueries: QueuedQuery[] = []

      for (const queuedQuery of queries) {
        const queryId = queuedQuery.id

        // Skip if already active (shouldn't happen but safety check)
        if (this.activeQueries.has(queryId)) {
          continue
        }

        // Check if still in queue (might have been cancelled)
        if (!this.queryQueue.has(queryId)) {
          continue
        }

        // Move from queue to active
        this.queryQueue.delete(queryId)
        this.activeQueries.add(queryId)

        queryArgsList.push({
          query: queuedQuery.queryInput.text,
          label: queryId,
          extra_filters: queuedQuery.queryInput.extraFilters,
          parameters: queuedQuery.queryInput.parameters,
        })

        validQueries.push(queuedQuery)
      }

      // If no valid queries after filtering, return
      if (queryArgsList.length === 0) {
        return
      }
      let callbacks = Object.fromEntries(
        queryArgsList.map((queryArgs) => [
          queryArgs.label,
          (results: Results) => {
            validQueries.find((q) => q.id === queryArgs.label)?.onSuccess(results)
            const waiter = this.queryWaiters.get(queryArgs.label)
            if (waiter) {
              waiter.resolve(results)
              this.queryWaiters.delete(queryArgs.label)
            }
            this.activeQueries.delete(queryArgs.label)
            this.cleanupQueryTracking(queryArgs.label)
          },
        ]),
      )
      let errorCallbacks = Object.fromEntries(
        queryArgsList.map((queryArgs) => [
          queryArgs.label,
          (error: string) => {
            let matched = validQueries.find((q) => q.id === queryArgs.label)
            if (matched) {
              this.handleQueryError(matched, error)
            }
            this.activeQueries.delete(queryArgs.label)
            this.cleanupQueryTracking(queryArgs.label)
          },
        ]),
      )
      // Execute batch query
      const { resultPromise } = await this.queryExecutionService.executeQueriesBatch(
        this.connectionName,
        queryArgsList,
        'trilogy',
        dashboardData.imports,
        [],
        {},
        () => {},
        () => {},
        errorCallbacks,
        callbacks,
        false,
        dashboardData.imports.map((imp) => ({
          alias: imp.name,
          // legacy handling
          contents:
            this.editorStore.editors[imp.id]?.contents ||
            this.editorStore.editors[imp.name]?.contents ||
            '',
        })),
      )

      // Handle batch results
      const results = await resultPromise

      console.log(`Batch query executed successfully with ${results.results.length} results`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'

      // If this was a connection error, reset connection state
      if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
        this.connectionChecked = false
        this.connectionPromise = null
      }

      // Handle error for all queries in the batch
      for (const queuedQuery of queries) {
        const queryId = queuedQuery.id

        // Only process if it was moved to active
        if (!this.activeQueries.has(queryId)) {
          continue
        }

        // Retry logic
        if (queuedQuery.retryCount < this.retryAttempts) {
          console.log(`Retrying query ${queryId} (attempt ${queuedQuery.retryCount + 1})`)
          queuedQuery.retryCount++
          queuedQuery.timestamp = Date.now() // Update timestamp for retry

          // Move back to queue for retry
          this.activeQueries.delete(queryId)
          this.queryQueue.set(queryId, queuedQuery)

          // Schedule individual retry after delay
          setTimeout(() => {
            if (this.queryQueue.has(queryId)) {
              this.executeQuery(queryId)
            }
          }, 1000 * queuedQuery.retryCount)
        } else {
          // Max retries reached
          this.handleQueryError(queuedQuery, errorMessage)
          this.activeQueries.delete(queryId)
          this.cleanupQueryTracking(queryId)
        }
      }
    } finally {
      // Process next batch if there are more queries
      this.processBatch()
    }
  }

  /**
   * Helper method to handle query errors consistently
   */
  private handleQueryError(queuedQuery: QueuedQuery, errorMessage: string): void {
    const queryId = queuedQuery.id

    // Call error callback
    queuedQuery.onError(errorMessage)

    // Reject any waiting promises
    const waiter = this.queryWaiters.get(queryId)
    if (waiter) {
      waiter.reject(errorMessage)
      this.queryWaiters.delete(queryId)
    }
  }

  private async executeQuery(queryId: string): Promise<void> {
    const queuedQuery = this.queryQueue.get(queryId)
    if (!queuedQuery) return

    try {
      // Ensure connection is established before executing query
      await this.ensureConnection()

      // Move from queue to active only after connection is ensured
      this.queryQueue.delete(queryId)
      this.activeQueries.add(queryId)

      // Get connection
      const conn = this.connectionStore.connections[this.connectionName]
      if (!conn) {
        throw new Error(`Connection "${this.connectionName}" not found!`)
      }

      // Double-check connection is still active
      if (!conn.connected) {
        throw new Error(`Connection "${this.connectionName}" is not connected`)
      }

      //fetch latest
      let dashboardData = this.getDashboardData(this.dashboardId)
      // Execute query
      const queryArgs = {
        ...queuedQuery.queryInput,
        imports: dashboardData.imports,
        editorType: 'trilogy' as 'trilogy' | 'sql' | 'preql',
      }
      const { resultPromise } = await this.queryExecutionService.executeQuery(
        this.connectionName,
        queryArgs,
        () => {}, // Progress callback for connection issues
        (message: any) => {
          if (message.error) {
            queuedQuery.onProgress(message)
          }
        },
      )

      // Handle result
      const result = await resultPromise

      if (result.success && result.results) {
        queuedQuery.onSuccess(result)
        // Resolve any waiting promises
        const waiter = this.queryWaiters.get(queryId)
        if (waiter) {
          waiter.resolve(result)
          this.queryWaiters.delete(queryId)
        }
      } else if (result.error) {
        queuedQuery.onError(result.error)
        // Reject any waiting promises
        const waiter = this.queryWaiters.get(queryId)
        if (waiter) {
          waiter.reject(result.error)
          this.queryWaiters.delete(queryId)
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'

      // If this was a connection error, reset connection state
      if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
        this.connectionChecked = false
        this.connectionPromise = null
      }

      // Retry logic
      if (queuedQuery.retryCount < this.retryAttempts) {
        console.log(`Retrying query ${queryId} (attempt ${queuedQuery.retryCount + 1})`)
        queuedQuery.retryCount++
        queuedQuery.timestamp = Date.now() // Update timestamp for retry
        this.queryQueue.set(queryId, queuedQuery)

        // Retry after a delay
        setTimeout(() => {
          if (this.queryQueue.has(queryId)) {
            this.executeQuery(queryId)
          }
        }, 1000 * queuedQuery.retryCount) // Exponential backoff
      } else {
        queuedQuery.onError(errorMessage)
        // Reject any waiting promises
        const waiter = this.queryWaiters.get(queryId)
        if (waiter) {
          waiter.reject(errorMessage)
          this.queryWaiters.delete(queryId)
        }
      }
    } finally {
      this.activeQueries.delete(queryId)

      // Clean up tracking data when query completes
      this.cleanupQueryTracking(queryId)

      this.processBatch()
    }
  }
}
