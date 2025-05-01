import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'
import { GoogleGenAI } from '@google/genai'

export class GoogleProvider extends LLMProvider {
  private genAIClient: GoogleGenAI | null = null
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

    
  }

  /**
   * Initializes the provider by fetching available models
   * @returns Promise resolving when initialization is complete
   */
  async reset(): Promise<void> {
    try {
      console.log(this.apiKey)
      this.genAIClient = new GoogleGenAI({ apiKey: this.apiKey })
      console.log('CONNECTED')
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

    try {
      if (history && history.length > 0) {
        // Create a chat with history
        const chat = this.genAIClient.chats.create({
          model: this.model.split('/')[1],
          history: this.convertToGeminiHistory(history),
        })

        // Send the message
        const result = await chat.sendMessage(options.prompt)

        // Get token usage if available
        const promptTokens = result.promptFeedback?.tokenCount || 0
        const completionTokens = result.candidates?.[0]?.usageMetadata?.candidatesTokenCount || 0

        return {
          text: result.text,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        }
      } else {
        // Simple completion without history
        const result = await this.genAIClient.models.generateContent({
          model: this.model,
          contents: options.prompt
        })

        // Get token usage if available
        const promptTokens = result.usageMetadata?.promptTokenCount || 0
        const completionTokens = result.usageMetadata?.candidatesTokenCount || 0

        return {
          text: result.text,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Google Gemini API error: ${error.message}`)
      } else {
        throw new Error('Unknown error occurred while generating completion')
      }
    }
  }

  /**
   * Converts standard LLM messages to Gemini-specific format for chat history
   * @param messages - Array of standard LLM messages
   * @returns Gemini-formatted message array for chat history
   */
  private convertToGeminiHistory(
    messages: LLMMessage[],
  ): Array<{ role: string; content: string }> {
    return messages.map((message) => {
      // Map standard roles to Gemini roles (assistant or user)
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      return {
        role,
        content: message.content
      }
    })
  }
}