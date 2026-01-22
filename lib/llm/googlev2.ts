import { LLMProvider } from './base'
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMMessage,
  LLMToolDefinition,
  LLMToolCall,
} from './base'
import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
  type Tool,
  type CreateChatParameters,
  type GenerateContentParameters,
} from '@google/genai'
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

  private async withRetry<T>(
    apiCall: () => Promise<T>,
    onBackoff?: (attempt: number, delayMs: number, error: Error) => void,
  ): Promise<T> {
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

        // Notify callback if provided
        if (onBackoff && error instanceof Error) {
          onBackoff(retries, delayMs, error)
        }

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
        const args: CreateChatParameters = {
          // if the model has models/ prefixed, split it
          model: this.model.includes('/') ? this.model.split('/')[1] : this.model,
          history: this.convertToGeminiHistory(history),
          config: {
            maxOutputTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: options.temperature || DEFAULT_TEMPERATURE,
            tools:
              options.tools && options.tools.length > 0
                ? this.convertToGeminiTools(options.tools)
                : undefined,
          },
        }

        const chat = this.genAIClient!.chats.create(args)

        // Send the message
        const result = await chat.sendMessage({ message: options.prompt })

        // Get token usage if available
        const promptTokens = result.usageMetadata?.promptTokenCount || 0
        const completionTokens = result.usageMetadata?.candidatesTokenCount || 0
        const { text, toolCalls } = this.extractResponseData(result)

        return {
          text,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        }
      } else {
        console.log('using simple completion without history')
        // Simple completion without history
        const requestArgs: GenerateContentParameters = {
          model: this.model.includes('/') ? this.model.split('/')[1] : this.model,
          contents: options.prompt,
          config: {
            maxOutputTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: options.temperature || DEFAULT_TEMPERATURE,
            tools:
              options.tools && options.tools.length > 0
                ? this.convertToGeminiTools(options.tools)
                : undefined,
          },
        }

        const result = await this.genAIClient!.models.generateContent(requestArgs)

        // Get token usage if available
        const promptTokens = result.usageMetadata?.promptTokenCount || 0
        const completionTokens = result.usageMetadata?.candidatesTokenCount || 0
        const { text, toolCalls } = this.extractResponseData(result)

        return {
          text,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        }
      }
    }, options.onRateLimitBackoff)
  }

  private convertToGeminiTools(tools: LLMToolDefinition[]): Tool[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties: tool.input_schema.properties,
        required: tool.input_schema.required,
      },
    }))
    return [{ functionDeclarations }]
  }

  private extractResponseData(result: any): { text: string; toolCalls: LLMToolCall[] } {
    // Handle responses that may contain text and/or function calls
    let responseText = ''
    const toolCalls: LLMToolCall[] = []
    const candidates = result.candidates || []
    let toolCallIndex = 0

    for (const candidate of candidates) {
      const content = candidate.content
      if (!content || !content.parts) continue

      for (const part of content.parts) {
        if (part.text) {
          responseText += part.text
        } else if (part.functionCall) {
          // Add to structured tool calls array
          toolCalls.push({
            id: `google_tool_${toolCallIndex++}`,
            name: part.functionCall.name,
            input: part.functionCall.args,
          })
        }
      }
    }

    // Fall back to result.text if no content was extracted
    return {
      text: responseText || result.text || '',
      toolCalls,
    }
  }

  private convertToGeminiHistory(messages: LLMMessage[]): Content[] {
    const result: Content[] = []

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      const role = message.role === 'assistant' ? 'model' : 'user'

      if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
        // Assistant message with tool calls - include functionCall parts
        const parts: any[] = []
        if (message.content) {
          parts.push({ text: message.content })
        }
        for (const tc of message.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.input,
            },
          })
        }
        result.push({ parts, role: 'model' })
      } else if (message.role === 'user' && message.toolResults && message.toolResults.length > 0) {
        // User message with tool results - include functionResponse parts
        const parts: any[] = message.toolResults.map((tr) => ({
          functionResponse: {
            name: tr.toolName,
            response: { result: tr.result },
          },
        }))
        result.push({ parts, role: 'user' })
      } else {
        // Regular text message
        result.push({
          parts: [{ text: message.content }],
          role,
        })
      }

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
