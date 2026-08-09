import type { Dashboard, GridItemDataResponse } from '../dashboards/base'
import type { ContentInput, MultiQueryComponent, Import } from '../stores/resolver'
import type { DashboardExecutionService } from '../stores/queryExecutionService'
import type { Results } from '../editors/results'

export interface QueryExecutorDependencies {
  queryExecutionService: DashboardExecutionService
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

/**
 * The batch executor hands its per-query failure callbacks two different
 * shapes: a query-level result object, where `error` is the message, and a
 * batch-level QueryUpdate, where `error` is the boolean "this is an error"
 * flag and the text lives in `message`. Reading `error` blindly turned the
 * second shape into the literal string "true" on the item.
 */
interface BatchQueryFailure {
  error?: string | boolean
  message?: string
}

function describeBatchFailure(failure: BatchQueryFailure | string | null | undefined): string {
  if (typeof failure === 'string') return failure
  if (typeof failure?.error === 'string' && failure.error) return failure.error
  if (typeof failure?.message === 'string' && failure.message) return failure.message
  return 'Unknown error occurred'
}

export class DashboardQueryExecutor {
  private queryQueue: Map<string, QueuedQuery> = new Map()
  private activeQueries: Set<string> = new Set()
  private queryWaiters: Map<string, QueryWaiter> = new Map()
  // Track the latest query ID for each itemId
  private latestQueryByItemId: Map<string, string> = new Map()
  // Which items each query is delivering for. Deduplication (findDuplicateQuery
  // matches on query text/filters/parameters, deliberately NOT on itemId) means
  // two items sharing a query share its id, so this is one-to-many. It used to
  // be a plain Map<queryId, itemId>, which silently kept only whichever item
  // registered last.
  private itemIdsByQueryId: Map<string, Set<string>> = new Map()

  public queryExecutionService: DashboardExecutionService
  public connectionName: string
  private dashboardId: string
  private getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse
  private setItemData: (itemId: string, dashboardId: string, content: any) => void
  private getDashboardData: (dashboardId: string) => Dashboard
  private maxConcurrentQueries: number
  private retryAttempts: number
  private batchDelay: number // ms to wait before executing batch
  private batchTimeout: NodeJS.Timeout | null = null

  constructor(
    queryExecutionService: DashboardExecutionService,
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
    this.connectionName = connectionName
    this.maxConcurrentQueries = options.maxConcurrentQueries || 10
    this.retryAttempts = options.retryAttempts || 2
    this.batchDelay = options.batchDelay || 0
    this.dashboardId = dashboardId
    this.getItemData = getItemData
    this.setItemData = setItemData
    this.getDashboardData = getDashboardData
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
      // A deduplicated query serves several items; it is only outdated for this
      // one if it is not still the latest for any OTHER item it feeds.
      const servedItems = this.itemIdsByQueryId.get(queryId)
      if (!servedItems?.has(itemId) || queryId === currentLatestQueryId) return
      const stillNeeded = [...servedItems].some(
        (other) => other !== itemId && this.latestQueryByItemId.get(other) === queryId,
      )
      if (!stillNeeded) queriesToCancel.push(queryId)
    })

    // Cancel the identified queries
    queriesToCancel.forEach((queryId) => {
      console.log(`Cancelling outdated query ${queryId} for itemId ${itemId}`)
      this.cancelQuery(queryId)
    })
  }

  /** Register that `queryId` will deliver results for `itemId`. */
  private trackQueryForItem(itemId: string, queryId: string): void {
    this.latestQueryByItemId.set(itemId, queryId)
    const served = this.itemIdsByQueryId.get(queryId)
    if (served) {
      served.add(itemId)
    } else {
      this.itemIdsByQueryId.set(queryId, new Set([itemId]))
    }
  }

  /**
   * Is this query still the one whose results the item wants?
   *
   * Takes the itemId rather than reverse-mapping from the query, because a
   * deduplicated query serves several items and the answer differs per item.
   */
  private isLatestQueryForItem(itemId: string, queryId: string): boolean {
    return this.latestQueryByItemId.get(itemId) === queryId
  }

  private isQueryInFlight(queryId: string): boolean {
    return this.queryQueue.has(queryId) || this.activeQueries.has(queryId)
  }

  /**
   * Stop the spinner for every item a finished query was feeding.
   *
   * `loading` is otherwise only ever cleared as a side effect of delivering
   * `results` or an `error`, and both deliveries are skipped when the result is
   * judged outdated — so a discarded result used to leave the item spinning
   * with nothing left to ever clear it. There is no timeout behind this.
   *
   * An item is left spinning only while the query it is actually waiting for —
   * `latestQueryByItemId` — is genuinely still queued or running. That covers
   * both cases that must not settle early: a second refresh started while this
   * one was in flight, and this same query re-queued for a retry. A newer query
   * that has already finished or been cancelled does not count, or the spinner
   * would outlive every query again.
   *
   * Callers must remove the query from `activeQueries` first, so that a query
   * finishing normally does not see itself as still in flight.
   */
  private settleQueryLoading(queryId: string): void {
    const servedItems = this.itemIdsByQueryId.get(queryId)
    if (!servedItems) return

    for (const itemId of servedItems) {
      const awaited = this.latestQueryByItemId.get(itemId)
      if (awaited && this.isQueryInFlight(awaited)) continue
      this.setItemData(itemId, this.dashboardId, { loading: false })
    }
  }

  /**
   * Cleanup tracking data for a completed query
   */
  private cleanupQueryTracking(queryId: string): void {
    const servedItems = this.itemIdsByQueryId.get(queryId)
    if (!servedItems) return

    for (const itemId of servedItems) {
      // Only remove from latestQueryByItemId if this was indeed the latest query
      if (this.latestQueryByItemId.get(itemId) === queryId) {
        this.latestQueryByItemId.delete(itemId)
      }
    }
    this.itemIdsByQueryId.delete(queryId)
  }

  /**
   * Get default priority based on chart position and type
   */
  private getDefaultPriority(itemId: string): number {
    return this.getDashboardData(this.dashboardId).layout.find((item) => item.i === itemId)?.y || 0
  }

  public setConnection(connectionName: string): void {
    this.connectionName = connectionName
  }

  private getDashboardImports(): Import[] {
    return this.getDashboardData(this.dashboardId).imports.map((imp) => ({
      name: imp.name,
      alias: imp.alias,
    }))
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
   * The text an item will actually execute.
   *
   * Deliberately the single expression both the empty-query guard and the
   * request body read, so the two can never disagree about whether an item has
   * a query — the guard used to test `structured_content.query` while the
   * request fell back to `content`.
   */
  private getItemQueryText(inputs: GridItemDataResponse): string {
    return (inputs.structured_content ? inputs.structured_content.query : inputs.content) || ''
  }

  /**
   * Build, deduplicate, queue and track the query for one item.
   *
   * Shared by runSingle and runBatch, which differ only in how the queued query
   * reaches the wire: runSingle starts it as soon as there is capacity, runBatch
   * leaves it for the debounced processBatch sweep.
   *
   * Returns the query id, or null when the item has nothing to run.
   */
  private enqueueItemQuery(itemId: string, executeImmediately: boolean): string | null {
    const inputs = this.getItemData(itemId, this.dashboardId)
    const queryText = this.getItemQueryText(inputs)

    // Markdown and freeform items can legitimately carry no query. Queuing one
    // anyway raises `loading` with nothing behind it to ever lower it again —
    // and nothing times out — so the item spins forever.
    if (queryText.trim().length === 0) {
      this.setItemData(itemId, this.dashboardId, {
        error: null,
        loading: false,
      })
      return null
    }

    const itemFilters = inputs.filters || []
    // Collect parameterised values from cross-filter entries and merge with any
    // item-level parameters so they all travel to the backend together.
    const filterParameters: Record<string, string | number> = Object.assign(
      {},
      ...itemFilters.map((f) => f.parameters || {}),
    )

    this.setItemData(itemId, this.dashboardId, {
      loading: true,
      error: null,
    })

    // Assigned below, before any callback can fire.
    let finalQueryId: string
    const isCurrent = () => this.isLatestQueryForItem(itemId, finalQueryId)

    const request: QueryRequest = {
      dashboardId: this.dashboardId,
      queryInput: {
        text: queryText,
        extraFilters: itemFilters.map((filter) => filter.value),
        parameters: { ...(inputs.parameters || {}), ...filterParameters } as Record<string, any>,
        extraContent: inputs.rootContent || [],
      },
      priority: this.getDefaultPriority(itemId),
      itemId,
      onSuccess: (result: any) => {
        // Only update if this is still the latest query for this itemId
        if (isCurrent()) {
          this.setItemData(itemId, this.dashboardId, {
            results: result.results,
          })
        } else {
          console.log(`Ignoring outdated query result for itemId ${itemId}`)
        }
      },
      onError: (error: string) => {
        // Only update if this is still the latest query for this itemId
        if (isCurrent()) {
          this.setItemData(itemId, this.dashboardId, { error })
        } else {
          console.log(`Ignoring outdated query error for itemId ${itemId}`)
        }
      },
      onProgress: (_: any) => {},
    }

    // Generate a potential query ID first
    const potentialQueryId = this.generateQueryId(request)

    // Cancel any pending queries for this itemId FIRST
    this.cancelPendingQueriesForItem(itemId)

    // Check for duplicate queries BEFORE setting up tracking
    const existingQuery = this.findDuplicateQuery(request)

    if (existingQuery) {
      console.log(`Deduplicating query for ${itemId}`)
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
      if (executeImmediately && this.activeQueries.size < this.maxConcurrentQueries) {
        console.log(`Executing query immediately for ${itemId}`)
        this.executeQuery(finalQueryId)
      }
    }

    // NOW set up tracking for the final query (whether new or deduplicated)
    this.trackQueryForItem(itemId, finalQueryId)

    return finalQueryId
  }

  /**
   * Queue a single query for execution.
   *
   * Returns null when the item has no query to run.
   */
  public runSingle(itemId: string): string | null {
    return this.enqueueItemQuery(itemId, true)
  }

  /**
   * Queue multiple queries for batch execution with prioritization.
   *
   * Items with no query are settled in place and contribute no query id.
   */
  public runBatch(itemIds: string[]): string[] {
    // Clear any pending batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
    }

    const queryIds = itemIds
      .map((itemId) => this.enqueueItemQuery(itemId, false))
      .filter((queryId): queryId is string => queryId !== null)

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
    this.itemIdsByQueryId.clear()

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
    extraContent: ContentInput[] = [],
    imports: Import[] = this.getDashboardImports(),
  ): Promise<any> {
    let newQuery = await this.queryExecutionService.createConnectionDrilldownQuery(
      this.connectionName,
      query,
      'trilogy',
      imports,
      add,
      remove,
      filter,
      extraContent,
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
      const dashboardImports = this.getDashboardImports()

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
            // After the delete, so a query cannot count itself as "in flight".
            this.settleQueryLoading(queryArgs.label)
            this.cleanupQueryTracking(queryArgs.label)
          },
        ]),
      )
      let errorCallbacks = Object.fromEntries(
        queryArgsList.map((queryArgs) => [
          queryArgs.label,
          (failure: BatchQueryFailure | string) => {
            const errorMessage = describeBatchFailure(failure)
            let matched = validQueries.find((q) => q.id === queryArgs.label)
            if (matched) {
              this.handleQueryError(matched, errorMessage)
            }
            this.activeQueries.delete(queryArgs.label)
            this.settleQueryLoading(queryArgs.label)
            this.cleanupQueryTracking(queryArgs.label)
          },
        ]),
      )
      // Execute batch query
      const { resultPromise } = await this.queryExecutionService.executeQueriesBatch(
        this.connectionName,
        queryArgsList,
        'trilogy',
        dashboardImports,
        [],
        {},
        () => {},
        () => {},
        errorCallbacks,
        callbacks,
        false,
        validQueries[0]?.queryInput.extraContent || [],
      )

      // Handle batch results
      const results = await resultPromise

      console.log(`Batch query executed successfully with ${results.results.length} results`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'

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
          this.settleQueryLoading(queryId)
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
      // Move from queue to active only after connection is ensured
      this.queryQueue.delete(queryId)
      this.activeQueries.add(queryId)
      let dashboardImports = this.getDashboardImports()
      // Execute query
      const queryArgs = {
        ...queuedQuery.queryInput,
        imports: dashboardImports,
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

      this.settleQueryLoading(queryId)

      // Clean up tracking data when query completes
      this.cleanupQueryTracking(queryId)

      this.processBatch()
    }
  }
}
