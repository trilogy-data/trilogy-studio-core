import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToolLoop, type ToolExecutor } from './useToolLoop'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ToolCallResult } from '../llm/editorRefinementToolExecutor'

// Mock LLM store type for testing
type MockLLMStore = {
  generateCompletion: ReturnType<typeof vi.fn>
}

describe('useToolLoop', () => {
  let mockLLMStore: MockLLMStore
  let mockToolExecutor: ToolExecutor
  let executeToolCallSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Create mock LLM store
    mockLLMStore = {
      generateCompletion: vi.fn(),
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

      setArtifacts([{ id: 'art-test-1', type: 'results', data: { headers: [], data: [] } }])

      expect(artifacts.value).toHaveLength(1)
      expect(artifacts.value[0].type).toBe('results')
    })
  })

  describe('executeMessage without tools', () => {
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
    it('should execute tool calls from LLM response and terminate via close_session', async () => {
      // First response has tool call
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Let me edit the query.',
        toolCalls: [
          { id: 'toolu_01', name: 'edit_editor', input: { content: 'SELECT * FROM users;' } },
        ],
      })

      // Second response closes the session
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Done.',
        toolCalls: [{ id: 'toolu_02', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Editor updated.',
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Session closed.',
        terminatesLoop: true,
      })

      const { executeMessage } = useToolLoop()

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
      expect(result.terminated).toBe(true)
      expect(result.finalMessage).toBe('Session closed.')
    })

    it('should handle tool execution errors', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Let me edit the editor.',
        toolCalls: [{ id: 'toolu_01', name: 'edit_editor', input: { content: '' } }],
      })

      // After error, agent calls close_session
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'There was an error.',
        toolCalls: [{ id: 'toolu_02', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: false,
        error: 'Content is required',
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
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
        text: 'Closing the session.',
        toolCalls: [{ id: 'toolu_01', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Session closed.',
        terminatesLoop: true,
      })

      const { executeMessage } = useToolLoop()

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

    it('should include tool call and tool result messages when terminatesLoop is true', async () => {
      // This test verifies the fix for OpenAI API error:
      // "An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'"
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Closing the session now.',
        toolCalls: [{ id: 'call_abc123', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Session closed successfully.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      await executeMessage(
        'Please close',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Should have: user message, assistant with tool calls, tool results (hidden user message)
      expect(messages.value.length).toBe(3)

      // First message should be the user message
      expect(messages.value[0].role).toBe('user')
      expect(messages.value[0].content).toBe('Please close')

      // Second message should be assistant with tool calls
      expect(messages.value[1].role).toBe('assistant')
      expect(messages.value[1].content).toBe('Closing the session now.')
      expect(messages.value[1].toolCalls).toBeDefined()
      expect(messages.value[1].toolCalls).toHaveLength(1)
      expect(messages.value[1].toolCalls![0].id).toBe('call_abc123')
      expect(messages.value[1].toolCalls![0].name).toBe('close_session')

      // Third message should be tool results (hidden user message)
      expect(messages.value[2].role).toBe('user')
      expect(messages.value[2].hidden).toBe(true)
      expect(messages.value[2].toolResults).toBeDefined()
      expect(messages.value[2].toolResults).toHaveLength(1)
      expect(messages.value[2].toolResults![0].toolCallId).toBe('call_abc123')
      expect(messages.value[2].toolResults![0].result).toBe('Session closed successfully.')
    })

    it('should include all tool results when terminatesLoop happens after multiple tools', async () => {
      // When multiple tool calls are made and the last one terminates,
      // all tool results should be included
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Let me validate and then close.',
        toolCalls: [
          { id: 'call_validate', name: 'validate_query', input: { query: 'SELECT 1' } },
          { id: 'call_close', name: 'close_session', input: {} },
        ],
      })

      // First tool succeeds normally
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Query is valid.',
      })

      // Second tool terminates the loop
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Session closed.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      await executeMessage(
        'Validate and close',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Should have proper message structure
      expect(messages.value.length).toBe(3)

      // Check that tool results include both tool calls
      const toolResultsMessage = messages.value[2]
      expect(toolResultsMessage.toolResults).toHaveLength(2)
      expect(toolResultsMessage.toolResults![0].toolCallId).toBe('call_validate')
      expect(toolResultsMessage.toolResults![0].result).toBe('Query is valid.')
      expect(toolResultsMessage.toolResults![1].toolCallId).toBe('call_close')
      expect(toolResultsMessage.toolResults![1].result).toBe('Session closed.')
    })

    it('should handle failed terminating tool calls correctly', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Attempting to close.',
        toolCalls: [{ id: 'call_close_fail', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValue({
        success: false,
        error: 'Failed to close session',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      await executeMessage(
        'Close now',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Tool results should contain the error
      const toolResultsMessage = messages.value[2]
      expect(toolResultsMessage.toolResults![0].result).toBe('Error: Failed to close session')
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
        text: 'Running the query.',
        toolCalls: [{ id: 'toolu_01', name: 'run_query', input: { query: 'SELECT * FROM users' } }],
      })

      // After query, agent closes session
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Query done.',
        toolCalls: [{ id: 'toolu_02', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        artifact: mockArtifact,
        message: '1 row returned.',
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
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
        text: 'Validating the query.',
        toolCalls: [{ id: 'toolu_01', name: 'validate_query', input: { query: 'SELECT 1' } }],
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Done.',
        toolCalls: [{ id: 'toolu_02', name: 'close_session', input: {} }],
      })

      const toolResult: ToolCallResult = {
        success: true,
        message: 'Query is valid.',
        availableSymbols: [{ label: 'test', trilogyType: 'concept' } as any],
      }
      executeToolCallSpy.mockResolvedValueOnce(toolResult)
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
      })

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

  describe('no-tool-call re-prompt behavior', () => {
    it('should re-prompt agent when it responds with text only (no tool calls)', async () => {
      // First response: text only — agent forgets to call a tool
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Here is my analysis...',
      })

      // Second response: agent calls close_session after the re-prompt
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Closing now.',
        toolCalls: [{ id: 'toolu_01', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Session closed.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      const result = await executeMessage(
        'Analyse this',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Should have looped: the text-only response is persisted, then the agent is re-prompted
      expect(mockLLMStore.generateCompletion).toHaveBeenCalledTimes(2)
      expect(result.terminated).toBe(true)

      // The first assistant text response should be in the messages
      const assistantMessages = messages.value.filter((m) => m.role === 'assistant')
      expect(assistantMessages.some((m) => m.content === 'Here is my analysis...')).toBe(true)
    })

    it('should include a hidden reminder message in history after no-tool-call response', async () => {
      // First iteration: text only
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Thinking aloud...',
      })

      // Second iteration: close
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Done.',
        toolCalls: [{ id: 'toolu_01', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      await executeMessage(
        'Do something',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // There should be a hidden user reminder message between the two assistant turns
      const hiddenMessages = messages.value.filter((m) => m.hidden && m.role === 'user')
      // At least one hidden reminder + the tool result hidden message
      expect(hiddenMessages.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('max iterations safety', () => {
    it('should stop after max iterations', async () => {
      // Always return tool calls to trigger iteration loop
      mockLLMStore.generateCompletion.mockResolvedValue({
        text: 'Editing the editor.',
        toolCalls: [{ id: 'toolu_01', name: 'edit_editor', input: { content: 'test' } }],
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Done.',
      })

      const { executeMessage } = useToolLoop()

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
      mockLLMStore.generateCompletion.mockImplementation(async () => {
        // Check loading state during execution — immediately return a close call
        return {
          text: 'Done.',
          toolCalls: [{ id: 'toolu_01', name: 'close_session', input: {} }],
        }
      })

      executeToolCallSpy.mockResolvedValue({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
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
        text: 'Let me do both things.',
        toolCalls: [
          { id: 'toolu_01', name: 'validate_query', input: { query: 'SELECT 1' } },
          { id: 'toolu_02', name: 'edit_editor', input: { content: 'SELECT 1;' } },
        ],
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Both done.',
        toolCalls: [{ id: 'toolu_03', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Done.' })
      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Done.' })
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
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
      expect(executeToolCallSpy).toHaveBeenCalledTimes(3)
      expect(executeToolCallSpy).toHaveBeenCalledWith('validate_query', { query: 'SELECT 1' })
      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_editor', { content: 'SELECT 1;' })
    })

    it('should handle real Anthropic response with text + structured tool calls', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Interesting data! Let me write this query to the editor and set up a scatter plot:',
        toolCalls: [
          {
            id: 'toolu_01',
            name: 'edit_editor',
            input: {
              content:
                'import flight;\n\nselect\n    aircraft.aircraft_model.seats,\n    avg(distance) as avg_distance\nlimit 100;',
            },
          },
          {
            id: 'toolu_02',
            name: 'edit_chart_config',
            input: {
              chartConfig: {
                chartType: 'point',
                xField: 'aircraft_aircraft_model_seats',
                yField: 'avg_distance',
              },
            },
          },
        ],
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Done.',
        toolCalls: [{ id: 'toolu_03', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Done.' })
      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Done.' })
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
      })

      const { executeMessage } = useToolLoop()

      await executeMessage(
        'Show me if larger planes fly longer distances as a scatter plot',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(executeToolCallSpy).toHaveBeenCalledTimes(3)
      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_editor', {
        content:
          'import flight;\n\nselect\n    aircraft.aircraft_model.seats,\n    avg(distance) as avg_distance\nlimit 100;',
      })
      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_chart_config', {
        chartConfig: {
          chartType: 'point',
          xField: 'aircraft_aircraft_model_seats',
          yField: 'avg_distance',
        },
      })
    })

    it('should prefer structured toolCalls over text parsing', async () => {
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Let me update the editor and chart config.',
        toolCalls: [
          {
            id: 'toolu_01abc',
            name: 'edit_editor',
            input: { content: 'SELECT * FROM users;' },
          },
          {
            id: 'toolu_02def',
            name: 'edit_chart_config',
            input: {
              chartConfig: {
                chartType: 'bar',
                xField: 'category',
                yField: 'count',
              },
            },
          },
        ],
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Done!',
        toolCalls: [{ id: 'toolu_03', name: 'close_session', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Done.' })
      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Done.' })
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
      })

      const { executeMessage } = useToolLoop()

      await executeMessage(
        'Update the query',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      expect(executeToolCallSpy).toHaveBeenCalledTimes(3)
      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_editor', {
        content: 'SELECT * FROM users;',
      })
      expect(executeToolCallSpy).toHaveBeenCalledWith('edit_chart_config', {
        chartConfig: {
          chartType: 'bar',
          xField: 'category',
          yField: 'count',
        },
      })
    })
  })

  describe('multi-iteration persistence', () => {
    it('should persist intermediate tool messages across multiple iterations', async () => {
      // This test verifies the fix for:
      // "An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'"
      // When multiple iterations occur, ALL intermediate messages should be in messages.value

      // Iteration 1: LLM calls edit_editor (non-terminating)
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'call_edit', name: 'edit_editor', input: { content: 'SELECT 1' } }],
      })

      // Iteration 2: LLM calls request_close (terminating)
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Updated the editor successfully.',
        toolCalls: [{ id: 'call_close', name: 'request_close', input: { message: 'Done' } }],
      })

      // edit_editor doesn't terminate
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Editor updated.',
      })

      // request_close terminates
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Session closed.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      await executeMessage(
        'Write a query',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Should have ALL messages persisted:
      // 1. user: "Write a query"
      // 2. assistant: edit_editor tool call (iteration 1)
      // 3. user (hidden): edit_editor tool result
      // 4. assistant: request_close tool call (iteration 2)
      // 5. user (hidden): request_close tool result
      expect(messages.value.length).toBe(5)

      expect(messages.value[0].role).toBe('user')
      expect(messages.value[0].content).toBe('Write a query')

      expect(messages.value[1].role).toBe('assistant')
      expect(messages.value[1].toolCalls).toBeDefined()
      expect(messages.value[1].toolCalls![0].id).toBe('call_edit')

      expect(messages.value[2].role).toBe('user')
      expect(messages.value[2].hidden).toBe(true)
      expect(messages.value[2].toolResults).toBeDefined()
      expect(messages.value[2].toolResults![0].toolCallId).toBe('call_edit')

      expect(messages.value[3].role).toBe('assistant')
      expect(messages.value[3].toolCalls).toBeDefined()
      expect(messages.value[3].toolCalls![0].id).toBe('call_close')

      expect(messages.value[4].role).toBe('user')
      expect(messages.value[4].hidden).toBe(true)
      expect(messages.value[4].toolResults).toBeDefined()
      expect(messages.value[4].toolResults![0].toolCallId).toBe('call_close')
    })

    it('should persist messages correctly for follow-up conversations', async () => {
      // First executeMessage call
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Editing the editor.',
        toolCalls: [{ id: 'call_edit_1', name: 'edit_editor', input: { content: 'SELECT 1' } }],
      })

      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Done editing.',
        toolCalls: [{ id: 'call_close_1', name: 'request_close', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({ success: true, message: 'Edited.' })
      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
      })

      const { executeMessage, messages } = useToolLoop()

      await executeMessage(
        'First request',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      const messageCountAfterFirst = messages.value.length
      expect(messageCountAfterFirst).toBe(5) // user, assistant+tool, tool_result, assistant+tool, tool_result

      // Second executeMessage call (follow-up) — agent immediately closes
      mockLLMStore.generateCompletion.mockResolvedValueOnce({
        text: 'Follow-up done.',
        toolCalls: [{ id: 'call_close_2', name: 'request_close', input: {} }],
      })

      executeToolCallSpy.mockResolvedValueOnce({
        success: true,
        message: 'Closed.',
        terminatesLoop: true,
      })

      await executeMessage(
        'Follow-up request',
        mockLLMStore as unknown as LLMConnectionStoreType,
        'test-connection',
        'System prompt',
        mockToolExecutor,
        { tools: [] },
      )

      // Should have added: user follow-up, assistant+tool call, tool result = 3 more
      expect(messages.value.length).toBe(messageCountAfterFirst + 3)

      expect(messages.value[5].role).toBe('user')
      expect(messages.value[5].content).toBe('Follow-up request')
    })
  })
})
