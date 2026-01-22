import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage, LLMToolCall } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'
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
      this.models = modelData.data.map((model: any) => model.id).sort()
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

    // Strip messages to only include role and content (OpenAI rejects extra fields like 'hidden')
    const cleanHistory = (history || []).map(({ role, content }) => ({ role, content }))

    let messages: { role: string; content: string }[] = []

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
}
