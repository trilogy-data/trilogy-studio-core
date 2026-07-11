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
  private baseCompletionUrl: string = 'https://api.openai.com/v1/responses'
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
      errorBodyExtractor: OpenAIProvider.extractErrorMessage,
      onRetry: (attempt, delayMs, error) => {
        console.warn(
          `Retry attempt ${attempt} after ${delayMs}ms delay due to error: ${error.message}`,
        )
      },
    }
  }

  /**
   * Extract a rich error message from an OpenAI error response body.
   * Expected body format: {"error":{"message":"...","type":"...","param":null,"code":"..."}}
   */
  static async extractErrorMessage(response: Response): Promise<string> {
    const data = await response.json()
    if (data?.error?.message) {
      const code = data.error.code ? ` (${data.error.code})` : ''
      return `OpenAI API error${code}: ${data.error.message}`
    }
    if (data?.error) {
      return `OpenAI API error: ${JSON.stringify(data.error)}`
    }
    return `OpenAI API error: HTTP ${response.status}: ${response.statusText}`
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

    // Build Responses API input items from history.
    // Tool calls become standalone function_call items and tool results become
    // function_call_output items. Item ids are deliberately omitted so the API
    // treats replayed history as stateless (no paired reasoning items required).
    const input: Array<Record<string, any>> = []
    for (const msg of history || []) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        if (msg.content) {
          input.push({ role: 'assistant', content: msg.content })
        }
        for (const tc of msg.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          })
        }
      } else if (msg.role === 'user' && msg.toolResults && msg.toolResults.length > 0) {
        // function_call_output only accepts string output, so images are sent as a
        // follow-up user message with an input_image content block.
        let hasImage = false
        for (const tr of msg.toolResults) {
          input.push({
            type: 'function_call_output',
            call_id: tr.toolCallId,
            output: tr.result,
          })
          if (tr.imageData) {
            hasImage = true
          }
        }
        if (hasImage) {
          const imageParts: any[] = []
          for (const tr of msg.toolResults) {
            if (tr.imageData) {
              imageParts.push({
                type: 'input_image',
                image_url: `data:${tr.imageData.mediaType};base64,${tr.imageData.data}`,
              })
            }
          }
          imageParts.push({
            type: 'input_text',
            text: 'Above is the rendered screenshot referenced by the preceding tool result. Review it visually.',
          })
          input.push({ role: 'user', content: imageParts })
        }
      } else {
        // Regular text message
        input.push({ role: msg.role, content: msg.content })
      }
    }

    // history contains previous messages, options.prompt is the current user message
    // Skip adding user message if prompt is empty (e.g., after tool calls, tool results are the implicit prompt)
    if (options.prompt) {
      input.push({ role: 'user', content: options.prompt })
    }

    // Build request body — history is managed client-side, so don't persist server-side
    const requestBody: Record<string, any> = {
      model: this.model,
      input: input,
      store: false,
    }

    // System prompt maps to top-level instructions in the Responses API
    if (options.systemPrompt) {
      requestBody.instructions = options.systemPrompt
    }

    // Add tools if provided (Responses API uses a flat function format).
    // strict defaults to true in the Responses API, which rejects schemas that
    // aren't strict-mode compliant, so disable it explicitly.
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
        strict: false,
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
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: options.signal,
          }),
        effectiveRetryOptions,
      )

      const data = await response.json()

      // Responses API returns a list of output items: message items hold text,
      // function_call items are tool calls (call_id links to function_call_output)
      let responseText = ''
      const structuredToolCalls: LLMToolCall[] = []

      for (const item of data.output || []) {
        if (item.type === 'message') {
          for (const part of item.content || []) {
            if (part.type === 'output_text') {
              responseText += part.text
            }
          }
        } else if (item.type === 'function_call') {
          structuredToolCalls.push({
            id: item.call_id,
            name: item.name,
            input: JSON.parse(item.arguments),
          })
        }
      }

      return {
        text: responseText,
        toolCalls: structuredToolCalls.length > 0 ? structuredToolCalls : undefined,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
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
