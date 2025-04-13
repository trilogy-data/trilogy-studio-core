import axios from 'axios'
import { ModelConfig } from '../models'
import crypto from 'crypto'

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
    this.keyOrder = this.keyOrder.filter(k => k !== key)
    this.keyOrder.push(key)

    return this.cache.get(key)
  }

  // Add or update value in cache
  set(key: string, value: T): void {
    // If the key already exists, update its position
    if (this.cache.has(key)) {
      this.keyOrder = this.keyOrder.filter(k => k !== key)
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

export interface QueryResponse {
  data: {
    generated_sql: string
    columns: any[]
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

export default class AxiosResolver {
  address: string
  private validateCache: LRUCache<ValidateResponse>
  private formatCache: LRUCache<FormatQueryResponse>
  private queryCache: LRUCache<QueryResponse>
  private modelCache: LRUCache<ModelConfig>

  constructor(address: string, cacheSize: number = 100) {
    this.address = address
    this.validateCache = new LRUCache<ValidateResponse>(cacheSize)
    this.formatCache = new LRUCache<FormatQueryResponse>(cacheSize)
    this.queryCache = new LRUCache<QueryResponse>(cacheSize)
    this.modelCache = new LRUCache<ModelConfig>(cacheSize)
  }

  // Helper function to create hash from request parameters
  private createHash(params: any): string {
    const stringified = JSON.stringify(params)
    return crypto.createHash('md5').update(stringified).digest('hex')
  }

  getErrorMessage(error: Error): string {
    let base = 'An error occured.'
    if (axios.isAxiosError(error)) {
      base = error.message
      if (error.response && error.response.data) {
        base = error.response.data.detail
      }
    }
    return JSON.stringify(base)
  }

  async validate_query(
    query: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
  ): Promise<ValidateResponse> {
    const requestParams = {
      query: query,
      sources: sources || [],
      imports: imports || [],
      extra_filters: extraFilters || [],
    }
    
    // Generate hash of request params
    const cacheKey = this.createHash(requestParams)
    
    // Check if result exists in cache
    const cachedResult = this.validateCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    // Not in cache, make the API call
    try {
      const response = await axios.post(`${this.address}/validate_query`, requestParams)
      
      // Cache the result
      this.validateCache.set(cacheKey, response)
      
      return response
    } catch (error: any) {
      console.log(error)
      throw Error(this.getErrorMessage(error))
    }
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
    try {
      const response = await axios.post(`${this.address}/format_query`, requestParams)
      
      // Cache the result
      this.formatCache.set(cacheKey, response)
      
      return response
    } catch (error: any) {
      console.log(error)
      throw Error(this.getErrorMessage(error))
    }
  }

  async resolve_query(
    query: string,
    dialect: string,
    type: string,
    sources: ContentInput[] | null = null,
    imports: Import[] | null = null,
    extraFilters: string[] | null = null,
    parameters: Record<string, string> | null = null,
  ): Promise<QueryResponse> {
    if (type === 'sql') {
      // return it as is
      return { data: { generated_sql: query, columns: [] } }
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
    const cachedResult = this.queryCache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    // Not in cache, make the API call
    try {
      const response = await axios.post(`${this.address}/generate_query`, requestParams)
      
      // Cache the result
      this.queryCache.set(cacheKey, response)
      
      return response
    } catch (error: any) {
      console.log(error)
      throw Error(this.getErrorMessage(error))
    }
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
    try {
      const response = await axios.post(`${this.address}/parse_model`, requestParams)
      const modelConfig = ModelConfig.fromJSON(response.data)
      
      // Cache the result
      this.modelCache.set(cacheKey, modelConfig)
      
      return modelConfig
    } catch (error: any) {
      throw Error(this.getErrorMessage(error))
    }
  }

  // Cache management methods
  clearAllCaches(): void {
    this.validateCache.clear()
    this.formatCache.clear()
    this.queryCache.clear()
    this.modelCache.clear()
  }
  
  getCacheStats(): { validate: number, format: number, query: number, model: number } {
    return {
      validate: this.validateCache.size(),
      format: this.formatCache.size(),
      query: this.queryCache.size(),
      model: this.modelCache.size()
    }
  }
}