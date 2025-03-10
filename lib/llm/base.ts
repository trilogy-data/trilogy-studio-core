
// Generic interface for LLM responses
export interface LLMResponse {
  text: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// Generic interface for LLM request options
export interface LLMRequestOptions {
  prompt: string
  maxTokens?: number
  temperature?: number
  topP?: number
}

export interface LLMMessage {
  role: string
  content: string
  modelInfo?: {
    totalTokens: number;
  }
}

// Abstract base class for LLM providers
export abstract class LLMProvider {
  protected apiKey: string
  public models: string[]
  public name: string
  public model: string
  public storage: string
  public type: string = 'generic'
  public connected: boolean
  public error: string | null = null
  constructor(name: string, apiKey: string, model: string) {
    this.apiKey = apiKey
    this.models = []
    this.name = name
    this.model = model
    // revisit if we load storage from any other location
    this.storage = 'local'
    this.connected = false
    this.error = null
    
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
  }

  abstract reset(): void

  // Abstract method to be implemented by specific providers
  abstract generateCompletion(options: LLMRequestOptions, history: LLMMessage[] | null): Promise<LLMResponse>

  // Common utility methods could be added here
  protected validateRequestOptions(options: LLMRequestOptions): void {
    if (!options.prompt) {
      throw new Error('Prompt is required')
    }
  }

  // Convert instance to JSON
  toJSON(): object {
    return {
      name: this.name,
      model: this.model,
      type: this.type,
      apiKey: this.apiKey,
    };
  }

  // Create instance from JSON
  static fromJSON(json: string | Partial<LLMProvider>): LLMProvider {
    let restored = typeof json === 'string' ? JSON.parse(json) : json
    const instance = new this(restored.name, restored.apiKey, restored.model);
    return instance;
  }
}