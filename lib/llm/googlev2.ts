import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'

export class GoogleProvider extends LLMProvider {
  //   private genAIClient: GoogleGenAI
  private genAIClient: any
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
    // lazy import of import { GoogleGenAI } from '@google/genai'
    // to reduce build size

    try {
      const { GoogleGenAI } = require('@google/genai')
      if (!GoogleGenAI) {
        throw new Error(
          'Google GenAI client library is not available. Please install @google/genai.',
        )
      }

      this.genAIClient = new GoogleGenAI({ apiKey: this.apiKey })
    } catch (error) {
      throw new Error(
        `Failed to initialize Google GenAI client: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
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
      // Get the model from the Gemini client
      const model = this.genAIClient.getGenerativeModel({ model: this.model })

      // Prepare chat history if available
      let chatSession
      if (history && history.length > 0) {
        chatSession = model.startChat({
          history: this.convertToGeminiHistory(history),
        })

        // Send the current message to the chat session
        const result = await chatSession.sendMessage(options.prompt)
        const response = await result.response

        return {
          text: response.text(),
          usage: {
            promptTokens: response.promptFeedback?.tokenCount || 0,
            completionTokens: response.candidates?.[0]?.usageMetadata?.candidatesTokenCount || 0,
            totalTokens:
              (response.promptFeedback?.tokenCount || 0) +
              (response.candidates?.[0]?.usageMetadata?.candidatesTokenCount || 0),
          },
        }
      } else {
        // Simple completion without history
        const result = await model.generateContent(options.prompt)
        const response = await result.response

        return {
          text: response.text(),
          usage: {
            promptTokens: response.promptFeedback?.tokenCount || 0,
            completionTokens: response.candidates?.[0]?.usageMetadata?.candidatesTokenCount || 0,
            totalTokens:
              (response.promptFeedback?.tokenCount || 0) +
              (response.candidates?.[0]?.usageMetadata?.candidatesTokenCount || 0),
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
   * @returns Gemini-formatted message objects for chat history
   */
  private convertToGeminiHistory(
    messages: LLMMessage[],
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages.map((message) => {
      // Map standard roles to Gemini roles (user or model)
      const role = message.role === 'assistant' ? 'model' : 'user'
      return {
        role,
        parts: [{ text: message.content }],
      }
    })
  }
}
