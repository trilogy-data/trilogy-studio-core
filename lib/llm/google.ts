import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'

export class GoogleProvider extends LLMProvider {
  private baseCompletionUrl: string = 'https://generativelanguage.googleapis.com/v1'
  private baseModelUrl: string = 'https://generativelanguage.googleapis.com/v1/models'
  public models: string[] = []
  public type: string = 'google'

  /**
   * @param name - Display name for the provider
   * @param apiKey - Google API key
   * @param model - Google model to use
   * @param saveCredential - Whether to persist the API key
   */
  constructor(name: string, apiKey: string, model: string, saveCredential: boolean = false) {
    super(name, apiKey, model, saveCredential)
  }

  /**
   * Initializes the provider by fetching available models
   * @returns Promise resolving when initialization is complete
   */
  async reset(): Promise<void> {
    this.error = null
    try {
      const response = await fetch(`${this.baseModelUrl}?key=${this.apiKey}`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Google API error: ${response.statusText}`)
      }

      const data = await response.json()
      this.models = data.models.map((model: { name: string }) => model.name).sort()

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

  /**
   * Generates a completion using the Google API
   * @param options - Request configuration options
   * @param history - Optional conversation history
   * @returns Promise resolving to the completion response
   */
  async generateCompletion(
    options: LLMRequestOptions,
    history: LLMMessage[] | null = null,
  ): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    // Construct the request payload based on whether we have history
    const messages: LLMMessage[] = history
      ? [...history, { role: 'user', content: options.prompt }]
      : [{ role: 'user', content: options.prompt }]

    const googleMessages = this.convertToGoogleMessages(messages)

    // Construct URL with API key
    const url = `${this.baseCompletionUrl}/${this.model}:generateContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        contents: googleMessages,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.4,
          topP: options.topP || 1.0,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`)
    }

    const data = await response.json()

    // Extract text from Google response format
    const text = data.candidates[0]?.content?.parts?.[0]?.text || ''

    return {
      text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens:
          (data.usageMetadata?.promptTokenCount || 0) +
          (data.usageMetadata?.candidatesTokenCount || 0),
      },
    }
  }

  /**
   * Converts standard LLM messages to Google-specific format
   * @param messages - Array of standard LLM messages
   * @returns Google-formatted message objects
   */
  private convertToGoogleMessages(messages: LLMMessage[]): any[] {
    return messages.map((message) => {
      // Map standard roles
      const role = message.role === 'assistant' ? 'model' : 'user'

      return {
        role,
        parts: [{ text: message.content }],
      }
    })
  }
}
