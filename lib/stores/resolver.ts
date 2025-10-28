import { ModelConfig } from '../models'
import crypto from 'crypto'
import { type UserSettingsStoreType } from './userSettingsStore'

// Define a generic LRU Cache
class LRUCache<T> {
  private capacity: number
  private cache: Map<string, T>
  private keyOrder: string[]

  constructor(capacity: number = 100) {
    this.capacity = capacity
    this.cache = new Map<string, T>()
    this.keyOrder = []
  }

  // Get value from cache
  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined

    // Update the key's position to most recently used
    this.keyOrder = this.keyOrder.filter((k) => k !== key)
    this.keyOrder.push(key)

    return this.cache.get(key)
  }

  // Add or update value in cache
  set(key: string, value: T): void {
    // If the key already exists, update its position
    if (this.cache.has(key)) {
      this.keyOrder = this.keyOrder.filter((k) => k !== key)
    }
    // If cache is at capacity, remove the least recently used item
    else if (this.keyOrder.length >= this.capacity) {
      const leastRecentKey = this.keyOrder.shift()
      if (leastRecentKey) {
        this.cache.delete(leastRecentKey)
      }
    }

    // Add the new key to the end (most recently used position)
    this.keyOrder.push(key)
    this.cache.set(key, value)
  }

  // Clear the cache
  clear(): void {
    this.cache.clear()
    this.keyOrder = []
  }

  // Get cache size
  size(): number {
    return this.cache.size
  }
}

export interface QueryAtom {
  generated_sql: string
  generated_output?: any[]
  columns: any[]
  error: string | null
  label?: string
}

export interface QueryResponse {
  data: QueryAtom
}

export interface BatchQueryResponse {
  data: {
    queries: QueryAtom[]
  }
}

export interface FormatQueryResponse {
  data: {
    text: string
  }
}

interface ValidateItem {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
  severity: number
}

export interface CompletionItem {
  label: string
  description: string
  type: string
  datatype: string
  insertText: string
  trilogyType?: 'concept' | 'function' | 'type'
  trilogySubType?: 'property' | 'key' | 'metric'
  calculation?: string
  keys?: string[]
}

export interface ValidateResponse {
  data: {
    items: ValidateItem[]
    completion_items: CompletionItem[]
    imports: Import[]
  }
}

export interface ContentInput {
  alias: string
  contents: string
}

export interface Import {
  name: string
  alias: string
}

export interface MultiQueryComponent {
  query: string
  label: string
  extra_filters?: string[]
  parameters?: Record<string, string | number | boolean>
}

export default class TrilogyResolver {
  settingStore: UserSettingsStoreType
  private validateCache: LRUCache<ValidateResponse>
  private formatCache: LRUCache<FormatQueryResponse>
  private queryCache: LRUCache<QueryResponse>
  private batchQueryCache: LRUCache<BatchQueryResponse>
  private modelCache: LRUCache<ModelConfig>

  constructor(settingStore: UserSettingsStoreType, cacheSize: number = 100) {
    this.settingStore = settingStore
    this.validateCache = new LRUCache<ValidateResponse>(cacheSize)
    this.formatCache = new LRUCache<FormatQueryResponse>(cacheSize)
    this.queryCache = new LRUCache<QueryResponse>(cacheSize)
    this.batchQueryCache = new LRUCache<BatchQueryResponse>(cacheSize)
    this.modelCache = new LRUCache<ModelConfig>(cacheSize)
  }

  // Helper function to create hash from request parameters
  private createHash(params: any): string {
    const stringified = JSON.stringify(params)
    return crypto.createHash('md5').update(stringified).digest('hex')
  }

  // Create normalized query cache key that's consistent between single and batch queries
  private createQueryCacheKey(
    query: string,
    dialect: string,
    sources: ContentInput[] | null,
    imports: Import[] | null,
    extraFilters: string[] | null,
    parameters: Record<string, string | number | boolean> | null,
  ): string {
    const normalizedParams = {
      query: query,
      dialect: dialect,
      full_model: { name: '', sources: sources || [] },
      imports: imports || [],
      extra_filters: extraFilters || [],
      parameters: parameters || {},
    }
    return this.createHash(normalizedParams)
  }

  getErrorMessage(error: any): string {
    let base = 'An error occurred.'
    if (error instanceof Error) {
      base = error.message
    }
    if (error.response && error.response.data) {
      base = error.response.data.detail
    }
    return base
  }

  private async fetchWithErrorHandling(url: string, options: RequestInit): Promise<any> {
    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw {
          message: `HTTP error ${response.status}`,
          response: { data: errorData },
        }
      }
      let rData = await response.json()
      return { data: rData }
    } catch (error: any) {
      console.log(error)
      throw Error(this.getErrorMessage(error))
    }
  }

  async validate_query(
    query: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
    extraContent: Record<string, any> | null = null,
  ): Promise<ValidateResponse> {
    const requestParams = {
      query: query,
      sources: sources || [],
      imports: imports || [],
      extra_filters: extraFilters || [],
      extra_content: extraContent || {},
    }

    // Generate hash of request params
    const cacheKey = this.createHash(requestParams)

    // Check if result exists in cache
    const cachedResult = this.validateCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    // Not in cache, make the API call
    const response = await this.fetchWithErrorHandling(
      `${this.settingStore.settings.trilogyResolver}/validate_query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      },
    )

    // Cache the result
    this.validateCache.set(cacheKey, response)

    return response
  }

  async drilldown_query(
    query: string,
    dialect: string,
    type: string,
    drilldown_remove: string,
    drilldown_add: string,
    drilldown_filter: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
    parameters: Record<string, string | number | boolean> | null = null,
  ): Promise<FormatQueryResponse> {
    const requestParams = {
      query: query,
      dialect: dialect,
      type: type,
      drilldown_remove: drilldown_remove,
      drilldown_add: drilldown_add,
      drilldown_filter: drilldown_filter,
      full_model: { name: '', sources: sources || [] },
      imports: imports || [],
      extra_filters: extraFilters || [],
      parameters: parameters || {},
    }


    // Not in cache, make the API call
    const response = await this.fetchWithErrorHandling(
      `${this.settingStore.settings.trilogyResolver}/drilldown_query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      },
    )


    return response
  }

  async format_query(
    query: string,
    dialect: string,
    type: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
    parameters: Record<string, string> | null = null,
  ): Promise<FormatQueryResponse> {
    if (type === 'sql') {
      // return it as is
      return { data: { text: query } }
    }

    const requestParams = {
      query: query,
      dialect: dialect,
      full_model: { name: '', sources: sources || [] },
      imports: imports || [],
      extra_filters: extraFilters || [],
      parameters: parameters || {},
    }

    // Generate hash of request params
    const cacheKey = this.createHash(requestParams)

    // Check if result exists in cache
    const cachedResult = this.formatCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    // Not in cache, make the API call
    const response = await this.fetchWithErrorHandling(
      `${this.settingStore.settings.trilogyResolver}/format_query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      },
    )

    // Cache the result
    this.formatCache.set(cacheKey, response)

    return response
  }

  async resolve_query(
    query: string,
    dialect: string,
    type: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
    parameters: Record<string, string | number | boolean> | null = null,
  ): Promise<QueryResponse> {
    if (type === 'sql') {
      // return it as is
      return { data: { generated_sql: query, columns: [], error: null } }
    }

    // Use the normalized cache key
    const cacheKey = this.createQueryCacheKey(
      query,
      dialect,
      sources,
      imports,
      extraFilters,
      parameters,
    )

    // Check if result exists in cache
    const cachedResult = this.queryCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    const requestParams = {
      query: query,
      dialect: dialect,
      full_model: { name: '', sources: sources || [] },
      imports: imports || [],
      extra_filters: extraFilters || [],
      parameters: parameters || {},
    }

    // Not in cache, make the API call
    const response = await this.fetchWithErrorHandling(
      `${this.settingStore.settings.trilogyResolver}/generate_query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      },
    )

    // Cache the result
    this.queryCache.set(cacheKey, response)
    return response
  }

  async resolve_queries_batch(
    queries: MultiQueryComponent[],
    dialect: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
    parameters: Record<string, string | number | boolean> | null = null,
  ): Promise<BatchQueryResponse> {
    // Check batch cache first
    const batchRequestParams = {
      queries: queries,
      dialect: dialect,
      full_model: { name: '', sources: sources || [] },
      imports: imports || [],
      extra_filters: extraFilters || [],
      parameters: parameters || {},
    }
    const batchCacheKey = this.createHash(batchRequestParams)
    const cachedBatchResult = this.batchQueryCache.get(batchCacheKey)
    if (cachedBatchResult) {
      return cachedBatchResult
    }

    // Check individual query cache and separate cached vs uncached queries
    const cachedQueries: Array<{ index: number; result: QueryAtom }> = []
    const uncachedQueries: Array<{ index: number; component: MultiQueryComponent }> = []

    queries.forEach((queryComponent, index) => {
      // Merge component-level filters and parameters with global ones
      const mergedExtraFilters = [...(extraFilters || []), ...(queryComponent.extra_filters || [])]
      const mergedParameters = {
        ...(parameters || {}),
        ...(queryComponent.parameters || {}),
      }

      const cacheKey = this.createQueryCacheKey(
        queryComponent.query,
        dialect,
        sources,
        imports,
        mergedExtraFilters.length > 0 ? mergedExtraFilters : null,
        Object.keys(mergedParameters).length > 0 ? mergedParameters : null,
      )

      const cachedResult = this.queryCache.get(cacheKey)
      if (cachedResult) {
        cachedQueries.push({
          index,
          result: { ...cachedResult.data, label: queryComponent.label },
        })
      } else {
        uncachedQueries.push({ index, component: queryComponent })
      }
    })

    // If all queries are cached, return immediately
    if (uncachedQueries.length === 0) {
      const orderedResults = cachedQueries
        .sort((a, b) => a.index - b.index)
        .map((item) => item.result)

      const response: BatchQueryResponse = {
        data: { queries: orderedResults },
      }

      // Cache the full batch result
      this.batchQueryCache.set(batchCacheKey, response)

      return response
    }

    // Make API call for uncached queries only
    const batchApiRequest = {
      queries: uncachedQueries.map((item) => item.component),
      dialect: dialect,
      full_model: { name: '', sources: sources || [] },
      imports: imports || [],
      extra_filters: extraFilters || [],
      parameters: parameters || {},
    }

    const apiResponse = await this.fetchWithErrorHandling(
      `${this.settingStore.settings.trilogyResolver}/generate_queries`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchApiRequest),
      },
    )

    // Cache each newly fetched query individually
    apiResponse.data.queries.forEach((queryAtom: QueryAtom, apiIndex: number) => {
      const originalIndex = uncachedQueries[apiIndex].index
      const queryComponent = uncachedQueries[apiIndex].component

      // Merge component-level filters and parameters with global ones
      const mergedExtraFilters = [...(extraFilters || []), ...(queryComponent.extra_filters || [])]
      const mergedParameters = {
        ...(parameters || {}),
        ...(queryComponent.parameters || {}),
      }

      const cacheKey = this.createQueryCacheKey(
        queryComponent.query,
        dialect,
        sources,
        imports,
        mergedExtraFilters.length > 0 ? mergedExtraFilters : null,
        Object.keys(mergedParameters).length > 0 ? mergedParameters : null,
      )

      this.queryCache.set(cacheKey, { data: queryAtom })

      // Add to cached queries with original index
      cachedQueries.push({
        index: originalIndex,
        result: { ...queryAtom, label: queryComponent.label },
      })
    })

    // Combine and order results
    const orderedResults = cachedQueries
      .sort((a, b) => a.index - b.index)
      .map((item) => item.result)

    const finalResponse: BatchQueryResponse = {
      data: { queries: orderedResults },
    }

    // Cache the full batch result
    this.batchQueryCache.set(batchCacheKey, finalResponse)

    return finalResponse
  }

  async resolveModel(name: string, sources: ContentInput[]): Promise<ModelConfig> {
    const requestParams = {
      name: name,
      sources: sources,
    }

    // Generate hash of request params
    const cacheKey = this.createHash(requestParams)

    // Check if result exists in cache
    const cachedResult = this.modelCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    // Not in cache, make the API call
    const response = await this.fetchWithErrorHandling(
      `${this.settingStore.settings.trilogyResolver}/parse_model`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestParams),
      },
    )

    const modelConfig = ModelConfig.fromJSON(response.data)

    // Cache the result
    this.modelCache.set(cacheKey, modelConfig)

    return modelConfig
  }

  // Cache management methods
  clearAllCaches(): void {
    this.validateCache.clear()
    this.formatCache.clear()
    this.queryCache.clear()
    this.batchQueryCache.clear()
    this.modelCache.clear()
  }

  getCacheStats(): {
    validate: number
    format: number
    query: number
    batchQuery: number
    model: number
  } {
    return {
      validate: this.validateCache.size(),
      format: this.formatCache.size(),
      query: this.queryCache.size(),
      batchQuery: this.batchQueryCache.size(),
      model: this.modelCache.size(),
    }
  }
}
