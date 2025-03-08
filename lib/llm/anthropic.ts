import {LLMProvider} from './base';
import type { LLMRequestOptions, LLMResponse } from './base';

export class AnthropicProvider extends LLMProvider {
    private baseUrl: string = 'https://api.anthropic.com/v1/messages'
  
    constructor(apiKey: string) {
      super(apiKey)
    }
  
    async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
      this.validateRequestOptions(options)
  
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          // 'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
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
        model: data.model,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
      }
    }
  }