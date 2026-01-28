import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage, LLMToolCall } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'
/**
 * Parse OpenAI model name into version components.
 * Examples: gpt-5.2-mini -> { major: 5, minor: 2, variant: 'mini' }
 *           gpt-5.2 -> { major: 5, minor: 2, variant: null }
 *           gpt-4o -> { major: 4, minor: null, variant: 'o' }
 */
export function parseOpenAIModelVersion(
  model: string,
): { major: number; minor: number | null; variant: string | null } | null {
  // Match patterns like gpt-5.2-mini, gpt-5.2, gpt-4o, gpt-4o-mini
  const match = model.match(/^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/)
  if (!match) {
    // Also try matching gpt-4o style (letter suffix)
    const letterMatch = model.match(/^gpt-(\d+)([a-z])(?:-(.+))?$/)
    if (letterMatch) {
      return {
        major: parseInt(letterMatch[1], 10),
        minor: null,
        variant: letterMatch[2] + (letterMatch[3] ? `-${letterMatch[3]}` : ''),
      }
    }
    return null
  }
  return {
    major: parseInt(match[1], 10),
    minor: match[2] ? parseInt(match[2], 10) : null,
    variant: match[3] || null,
  }
}

/**
 * Compare two OpenAI models for sorting (descending - higher version first).
 */
export function compareOpenAIModels(a: string, b: string): number {
  const versionA = parseOpenAIModelVersion(a)
  const versionB = parseOpenAIModelVersion(b)

  // Non-gpt models go to the end
  if (!versionA && !versionB) return a.localeCompare(b)
  if (!versionA) return 1
  if (!versionB) return -1

  // Compare major version
  if (versionA.major !== versionB.major) {
    return versionB.major - versionA.major
  }

  // Compare minor version (null treated as 0)
  const minorA = versionA.minor ?? 0
  const minorB = versionB.minor ?? 0
  if (minorA !== minorB) {
    return minorB - minorA
  }

  // Prefer non-variant models (gpt-5.2 over gpt-5.2-mini)
  const hasVariantA = versionA.variant !== null
  const hasVariantB = versionB.variant !== null
  if (hasVariantA !== hasVariantB) {
    return hasVariantA ? 1 : -1
  }

  return 0
}

export class OpenAIProvider extends LLMProvider {
  private baseCompletionUrl: string = 'https://api.openai.com/v1/chat/completions'
  private baseModelUrl: string = 'https://api.openai.com/v1/models'
  public models: string[]
  public type: string = 'openai'
  private retryOptions: RetryOptions

  constructor(
    name: string,
    apiKey: string,
    model: string,
    saveCredential: boolean = false,
    retryOptions?: RetryOptions,
  ) {
    super(name, apiKey, model, saveCredential)
    this.models = []
    this.retryOptions = retryOptions || {
      maxRetries: 3,
      initialDelayMs: 1000,
      retryStatusCodes: [429, 500, 502, 503, 504], // Add common API error codes
      onRetry: (attempt, delayMs, error) => {
        console.warn(
          `Retry attempt ${attempt} after ${delayMs}ms delay due to error: ${error.message}`,
        )
      },
    }
  }

  async reset(): Promise<void> {
    this.error = null
    try {
      const response = await fetchWithRetry(
        () =>
          fetch(this.baseModelUrl, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
            method: 'GET',
          }),
        this.retryOptions,
      )

      const modelData = await response.json()
      const allModels = modelData.data.map((model: any) => model.id)
      // Apply filtering to only show GPT-5.x+ models
      this.models = OpenAIProvider.filterModels(allModels)
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
    // OpenAI expects tool_calls in assistant messages and role: 'tool' for tool results
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
        // Tool results - OpenAI uses role: 'tool' for each result
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

    messages = [...messages, ...cleanHistory, { role: 'user', content: options.prompt }]

    // Build request body
    const requestBody: Record<string, any> = {
      model: this.model,
      messages: messages,
      // max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
      // temperature: options.temperature || DEFAULT_TEMPERATURE,
      // top_p: options.topP || 1.0,
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
      // Merge retry options with request-specific backoff callback
      const effectiveRetryOptions = {
        ...this.retryOptions,
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
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(requestBody),
          }),
        effectiveRetryOptions,
      )

      const data = await response.json()

      // Handle tool calls in the response
      let responseText = data.choices[0].message.content || ''
      const rawToolCalls = data.choices[0].message.tool_calls
      const structuredToolCalls: LLMToolCall[] = []

      if (rawToolCalls && rawToolCalls.length > 0) {
        for (const toolCall of rawToolCalls) {
          if (toolCall.type === 'function') {
            const input = JSON.parse(toolCall.function.arguments)
            // Add to structured tool calls array
            structuredToolCalls.push({
              id: toolCall.id,
              name: toolCall.function.name,
              input,
            })
          }
        }
      }

      return {
        text: responseText,
        toolCalls: structuredToolCalls.length > 0 ? structuredToolCalls : undefined,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Filter OpenAI models to only include GPT-5.x+ models.
   * @param models - Array of model IDs from the API
   * @returns Filtered and sorted array of model IDs (highest version first)
   */
  static filterModels(models: string[]): string[] {
    return models
      .filter((model) => {
        const version = parseOpenAIModelVersion(model)
        return version !== null && version.major >= 5
      })
      .sort(compareOpenAIModels)
  }

  /**
   * Get the default model to use for OpenAI.
   * Returns the latest gpt-X.y model (not mini or other variants).
   * @param models - Array of model IDs (already filtered)
   * @returns The default model ID to use
   */
  static getDefaultModel(models: string[]): string {
    // Sort models and find the first one without a variant (not mini, etc.)
    const sorted = [...models].sort(compareOpenAIModels)
    const nonVariant = sorted.find((model) => {
      const version = parseOpenAIModelVersion(model)
      return version !== null && version.variant === null
    })
    // Fall back to first model if no non-variant found
    return nonVariant || sorted[0] || ''
  }
}
