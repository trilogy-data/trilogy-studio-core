import { LLMProvider } from './base';
import type { LLMRequestOptions, LLMResponse } from './base';


export class OpenAIProvider extends LLMProvider {
  private baseUrl: string = 'https://api.openai.com/v1/chat/completions'
  public models: string[]
  public type: string = 'openai'
  
  constructor(name: string,  apiKey: string, model:string) {
    super(name, apiKey, model)
    this.models = ['o3-mini']
  }

  async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      text: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    }
  }
}