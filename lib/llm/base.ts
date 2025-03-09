
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
  public models: string[]
  public name: string
  public model:string

  constructor(name: string, apiKey: string, model:string) {
    this.apiKey = apiKey
    this.models = []
    this.name = name
    this.model=model
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

  // Convert instance to JSON
  toJSON(): string {
    return JSON.stringify({
      name: this.name,
      models: this.models,
    });
  }

  // Create instance from JSON
  static fromJSON<T extends LLMProvider>(this: new (name: string, apiKey: string) => T, json: string, apiKey: string): T {
    const data = JSON.parse(json);
    const instance = new this(data.name, apiKey);
    instance.models = data.models;
    return instance;
  }
}