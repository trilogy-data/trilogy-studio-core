import { QueryExecutionService } from "../stores"
import type { Dashboard, DashboardImport, GridItemDataResponse } from '../dashboards/base'
import type { ContentInput } from "../stores/resolver"
import type { ConnectionStoreType } from "../stores/connectionStore"
import type { EditorStoreType } from "../stores/editorStore"

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
  itemId: string;
  dashboardId: string;

  // connectionName: string;
  queryInput: {
    text: string
    extraFilters?: string[]
    parameters?: Record<string, any>
    extraContent?: ContentInput[]
  }

  priority: number; // Lower number = higher priority
  onSuccess: (result: any) => void;
  onError: (error: string) => void;
  onProgress: (message: any) => void;
}

interface QueuedQuery extends QueryRequest {
  id: string;
  timestamp: number;
  retryCount: number;
}

interface QueryWaiter {
  resolve: (result: any) => void;
  reject: (error: string) => void;
}

export class DashboardQueryExecutor {
  private queryQueue: Map<string, QueuedQuery> = new Map();
  private activeQueries: Set<string> = new Set();
  private queryWaiters: Map<string, QueryWaiter> = new Map();
  private queryExecutionService: QueryExecutionService;
  private connectionStore: ConnectionStoreType;
  private editorStore: EditorStoreType;
  private connectionName: string;
  private dashboardId: string;
  private getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse;
  private setItemData: (itemId: string, dashboardId: string, content: any) => void;
  private getDashboardData: (dashboardId: string) => Dashboard;
  private maxConcurrentQueries: number;
  private retryAttempts: number;
  private batchDelay: number; // ms to wait before executing batch
  private batchTimeout: NodeJS.Timeout | null = null;

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
      maxConcurrentQueries?: number;
      retryAttempts?: number;
      batchDelay?: number;
    } = {}
  ) {
    this.queryExecutionService = queryExecutionService;
    this.connectionStore = connectionStore;
    this.editorStore = editorStore;
    this.connectionName = connectionName;
    this.maxConcurrentQueries = options.maxConcurrentQueries || 3;
    this.retryAttempts = options.retryAttempts || 2;
    this.batchDelay = options.batchDelay || 100;
    this.dashboardId = dashboardId;
    this.getItemData = getItemData;
    this.setItemData = setItemData;
    this.getDashboardData = getDashboardData;
  }

  /**
   * Get default priority based on chart position and type
   */
  private getDefaultPriority(itemId: string): number {
    // Charts higher on dashboard get higher priority (lower numbers)
    // You can implement more sophisticated priority logic here
    return 5; // Default middle priority
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
        reject(new Error(`Query ${queryId} not found or already completed`));
        return;
      }

      // Store the promise resolvers
      this.queryWaiters.set(queryId, { resolve, reject });
    });
  }

  /**
   * Queue a single query for execution
   */
  public runSingle(itemId: string): string {
    let inputs = this.getItemData(itemId, this.dashboardId)
    let filters = (this.getItemData(itemId, this.dashboardId).filters || []).map(
      (filter) => filter.value,
    );
    let dashboard = this.getDashboardData(this.dashboardId);
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
            this.editorStore.editors[imp.id]?.contents || this.editorStore.editors[imp.name]?.contents || '',
        }))

      },
      priority: 5,
      itemId,
      onSuccess: (result: any) => {
        this.setItemData(itemId, this.dashboardId, {
            results: result.results,
          })
      },
      onError: (error: string) => {
        this.setItemData(itemId, this.dashboardId, { error })
      },
      onProgress: (message: any) => {
        () => { }
      }
    }
    const requestWithPriority = {
      ...request,
      priority: this.getDefaultPriority(itemId),
    };

    const queryId = this.generateQueryId(requestWithPriority);

    // Check for duplicate queries
    const existingQuery = this.findDuplicateQuery(requestWithPriority);
    if (existingQuery) {
      console.log(`Deduplicating query for ${requestWithPriority.itemId}`);
      // Add callbacks to existing query
      this.addCallbacksToExistingQuery(existingQuery, requestWithPriority);
      return existingQuery.id;
    }

    const queuedQuery: QueuedQuery = {
      ...requestWithPriority,
      id: queryId,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queryQueue.set(queryId, queuedQuery);

    // Execute immediately if capacity allows
    if (this.activeQueries.size < this.maxConcurrentQueries) {
      console.log(`Executing query immediately for ${requestWithPriority.itemId}`);
      this.executeQuery(queryId);
    }

    return queryId;
  }

  /**
   * Queue multiple queries for batch execution with prioritization
   */
  public runBatch(requests: Omit<QueryRequest, 'priority'>[]): string[] {
    const queryIds: string[] = [];

    // Clear any pending batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Add all requests to queue with priorities
    requests.forEach(request => {
      const requestWithPriority = {
        ...request,
        priority: this.getDefaultPriority(request.itemId),
      };

      const queryId = this.generateQueryId(requestWithPriority);

      // Check for duplicates
      const existingQuery = this.findDuplicateQuery(requestWithPriority);
      if (existingQuery) {
        console.log(`Deduplicating batch query for ${requestWithPriority.itemId}`);
        this.addCallbacksToExistingQuery(existingQuery, requestWithPriority);
        queryIds.push(existingQuery.id);
        return;
      }

      const queuedQuery: QueuedQuery = {
        ...requestWithPriority,
        id: queryId,
        timestamp: Date.now(),
        retryCount: 0,
      };

      this.queryQueue.set(queryId, queuedQuery);
      queryIds.push(queryId);
    });

    // Schedule batch execution with delay to allow for more queries to be added
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);

    return queryIds;
  }

  /**
   * Cancel a queued or active query
   */
  public cancelQuery(queryId: string): boolean {
    // If there's a waiter for this query, reject it
    const waiter = this.queryWaiters.get(queryId);
    if (waiter) {
      waiter.reject('Query was cancelled');
      this.queryWaiters.delete(queryId);
    }

    if (this.queryQueue.has(queryId)) {
      this.queryQueue.delete(queryId);
      return true;
    }

    if (this.activeQueries.has(queryId)) {
      this.activeQueries.delete(queryId);
      // Note: Actual query cancellation would need to be implemented in queryExecutionService
      return true;
    }

    return false;
  }

  /**
   * Clear all queued queries
   */
  public clearQueue(): void {
    // Reject all waiting promises
    this.queryWaiters.forEach((waiter, queryId) => {
      waiter.reject('Queue was cleared');
    });
    this.queryWaiters.clear();

    this.queryQueue.clear();
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Get status of all queries
   */
  public getStatus(): {
    queued: number;
    active: number;
    queuedQueries: QueuedQuery[];
  } {
    return {
      queued: this.queryQueue.size,
      active: this.activeQueries.size,
      queuedQueries: Array.from(this.queryQueue.values()),
    };
  }

  private generateQueryId(request: QueryRequest): string {
    return `${request.dashboardId}-${request.itemId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private findDuplicateQuery(request: QueryRequest): QueuedQuery | null {
    for (const [, queuedQuery] of this.queryQueue) {
      if (
        queuedQuery.dashboardId === request.dashboardId &&
        queuedQuery.queryInput.text === request.queryInput.text &&
        JSON.stringify(queuedQuery.queryInput.extraFilters) === JSON.stringify(request.queryInput.extraFilters) &&
        JSON.stringify(queuedQuery.queryInput.parameters) === JSON.stringify(request.queryInput.parameters)
      ) {
        return queuedQuery;
      }
    }
    return null;
  }

  private addCallbacksToExistingQuery(existingQuery: QueuedQuery, newRequest: QueryRequest): void {
    // Store original callbacks
    const originalOnSuccess = existingQuery.onSuccess;
    const originalOnError = existingQuery.onError;
    const originalOnProgress = existingQuery.onProgress;

    // Create combined callbacks
    existingQuery.onSuccess = (result: any) => {
      originalOnSuccess(result);
      newRequest.onSuccess(result);
    };

    existingQuery.onError = (error: string) => {
      originalOnError(error);
      newRequest.onError(error);
    };

    existingQuery.onProgress = (message: any) => {
      originalOnProgress(message);
      newRequest.onProgress(message);
    };

    // Use higher priority (lower number)
    existingQuery.priority = Math.min(existingQuery.priority, newRequest.priority);
  }

  private processBatch(): void {
    if (this.queryQueue.size === 0) return;

    // Sort queries by priority (lower number = higher priority)
    const sortedQueries = Array.from(this.queryQueue.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Secondary sort by timestamp for FIFO within same priority
      return a.timestamp - b.timestamp;
    });

    // Execute queries up to concurrent limit
    const availableSlots = this.maxConcurrentQueries - this.activeQueries.size;
    const queriesToExecute = sortedQueries.slice(0, availableSlots);

    queriesToExecute.forEach(query => {
      this.executeQuery(query.id);
    });
  }

  private async executeQuery(queryId: string): Promise<void> {
    const queuedQuery = this.queryQueue.get(queryId);
    if (!queuedQuery) return;

    // Move from queue to active
    this.queryQueue.delete(queryId);
    this.activeQueries.add(queryId);

    try {
      // Get connection
      const conn = this.connectionStore.connections[this.connectionName];
      if (!conn) {
        throw new Error(`Connection "${this.connectionName}" not found!`);
      }
      //fetch latest
      let dashboardData = this.getDashboardData(this.dashboardId);
      // Execute query
      const queryArgs = { ...queuedQuery.queryInput, imports: dashboardData.imports, editorType: 'trilogy' as 'trilogy' | 'sql' | 'preql', };
      const { resultPromise } = await this.queryExecutionService.executeQuery(
        this.connectionName,
        queryArgs,
        () => { }, // Progress callback for connection issues
        (message: any) => {
          if (message.error) {
            queuedQuery.onProgress(message);
          }
        }
      );

      // Handle result
      const result = await resultPromise;

      if (result.success && result.results) {
        queuedQuery.onSuccess(result);
        // Resolve any waiting promises
        const waiter = this.queryWaiters.get(queryId);
        if (waiter) {
          waiter.resolve(result);
          this.queryWaiters.delete(queryId);
        }
      } else if (result.error) {
        queuedQuery.onError(result.error);
        // Reject any waiting promises
        const waiter = this.queryWaiters.get(queryId);
        if (waiter) {
          waiter.reject(result.error);
          this.queryWaiters.delete(queryId);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';

      // Retry logic
      if (queuedQuery.retryCount < this.retryAttempts) {
        console.log(`Retrying query ${queryId} (attempt ${queuedQuery.retryCount + 1})`);
        queuedQuery.retryCount++;
        queuedQuery.timestamp = Date.now(); // Update timestamp for retry
        this.queryQueue.set(queryId, queuedQuery);

        // Retry after a delay
        setTimeout(() => {
          if (this.queryQueue.has(queryId)) {
            this.executeQuery(queryId);
          }
        }, 1000 * queuedQuery.retryCount); // Exponential backoff
      } else {
        queuedQuery.onError(errorMessage);
        // Reject any waiting promises
        const waiter = this.queryWaiters.get(queryId);
        if (waiter) {
          waiter.reject(errorMessage);
          this.queryWaiters.delete(queryId);
        }
      }
    } finally {
      this.activeQueries.delete(queryId);

      // Process next queries in queue
      setTimeout(() => {
        this.processBatch();
      }, 50);
    }
  }
}