import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage, LLMToolCall } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './consts'

/** Tiers recognized in model IDs, highest capability first. */
const TIER_PATTERN = 'fable|mythos|opus|sonnet|haiku'

/**
 * Parse Anthropic model name into components.
 *
 * Current model IDs are undated aliases (claude-opus-4-8, claude-sonnet-5); older
 * ones carry a dated snapshot suffix. Both are recognized, and `date` is '' for an
 * undated alias.
 *
 * Examples: claude-3-opus-20240229   -> { version: '3',   tier: 'opus',   date: '20240229' }
 *           claude-3-5-sonnet-20240620 -> { version: '3-5', tier: 'sonnet', date: '20240620' }
 *           claude-sonnet-4-20250514 -> { version: '4',   tier: 'sonnet', date: '20250514' }
 *           claude-opus-4-8          -> { version: '4-8', tier: 'opus',   date: '' }
 *           claude-sonnet-5          -> { version: '5',   tier: 'sonnet', date: '' }
 */
export function parseAnthropicModelVersion(
  model: string,
): { version: string; tier: string; date: string } | null {
  // Dated forms are matched first. The date group cannot be made optional in a single
  // pattern: on 'claude-sonnet-4-20250514' the version group would greedily swallow
  // '-20250514' and report version '4-20250514'.

  // Dated new format: claude-{tier}-{version}-{date} (e.g., claude-sonnet-4-20250514)
  const datedNew = model.match(new RegExp(`^claude-(${TIER_PATTERN})-(\\d+(?:-\\d+)?)-(\\d{8})$`))
  if (datedNew) {
    return { version: datedNew[2], tier: datedNew[1], date: datedNew[3] }
  }

  // Dated old format: claude-{version}-{tier}-{date} (e.g., claude-3-opus-20240229)
  const datedOld = model.match(new RegExp(`^claude-(\\d+(?:-\\d+)?)-(${TIER_PATTERN})-(\\d{8})$`))
  if (datedOld) {
    return { version: datedOld[1], tier: datedOld[2], date: datedOld[3] }
  }

  // Undated alias, new format: claude-{tier}-{version} (e.g., claude-opus-4-8, claude-sonnet-5)
  const aliasNew = model.match(new RegExp(`^claude-(${TIER_PATTERN})-(\\d+(?:-\\d+)?)$`))
  if (aliasNew) {
    return { version: aliasNew[2], tier: aliasNew[1], date: '' }
  }

  // Undated alias, old format: claude-{version}-{tier} (e.g., claude-3-opus)
  const aliasOld = model.match(new RegExp(`^claude-(\\d+(?:-\\d+)?)-(${TIER_PATTERN})$`))
  if (aliasOld) {
    return { version: aliasOld[1], tier: aliasOld[2], date: '' }
  }

  return null
}

/**
 * Sampling parameters (temperature/top_p/top_k) were removed on the newest models and
 * return a 400 if sent. Steer these models with prompting instead.
 * Rejected on: Fable/Mythos (any version), Opus >= 4.7, Sonnet >= 5.
 */
export function modelRejectsSamplingParams(model: string): boolean {
  const parsed = parseAnthropicModelVersion(model)
  if (!parsed) return false // unknown ID - preserve existing behavior
  const version = versionToNumber(parsed.version)
  switch (parsed.tier) {
    case 'fable':
    case 'mythos':
      return true
    case 'opus':
      return version >= 4.7
    case 'sonnet':
      return version >= 5
    default:
      return false
  }
}

/**
 * Convert version string to comparable number (e.g., '3-5' -> 3.5, '4' -> 4.0)
 */
function versionToNumber(version: string): number {
  const parts = version.split('-').map((p) => parseInt(p, 10))
  return parts[0] + (parts[1] ?? 0) / 10
}

/**
 * Compare two Anthropic models for sorting (descending - higher version first, opus preferred).
 */
export function compareAnthropicModels(a: string, b: string): number {
  const versionA = parseAnthropicModelVersion(a)
  const versionB = parseAnthropicModelVersion(b)

  // Non-claude models go to the end
  if (!versionA && !versionB) return a.localeCompare(b)
  if (!versionA) return 1
  if (!versionB) return -1

  // Compare version number (higher first)
  const vNumA = versionToNumber(versionA.version)
  const vNumB = versionToNumber(versionB.version)
  if (vNumA !== vNumB) {
    return vNumB - vNumA
  }

  // Same version - prefer fable/mythos > opus > sonnet > haiku
  const tierOrder: Record<string, number> = { fable: 0, mythos: 0, opus: 1, sonnet: 2, haiku: 3 }
  const tierOrderA = tierOrder[versionA.tier] ?? 99
  const tierOrderB = tierOrder[versionB.tier] ?? 99
  if (tierOrderA !== tierOrderB) {
    return tierOrderA - tierOrderB
  }

  // Same tier - prefer the undated alias (it tracks the latest snapshot), then newer date
  const aliasA = versionA.date === ''
  const aliasB = versionB.date === ''
  if (aliasA !== aliasB) {
    return aliasA ? -1 : 1
  }
  return versionB.date.localeCompare(versionA.date)
}

export class AnthropicProvider extends LLMProvider {
  private baseUrl: string = 'https://api.anthropic.com/v1/messages'
  private baseModelUrl: string = 'https://api.anthropic.com/v1/models'
  public models: string[] = []
  public type: string = 'anthropic'
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
      maxRetries: 5,
      initialDelayMs: 5000,
      retryStatusCodes: [429, 500, 502, 503, 504],
      errorBodyExtractor: AnthropicProvider.extractErrorMessage,
      onRetry: (attempt, delayMs, error) => {
        console.warn(
          `Anthropic API retry attempt ${attempt} after ${delayMs}ms delay due to error: ${error.message}`,
        )
      },
    }
  }

  /**
   * Extract a rich error message from an Anthropic error response body.
   * Expected body format:
   *   {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"..."}
   */
  static async extractErrorMessage(response: Response): Promise<string> {
    const httpLine = `Anthropic API error: HTTP ${response.status}: ${response.statusText}`

    // Read as text first: a non-JSON body (proxy HTML, gateway error page) would make
    // response.json() throw inside the error handler and mask the real failure.
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
      const kind = data.error.type ? ` (${data.error.type})` : ''
      return `Anthropic API error${kind}: ${data.error.message}`
    }
    if (data?.error) {
      return `Anthropic API error: ${JSON.stringify(data.error)}`
    }
    return httpLine
  }

  async reset(): Promise<void> {
    this.error = null
    try {
      const response = await fetchWithRetry(
        () =>
          fetch(this.baseModelUrl, {
            headers: {
              'x-api-key': `${this.apiKey}`,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            method: 'GET',
          }),
        this.retryOptions,
      )

      const models = await response.json()
      const allModels = models.data.map((model: any) => model.id)
      // Apply filtering to only show recognized Claude models
      this.models = AnthropicProvider.filterModels(allModels)
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
    history = history || []
    try {
      // Extract system message from history (if any) - Anthropic expects system as a top-level
      // parameter. Only used when options.systemPrompt is absent; any other system message in
      // history is preserved inline below rather than dropped.
      const systemMessage = history.find(({ role }) => role === 'system')
      const hoistedSystemMessage = options.systemPrompt ? undefined : systemMessage

      // Build Anthropic-formatted messages from history
      // Anthropic expects tool_use blocks in assistant messages and tool_result blocks in user messages
      const cleanedHistory: Array<{ role: string; content: any }> = []
      for (const msg of history) {
        if (msg.role === 'system') {
          // The one message hoisted into the top-level `system` parameter is skipped here.
          if (msg === hoistedSystemMessage) continue
          // Any other system message arrived mid-conversation. Keeping it in the top-level
          // system prompt would change the cached prefix on every turn, so render it inline
          // at its original position instead of dropping it.
          if (msg.content) {
            cleanedHistory.push({
              role: 'user',
              content: [
                { type: 'text', text: `<system-reminder>${msg.content}</system-reminder>` },
              ],
            })
          }
          continue
        }

        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          // Assistant message with tool calls - format as content array with text and tool_use blocks
          const content: any[] = []
          if (msg.content) {
            content.push({ type: 'text', text: msg.content })
          }
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            })
          }
          cleanedHistory.push({ role: 'assistant', content })
        } else if (msg.role === 'user' && msg.toolResults && msg.toolResults.length > 0) {
          // User message with tool results - format as content array with tool_result blocks.
          // When a tool result includes imageData, build a mixed-content block array so the
          // model can actually see the image (e.g. a captured dashboard screenshot).
          const content: any[] = msg.toolResults.map((tr) => {
            if (tr.imageData) {
              const blocks: any[] = []
              if (tr.result) {
                blocks.push({ type: 'text', text: tr.result })
              }
              blocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: tr.imageData.mediaType,
                  data: tr.imageData.data,
                },
              })
              return {
                type: 'tool_result',
                tool_use_id: tr.toolCallId,
                content: blocks,
              }
            }
            return {
              type: 'tool_result',
              tool_use_id: tr.toolCallId,
              content: tr.result,
            }
          })
          cleanedHistory.push({ role: 'user', content })
        } else {
          // Regular text message
          cleanedHistory.push({ role: msg.role, content: msg.content })
        }
      }

      // Build messages - skip adding user message if prompt is empty (e.g., after tool calls)
      const finalMessages = options.prompt
        ? cleanedHistory.concat([{ role: 'user', content: options.prompt }])
        : cleanedHistory

      // Build request body
      const requestBody: Record<string, any> = {
        model: this.model,
        messages: finalMessages,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      }

      // Sampling params return a 400 on the newest models; send them only where accepted.
      // ?? not ||: temperature 0 is a valid value that || would silently replace.
      if (!modelRejectsSamplingParams(this.model)) {
        requestBody.temperature = options.temperature ?? DEFAULT_TEMPERATURE
        if (options.topP !== undefined) {
          requestBody.top_p = options.topP
        }
      }

      // Add system prompt - prefer options.systemPrompt, fall back to system message from history.
      // Sent as a content-block array so it can carry a cache_control breakpoint. Anthropic
      // renders tools before system, so this single breakpoint caches tools + system together.
      const systemPrompt = options.systemPrompt || hoistedSystemMessage?.content
      if (systemPrompt) {
        requestBody.system = [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
        ]
      }

      // Add tools if provided
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
      }

      // Second breakpoint at the end of the conversation. Prompt caching is a prefix match,
      // so each turn of an agentic loop reads the entry written by the previous turn instead
      // of reprocessing the whole history. Max 4 breakpoints per request; we use 2.
      const lastMessage = finalMessages[finalMessages.length - 1]
      if (lastMessage) {
        const blocks = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : lastMessage.content
            ? [{ type: 'text', text: lastMessage.content }]
            : []
        const lastBlock = blocks[blocks.length - 1]
        if (lastBlock) {
          blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' } }
          finalMessages[finalMessages.length - 1] = { ...lastMessage, content: blocks }
        }
      }

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
          fetch(this.baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': `${this.apiKey}`,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify(requestBody),
            signal: options.signal,
          }),
        effectiveRetryOptions,
      )

      const data = await response.json()

      // Check for API-level errors (e.g. invalid model, authentication failures)
      if (data.type === 'error' || data.error) {
        const errorMsg = data.error?.message || data.error?.type || 'Unknown API error'
        throw new Error(errorMsg)
      }

      // Handle tool use responses - extract text and tool_use blocks
      let responseText = ''
      const toolCalls: LLMToolCall[] = []

      for (const block of Array.isArray(data.content) ? data.content : []) {
        if (block.type === 'text') {
          responseText += block.text
        } else if (block.type === 'tool_use') {
          // Add to structured tool calls array
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input,
          })
        }
      }

      // stop_reason arrives on a 200 response, so a refusal or a truncated answer is otherwise
      // indistinguishable from a complete one.
      const stopReason: string | undefined = data.stop_reason ?? undefined
      if (stopReason === 'refusal' && !responseText && toolCalls.length === 0) {
        const category = data.stop_details?.category
        throw new Error(`request was refused for safety reasons${category ? ` (${category})` : ''}`)
      }
      if (stopReason === 'max_tokens') {
        console.warn(
          `Anthropic response hit the max_tokens limit (${requestBody.max_tokens}) and is truncated.`,
        )
      }

      // Cached input tokens are reported separately from input_tokens, which counts only the
      // uncached remainder. Total prompt size is the sum of all three.
      const usage = data.usage ?? {}
      const promptTokens = usage.input_tokens ?? 0
      const completionTokens = usage.output_tokens ?? 0
      const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0

      return {
        text: responseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason,
        usage: {
          promptTokens,
          completionTokens,
          cacheCreationTokens,
          cacheReadTokens,
          totalTokens: promptTokens + cacheCreationTokens + cacheReadTokens + completionTokens,
        },
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Anthropic API error: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Filter Anthropic models to only include recognized Claude models.
   * @param models - Array of model IDs from the API
   * @returns Filtered and sorted array of model IDs (highest version/opus first)
   */
  static filterModels(models: string[]): string[] {
    return models
      .filter((model) => parseAnthropicModelVersion(model) !== null)
      .sort(compareAnthropicModels)
  }

  /**
   * Get the default model to use for Anthropic.
   * Returns the latest Opus model.
   * @param models - Array of model IDs (already filtered)
   * @returns The default model ID to use
   */
  static getDefaultModel(models: string[]): string {
    // Sort models and find the first opus model (highest version)
    const sorted = [...models].sort(compareAnthropicModels)
    const opusModel = sorted.find((model) => {
      const version = parseAnthropicModelVersion(model)
      return version !== null && version.tier === 'opus'
    })
    // Fall back to first model if no opus found
    return opusModel || sorted[0] || ''
  }
}
