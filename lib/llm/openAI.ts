import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'
import { fetchWithRetry, type RetryOptions } from './utils'
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './consts'
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
      console.log('Model data:', modelData)
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

    let messages: LLMMessage[] = []
    if (history) {
      messages = [...history, { role: 'user', content: options.prompt }]
    } else {
      messages = [{ role: 'user', content: options.prompt }]
    }

    try {
      const response = await fetchWithRetry(
        () =>
          fetch(this.baseCompletionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: this.model,
              messages: messages,
              max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
              temperature: options.temperature || DEFAULT_TEMPERATURE,
              top_p: options.topP || 1.0,
            }),
          }),
        this.retryOptions,
      )

      const data = await response.json()
      return {
        text: data.choices[0].message.content,
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
