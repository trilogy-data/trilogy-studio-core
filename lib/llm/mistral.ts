import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse } from './base'

export class MistralProvider extends LLMProvider {
  private baseUrl = 'https://api.mistral.ai/v1/chat/completions'
  public type: string = 'mistral'
  constructor(name: string, apiKey: string, model: string) {
    super(name, apiKey, model)
  }

  async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    // Validate request options
    this.validateRequestOptions(options)

    try {
      // Map our generic request options to Mistral API format
      const requestBody = {
        model: this.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1.0,
      }

      // Make API request to Mistral
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Mistral API error: ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()

      // Map Mistral response to our generic LLMResponse format
      return {
        text: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      }
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('Unknown error occurred while generating completion with Mistral')
    }
  }

  // Additional Mistral-specific methods could be added here
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch('https://api.mistral.ai/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch Mistral models: ${response.statusText}`)
      }

      const data = await response.json()
      return data.data.map((model: any) => model.id)
    } catch (error) {
      console.error('Error listing Mistral models:', error)
      return []
    }
  }

  // Method to test connection
  async testConnection(): Promise<boolean> {
    try {
      const models = await this.listModels()
      this.connected = models.length > 0
      return this.connected
    } catch (error) {
      this.connected = false
      this.error = error instanceof Error ? error.message : 'Unknown error'
      return false
    } finally {
    }
  }

  // Reset connection state
  reset(): Promise<MistralProvider> {
    this.connected = false
    this.error = null
    return Promise.resolve(this)
  }
}
