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
    totalTokens: number
  }
}

export abstract class LLMProvider {
  protected apiKey: string
  public models: string[]
  public name: string
  public model: string
  public storage: string
  public type: string = 'generic'
  public connected: boolean
  public error: string | null = null
  public saveCredential: boolean
  public isDefault: boolean = false

  constructor(name: string, apiKey: string, model: string, saveCredential: boolean = false) {
    this.apiKey = apiKey
    this.models = []
    this.name = name
    this.model = model
    // revisit if we load storage from any other location
    this.storage = 'local'
    this.connected = false
    this.error = null
    this.saveCredential = saveCredential
    this.isDefault = false
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
  }

  abstract reset(): void

  // Abstract method to be implemented by specific providers
  abstract generateCompletion(
    options: LLMRequestOptions,
    history: LLMMessage[] | null,
  ): Promise<LLMResponse>

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
      apiKey: this.saveCredential ? this.apiKey : null,
      saveCredential: this.saveCredential,
      isDefault: this.isDefault,
    }
  }

  // Create instance from JSON
  static fromJSON<T extends LLMProvider>(
    this: new (name: string, apiKey: string, model: string, saveCredential: boolean) => T,
    json: string | Partial<LLMProvider>,
  ): T {
    let restored = typeof json === 'string' ? JSON.parse(json) : json

    const instance = new this(
      restored.name,
      restored.apiKey,
      restored.model,
      restored.saveCredential,
    )
    instance.isDefault = restored.isDefault || false
    return instance
  }
}
