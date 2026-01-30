import { describe, it, expect, beforeAll } from 'vitest'
import { AnthropicProvider } from './anthropic'
import { OpenAIProvider } from './openai'
import { GoogleProvider } from './googlev2'
import { OpenRouterProvider } from './openrouter'
import type { LLMToolDefinition, LLMMessage } from './base'

// Skip tests if API keys are not available
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY
const OPENAI_KEY = process.env.OPENAI_KEY
const GOOGLE_KEY = process.env.GOOGLE_KEY
const OPENROUTER_KEY = process.env.OPENROUTER_KEY

const testTool: LLMToolDefinition = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA',
      },
    },
    required: ['location'],
  },
}

describe.skipIf(!ANTHROPIC_KEY)('Anthropic Provider Integration', () => {
  let provider: AnthropicProvider

  beforeAll(() => {
    provider = new AnthropicProvider('test-anthropic', ANTHROPIC_KEY!, 'claude-sonnet-4-20250514')
  })

  it('should connect and fetch models', async () => {
    await provider.reset()
    expect(provider.connected).toBe(true)
    expect(provider.models.length).toBeGreaterThan(0)
  })

  it('should generate a simple completion', async () => {
    const response = await provider.generateCompletion({
      prompt: 'Say "hello" and nothing else.',
      maxTokens: 50,
    })

    expect(response.text.toLowerCase()).toContain('hello')
    expect(response.usage.totalTokens).toBeGreaterThan(0)
  })

  it('should handle system prompts', async () => {
    const response = await provider.generateCompletion({
      prompt: 'What is your name?',
      systemPrompt: 'You are a helpful assistant named Bob. Always respond briefly.',
      maxTokens: 50,
    })

    expect(response.text.toLowerCase()).toContain('bob')
  })

  it('should handle message history', async () => {
    const history: LLMMessage[] = [
      { role: 'user', content: 'My favorite color is blue.' },
      { role: 'assistant', content: 'Nice! Blue is a great color.' },
    ]

    const response = await provider.generateCompletion(
      {
        prompt: 'What is my favorite color?',
        maxTokens: 50,
      },
      history,
    )

    expect(response.text.toLowerCase()).toContain('blue')
  })

  it('should handle message history with hidden field', async () => {
    const history: LLMMessage[] = [
      { role: 'user', content: 'My favorite number is 42.', hidden: true },
      { role: 'assistant', content: 'Interesting choice!' },
    ]

    const response = await provider.generateCompletion(
      {
        prompt: 'What is my favorite number?',
        maxTokens: 50,
      },
      history,
    )

    expect(response.text).toContain('42')
  })

  it('should handle tool calling', async () => {
    const response = await provider.generateCompletion({
      prompt: 'What is the weather in San Francisco?',
      tools: [testTool],
      maxTokens: 200,
    })

    expect(response.text).toContain('tool_use')
    expect(response.text).toContain('get_weather')
  })
})

describe.skipIf(!OPENAI_KEY)('OpenAI Provider Integration', () => {
  let provider: OpenAIProvider

  beforeAll(() => {
    provider = new OpenAIProvider('test-openai', OPENAI_KEY!, 'gpt-4o-mini')
  })

  it('should connect and fetch models', async () => {
    await provider.reset()
    expect(provider.connected).toBe(true)
    expect(provider.models.length).toBeGreaterThan(0)
  })

  it('should generate a simple completion', async () => {
    const response = await provider.generateCompletion({
      prompt: 'Say "hello" and nothing else.',
      maxTokens: 50,
    })

    expect(response.text.toLowerCase()).toContain('hello')
    expect(response.usage.totalTokens).toBeGreaterThan(0)
  })

  it('should handle system prompts', async () => {
    const response = await provider.generateCompletion({
      prompt: 'What is your name?',
      systemPrompt: 'You are a helpful assistant named Alice. Always respond briefly.',
      maxTokens: 50,
    })

    expect(response.text.toLowerCase()).toContain('alice')
  })

  it('should handle message history', async () => {
    const history: LLMMessage[] = [
      { role: 'user', content: 'My favorite animal is a cat.' },
      { role: 'assistant', content: 'Cats are wonderful pets!' },
    ]

    const response = await provider.generateCompletion(
      {
        prompt: 'What is my favorite animal?',
        maxTokens: 50,
      },
      history,
    )

    expect(response.text.toLowerCase()).toContain('cat')
  })

  it('should handle message history with hidden field', async () => {
    const history: LLMMessage[] = [
      { role: 'user', content: 'My secret code is ABC123.', hidden: true },
      { role: 'assistant', content: 'Got it!' },
    ]

    const response = await provider.generateCompletion(
      {
        prompt: 'What is my secret code?',
        maxTokens: 50,
      },
      history,
    )

    expect(response.text).toContain('ABC123')
  })

  it('should handle tool calling', async () => {
    const response = await provider.generateCompletion({
      prompt: 'What is the weather in New York?',
      tools: [testTool],
      maxTokens: 200,
    })

    expect(response.text).toContain('tool_use')
    expect(response.text).toContain('get_weather')
  })
})

// Google tests need longer timeout due to 30s retry delay on rate limits
describe.skipIf(!GOOGLE_KEY)('Google Provider Integration', () => {
  let provider: GoogleProvider

  beforeAll(() => {
    provider = new GoogleProvider('test-google', GOOGLE_KEY!, 'gemini-2.0-flash')
  })

  it('should connect and fetch models', async () => {
    await provider.reset()
    expect(provider.connected).toBe(true)
    expect(provider.models.length).toBeGreaterThan(0)
  })

  it(
    'should generate a simple completion',
    async () => {
      const response = await provider.generateCompletion({
        prompt: 'Say "hello" and nothing else.',
        maxTokens: 50,
      })

      expect(response.text.toLowerCase()).toContain('hello')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
    },
    { timeout: 120000 },
  )

  it(
    'should handle message history',
    async () => {
      const history: LLMMessage[] = [
        { role: 'user', content: 'My favorite fruit is mango.' },
        { role: 'assistant', content: 'Mangoes are delicious!' },
      ]

      const response = await provider.generateCompletion(
        {
          prompt: 'What is my favorite fruit?',
          maxTokens: 50,
        },
        history,
      )

      expect(response.text.toLowerCase()).toContain('mango')
    },
    { timeout: 120000 },
  )

  it(
    'should handle tool calling',
    async () => {
      const response = await provider.generateCompletion({
        prompt: 'What is the weather in Tokyo?',
        tools: [testTool],
        maxTokens: 200,
      })

      expect(response.text).toContain('tool_use')
      expect(response.text).toContain('get_weather')
    },
    { timeout: 120000 },
  )
})

describe.skipIf(!OPENROUTER_KEY)('OpenRouter Provider Integration', () => {
  let provider: OpenRouterProvider

  beforeAll(() => {
    provider = new OpenRouterProvider(
      'test-openrouter',
      OPENROUTER_KEY!,
      'anthropic/claude-3-5-sonnet',
    )
  })

  it('should connect and fetch models', async () => {
    await provider.reset()
    expect(provider.connected).toBe(true)
    expect(provider.models.length).toBeGreaterThan(0)
    // Should have filtered to modern models only
    expect(
      provider.models.some(
        (m) => m.startsWith('anthropic/') || m.startsWith('openai/') || m.startsWith('meta-llama/'),
      ),
    ).toBe(true)
  })

  it('should store model metadata', async () => {
    await provider.reset()
    // Should have metadata for at least some models
    expect(provider.modelMetadata.size).toBeGreaterThan(0)

    // Check that metadata has expected properties
    const firstModelId = provider.models[0]
    const metadata = provider.getModelMetadata(firstModelId)
    expect(metadata).toBeDefined()
    expect(metadata?.id).toBe(firstModelId)
  })

  it('should generate a simple completion', async () => {
    const response = await provider.generateCompletion({
      prompt: 'Say "hello" and nothing else.',
      maxTokens: 50,
    })

    expect(response.text.toLowerCase()).toContain('hello')
    expect(response.usage.totalTokens).toBeGreaterThan(0)
  })

  it('should handle system prompts', async () => {
    const response = await provider.generateCompletion({
      prompt: 'What is your name?',
      systemPrompt: 'You are a helpful assistant named Charlie. Always respond briefly.',
      maxTokens: 50,
    })

    expect(response.text.toLowerCase()).toContain('charlie')
  })

  it('should handle message history', async () => {
    const history: LLMMessage[] = [
      { role: 'user', content: 'My favorite food is pizza.' },
      { role: 'assistant', content: 'Pizza is delicious!' },
    ]

    const response = await provider.generateCompletion(
      {
        prompt: 'What is my favorite food?',
        maxTokens: 50,
      },
      history,
    )

    expect(response.text.toLowerCase()).toContain('pizza')
  })

  it('should handle tool calling', async () => {
    const response = await provider.generateCompletion({
      prompt: 'What is the weather in London?',
      tools: [testTool],
      maxTokens: 200,
    })

    // OpenRouter returns tool calls as structured data
    expect(response.toolCalls).toBeDefined()
    expect(response.toolCalls!.length).toBeGreaterThan(0)
    expect(response.toolCalls![0].name).toBe('get_weather')
    expect(response.toolCalls![0].input).toHaveProperty('location')
  })
})
