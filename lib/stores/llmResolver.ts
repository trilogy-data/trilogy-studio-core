// llm-provider.ts

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

// OpenAI implementation
export class OpenAIProvider extends LLMProvider {
  private baseUrl: string = 'https://api.openai.com/v1/chat/completions'

  constructor(apiKey: string) {
    super(apiKey)
  }

  async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1.0,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      text: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    }
  }
}

// Anthropic implementation
export class AnthropicProvider extends LLMProvider {
  private baseUrl: string = 'https://api.anthropic.com/v1/messages'

  constructor(apiKey: string) {
    super(apiKey)
  }

  async generateCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    this.validateRequestOptions(options)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1.0,
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      text: data.content[0].text,
      model: data.model,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    }
  }
}

// Example usage:
/*
  const openAiProvider = new OpenAIProvider('your-openai-api-key');
  const anthropicProvider = new AnthropicProvider('your-anthropic-api-key');
  
  async function getCompletion() {
    try {
      const openAiResponse = await openAiProvider.generateCompletion({
        prompt: 'Explain quantum computing in simple terms',
        model: 'gpt-4'
      });
      
      console.log('OpenAI response:', openAiResponse.text);
      
      const anthropicResponse = await anthropicProvider.generateCompletion({
        prompt: 'Explain quantum computing in simple terms',
        model: 'claude-3-opus-20240229'
      });
      
      console.log('Anthropic response:', anthropicResponse.text);
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  getCompletion();
  */
