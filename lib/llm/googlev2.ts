import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'
import { GoogleGenAI, type Part } from '@google/genai'
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './consts'
export class GoogleProvider extends LLMProvider {
  private genAIClient: GoogleGenAI | null = null
  // no api method to list
  private baseModelUrl: string = 'https://generativelanguage.googleapis.com/v1/models'
  public models: string[] = []
  public type: string = 'google'

  /**
   * @param name - Display name for the provider
   * @param apiKey - Google API key
   * @param model - Google model to use (e.g., 'gemini-2.0-flash-001')
   * @param saveCredential - Whether to persist the API key
   */
  constructor(name: string, apiKey: string, model: string, saveCredential: boolean = false) {
    super(name, apiKey, model, saveCredential)
    this.genAIClient = new GoogleGenAI({ apiKey: this.apiKey })
  }

  /**
   * Initializes the provider by fetching available models
   * @returns Promise resolving when initialization is complete
   */
  async reset(): Promise<void> {
    try {
      this.genAIClient = new GoogleGenAI({ apiKey: this.apiKey })
    } catch (error) {
      console.error('Error initializing Google GenAI client:', error)
      throw new Error(
        `Failed to initialize Google GenAI client: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
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
   * Generates a completion using the Google Gemini API
   * @param options - Request configuration options
   * @param history - Optional conversation history
   * @returns Promise resolving to the completion response
   */
  async generateCompletion(
    options: LLMRequestOptions,
    history: LLMMessage[] | null = null,
  ): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    if (!this.genAIClient) {
      throw new Error('Google GenAI client is not initialized')
    }

    console.log('history', history)
    try {
      if (history && history.length > 0) {
        // Create a chat with history
        const args = {
          // if the model has models/ prefixed, split it
          model: this.model.includes('/') ? this.model.split('/')[1] : this.model,
          history: this.convertToGeminiHistory(history),
          config: {
            maxOutputTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: options.temperature || DEFAULT_TEMPERATURE,
          },
        }
        const chat = this.genAIClient.chats.create(args)

        // Send the message
        const result = await chat.sendMessage({ message: options.prompt })

        // Get token usage if available
        const promptTokens = result.usageMetadata?.promptTokenCount || 0
        const completionTokens = result.usageMetadata?.candidatesTokenCount || 0

        return {
          text: result.text || '',
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        }
      } else {
        console.log('using simple completion without history')
        // Simple completion without history
        const result = await this.genAIClient.models.generateContent({
          model: this.model.includes('/') ? this.model.split('/')[1] : this.model,
          contents: options.prompt,
          config: {
            maxOutputTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: options.temperature || DEFAULT_TEMPERATURE,
          },
        })

        // Get token usage if available
        const promptTokens = result.usageMetadata?.promptTokenCount || 0
        const completionTokens = result.usageMetadata?.candidatesTokenCount || 0

        return {
          text: result.text || '',
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      } else {
        throw new Error('Unknown error occurred while generating completion')
      }
    }
  }

  private convertToGeminiHistory(messages: LLMMessage[]): Array<{ role: string; parts: Part[] }> {
    return messages.map((message) => {
      // Map standard roles to Gemini roles (model or user)
      const role = message.role === 'assistant' ? 'model' : 'user'
      return {
        parts: [{ text: message.content }],
        role,
      }
    })
  }
}
