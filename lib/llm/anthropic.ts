import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse } from './base'

export class AnthropicProvider extends LLMProvider {
  private baseUrl: string = 'https://api.anthropic.com/v1/messages'
  private baseModelUrl: string = 'https://api.anthropic.com/v1/models'
  public type: string = 'anthropic'
  constructor(name: string, apiKey: string, model: string, saveCredential: boolean = false) {
    super(name, apiKey, model, saveCredential)
  }

  async reset(): Promise<void> {
    this.error = null;
    try {
      let models = await fetch(this.baseModelUrl, {
        headers: {
          "x-api-key": `${this.apiKey}`,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"

        },
        method: 'GET',
      }).then((response) => response.json())
      this.models = models.data.map((model: any) => model.id)
      this.connected = true
    } catch (e) {
      if (e instanceof Error) {
        this.error = e.message
      } else {
        this.error = 'Unknown error'
      }
      this.connected = false
    }
  }

  async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        "x-api-key": `${this.apiKey}`,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1.0,
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      text: data.content[0].text,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    }
  }
}
