import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToolLoop, type ToolExecutor, type ToolLoopOptions } from './useToolLoop'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ToolCallResult } from '../llm/editorRefinementToolExecutor'

// Mock LLM store type for testing
type MockLLMStore = {
  generateCompletion: ReturnType<typeof vi.fn>
  shouldAutoContinue: ReturnType<typeof vi.fn>
}

describe('useToolLoop', () => {
  let mockLLMStore: MockLLMStore
  let mockToolExecutor: ToolExecutor
  let executeToolCallSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Create mock LLM store
    mockLLMStore = {
      generateCompletion: vi.fn(),
      shouldAutoContinue: vi.fn().mockResolvedValue(false),
    }

    // Create mock tool executor
    executeToolCallSpy = vi.fn()
    mockToolExecutor = {
      executeToolCall: executeToolCallSpy,
    }
  })

  describe('initial state', () => {
    it('should initialize with empty state', () => {
      const { messages, artifacts, isLoading, activeToolName, error } = useToolLoop()

      expect(messages.value).toEqual([])
      expect(artifacts.value).toEqual([])
      expect(isLoading.value).toBe(false)
      expect(activeToolName.value).toBe('')
      expect(error.value).toBeNull()
    })
  })

  describe('message management', () => {
    it('should add messages', () => {
      const { addMessage, messages } = useToolLoop()

      addMessage({ role: 'user', content: 'Hello' })
      expect(messages.value).toHaveLength(1)
      expect(messages.value[0].content).toBe('Hello')

      addMessage({ role: 'assistant', content: 'Hi there!' })
      expect(messages.value).toHaveLength(2)
    })

    it('should clear messages', () => {
      const { addMessage, clearMessages, messages, artifacts, error } = useToolLoop()

      addMessage({ role: 'user', content: 'Hello' })
      addMessage({ role: 'assistant', content: 'Hi' })
      clearMessages()

      expect(messages.value).toHaveLength(0)
      expect(artifacts.value).toHaveLength(0)
      expect(error.value).toBeNull()
    })

    it('should set messages', () => {
      const { setMessages, messages } = useToolLoop()

      setMessages([
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Message 2' },
      ])

      expect(messages.value).toHaveLength(2)
      expect(messages.value[0].content).toBe('Message 1')
    })

    it('should set artifacts', () => {
      const { setArtifacts, artifacts } = useToolLoop()

      setArtifacts([{ type: 'results', data: { headers: [], data: [] } }])

      expect(artifacts.value).toHaveLength(1)
      expect(artifacts.value[0].type).toBe('results')
    })
  })

  describe('executeMessage without tools', () => {
    it('should add user and assistant messages for simple completion', async () => {
      mockLLMStore.generateCompletion.mockResolvedValue({
        text: 'I can help you with that!',
      })

      const { executeMessage, messages } = useToolLoop()

      const result = await executeMessage(
        'Hello, can you help?',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'You are a helpful assistant.',
        mockToolExecutor,
        { tools: [] },
      )

      expect(result.terminated).toBe(false)
      expect(result.finalMessage).toBe('I can help you with that!')
      expect(messages.value).toHaveLength(2)
      expect(messages.value[0].role).toBe('user')
      expect(messages.value[1].role).toBe('assistant')
    })

    it('should handle missing connection name', async () => {
      const { executeMessage, error } = useToolLoop()

      const result = await executeMessage(
        'Hello',
        mockLLMStore as unknown as LLMConnectionStoreType,
        '', // Empty connection name
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(result.terminated).toBe(false)
      expect(error.value).toBe('No LLM connection available')
    })
  })

  describe('executeMessage with tool calls', () => {
    it('should execute tool calls from LLM response', async () => {
      // First response has tool call
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Let me edit the query.\n<tool_call name="edit_editor">\n{"content": "SELECT * FROM users;"}\n</tool_call>',
      })

      // Second response after tool result
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'I have updated the editor with the query.',
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Editor updated.',
      })

      const { executeMessage, messages } = useToolLoop()

      const result = await executeMessage(
        'Write a query',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [{ name: 'edit_editor', description: 'Edit the editor' }] },
      )

      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_editor', {
        content: 'SELECT * FROM users;',
      })
      expect(result.terminated).toBe(false)
      expect(result.finalMessage).toBe('I have updated the editor with the query.')
    })

    it('should handle tool execution errors', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: '<tool_call name="edit_editor">\n{"content": ""}\n</tool_call>',
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Sorry, there was an error updating the editor.',
      })

      executeToolCallSpy.mockResolvedValue({
        success: false,
        error: 'Content is required',
      })

      const { executeMessage } = useToolLoop()

      await executeMessage(
        'Edit the query',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(executeToolCallSpy).toHaveBeenCalled()
    })

    it('should terminate loop when tool returns terminatesLoop', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: '<tool_call name="close_session">\n{}\n</tool_call>',
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Session closed.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      const result = await executeMessage(
        'Close the session',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(result.terminated).toBe(true)
      expect(result.finalMessage).toBe('Session closed.')
    })

    it('should add artifacts from tool results', async () => {
      const mockArtifact = {
        type: 'results' as const,
        data: {
          headers: ['id', 'name'],
          data: [[1, 'Alice']],
          toJSON: () => ({
            headers: ['id', 'name'],
            data: [[1, 'Alice']],
          }),
        },
        config: {
          resultSize: 1,
          columnCount: 2,
        },
      }

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: '<tool_call name="run_query">\n{"query": "SELECT * FROM users"}\n</tool_call>',
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Query executed successfully.',
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        artifact: mockArtifact,
        message: '1 row returned.',
      })

      const { executeMessage, artifacts } = useToolLoop()

      await executeMessage(
        'Run the query',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(artifacts.value).toHaveLength(1)
      expect(artifacts.value[0].type).toBe('results')
    })

    it('should invoke onToolResult callback', async () => {
      const onToolResult = vi.fn()

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: '<tool_call name="validate_query">\n{"query": "SELECT 1"}\n</tool_call>',
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Query is valid.',
      })

      const toolResult: ToolCallResult = {
        success: true,
        message: 'Query is valid.',
        availableSymbols: [{ label: 'test', trilogyType: 'concept' } as any],
      }
      executeToolCallSpy.mockResolvedValue(toolResult)

      const { executeMessage } = useToolLoop()

      await executeMessage(
        'Validate the query',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [], onToolResult },
      )

      expect(onToolResult).toHaveBeenCalledWith('validate_query', toolResult)
    })
  })

  describe('max iterations safety', () => {
    it('should stop after max iterations', async () => {
      // Always return tool calls to trigger iteration loop
      mockLLMStore.generateCompletion.mockResolvedValue({
        text: '<tool_call name="edit_editor">\n{"content": "test"}\n</tool_call>',
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Done.',
      })

      const { executeMessage, messages } = useToolLoop()

      const result = await executeMessage(
        'Keep editing',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [], maxIterations: 3 },
      )

      // Should have stopped after max iterations
      expect(result.terminated).toBe(false)
      expect(result.finalMessage).toContain('Max tool iterations reached')
    })
  })

  describe('auto-continue behavior', () => {
    it('should auto-continue when shouldAutoContinue returns true', async () => {
      // First response without tool call
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Let me think about this...',
      })

      // shouldAutoContinue returns true
      mockLLMStore.shouldAutoContinue.mockResolvedValueOnce(true)

      // Second response after auto-continue
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Here is my final answer!',
      })

      // shouldAutoContinue returns false to stop
      mockLLMStore.shouldAutoContinue.mockResolvedValueOnce(false)

      const { executeMessage, messages } = useToolLoop()

      const result = await executeMessage(
        'Help me',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [], maxAutoContinue: 3 },
      )

      expect(mockLLMStore.shouldAutoContinue).toHaveBeenCalled()
      expect(result.finalMessage).toBe('Here is my final answer!')
    })

    it('should respect maxAutoContinue limit', async () => {
      mockLLMStore.generateCompletion.mockResolvedValue({
        text: 'Thinking...',
      })

      mockLLMStore.shouldAutoContinue.mockResolvedValue(true)

      const { executeMessage } = useToolLoop()

      // With maxAutoContinue = 2, it should stop after 2 auto-continues
      const result = await executeMessage(
        'Help',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [], maxAutoContinue: 2 },
      )

      // Should have called shouldAutoContinue twice (and then stopped)
      expect(mockLLMStore.shouldAutoContinue).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should handle LLM generation errors', async () => {
      mockLLMStore.generateCompletion.mockRejectedValue(new Error('Network error'))

      const { executeMessage, error, messages } = useToolLoop()

      const result = await executeMessage(
        'Hello',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(error.value).toBe('Network error')
      expect(result.finalMessage).toContain('Error: Network error')
      // Should have added error message to messages
      expect(messages.value.some((m) => m.content.includes('Error'))).toBe(true)
    })

    it('should set isLoading correctly during execution', async () => {
      let loadingDuringExecution = false

      mockLLMStore.generateCompletion.mockImplementation(async () => {
        // Check loading state during execution
        return { text: 'Response' }
      })

      const { executeMessage, isLoading } = useToolLoop()

      // Before execution
      expect(isLoading.value).toBe(false)

      const promise = executeMessage(
        'Hello',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // During execution (in the next tick)
      await new Promise((resolve) => setTimeout(resolve, 0))

      await promise

      // After execution
      expect(isLoading.value).toBe(false)
    })
  })

  describe('multiple tool calls in one response', () => {
    it('should execute multiple tool calls sequentially', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: `Let me do both things.
<tool_call name="validate_query">
{"query": "SELECT 1"}
</tool_call>
<tool_call name="edit_editor">
{"content": "SELECT 1;"}
</tool_call>`,
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Both operations completed.',
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Done.',
      })

      const { executeMessage } = useToolLoop()

      await executeMessage(
        'Validate and edit',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Both tool calls should have been executed
      expect(executeToolCallSpy).toHaveBeenCalledTimes(2)
      expect(executeToolCallSpy).toHaveBeenCalledWith('validate_query', { query: 'SELECT 1' })
      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_editor', { content: 'SELECT 1;' })
    })
  })
})
