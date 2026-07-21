import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { GoogleProvider } from './googlev2'
import { OpenRouterProvider } from './openrouter'
import { DeepSeekProvider } from './deepseek'
import type { LLMMessage, LLMToolDefinition, LLMToolCall, LLMToolResult } from './base'

/**
 * Tests that verify tool calls are correctly preserved in message history
 * when sent across multiple conversation turns.
 *
 * This tests the fix for the bug where LLMs would "forget" what tools they used
 * because tool_calls were being dropped from the message history.
 */

// Sample tool for testing
const testTool: LLMToolDefinition = {
  name: 'run_query',
  description: 'Execute a database query',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The query to run' },
    },
    required: ['query'],
  },
}

// Mock fetch for all tests
const mockFetch = vi.fn()

describe('OpenAI Provider - Tool Call Preservation', () => {
  let provider: OpenAIProvider
  let capturedRequestBody: any

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    provider = new OpenAIProvider('test-openai', 'test-api-key', 'gpt-4o-mini', false, {
      maxRetries: 0,
      initialDelayMs: 0,
      retryStatusCodes: [],
    })
    capturedRequestBody = null
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should preserve tool_calls in assistant messages when sending history', async () => {
    // Arrange: Create a message history with an assistant message containing tool_calls
    const toolCall: LLMToolCall = {
      id: 'call_123',
      name: 'run_query',
      input: { query: 'SELECT * FROM users' },
    }

    const toolResult: LLMToolResult = {
      toolCallId: 'call_123',
      toolName: 'run_query',
      result: 'Success. 10 rows returned.',
    }

    const history: LLMMessage[] = [
      { role: 'user', content: 'Run a query to get all users' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [toolCall],
      },
      {
        role: 'user',
        content: '',
        toolResults: [toolResult],
      },
    ]

    // Mock the API response (Responses API format)
    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Query completed successfully!' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
      }
    })

    // Act
    await provider.generateCompletion(
      { prompt: 'What were the results?', tools: [testTool] },
      history,
    )

    // Assert: Verify the request body contains function_call items in the input
    expect(capturedRequestBody).toBeDefined()
    expect(capturedRequestBody.input).toBeDefined()

    // Find the function_call item
    const functionCallItem = capturedRequestBody.input.find(
      (item: any) => item.type === 'function_call',
    )
    expect(functionCallItem).toBeDefined()
    expect(functionCallItem.call_id).toBe('call_123')
    expect(functionCallItem.name).toBe('run_query')
    expect(functionCallItem.arguments).toBe(JSON.stringify({ query: 'SELECT * FROM users' }))

    // Find the function_call_output item
    const toolResultItem = capturedRequestBody.input.find(
      (item: any) => item.type === 'function_call_output',
    )
    expect(toolResultItem).toBeDefined()
    expect(toolResultItem.call_id).toBe('call_123')
    expect(toolResultItem.output).toBe('Success. 10 rows returned.')

    // Tools should be in flat Responses API format
    expect(capturedRequestBody.tools).toHaveLength(1)
    expect(capturedRequestBody.tools[0].type).toBe('function')
    expect(capturedRequestBody.tools[0].name).toBe('run_query')
    expect(capturedRequestBody.tools[0].parameters).toEqual(testTool.input_schema)
  })

  it('should not drop tool_calls when adding subsequent user messages', async () => {
    // Arrange: Simulate a multi-turn conversation with tool calls
    const toolCall: LLMToolCall = {
      id: 'call_456',
      name: 'run_query',
      input: { query: 'SELECT count(*) FROM orders' },
    }

    const history: LLMMessage[] = [
      { role: 'user', content: 'How many orders are there?' },
      {
        role: 'assistant',
        content: 'Let me check.',
        toolCalls: [toolCall],
      },
      {
        role: 'user',
        content: '',
        toolResults: [{ toolCallId: 'call_456', toolName: 'run_query', result: '1000 orders' }],
      },
      { role: 'assistant', content: 'There are 1000 orders in the database.' },
      // This is the key: adding a new user message should NOT drop the previous tool_calls
      { role: 'user', content: 'Thanks! Can you break that down by month?' },
    ]

    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Sure, let me run another query.' }],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        }),
      }
    })

    // Act
    await provider.generateCompletion(
      { prompt: 'Continue the conversation', tools: [testTool] },
      history,
    )

    // Assert: Tool calls should still be present in the history
    const functionCallItem = capturedRequestBody.input.find(
      (item: any) => item.type === 'function_call',
    )
    expect(functionCallItem).toBeDefined()
    expect(functionCallItem.name).toBe('run_query')
    expect(functionCallItem.call_id).toBe('call_456')
  })

  it('should correctly parse structured tool_calls from response', async () => {
    // Mock response with a function_call output item (Responses API format)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'function_call',
            id: 'fc_abc',
            call_id: 'call_789',
            name: 'run_query',
            arguments: '{"query": "SELECT * FROM products"}',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      }),
    })

    const response = await provider.generateCompletion({
      prompt: 'List all products',
      tools: [testTool],
    })

    expect(response.toolCalls).toBeDefined()
    expect(response.toolCalls).toHaveLength(1)
    // call_id (not the item id) is what tool results must reference
    expect(response.toolCalls![0].id).toBe('call_789')
    expect(response.toolCalls![0].name).toBe('run_query')
    expect(response.toolCalls![0].input).toEqual({ query: 'SELECT * FROM products' })
  })

  it('should pass system prompt as instructions', async () => {
    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Hello!' }],
            },
          ],
          usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
        }),
      }
    })

    await provider.generateCompletion({
      prompt: 'Hi',
      systemPrompt: 'You are a helpful assistant.',
    })

    expect(capturedRequestBody.instructions).toBe('You are a helpful assistant.')
    // System prompt should not appear as a message in the input
    const systemMessage = capturedRequestBody.input.find((item: any) => item.role === 'system')
    expect(systemMessage).toBeUndefined()
  })
})

describe('Anthropic Provider - Tool Call Preservation', () => {
  let provider: AnthropicProvider
  let capturedRequestBody: any

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    provider = new AnthropicProvider('test-anthropic', 'test-api-key', 'claude-3-sonnet', false, {
      maxRetries: 0,
      initialDelayMs: 0,
      retryStatusCodes: [],
    })
    capturedRequestBody = null
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should preserve tool_use blocks in assistant messages', async () => {
    const toolCall: LLMToolCall = {
      id: 'toolu_01',
      name: 'run_query',
      input: { query: 'SELECT * FROM users' },
    }

    const toolResult: LLMToolResult = {
      toolCallId: 'toolu_01',
      toolName: 'run_query',
      result: 'Success. 5 rows returned.',
    }

    const history: LLMMessage[] = [
      { role: 'user', content: 'Get all users' },
      {
        role: 'assistant',
        content: 'Running the query now.',
        toolCalls: [toolCall],
      },
      {
        role: 'user',
        content: '',
        toolResults: [toolResult],
      },
    ]

    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Found 5 users.' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }
    })

    await provider.generateCompletion(
      { prompt: 'Summarize the results', tools: [testTool] },
      history,
    )

    // Assert: Check Anthropic format (tool_use blocks in content array)
    const assistantMessage = capturedRequestBody.messages.find(
      (m: any) => m.role === 'assistant' && Array.isArray(m.content),
    )
    expect(assistantMessage).toBeDefined()

    const toolUseBlock = assistantMessage.content.find((c: any) => c.type === 'tool_use')
    expect(toolUseBlock).toBeDefined()
    expect(toolUseBlock.id).toBe('toolu_01')
    expect(toolUseBlock.name).toBe('run_query')

    // Check tool_result in user message
    const toolResultMessage = capturedRequestBody.messages.find(
      (m: any) => m.role === 'user' && Array.isArray(m.content),
    )
    expect(toolResultMessage).toBeDefined()

    const toolResultBlock = toolResultMessage.content.find((c: any) => c.type === 'tool_result')
    expect(toolResultBlock).toBeDefined()
    expect(toolResultBlock.tool_use_id).toBe('toolu_01')
  })

  it('should correctly parse tool_use from response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: 'text', text: 'Let me run that query.' },
          {
            type: 'tool_use',
            id: 'toolu_02',
            name: 'run_query',
            input: { query: 'SELECT * FROM orders' },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    })

    const response = await provider.generateCompletion({
      prompt: 'Get all orders',
      tools: [testTool],
    })

    expect(response.toolCalls).toBeDefined()
    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls![0].id).toBe('toolu_02')
    expect(response.toolCalls![0].name).toBe('run_query')
    expect(response.toolCalls![0].input).toEqual({ query: 'SELECT * FROM orders' })
    expect(response.text).toBe('Let me run that query.')
  })
})

describe('Google Provider - Tool Call Preservation', () => {
  let provider: GoogleProvider

  beforeEach(() => {
    // For Google, we need to mock the GoogleGenAI client
    provider = new GoogleProvider('test-google', 'test-api-key', 'gemini-2.0-flash')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should include functionCall parts in model messages', async () => {
    // For Google we test the convertToGeminiHistory method behavior
    // by checking that LLMMessage with toolCalls becomes Content with functionCall parts

    const toolCall: LLMToolCall = {
      id: 'google_tool_0',
      name: 'run_query',
      input: { query: 'SELECT * FROM users' },
    }

    const history: LLMMessage[] = [
      { role: 'user', content: 'Get all users' },
      {
        role: 'assistant',
        content: 'Running query.',
        toolCalls: [toolCall],
      },
    ]

    // Access the private method via any cast for testing
    const convertedHistory = (provider as any).convertToGeminiHistory(history)

    expect(convertedHistory).toHaveLength(2)

    // Check the model message has functionCall
    const modelMessage = convertedHistory.find((m: any) => m.role === 'model')
    expect(modelMessage).toBeDefined()
    expect(modelMessage.parts).toBeDefined()

    const functionCallPart = modelMessage.parts.find((p: any) => p.functionCall)
    expect(functionCallPart).toBeDefined()
    expect(functionCallPart.functionCall.name).toBe('run_query')
    expect(functionCallPart.functionCall.args).toEqual({ query: 'SELECT * FROM users' })
  })

  it('should include functionResponse parts in user messages for tool results', async () => {
    const toolResult: LLMToolResult = {
      toolCallId: 'google_tool_0',
      toolName: 'run_query',
      result: '10 users found',
    }

    const history: LLMMessage[] = [
      { role: 'user', content: 'Get all users' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'google_tool_0', name: 'run_query', input: { query: 'SELECT * FROM users' } },
        ],
      },
      {
        role: 'user',
        content: '',
        toolResults: [toolResult],
      },
    ]

    const convertedHistory = (provider as any).convertToGeminiHistory(history)

    // Find the user message with functionResponse
    const toolResultMessage = convertedHistory.find(
      (m: any) => m.role === 'user' && m.parts?.some((p: any) => p.functionResponse),
    )
    expect(toolResultMessage).toBeDefined()

    const functionResponsePart = toolResultMessage.parts.find((p: any) => p.functionResponse)
    expect(functionResponsePart).toBeDefined()
    expect(functionResponsePart.functionResponse.name).toBe('run_query')
    expect(functionResponsePart.functionResponse.response.result).toBe('10 users found')
  })
})

describe('OpenRouter Provider - Tool Call Preservation', () => {
  let provider: OpenRouterProvider
  let capturedRequestBody: any

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    provider = new OpenRouterProvider(
      'test-openrouter',
      'test-api-key',
      'anthropic/claude-3-sonnet',
      false,
      {
        maxRetries: 0,
        initialDelayMs: 0,
        retryStatusCodes: [],
      },
    )
    capturedRequestBody = null
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should preserve tool_calls in assistant messages when sending history', async () => {
    const toolCall: LLMToolCall = {
      id: 'call_or_123',
      name: 'run_query',
      input: { query: 'SELECT * FROM users' },
    }

    const toolResult: LLMToolResult = {
      toolCallId: 'call_or_123',
      toolName: 'run_query',
      result: 'Success. 10 rows returned.',
    }

    const history: LLMMessage[] = [
      { role: 'user', content: 'Run a query to get all users' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [toolCall],
      },
      {
        role: 'user',
        content: '',
        toolResults: [toolResult],
      },
    ]

    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Query completed successfully!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      }
    })

    await provider.generateCompletion(
      { prompt: 'What were the results?', tools: [testTool] },
      history,
    )

    expect(capturedRequestBody).toBeDefined()
    expect(capturedRequestBody.messages).toBeDefined()

    // Find the assistant message with tool_calls
    const assistantWithToolCalls = capturedRequestBody.messages.find(
      (m: any) => m.role === 'assistant' && m.tool_calls,
    )
    expect(assistantWithToolCalls).toBeDefined()
    expect(assistantWithToolCalls.tool_calls).toHaveLength(1)
    expect(assistantWithToolCalls.tool_calls[0].id).toBe('call_or_123')
    expect(assistantWithToolCalls.tool_calls[0].type).toBe('function')
    expect(assistantWithToolCalls.tool_calls[0].function.name).toBe('run_query')

    // Find the tool result message
    const toolResultMessage = capturedRequestBody.messages.find((m: any) => m.role === 'tool')
    expect(toolResultMessage).toBeDefined()
    expect(toolResultMessage.tool_call_id).toBe('call_or_123')
    expect(toolResultMessage.content).toBe('Success. 10 rows returned.')
  })

  it('should correctly parse structured tool_calls from response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_or_456',
                  type: 'function',
                  function: {
                    name: 'run_query',
                    arguments: '{"query": "SELECT * FROM products"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    })

    const response = await provider.generateCompletion({
      prompt: 'List all products',
      tools: [testTool],
    })

    expect(response.toolCalls).toBeDefined()
    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls![0].id).toBe('call_or_456')
    expect(response.toolCalls![0].name).toBe('run_query')
    expect(response.toolCalls![0].input).toEqual({ query: 'SELECT * FROM products' })
  })

  it('should format tools correctly for OpenRouter (OpenAI-compatible format)', async () => {
    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'I will run the query.' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      }
    })

    await provider.generateCompletion({
      prompt: 'Run a query',
      tools: [testTool],
    })

    // Verify tools are formatted in OpenAI format
    expect(capturedRequestBody.tools).toBeDefined()
    expect(capturedRequestBody.tools).toHaveLength(1)
    expect(capturedRequestBody.tools[0].type).toBe('function')
    expect(capturedRequestBody.tools[0].function.name).toBe('run_query')
    expect(capturedRequestBody.tools[0].function.description).toBe('Execute a database query')
    expect(capturedRequestBody.tools[0].function.parameters).toEqual(testTool.input_schema)
  })
})

describe('Cross-Provider - Multi-Turn Tool Conversation', () => {
  /**
   * This test verifies the full flow:
   * 1. User asks a question
   * 2. LLM responds with a tool call
   * 3. Tool result is added
   * 4. LLM responds with analysis
   * 5. User asks a follow-up
   * 6. LLM should still know about the previous tool call
   */

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('OpenAI: should preserve tool calls across multiple conversation turns', async () => {
    const provider = new OpenAIProvider('test', 'key', 'gpt-4o', false, {
      maxRetries: 0,
      initialDelayMs: 0,
      retryStatusCodes: [],
    })

    // Build up a conversation with tool calls
    const conversation: LLMMessage[] = [
      { role: 'user', content: 'What are the most successful rockets?' },
      {
        role: 'assistant',
        content: null as any,
        toolCalls: [
          { id: 'call_1', name: 'select_active_import', input: { import_name: 'launch' } },
        ],
      },
      {
        role: 'user',
        content: '',
        toolResults: [
          { toolCallId: 'call_1', toolName: 'select_active_import', result: 'Selected launch' },
        ],
      },
      {
        role: 'assistant',
        content: null as any,
        toolCalls: [
          { id: 'call_2', name: 'run_trilogy_query', input: { query: 'SELECT rocket, count(*)' } },
        ],
      },
      {
        role: 'user',
        content: '',
        toolResults: [
          { toolCallId: 'call_2', toolName: 'run_trilogy_query', result: '{"data": [...]}' },
        ],
      },
      { role: 'assistant', content: 'The most successful rockets are...' },
    ]

    let capturedBody: any
    mockFetch.mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Based on my previous query...' }],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        }),
      }
    })

    // Follow-up question should include all the tool call history
    await provider.generateCompletion(
      { prompt: 'What was the query you ran for this?' },
      conversation,
    )

    // Verify ALL tool calls are preserved in the request as function_call items
    const functionCalls = capturedBody.input.filter((item: any) => item.type === 'function_call')
    expect(functionCalls).toHaveLength(2)
    expect(functionCalls[0].call_id).toBe('call_1')
    expect(functionCalls[1].call_id).toBe('call_2')

    // Verify tool results are present as function_call_output items
    const toolOutputs = capturedBody.input.filter(
      (item: any) => item.type === 'function_call_output',
    )
    expect(toolOutputs).toHaveLength(2)
  })
})

describe('DeepSeek Provider - Tool Calls and Cache Usage', () => {
  let provider: DeepSeekProvider
  let capturedRequestBody: any

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    provider = new DeepSeekProvider('test-deepseek', 'test-api-key', 'deepseek-v4-pro', false, {
      maxRetries: 0,
      initialDelayMs: 0,
      retryStatusCodes: [],
    })
    capturedRequestBody = null
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should preserve tool_calls and tool results in history', async () => {
    const history: LLMMessage[] = [
      { role: 'user', content: 'Run a query to get all users' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call_ds_1', name: 'run_query', input: { query: 'SELECT * FROM users' } },
        ],
      },
      {
        role: 'user',
        content: '',
        toolResults: [
          { toolCallId: 'call_ds_1', toolName: 'run_query', result: 'Success. 10 rows returned.' },
        ],
      },
    ]

    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Done!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      }
    })

    await provider.generateCompletion(
      { prompt: 'What were the results?', systemPrompt: 'You are a helper', tools: [testTool] },
      history,
    )

    // System prompt must lead the request: DeepSeek caches on prefix match
    expect(capturedRequestBody.messages[0].role).toBe('system')

    const assistantWithToolCalls = capturedRequestBody.messages.find(
      (m: any) => m.role === 'assistant' && m.tool_calls,
    )
    expect(assistantWithToolCalls.tool_calls[0].id).toBe('call_ds_1')
    expect(assistantWithToolCalls.tool_calls[0].function.name).toBe('run_query')

    const toolResultMessage = capturedRequestBody.messages.find((m: any) => m.role === 'tool')
    expect(toolResultMessage.tool_call_id).toBe('call_ds_1')
    expect(toolResultMessage.content).toBe('Success. 10 rows returned.')

    // Tools use the OpenAI function shape
    expect(capturedRequestBody.tools[0].type).toBe('function')
    expect(capturedRequestBody.tools[0].function.name).toBe('run_query')
  })

  it('should parse structured tool_calls from the response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_ds_2',
                  type: 'function',
                  function: { name: 'run_query', arguments: '{"query":"SELECT 1"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    })

    const response = await provider.generateCompletion({ prompt: 'Run a query', tools: [testTool] })

    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls![0].id).toBe('call_ds_2')
    expect(response.toolCalls![0].input).toEqual({ query: 'SELECT 1' })
    expect(response.stopReason).toBe('tool_calls')
  })

  it('should map context cache hits to cacheReadTokens and report uncached promptTokens', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 1000,
          prompt_cache_hit_tokens: 900,
          prompt_cache_miss_tokens: 100,
          completion_tokens: 20,
          total_tokens: 1020,
        },
      }),
    })

    const response = await provider.generateCompletion({ prompt: 'hi' })

    expect(response.usage.cacheReadTokens).toBe(900)
    expect(response.usage.promptTokens).toBe(100) // uncached portion only
    expect(response.usage.totalTokens).toBe(1020)
  })

  it('should fall back to prompt_tokens when cache fields are absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
      }),
    })

    const response = await provider.generateCompletion({ prompt: 'hi' })

    expect(response.usage.promptTokens).toBe(42)
    expect(response.usage.cacheReadTokens).toBe(0)
  })

  it('should note dropped images rather than sending them to a text-only model', async () => {
    mockFetch.mockImplementation(async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      }
    })

    await provider.generateCompletion({ prompt: 'describe it' }, [
      {
        role: 'user',
        content: '',
        toolResults: [
          {
            toolCallId: 'call_img',
            toolName: 'screenshot',
            result: 'captured',
            imageData: { data: 'AAAA', mediaType: 'image/png' },
          },
        ],
      },
    ])

    const serialized = JSON.stringify(capturedRequestBody)
    expect(serialized).not.toContain('image_url')
    expect(serialized).not.toContain('AAAA')
    const note = capturedRequestBody.messages.find(
      (m: any) => typeof m.content === 'string' && m.content.includes('could not be included'),
    )
    expect(note).toBeDefined()
  })
})
