import { LLMProvider } from './base'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from './base'
import { GoogleGenAI, type Content } from '@google/genai'
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './consts'

const MAX_RETRIES = 3
// retry delay by default for 429 is 30s
const INITIAL_RETRY_DELAY_MS = 30_000

export class GoogleProvider extends LLMProvider {
  private genAIClient: GoogleGenAI | null = null
  // no api method to list
  private baseModelUrl: string = 'https://generativelanguage.googleapis.com/v1/models'
  public models: string[] = []
  public type: string = 'google'

  constructor(name: string, apiKey: string, model: string, saveCredential: boolean = false) {
    super(name, apiKey, model, saveCredential)
    this.genAIClient = new GoogleGenAI({ apiKey: this.apiKey })
  }

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

    // Apply retry logic to the model fetching
    let retries = 0
    let success = false

    while (!success && retries <= MAX_RETRIES) {
      try {
        const response = await fetch(`${this.baseModelUrl}?key=${this.apiKey}`, {
          method: 'GET',
        })

        if (response.status === 429) {
          retries++
          if (retries <= MAX_RETRIES) {
            const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries - 1) // Exponential backoff
            console.log(`Rate limited (429). Retry ${retries}/${MAX_RETRIES} after ${delayMs}ms`)
            await new Promise((resolve) => setTimeout(resolve, delayMs))
            continue
          }
        }

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        this.models = data.models.map((model: { name: string }) => model.name).sort()
        this.connected = true
        success = true
      } catch (e) {
        if (retries >= MAX_RETRIES) {
          if (e instanceof Error) {
            this.error = e.message
          } else {
            this.error = 'Unknown error'
          }
          this.connected = false
          throw new Error(`Failed to fetch models after ${MAX_RETRIES} retries: ${this.error}`)
        }
        retries++
        // Exponential backoff for other errors too
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries - 1)
        console.log(`Error fetching models. Retry ${retries}/${MAX_RETRIES} after ${delayMs}ms`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  private async withRetry<T>(apiCall: () => Promise<T>): Promise<T> {
    let retries = 0

    while (true) {
      try {
        return await apiCall()
      } catch (error) {
        // Check if it's a 429 error or contains 429 error message
        const isRateLimitError =
          (error instanceof Error &&
            (error.message.includes('429') ||
              error.message.toLowerCase().includes('rate limit'))) ||
          (error instanceof Response && error.status === 429)

        if (!isRateLimitError || retries >= MAX_RETRIES) {
          throw error
        }

        retries++
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries - 1) // Exponential backoff
        console.log(`Rate limited (429). Retry ${retries}/${MAX_RETRIES} after ${delayMs}ms`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  async generateCompletion(
    options: LLMRequestOptions,
    history: LLMMessage[] | null = null,
  ): Promise<LLMResponse> {
    console.log('gemini generating with')
    console.log(history)
    this.validateRequestOptions(options)

    if (!this.genAIClient) {
      throw new Error('Google GenAI client is not initialized')
    }

    // Using the retry wrapper for API calls
    return await this.withRetry(async () => {
      if (history && history.length > 0) {
        // Create a chat with history
        console.log(this.convertToGeminiHistory(history))
        const args = {
          // if the model has models/ prefixed, split it
          model: this.model.includes('/') ? this.model.split('/')[1] : this.model,
          history: this.convertToGeminiHistory(history),
          config: {
            maxOutputTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: options.temperature || DEFAULT_TEMPERATURE,
          },
        }
        const chat = this.genAIClient!.chats.create(args)

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
        const result = await this.genAIClient!.models.generateContent({
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
    })
  }
  private convertToGeminiHistory(messages: LLMMessage[]): Content[] {
    const result: Content[] = []

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      const role = message.role === 'assistant' ? 'model' : 'user'

      result.push({
        parts: [{ text: message.content }],
        role,
      })

      // If this is a user message and the next message is also a user message (or doesn't exist and we need model response)
      // OR if this is the last message and it's from the user (shouldn't happen but safety check)
      const nextMessage = messages[i + 1]
      if (role === 'user' && nextMessage) {
        const nextRole = nextMessage.role === 'assistant' ? 'model' : 'user'
        if (nextRole === 'user') {
          // Insert a dummy model response
          result.push({
            parts: [{ text: 'Thanks!' }],
            role: 'model',
          })
        }
      }
    }

    return result
  }
}
