const { LLMProvider, OpenAIProvider, GoogleProvider, AnthropicProvider, createPrompt } =
  await import('trilogy-studio-components/llm')
/**
 * Creates a provider instance based on provider name
 */
export function createProviderInstance(name: string, apiKey: string, model: string): LLMProvider {
  switch (name) {
    case 'OPENAI':
      return new OpenAIProvider(model, apiKey, model)
    case 'ANTHROPIC':
      return new AnthropicProvider(model, apiKey, model)
    case 'GOOGLE':
      return new GoogleProvider(model, apiKey, model)
    default:
      throw new Error(`Unknown provider: ${name}`)
  }
}
