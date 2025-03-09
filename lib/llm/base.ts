
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
  public type: string = 'generic'

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
  }

  // Convert instance to JSON
  toJSON(): object {
    return {
      name: this.name,
      model: this.model,
      type: this.type,
      apiKey:this.apiKey
    };
  }

  // Create instance from JSON
  static fromJSON(json:string | Partial<LLMProvider>): LLMProvider{
    typeof json === 'string' ? JSON.parse(json) : json
    const instance = new this(json.name, json.apiKey, json.model);
    return instance;
  }
}