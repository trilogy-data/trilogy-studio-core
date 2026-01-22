import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditorRefinementToolExecutor, type EditorContext } from './editorRefinementToolExecutor'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { ConnectionStoreType } from '../stores/connectionStore'

// Mock types for testing
type MockQueryExecutionService = {
  validateQuery: ReturnType<typeof vi.fn>
  executeQuery: ReturnType<typeof vi.fn>
  formatQuery: ReturnType<typeof vi.fn>
}

type MockConnectionStore = {
  connections: Record<string, { connected: boolean }>
  getConnectionSources: ReturnType<typeof vi.fn>
  connectConnection: ReturnType<typeof vi.fn>
}

describe('EditorRefinementToolExecutor', () => {
  let executor: EditorRefinementToolExecutor
  let mockQueryExecutionService: MockQueryExecutionService
  let mockConnectionStore: MockConnectionStore
  let mockEditorContext: EditorContext
  let onEditorContentChangeSpy: ReturnType<typeof vi.fn>
  let onChartConfigChangeSpy: ReturnType<typeof vi.fn>
  let onFinishSpy: ReturnType<typeof vi.fn>
  let onRunActiveEditorQuerySpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset spies
    onEditorContentChangeSpy = vi.fn()
    onChartConfigChangeSpy = vi.fn()
    onFinishSpy = vi.fn()
    onRunActiveEditorQuerySpy = vi.fn()

    // Create mock services
    mockQueryExecutionService = {
      validateQuery: vi.fn(),
      executeQuery: vi.fn(),
      formatQuery: vi.fn(),
    }

    mockConnectionStore = {
      connections: {
        'test-connection': { connected: true },
      },
      getConnectionSources: vi.fn().mockReturnValue([]),
      connectConnection: vi.fn().mockResolvedValue(undefined),
    }

    // Create mock editor context
    mockEditorContext = {
      connectionName: 'test-connection',
      editorContents: 'SELECT * FROM users;',
      onEditorContentChange: onEditorContentChangeSpy,
      onChartConfigChange: onChartConfigChangeSpy,
      onFinish: onFinishSpy,
      onRunActiveEditorQuery: onRunActiveEditorQuerySpy,
    }

    // Create executor
    executor = new EditorRefinementToolExecutor(
      mockQueryExecutionService as unknown as QueryExecutionService,
      mockConnectionStore as unknown as ConnectionStoreType,
      mockEditorContext,
    )
  })

  describe('edit_editor tool', () => {
    it('should update editor content and run validation', async () => {
      mockQueryExecutionService.validateQuery.mockResolvedValue({
        data: {
          items: [],
          completion_items: [
            { label: 'users.id', trilogyType: 'concept', datatype: 'int' },
            { label: 'users.name', trilogyType: 'concept', datatype: 'string' },
          ],
        },
      })

      const result = await executor.executeToolCall('edit_editor', {
        content: 'SELECT id, name FROM users;',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('Updated editor contents')
      expect(result.message).toContain('Query is valid')
      expect(result.availableSymbols).toHaveLength(2)
      expect(onEditorContentChangeSpy).toHaveBeenCalledWith(
        'SELECT id, name FROM users;',
        false, // Always replace whole editor, not selection
      )
    })

    it('should update editor and report validation errors', async () => {
      mockQueryExecutionService.validateQuery.mockResolvedValue({
        data: {
          items: [{ severity: 8, message: 'Unknown column: foo' }],
          completion_items: [],
        },
      })

      const result = await executor.executeToolCall('edit_editor', {
        content: 'SELECT foo FROM users;',
      })

      expect(result.success).toBe(true) // Edit succeeded even though validation failed
      expect(result.message).toContain('Updated editor contents')
      expect(result.message).toContain('Validation errors found')
      expect(result.message).toContain('Unknown column: foo')
      expect(onEditorContentChangeSpy).toHaveBeenCalledWith('SELECT foo FROM users;', false)
    })

    it('should fail with empty content', async () => {
      const result = await executor.executeToolCall('edit_editor', {
        content: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Content is required')
    })
  })

  describe('validate_query tool', () => {
    it('should validate a query successfully', async () => {
      mockQueryExecutionService.validateQuery.mockResolvedValue({
        data: {
          items: [],
          completion_items: [
            { label: 'users.id', trilogyType: 'concept', datatype: 'int' },
            { label: 'users.name', trilogyType: 'concept', datatype: 'string' },
          ],
        },
      })

      const result = await executor.executeToolCall('validate_query', {
        query: 'SELECT id FROM users;',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('Query is valid')
      expect(result.availableSymbols).toHaveLength(2)
    })

    it('should return validation errors', async () => {
      mockQueryExecutionService.validateQuery.mockResolvedValue({
        data: {
          items: [{ severity: 8, message: 'Unknown column: foo' }],
          completion_items: [],
        },
      })

      const result = await executor.executeToolCall('validate_query', {
        query: 'SELECT foo FROM users;',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Validation errors')
      expect(result.error).toContain('Unknown column: foo')
    })

    it('should fail with empty query', async () => {
      const result = await executor.executeToolCall('validate_query', {
        query: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Query is required')
    })

    it('should fail with non-existent connection', async () => {
      mockEditorContext.connectionName = 'non-existent'
      executor = new EditorRefinementToolExecutor(
        mockQueryExecutionService as unknown as QueryExecutionService,
        mockConnectionStore as unknown as ConnectionStoreType,
        mockEditorContext,
      )

      const result = await executor.executeToolCall('validate_query', {
        query: 'SELECT * FROM users;',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection "non-existent" not found')
    })
  })

  describe('run_query tool', () => {
    it('should execute a query and return results', async () => {
      mockQueryExecutionService.executeQuery.mockReturnValue({
        resultPromise: Promise.resolve({
          success: true,
          results: {
            headers: ['id', 'name'],
            data: [
              [1, 'Alice'],
              [2, 'Bob'],
            ],
            toJSON: () => ({
              headers: ['id', 'name'],
              data: [
                [1, 'Alice'],
                [2, 'Bob'],
              ],
            }),
          },
          executionTime: 100,
          resultSize: 2,
          columnCount: 2,
          generatedSql: 'SELECT id, name FROM users',
        }),
      })

      const result = await executor.executeToolCall('run_query', {
        query: 'SELECT id, name FROM users;',
      })

      expect(result.success).toBe(true)
      expect(result.artifact).toBeDefined()
      expect(result.artifact?.type).toBe('results')
      expect(result.message).toContain('2 rows')
    })

    it('should fail when connection is not connected', async () => {
      mockConnectionStore.connections['test-connection'].connected = false

      const result = await executor.executeToolCall('run_query', {
        query: 'SELECT * FROM users;',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not currently connected')
    })

    it('should handle query execution errors', async () => {
      mockQueryExecutionService.executeQuery.mockReturnValue({
        resultPromise: Promise.resolve({
          success: false,
          error: 'Syntax error in query',
        }),
      })

      const result = await executor.executeToolCall('run_query', {
        query: 'SELECT FROM;',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Syntax error in query')
    })
  })

  describe('format_query tool', () => {
    it('should format a query', async () => {
      mockQueryExecutionService.formatQuery.mockResolvedValue(
        'SELECT\n    id,\n    name\nFROM users;',
      )

      const result = await executor.executeToolCall('format_query', {
        query: 'SELECT id,name FROM users;',
      })

      expect(result.success).toBe(true)
      expect(result.formattedQuery).toBe('SELECT\n    id,\n    name\nFROM users;')
    })

    it('should fail with empty query', async () => {
      const result = await executor.executeToolCall('format_query', {
        query: '   ',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Query is required')
    })
  })

  describe('edit_chart_config tool', () => {
    it('should update chart configuration', async () => {
      const chartConfig = {
        chartType: 'bar' as const,
        xField: 'category',
        yField: 'count',
      }

      const result = await executor.executeToolCall('edit_chart_config', {
        chartConfig,
      })

      expect(result.success).toBe(true)
      expect(onChartConfigChangeSpy).toHaveBeenCalledWith(chartConfig)
    })

    it('should fail with invalid chart config', async () => {
      const result = await executor.executeToolCall('edit_chart_config', {
        chartConfig: null,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('chartConfig is required')
    })
  })

  describe('run_active_editor_query tool', () => {
    it('should execute editor contents and return results', async () => {
      onRunActiveEditorQuerySpy.mockResolvedValue({
        success: true,
        results: {
          headers: ['id', 'name'],
          data: [
            [1, 'Alice'],
            [2, 'Bob'],
          ],
        },
        executionTime: 100,
        resultSize: 2,
        columnCount: 2,
        generatedSql: 'SELECT * FROM users',
      })

      const result = await executor.executeToolCall('run_active_editor_query', {})

      expect(result.success).toBe(true)
      expect(onRunActiveEditorQuerySpy).toHaveBeenCalled()
      expect(result.artifact).toBeDefined()
      expect(result.artifact?.type).toBe('results')
      expect(result.message).toContain('2 rows')
    })

    it('should fail when editor is empty', async () => {
      mockEditorContext.editorContents = ''
      executor = new EditorRefinementToolExecutor(
        mockQueryExecutionService as unknown as QueryExecutionService,
        mockConnectionStore as unknown as ConnectionStoreType,
        mockEditorContext,
      )

      const result = await executor.executeToolCall('run_active_editor_query', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Editor is empty')
    })

    it('should fail when callback is not available', async () => {
      mockEditorContext.onRunActiveEditorQuery = undefined
      executor = new EditorRefinementToolExecutor(
        mockQueryExecutionService as unknown as QueryExecutionService,
        mockConnectionStore as unknown as ConnectionStoreType,
        mockEditorContext,
      )

      const result = await executor.executeToolCall('run_active_editor_query', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')
    })

    it('should return error when query execution fails', async () => {
      onRunActiveEditorQuerySpy.mockResolvedValue({
        success: false,
        error: 'Connection timeout',
      })

      const result = await executor.executeToolCall('run_active_editor_query', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection timeout')
    })
  })

  describe('request_close tool', () => {
    it('should return a close request message', async () => {
      const result = await executor.executeToolCall('request_close', {
        message: 'All changes completed.',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('All changes completed.')
      expect(result.message).toContain('Ready to close')
      expect(result.terminatesLoop).toBeUndefined() // Should not terminate
    })
  })

  describe('close_session tool', () => {
    it('should close the session and terminate the loop', async () => {
      const result = await executor.executeToolCall('close_session', {})

      expect(result.success).toBe(true)
      expect(result.terminatesLoop).toBe(true)
      expect(onFinishSpy).toHaveBeenCalled()
    })
  })

  describe('connect_data_connection tool', () => {
    it('should connect a disconnected connection', async () => {
      // Set up a disconnected connection
      mockConnectionStore.connections['test-connection'].connected = false
      mockConnectionStore.connectConnection = vi.fn().mockResolvedValue(undefined)

      const result = await executor.executeToolCall('connect_data_connection', {
        connection: 'test-connection',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('Successfully connected')
      expect(mockConnectionStore.connectConnection).toHaveBeenCalledWith('test-connection')
    })

    it('should report already connected for active connections', async () => {
      const result = await executor.executeToolCall('connect_data_connection', {
        connection: 'test-connection',
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('already active')
    })

    it('should fail for non-existent connection', async () => {
      const result = await executor.executeToolCall('connect_data_connection', {
        connection: 'non-existent',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
      expect(result.error).toContain('Available connections')
    })

    it('should fail when connection name is not provided', async () => {
      const result = await executor.executeToolCall('connect_data_connection', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection name is required')
    })

    it('should handle connection errors', async () => {
      mockConnectionStore.connections['test-connection'].connected = false
      mockConnectionStore.connectConnection = vi.fn().mockRejectedValue(new Error('Auth failed'))

      const result = await executor.executeToolCall('connect_data_connection', {
        connection: 'test-connection',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to connect')
      expect(result.error).toContain('Auth failed')
    })
  })

  describe('unknown tool', () => {
    it('should return an error for unknown tools', async () => {
      const result = await executor.executeToolCall('unknown_tool', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown tool')
      expect(result.error).toContain('unknown_tool')
    })
  })
})
