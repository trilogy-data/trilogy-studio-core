import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage, LLMToolCall } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'

/**
 * DeepSeek provider (https://api-docs.deepseek.com/).
 *
 * DeepSeek exposes an OpenAI-compatible surface, so the wire format mirrors the
 * OpenRouter/OpenAI providers. Two behaviors are DeepSeek-specific:
 *
 *  - Context caching is automatic. There is no cache_control equivalent to place; the
 *    server matches on request prefix, so the win comes from keeping stable content
 *    (system prompt, tool definitions) first and byte-identical across calls. Hits are
 *    reported as usage.prompt_cache_hit_tokens.
 *  - The models are text-only. Tool results carrying imageData are sent as text with an
 *    explicit note rather than silently dropping the reference.
 */

/** Parsed DeepSeek model ID. Legacy IDs (deepseek-chat) have no version. */
interface DeepSeekModelInfo {
  version: number
  tier: string
}

/**
 * Parse a DeepSeek model ID.
 * Examples: deepseek-v4-pro   -> { version: 4, tier: 'pro' }
 *           deepseek-v4-flash -> { version: 4, tier: 'flash' }
 *           deepseek-chat     -> { version: 0, tier: 'chat' }   (legacy, deprecated 2026-07-24)
 */
export function parseDeepSeekModel(model: string): DeepSeekModelInfo | null {
  const versioned = model.match(/^deepseek-v(\d+)(?:\.(\d+))?-([a-z]+)$/)
  if (versioned) {
    const major = parseInt(versioned[1], 10)
    const minor = versioned[2] ? parseInt(versioned[2], 10) : 0
    return { version: major + minor / 10, tier: versioned[3] }
  }

  // Legacy unversioned aliases. Version 0 sorts them below every v-numbered model.
  const legacy = model.match(/^deepseek-(chat|reasoner)$/)
  if (legacy) {
    return { version: 0, tier: legacy[1] }
  }

  return null
}

/** Sort DeepSeek models: newest version first, then preferred tier.
 *  flash leads pro — it is materially faster at comparable quality for this
 *  workload, so it heads the picker and is the default. */
export function compareDeepSeekModels(a: string, b: string): number {
  const infoA = parseDeepSeekModel(a)
  const infoB = parseDeepSeekModel(b)

  if (!infoA && !infoB) return a.localeCompare(b)
  if (!infoA) return 1
  if (!infoB) return -1

  if (infoA.version !== infoB.version) {
    return infoB.version - infoA.version
  }

  const tierOrder: Record<string, number> = { flash: 0, pro: 1, reasoner: 2, chat: 3 }
  const tierA = tierOrder[infoA.tier] ?? 99
  const tierB = tierOrder[infoB.tier] ?? 99
  if (tierA !== tierB) {
    return tierA - tierB
  }

  return a.localeCompare(b)
}

export class DeepSeekProvider extends LLMProvider {
  private baseCompletionUrl: string = 'https://api.deepseek.com/chat/completions'
  private baseModelUrl: string = 'https://api.deepseek.com/models'
  public models: string[] = []
  public type: string = 'deepseek'
  private retryOptions: RetryOptions

  constructor(
    name: string,
    apiKey: string,
    model: string,
    saveCredential: boolean = false,
    retryOptions?: RetryOptions,
  ) {
    super(name, apiKey, model, saveCredential)
    this.retryOptions = retryOptions || {
      maxRetries: 3,
      initialDelayMs: 1000,
      retryStatusCodes: [429, 500, 502, 503, 504],
      errorBodyExtractor: DeepSeekProvider.extractErrorMessage,
      onRetry: (attempt, delayMs, error) => {
        console.warn(
          `DeepSeek API retry attempt ${attempt} after ${delayMs}ms delay due to error: ${error.message}`,
        )
      },
    }
  }

  /**
   * Extract a rich error message from a DeepSeek error response body.
   * Expected body format: {"error":{"message":"...","type":"...","code":"..."}}
   */
  static async extractErrorMessage(response: Response): Promise<string> {
    const httpLine = `DeepSeek API error: HTTP ${response.status}: ${response.statusText}`

    // Read as text first so a non-JSON body (gateway/proxy error page) doesn't throw
    // inside the error handler and mask the real failure.
    let raw: string
    try {
      raw = await response.text()
    } catch {
      return httpLine
    }

    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      const snippet = raw.trim().slice(0, 200)
      return snippet ? `${httpLine} - ${snippet}` : httpLine
    }

    if (data?.error?.message) {
      const code = data.error.code || data.error.type
      // 402 means the account is out of credit - worth calling out, it is not a transient error.
      const hint = response.status === 402 ? ' (check your DeepSeek account balance)' : ''
      return `DeepSeek API error${code ? ` (${code})` : ''}: ${data.error.message}${hint}`
    }
    if (data?.error) {
      return `DeepSeek API error: ${JSON.stringify(data.error)}`
    }
    return httpLine
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }
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
      const allModelIds = (modelData.data || []).map((model: any) => model.id)
      this.models = DeepSeekProvider.filterModels(allModelIds)
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
    const cleanHistory: Array<Record<string, any>> = []
    for (const msg of history || []) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message with tool calls. Note that reasoning output from thinking-mode
        // responses is deliberately not echoed back - only content and tool calls are.
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
        // Tool results use role: 'tool', one message per result.
        for (const tr of msg.toolResults) {
          cleanHistory.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: tr.result,
          })
        }
        // DeepSeek models are text-only. Say so explicitly rather than leaving the model
        // to reason about an image it was never shown.
        const imageCount = msg.toolResults.filter((tr) => tr.imageData).length
        if (imageCount > 0) {
          cleanHistory.push({
            role: 'user',
            content:
              `[${imageCount} image${imageCount === 1 ? '' : 's'} produced by the preceding ` +
              `tool call could not be included: this model does not accept image input. ` +
              `Rely on the textual tool output instead.]`,
          })
        }
      } else {
        // Regular text message
        cleanHistory.push({ role: msg.role, content: msg.content })
      }
    }

    // System prompt goes first so it forms a stable cacheable prefix. DeepSeek's context
    // cache matches on prefix, so anything volatile placed here costs every later turn.
    let messages: Record<string, any>[] = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    // history contains previous messages, options.prompt is the current user message.
    // Skip adding user message if prompt is empty (e.g. after tool calls, where the tool
    // results in history are the implicit prompt).
    messages = [...messages, ...cleanHistory]
    if (options.prompt) {
      messages.push({ role: 'user', content: options.prompt })
    }

    const requestBody: Record<string, any> = {
      model: this.model,
      messages: messages,
    }

    if (options.maxTokens) {
      requestBody.max_tokens = options.maxTokens
    }
    if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature
    }
    if (options.topP !== undefined) {
      requestBody.top_p = options.topP
    }

    // Tools use the OpenAI function-calling shape
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
      const effectiveRetryOptions = {
        ...this.retryOptions,
        signal: options.signal,
        onRetry: (attempt: number, delayMs: number, error: Error) => {
          this.retryOptions.onRetry?.(attempt, delayMs, error)
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

      // Error bodies can arrive on a 200 for some gateway conditions
      if (data.error) {
        const code = data.error.code || data.error.type
        throw new Error(
          `DeepSeek API error${code ? ` (${code})` : ''}: ${
            data.error.message || JSON.stringify(data.error)
          }`,
        )
      }

      const choice = data.choices?.[0]
      const responseText = choice?.message?.content || ''
      const rawToolCalls = choice?.message?.tool_calls
      const structuredToolCalls: LLMToolCall[] = []

      if (rawToolCalls && rawToolCalls.length > 0) {
        for (const toolCall of rawToolCalls) {
          if (toolCall.type === 'function') {
            const input = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
            structuredToolCalls.push({
              id: toolCall.id,
              name: toolCall.function.name,
              input,
            })
          }
        }
      }

      // finish_reason 'length' means the answer is truncated mid-thought, not complete.
      const finishReason: string | undefined = choice?.finish_reason ?? undefined
      if (finishReason === 'length') {
        console.warn('DeepSeek response hit the output token limit and is truncated.')
      }

      // prompt_tokens counts all input; the hit/miss split says how much was served from
      // DeepSeek's automatic context cache. promptTokens is reported as the uncached
      // portion, matching the convention in LLMResponse.
      const usage = data.usage || {}
      const cacheReadTokens = usage.prompt_cache_hit_tokens ?? 0
      const promptTokens = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens ?? 0
      const completionTokens = usage.completion_tokens ?? 0

      return {
        text: responseText,
        toolCalls: structuredToolCalls.length > 0 ? structuredToolCalls : undefined,
        stopReason: finishReason,
        usage: {
          promptTokens,
          completionTokens,
          cacheReadTokens,
          totalTokens: usage.total_tokens ?? promptTokens + cacheReadTokens + completionTokens,
        },
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`DeepSeek API error: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Filter to recognized DeepSeek chat models, newest and most capable first.
   * Non-chat models (embeddings and similar) are excluded.
   */
  static filterModels(models: string[]): string[] {
    return models.filter((model) => parseDeepSeekModel(model) !== null).sort(compareDeepSeekModels)
  }

  /**
   * Get the default model to use for DeepSeek.
   * Prefers the newest 'flash' tier: pro is slower without being better enough
   * to justify the latency for interactive agent work.
   */
  static getDefaultModel(models: string[]): string {
    const sorted = [...models].sort(compareDeepSeekModels)
    const flash = sorted.find((model) => parseDeepSeekModel(model)?.tier === 'flash')
    return flash || sorted[0] || ''
  }
}
