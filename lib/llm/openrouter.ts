import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage, LLMToolCall } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'

/**
 * OpenRouter model metadata from the API response
 */
export interface OpenRouterModel {
  id: string
  name: string
  created: number
  description?: string
  context_length: number
  architecture?: {
    modality: string
    tokenizer: string
    instruct_type: string | null
  }
  pricing?: {
    prompt: string
    completion: string
    image?: string
    request?: string
  }
  top_provider?: {
    context_length: number
    max_completion_tokens: number
    is_moderated: boolean
  }
  per_request_limits?: {
    prompt_tokens: string
    completion_tokens: string
  } | null
}

/**
 * Configuration for OAuth PKCE authentication flow
 */
export interface OpenRouterOAuthConfig {
  callbackUrl: string
  codeVerifier?: string
  codeChallenge?: string
  codeChallengeMethod?: 'plain' | 'S256'
}

/**
 * List of model ID prefixes/patterns for modern, high-quality models.
 * These are the leading models from major providers + top open-source models.
 */
const MODERN_MODEL_PATTERNS: RegExp[] = [
  // Anthropic Claude models (Claude 3+, Claude 4)
  /^anthropic\/claude-(?:3|4|opus|sonnet|haiku)/,

  // OpenAI GPT models (GPT-4+)
  /^openai\/gpt-(?:4|5)/,
  /^openai\/o[1-9]/, // o1, o3, etc.

  // Google Gemini models (1.5+, 2.0+)
  /^google\/gemini-(?:1\.5|2\.|pro|flash|ultra)/,

  // Meta Llama models (3+)
  /^meta-llama\/llama-(?:3|4)/,
  /^meta-llama\/llama-guard/,

  // Mistral models (mistral-large, mistral-medium, mixtral)
  /^mistral(?:ai)?\/mistral-(?:large|medium|small)/,
  /^mistral(?:ai)?\/mixtral/,
  /^mistral(?:ai)?\/codestral/,
  /^mistral(?:ai)?\/ministral/,
  /^mistral(?:ai)?\/pixtral/,

  // DeepSeek models
  /^deepseek\//,

  // Qwen models (2+)
  /^qwen\/qwen-(?:2|3)/,
  /^qwen\/qwq/,

  // Cohere Command models
  /^cohere\/command-(?:r|a)/,

  // xAI Grok models
  /^x-ai\/grok/,

  // Perplexity models
  /^perplexity\//,

  // Nous Research models
  /^nousresearch\/hermes-3/,

  // Microsoft models
  /^microsoft\/phi-(?:3|4)/,
  /^microsoft\/wizardlm/,
]

/**
 * Model tier for sorting priority (lower number = higher priority)
 */
type ModelTier = 'flagship' | 'standard' | 'mini' | 'other'

/**
 * Extract provider and model name from OpenRouter model ID
 */
export function parseOpenRouterModelId(modelId: string): { provider: string; modelName: string } {
  const parts = modelId.split('/')
  if (parts.length >= 2) {
    return {
      provider: parts[0],
      modelName: parts.slice(1).join('/'),
    }
  }
  return { provider: '', modelName: modelId }
}

/**
 * Determine the tier of a model for sorting purposes
 */
export function getModelTier(modelId: string): ModelTier {
  const lowerModelId = modelId.toLowerCase()

  // Flagship/top-tier models
  if (
    lowerModelId.includes('opus') ||
    lowerModelId.includes('ultra') ||
    lowerModelId.includes('-large') ||
    lowerModelId.includes('gpt-5') ||
    lowerModelId.includes('o1-pro') ||
    lowerModelId.includes('o3')
  ) {
    return 'flagship'
  }

  // Mini/fast models - use more specific patterns to avoid matching 'gemini'
  // Match: -mini, /mini, haiku, flash, -small, instant
  if (
    /-mini\b/.test(lowerModelId) ||
    /\/mini\b/.test(lowerModelId) ||
    lowerModelId.includes('haiku') ||
    lowerModelId.includes('flash') ||
    lowerModelId.includes('-small') ||
    lowerModelId.includes('instant')
  ) {
    return 'mini'
  }

  // Standard models (sonnet, medium, pro, etc.)
  if (
    lowerModelId.includes('sonnet') ||
    lowerModelId.includes('medium') ||
    /-pro\b/.test(lowerModelId) ||
    lowerModelId.endsWith('-pro') ||
    lowerModelId.endsWith('pro') ||
    lowerModelId.includes('gpt-4')
  ) {
    return 'standard'
  }

  return 'other'
}

/**
 * Extract version numbers from model ID for comparison
 */
export function extractModelVersion(
  modelId: string,
): { major: number; minor: number; patch: number } | null {
  // Try to find version patterns like 3.5, 4.0, 2.0, gpt-4o, gpt-4-turbo, etc.
  // Pattern: [/-]digit followed by optional .digit or -digit, or just a letter suffix
  const versionMatch = modelId.match(/[/-](\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[a-z])?(?:[/-]|$)/i)
  if (versionMatch) {
    return {
      major: parseInt(versionMatch[1], 10),
      minor: versionMatch[2] ? parseInt(versionMatch[2], 10) : 0,
      patch: versionMatch[3] ? parseInt(versionMatch[3], 10) : 0,
    }
  }
  return null
}

/**
 * Compare two OpenRouter models for sorting
 * Priority: Provider tier -> Version (descending) -> Model tier
 */
export function compareOpenRouterModels(a: string, b: string): number {
  const parsedA = parseOpenRouterModelId(a)
  const parsedB = parseOpenRouterModelId(b)

  // Provider priority (roughly by market position/quality)
  const providerOrder: Record<string, number> = {
    anthropic: 0,
    openai: 1,
    google: 2,
    'x-ai': 3,
    'meta-llama': 4,
    mistralai: 5,
    mistral: 5,
    deepseek: 6,
    qwen: 7,
    cohere: 8,
    perplexity: 9,
  }

  const providerOrderA = providerOrder[parsedA.provider] ?? 99
  const providerOrderB = providerOrder[parsedB.provider] ?? 99

  if (providerOrderA !== providerOrderB) {
    return providerOrderA - providerOrderB
  }

  // Same provider - compare by model tier
  const tierOrder: Record<ModelTier, number> = {
    flagship: 0,
    standard: 1,
    mini: 2,
    other: 3,
  }

  const tierA = getModelTier(a)
  const tierB = getModelTier(b)

  if (tierA !== tierB) {
    return tierOrder[tierA] - tierOrder[tierB]
  }

  // Same tier - compare by version (higher first)
  const versionA = extractModelVersion(a)
  const versionB = extractModelVersion(b)

  if (versionA && versionB) {
    if (versionA.major !== versionB.major) return versionB.major - versionA.major
    if (versionA.minor !== versionB.minor) return versionB.minor - versionA.minor
    return versionB.patch - versionA.patch
  }
  if (versionA) return -1
  if (versionB) return 1

  // Fallback to alphabetical
  return a.localeCompare(b)
}

export class OpenRouterProvider extends LLMProvider {
  private baseCompletionUrl: string = 'https://openrouter.ai/api/v1/chat/completions'
  private baseModelUrl: string = 'https://openrouter.ai/api/v1/models'
  public models: string[] = []
  public modelMetadata: Map<OpenRouterModel['id'], OpenRouterModel> = new Map()
  public type: string = 'openrouter'
  private retryOptions: RetryOptions
  private httpReferer?: string
  private appTitle?: string

  constructor(
    name: string,
    apiKey: string,
    model: string,
    saveCredential: boolean = false,
    retryOptions?: RetryOptions,
    options?: {
      httpReferer?: string
      appTitle?: string
    },
  ) {
    super(name, apiKey, model, saveCredential)
    this.httpReferer = options?.httpReferer
    this.appTitle = options?.appTitle
    this.retryOptions = retryOptions || {
      maxRetries: 3,
      initialDelayMs: 1000,
      retryStatusCodes: [429, 500, 502, 503, 504],
      onRetry: (attempt, delayMs, error) => {
        console.warn(
          `OpenRouter API retry attempt ${attempt} after ${delayMs}ms delay due to error: ${error.message}`,
        )
      },
    }
  }

  /**
   * Get headers for OpenRouter API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }

    // Optional headers for OpenRouter rankings and attribution
    if (this.httpReferer) {
      headers['HTTP-Referer'] = this.httpReferer
    }
    if (this.appTitle) {
      headers['X-Title'] = this.appTitle
    }

    return headers
  }

  async reset(): Promise<void> {
    this.error = null
    try {
      const response = await fetchWithRetry(
        () =>
          fetch(this.baseModelUrl, {
            headers: this.getHeaders(),
            method: 'GET',
          }),
        this.retryOptions,
      )

      const modelData = await response.json()
      const allModels: OpenRouterModel[] = modelData.data || []

      // Store metadata for later use
      this.modelMetadata.clear()
      for (const model of allModels) {
        this.modelMetadata.set(model.id, model)
      }

      // Extract model IDs and apply filtering
      const allModelIds = allModels.map((model) => model.id)
      this.models = OpenRouterProvider.filterModels(allModelIds)
      this.connected = true
    } catch (e) {
      if (e instanceof Error) {
        this.error = e.message
      } else {
        this.error = 'Unknown error'
      }
      this.connected = false
      throw e
    }
  }

  async generateCompletion(
    options: LLMRequestOptions,
    history: LLMMessage[] | null = null,
  ): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    // Build OpenAI-formatted messages from history
    // OpenRouter is OpenAI-compatible, so we use the same format as OpenAI
    const cleanHistory: Array<Record<string, any>> = []
    for (const msg of history || []) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message with tool calls
        cleanHistory.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          })),
        })
      } else if (msg.role === 'user' && msg.toolResults && msg.toolResults.length > 0) {
        // Tool results - OpenAI format uses role: 'tool' for each result
        for (const tr of msg.toolResults) {
          cleanHistory.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: tr.result,
          })
        }
      } else {
        // Regular text message
        cleanHistory.push({ role: msg.role, content: msg.content })
      }
    }

    let messages: Record<string, any>[] = []

    // Add system prompt if provided
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    // history contains previous messages, options.prompt is the current user message
    // Skip adding user message if prompt is empty (e.g., after tool calls, tool results are the implicit prompt)
    messages = [...messages, ...cleanHistory]
    if (options.prompt) {
      messages.push({ role: 'user', content: options.prompt })
    }

    // Build request body
    const requestBody: Record<string, any> = {
      model: this.model,
      messages: messages,
    }

    // Add optional parameters if provided
    if (options.maxTokens) {
      requestBody.max_tokens = options.maxTokens
    }
    if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature
    }
    if (options.topP !== undefined) {
      requestBody.top_p = options.topP
    }

    // Add tools if provided (OpenAI format)
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }))
    }

    try {
      // Merge retry options with request-specific backoff callback and abort signal
      const effectiveRetryOptions = {
        ...this.retryOptions,
        signal: options.signal,
        onRetry: (attempt: number, delayMs: number, error: Error) => {
          // Call the default retry handler
          this.retryOptions.onRetry?.(attempt, delayMs, error)
          // Also notify the request-specific callback if provided
          options.onRateLimitBackoff?.(attempt, delayMs, error)
        },
      }

      const response = await fetchWithRetry(
        () =>
          fetch(this.baseCompletionUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(requestBody),
            signal: options.signal,
          }),
        effectiveRetryOptions,
      )

      const data = await response.json()

      // Handle error responses from OpenRouter
      if (data.error) {
        throw new Error(`OpenRouter API error: ${data.error.message || JSON.stringify(data.error)}`)
      }

      // Handle tool calls in the response
      let responseText = data.choices?.[0]?.message?.content || ''
      const rawToolCalls = data.choices?.[0]?.message?.tool_calls
      const structuredToolCalls: LLMToolCall[] = []

      if (rawToolCalls && rawToolCalls.length > 0) {
        for (const toolCall of rawToolCalls) {
          if (toolCall.type === 'function') {
            const input = JSON.parse(toolCall.function.arguments)
            structuredToolCalls.push({
              id: toolCall.id,
              name: toolCall.function.name,
              input,
            })
          }
        }
      }

      // Handle usage - OpenRouter may return usage in different formats
      const usage = data.usage || {}

      return {
        text: responseText,
        toolCalls: structuredToolCalls.length > 0 ? structuredToolCalls : undefined,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenRouter API error: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Get model metadata for a specific model ID
   */
  getModelMetadata(modelId: string): OpenRouterModel | undefined {
    return this.modelMetadata.get(modelId)
  }

  /**
   * Filter OpenRouter models to include only modern, high-quality models.
   * @param models - Array of model IDs from the API
   * @returns Filtered and sorted array of model IDs
   */
  static filterModels(models: string[]): string[] {
    return models
      .filter((model) => {
        // Check if model matches any of our modern model patterns
        return MODERN_MODEL_PATTERNS.some((pattern) => pattern.test(model))
      })
      .sort(compareOpenRouterModels)
  }

  /**
   * Get the default model to use for OpenRouter.
   * Returns a high-quality, reliable default model.
   * @param models - Array of model IDs (already filtered)
   * @returns The default model ID to use
   */
  static getDefaultModel(models: string[]): string {
    // Prefer Claude Sonnet 4 as a balanced default
    const preferredDefaults = [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-5-sonnet',
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'google/gemini-2.0-flash',
    ]

    for (const preferred of preferredDefaults) {
      // Check for exact match or prefix match
      const found = models.find((m) => m === preferred || m.startsWith(preferred))
      if (found) {
        return found
      }
    }

    // Fall back to first model if no preferred default found
    return models[0] || ''
  }

  /**
   * Generate the OAuth PKCE authorization URL for OpenRouter
   * @param config - OAuth configuration
   * @returns The authorization URL to redirect the user to
   */
  static getOAuthAuthorizationUrl(config: OpenRouterOAuthConfig): string {
    const params = new URLSearchParams({
      callback_url: config.callbackUrl,
    })

    if (config.codeChallenge) {
      params.set('code_challenge', config.codeChallenge)
    }
    if (config.codeChallengeMethod) {
      params.set('code_challenge_method', config.codeChallengeMethod)
    }

    return `https://openrouter.ai/auth?${params.toString()}`
  }

  /**
   * Exchange an authorization code for an API key using OAuth PKCE
   * @param code - The authorization code from the callback
   * @param codeVerifier - The code verifier used to generate the challenge (optional)
   * @returns The API key
   */
  static async exchangeCodeForApiKey(code: string, codeVerifier?: string): Promise<string> {
    const body: Record<string, string> = { code }
    if (codeVerifier) {
      body.code_verifier = codeVerifier
    }

    const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(`Failed to exchange code for API key: ${error.message || response.statusText}`)
    }

    const data = await response.json()
    return data.key
  }

  /**
   * Generate a cryptographically secure code verifier for PKCE
   * @returns A random code verifier string
   */
  static generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  /**
   * Generate a code challenge from a code verifier using S256
   * @param verifier - The code verifier
   * @returns The code challenge
   */
  static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    return btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }
}
