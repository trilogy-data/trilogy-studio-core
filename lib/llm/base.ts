
// Generic interface for LLM responses
export interface LLMResponse {
    text: string
    model: string
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }
  
  // Generic interface for LLM request options
  export interface LLMRequestOptions {
    prompt: string
    model: string
    maxTokens?: number
    temperature?: number
    topP?: number
  }
  
  // Abstract base class for LLM providers
  export abstract class LLMProvider {
    protected apiKey: string
  
    constructor(apiKey: string) {
      this.apiKey = apiKey
    }
  
    // Abstract method to be implemented by specific providers
    abstract generateCompletion(options: LLMRequestOptions): Promise<LLMResponse>
  
    // Common utility methods could be added here
    protected validateRequestOptions(options: LLMRequestOptions): void {
      if (!options.prompt) {
        throw new Error('Prompt is required')
      }
      if (!options.model) {
        throw new Error('Model is required')
      }
    }
  }