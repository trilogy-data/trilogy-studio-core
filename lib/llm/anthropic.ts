import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'
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

  async generateCompletion(options: LLMRequestOptions, history: LLMMessage[] | null = null,): Promise<LLMResponse> {
    this.validateRequestOptions(options)
    history = history || []
    try {
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
            body: JSON.stringify({
              model: this.model,
              messages: history.concat([{ role: 'user', content: options.prompt }]),
              max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
              temperature: options.temperature || DEFAULT_TEMPERATURE,
              top_p: options.topP || 1.0,
            }),
          }),
        this.retryOptions,
      )

      const data = await response.json()
      return {
        text: data.content[0].text,
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
