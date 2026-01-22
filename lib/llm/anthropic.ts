import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage, LLMToolCall } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './consts'

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
      onRetry: (attempt, delayMs, error) => {
        console.warn(
          `Anthropic API retry attempt ${attempt} after ${delayMs}ms delay due to error: ${error.message}`,
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
              'x-api-key': `${this.apiKey}`,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            method: 'GET',
          }),
        this.retryOptions,
      )

      const models = await response.json()
      this.models = models.data.map((model: any) => model.id)
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
      // Extract system message from history (if any) - Anthropic expects system as a top-level parameter
      const systemMessage = history.find(({ role }) => role === 'system')

      // Build Anthropic-formatted messages from history
      // Anthropic expects tool_use blocks in assistant messages and tool_result blocks in user messages
      const cleanedHistory: Array<{ role: string; content: any }> = []
      for (const msg of history) {
        if (msg.role === 'system') continue // System messages go in top-level parameter

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
          // User message with tool results - format as content array with tool_result blocks
          const content: any[] = msg.toolResults.map((tr) => ({
            type: 'tool_result',
            tool_use_id: tr.toolCallId,
            content: tr.result,
          }))
          cleanedHistory.push({ role: 'user', content })
        } else {
          // Regular text message
          cleanedHistory.push({ role: msg.role, content: msg.content })
        }
      }

      // Build request body
      const requestBody: Record<string, any> = {
        model: this.model,
        messages: cleanedHistory.concat([{ role: 'user', content: options.prompt }]),
        max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: options.temperature || DEFAULT_TEMPERATURE,
      }

      // Add system prompt - prefer options.systemPrompt, fall back to system message from history
      const systemPrompt = options.systemPrompt || systemMessage?.content
      if (systemPrompt) {
        requestBody.system = systemPrompt
      }

      // Add tools if provided
      if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
      }

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
          fetch(this.baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': `${this.apiKey}`,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify(requestBody),
          }),
        effectiveRetryOptions,
      )

      const data = await response.json()

      // Handle tool use responses - extract text and tool_use blocks
      let responseText = ''
      const toolCalls: LLMToolCall[] = []

      if (Array.isArray(data.content)) {
        for (const block of data.content) {
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
      } else {
        responseText = data.content[0]?.text || ''
      }

      return {
        text: responseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Anthropic API error: ${error.message}`)
      }
      throw error
    }
  }
}
