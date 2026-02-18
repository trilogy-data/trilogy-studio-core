import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChatWithTools } from './useChatWithTools'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { LLMToolDefinition } from '../llm/base'

// Minimal mock of the LLM connection store for standalone-mode tests
function makeMockLLMStore(overrides: Partial<LLMConnectionStoreType> = {}): LLMConnectionStoreType {
  return {
    activeConnection: 'test-conn',
    generateCompletion: vi.fn().mockResolvedValue({ text: 'Hello!', usage: {} }),
    shouldAutoContinue: vi.fn().mockResolvedValue(false),
    generateChatName: vi.fn().mockResolvedValue('Test Chat'),
    getConnection: vi.fn().mockReturnValue(null),
    connections: {},
    ...overrides,
  } as unknown as LLMConnectionStoreType
}

const SAMPLE_TOOLS: LLMToolDefinition[] = [
  {
    name: 'get_weather',
    description: 'Returns the current weather for a location.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
      },
      required: ['location'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the map to a location.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
      required: ['latitude', 'longitude'],
    },
  },
]

describe('useChatWithTools – standalone mode with customTools', () => {
  let llmStore: LLMConnectionStoreType

  beforeEach(() => {
    llmStore = makeMockLLMStore()
  })

  it('passes customTools to generateCompletion when provided', async () => {
    const onCustomToolCall = vi.fn().mockResolvedValue('{"temp": 72}')

    const { handleChatMessageWithTools, activeChatMessages } = useChatWithTools({
      llmConnectionStore: llmStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
      customTools: SAMPLE_TOOLS,
      onCustomToolCall,
    })

    // LLM returns a plain text response (no tool calls)
    ;(llmStore.generateCompletion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'The weather is sunny.',
      usage: {},
    })

    await handleChatMessageWithTools('What is the weather?', [])

    expect(llmStore.generateCompletion).toHaveBeenCalledOnce()
    const callArgs = (llmStore.generateCompletion as ReturnType<typeof vi.fn>).mock.calls[0]
    // callArgs: [connectionName, options, messages]
    expect(callArgs[1].tools).toEqual(SAMPLE_TOOLS)
  })

  it('routes LLM tool calls to onCustomToolCall handler', async () => {
    const onCustomToolCall = vi.fn().mockResolvedValue('{"temp": 72}')

    const { handleChatMessageWithTools } = useChatWithTools({
      llmConnectionStore: llmStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
      customTools: SAMPLE_TOOLS,
      onCustomToolCall,
    })

    // First response: LLM calls get_weather
    ;(llmStore.generateCompletion as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        text: 'Let me check.',
        toolCalls: [{ id: 'tc_01', name: 'get_weather', input: { location: 'Paris' } }],
        usage: {},
      })
      // Second response: plain text after tool result
      .mockResolvedValueOnce({
        text: 'It is 72°F in Paris.',
        usage: {},
      })

    await handleChatMessageWithTools('What is the weather in Paris?', [])

    expect(onCustomToolCall).toHaveBeenCalledOnce()
    expect(onCustomToolCall).toHaveBeenCalledWith('get_weather', { location: 'Paris' })
  })

  it('appends user message and assistant reply to activeChatMessages', async () => {
    const { handleChatMessageWithTools, activeChatMessages } = useChatWithTools({
      llmConnectionStore: llmStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
      customTools: SAMPLE_TOOLS,
      onCustomToolCall: vi.fn().mockResolvedValue('ok'),
    })

    ;(llmStore.generateCompletion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'Navigating now.',
      usage: {},
    })

    await handleChatMessageWithTools('Go to the Eiffel Tower', [])

    // Should have user message + assistant reply
    expect(activeChatMessages.value.length).toBeGreaterThanOrEqual(2)
    expect(activeChatMessages.value[0].role).toBe('user')
    expect(activeChatMessages.value[0].content).toBe('Go to the Eiffel Tower')
    const lastMsg = activeChatMessages.value[activeChatMessages.value.length - 1]
    expect(lastMsg.role).toBe('assistant')
    expect(lastMsg.content).toBe('Navigating now.')
  })

  it('handles errors thrown by onCustomToolCall gracefully', async () => {
    const onCustomToolCall = vi.fn().mockRejectedValue(new Error('DB connection failed'))

    const { handleChatMessageWithTools, activeChatMessages } = useChatWithTools({
      llmConnectionStore: llmStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
      customTools: SAMPLE_TOOLS,
      onCustomToolCall,
    })

    ;(llmStore.generateCompletion as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'tc_02', name: 'get_weather', input: { location: 'NY' } }],
        usage: {},
      })
      .mockResolvedValueOnce({ text: 'Sorry, could not get the weather.', usage: {} })

    // Should not throw
    await expect(handleChatMessageWithTools('Weather in NY?', [])).resolves.not.toThrow()

    // The error result is fed back to the LLM; final reply is persisted
    const msgs = activeChatMessages.value
    const assistantReplies = msgs.filter((m) => m.role === 'assistant' && !m.toolCalls?.length)
    expect(assistantReplies.length).toBeGreaterThanOrEqual(1)
  })

  it('falls back to simple completion when no customTools provided', async () => {
    const { handleChatMessageWithTools } = useChatWithTools({
      llmConnectionStore: llmStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
    })

    ;(llmStore.generateCompletion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'Simple answer.',
      usage: {},
    })

    const result = await handleChatMessageWithTools('Hello', [])

    expect(result).toEqual({ response: 'Simple answer.' })
    // In simple mode, tools should NOT be sent to the LLM
    const callArgs = (llmStore.generateCompletion as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1].tools).toBeUndefined()
  })

  it('returns early with error message when no active LLM connection', async () => {
    const noConnStore = makeMockLLMStore({ activeConnection: '' })

    const { handleChatMessageWithTools } = useChatWithTools({
      llmConnectionStore: noConnStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
      customTools: SAMPLE_TOOLS,
      onCustomToolCall: vi.fn(),
    })

    const result = await handleChatMessageWithTools('Hello', [])

    expect(result).toMatchObject({ response: expect.stringContaining('No LLM connection') })
    expect(noConnStore.generateCompletion).not.toHaveBeenCalled()
  })

  it('passes tools from multiple sequential tool calls through the loop', async () => {
    const onCustomToolCall = vi
      .fn()
      .mockResolvedValueOnce('48.8566,2.3522') // navigate result
      .mockResolvedValueOnce('sunny 68°F') // get_weather result

    const { handleChatMessageWithTools } = useChatWithTools({
      llmConnectionStore: llmStore,
      connectionStore: null,
      queryExecutionService: null,
      editorStore: null,
      customTools: SAMPLE_TOOLS,
      onCustomToolCall,
    })

    // Iteration 1: LLM calls navigate
    ;(llmStore.generateCompletion as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        text: 'Flying to Paris.',
        toolCalls: [{ id: 'tc_01', name: 'navigate', input: { latitude: 48.8566, longitude: 2.3522 } }],
        usage: {},
      })
      // Iteration 2: LLM calls get_weather
      .mockResolvedValueOnce({
        text: 'Now checking weather.',
        toolCalls: [{ id: 'tc_02', name: 'get_weather', input: { location: 'Paris' } }],
        usage: {},
      })
      // Final response
      .mockResolvedValueOnce({
        text: 'Paris is sunny and 68°F. Camera moved.',
        usage: {},
      })

    await handleChatMessageWithTools('Go to Paris and check the weather.', [])

    expect(onCustomToolCall).toHaveBeenCalledTimes(2)
    expect(onCustomToolCall).toHaveBeenNthCalledWith(1, 'navigate', {
      latitude: 48.8566,
      longitude: 2.3522,
    })
    expect(onCustomToolCall).toHaveBeenNthCalledWith(2, 'get_weather', { location: 'Paris' })
  })
})
