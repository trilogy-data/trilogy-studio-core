import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'

export class OpenAIProvider extends LLMProvider {
  private baseCompletionUrl: string = 'https://api.openai.com/v1/chat/completions'
  private baseModelUrl: string = 'https://api.openai.com/v1/models'
  public models: string[]
  public type: string = 'openai'

  constructor(name: string, apiKey: string, model: string, saveCredential: boolean=false) {
    super(name, apiKey, model, saveCredential)
    this.models = []
  }

  async reset(): Promise<void> {
    try {
      let models = await fetch(this.baseModelUrl, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        method: 'GET',
      }).then((response) => response.json())
      this.models = models.data.map((model: any) => model.id).sort()
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

    const response = await fetch(this.baseCompletionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        // max_completion_tokens: options.maxTokens || 1000,
        // temperature: options.temperature || 0.4,
        // top_p: options.topP || 1.0,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      text: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    }
  }
}
