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
  role: 'user' | 'assistant' | 'system'
  content: string
  modelInfo?: {
    totalTokens: number
  }
  hidden?: boolean // Used to hide messages in the UI
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
  public changed: boolean = false
  public deleted: boolean = false
  public running: boolean = false

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
    this.changed = false
    this.deleted = false
    this.running = false
  }

  setApiKey(apiKey: string): void {
    if (this.apiKey === apiKey) {
      return // No change, do nothing
    }
    this.changed = true
    this.apiKey = apiKey
  }

  setModel(model: string): void {
    if (this.model === model) {
      return // No change, do nothing
    }
    this.changed = true
    this.model = model
  }

  getApiKey(): string {
    return this.apiKey
  }

  delete(): void {
    this.deleted = true
    this.changed = true
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
      // redacted will trigger a fetch from the secure store
      apiKey: this.saveCredential ? 'saved' : null,
      saveCredential: this.saveCredential,
      isDefault: this.isDefault,
    }
  }

  getCredentialName(): string {
    return `trilogy-llm-${this.type}`
  }

  // Create instance from JSON
  static async fromJSON<T extends LLMProvider>(
    this: new (name: string, apiKey: string, model: string, saveCredential: boolean) => T,
    json: string | Partial<LLMProvider>,
  ): Promise<T> {
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
