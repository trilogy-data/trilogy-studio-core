import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import BigQueryOauthConnection from './bigquery_oauth'
import { ColumnType, Results } from '../editors/results'
import { DateTime } from 'luxon'

// Mock the google object
vi.mock('global', () => ({
  google: {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn().mockImplementation(() => ({
          requestAccessToken: vi.fn(),
        })),
      },
    },
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe('BigQueryOauthConnection', () => {
  let connection: BigQueryOauthConnection
  // Define mockActiveJobs at the top level
  let mockActiveJobs: Map<string, string>

  beforeEach(() => {
    connection = new BigQueryOauthConnection('test-connection', 'test-project-id')
    // Mock accessToken
    ;(connection as any).accessToken = 'mock-token'
    // Reset fetch mock
    vi.mocked(fetch).mockReset()
    // Reset all mocks
    vi.clearAllMocks()

    // Initialize mockActiveJobs at the top level for all tests
    mockActiveJobs = new Map<string, string>()
    // Replace connection's activeJobs with our mock
    ;(connection as any).activeJobs = mockActiveJobs
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fieldToResultColumn', () => {
    it('maps a simple field to a ResultColumn', () => {
      const field = {
        name: 'test_field',
        type: 'STRING',
        mode: 'NULLABLE',
      }

      const result = connection.fieldToResultColumn(field)

      expect(result).toEqual({
        name: 'test_field',
        type: ColumnType.STRING,
        children: undefined,
      })
    })

    it('maps an array field to a ResultColumn with ARRAY type', () => {
      const field = {
        name: 'test_array',
        type: 'STRING',
        mode: 'REPEATED',
      }

      const result = connection.fieldToResultColumn(field)

      expect(result.name).toBe('test_array')
      expect(result.type).toBe(ColumnType.ARRAY)
      expect(result.children).toBeInstanceOf(Map)
      expect(result.children?.get('v')).toEqual({
        name: 'v',
        type: ColumnType.STRING,
        children: undefined,
      })
    })

    it('maps a struct field to a ResultColumn with STRUCT type and children', () => {
      const field = {
        name: 'test_struct',
        type: 'RECORD',
        mode: 'NULLABLE',
        fields: [
          {
            name: 'child_field',
            type: 'STRING',
            mode: 'NULLABLE',
          },
        ],
      }

      const result = connection.fieldToResultColumn(field)

      expect(result.name).toBe('test_struct')
      expect(result.type).toBe(ColumnType.STRUCT)
      expect(result.children).toBeInstanceOf(Map)
      expect(result.children?.get('child_field')).toEqual({
        name: 'child_field',
        type: ColumnType.STRING,
        children: undefined,
      })
    })
  })

  describe('processRow', () => {
    it('processes a simple row with primitive types', () => {
      const row = {
        string_field: { v: 'test string' },
        int_field: { v: '123' },
        float_field: { v: '123.45' },
        bool_field: { v: 'true' },
        null_field: { v: null },
      }

      const headers = new Map([
        ['string_field', { name: 'string_field', type: ColumnType.STRING }],
        ['int_field', { name: 'int_field', type: ColumnType.INTEGER }],
        ['float_field', { name: 'float_field', type: ColumnType.FLOAT }],
        ['bool_field', { name: 'bool_field', type: ColumnType.BOOLEAN }],
        ['null_field', { name: 'null_field', type: ColumnType.STRING }],
      ])

      const processed = connection.processRow(row, headers)

      expect(processed).toEqual({
        string_field: 'test string',
        int_field: 123,
        float_field: 123.45,
        bool_field: 'true',
        null_field: null,
      })
    })

    it('processes timestamp fields correctly', () => {
      const timestamp = 1609459200 // 2021-01-01 00:00:00 UTC
      const row = {
        timestamp_field: { v: timestamp.toString() },
      }

      const headers = new Map([
        ['timestamp_field', { name: 'timestamp_field', type: ColumnType.DATETIME }],
      ])

      const processed = connection.processRow(row, headers)

      expect(processed.timestamp_field).toBeInstanceOf(DateTime)
      expect(processed.timestamp_field.toMillis()).toBe(timestamp * 1000)
    })

    it('processes array fields correctly', () => {
      const row = {
        array_field: {
          v: [{ v: 'item1' }, { v: 'item2' }],
        },
      }

      const childColumn = { name: 'v', type: ColumnType.STRING }
      const arrayColumn = {
        name: 'array_field',
        type: ColumnType.ARRAY,
        children: new Map([['v', childColumn]]),
      }

      const headers = new Map([['array_field', arrayColumn]])

      const processed = connection.processRow(row, headers)

      expect(processed.array_field).toEqual([{ v: 'item1' }, { v: 'item2' }])
    })

    it('processes struct fields correctly', () => {
      const row = {
        struct_field: {
          v: {
            f: [{ v: 'field1_value' }, { v: 'field2_value' }],
          },
        },
      }

      const structChildren = new Map([
        ['0', { name: '0', type: ColumnType.STRING }],
        ['1', { name: '1', type: ColumnType.STRING }],
      ])

      const headers = new Map([
        [
          'struct_field',
          { name: 'struct_field', type: ColumnType.STRUCT, children: structChildren },
        ],
      ])

      const processed = connection.processRow(row, headers)

      expect(processed.struct_field).toEqual({
        '0': 'field1_value',
        '1': 'field2_value',
      })
    })
  })

  describe('mapBigQueryTypeToColumnType', () => {
    it('maps BigQuery types to ColumnType correctly', () => {
      const mapping = [
        { bqType: 'string', mode: 'NULLABLE', expected: ColumnType.STRING },
        { bqType: 'bytes', mode: 'NULLABLE', expected: ColumnType.STRING },
        { bqType: 'integer', mode: 'NULLABLE', expected: ColumnType.INTEGER },
        { bqType: 'int64', mode: 'NULLABLE', expected: ColumnType.INTEGER },
        { bqType: 'float', mode: 'NULLABLE', expected: ColumnType.FLOAT },
        { bqType: 'float64', mode: 'NULLABLE', expected: ColumnType.FLOAT },
        { bqType: 'boolean', mode: 'NULLABLE', expected: ColumnType.BOOLEAN },
        { bqType: 'bool', mode: 'NULLABLE', expected: ColumnType.BOOLEAN },
        { bqType: 'timestamp', mode: 'NULLABLE', expected: ColumnType.TIMESTAMP },
        { bqType: 'datetime', mode: 'NULLABLE', expected: ColumnType.DATETIME },
        { bqType: 'date', mode: 'NULLABLE', expected: ColumnType.DATE },
        { bqType: 'time', mode: 'NULLABLE', expected: ColumnType.TIME },
        { bqType: 'record', mode: 'NULLABLE', expected: ColumnType.STRUCT },
        { bqType: 'unknown_type', mode: 'NULLABLE', expected: ColumnType.UNKNOWN },
        // Any type with REPEATED mode should be an ARRAY
        { bqType: 'string', mode: 'REPEATED', expected: ColumnType.ARRAY },
        { bqType: 'integer', mode: 'REPEATED', expected: ColumnType.ARRAY },
        { bqType: 'record', mode: 'REPEATED', expected: ColumnType.ARRAY },
      ]

      mapping.forEach(({ bqType, mode, expected }) => {
        const result = (connection as any).mapBigQueryTypeToColumnType(bqType, mode)
        expect(result).toBe(expected)
      })
    })
  })

  describe('query_core', () => {
    // Define a mock for the activeJobs Map
    let mockActiveJobs: Map<string, string>

    beforeEach(() => {
      // Setup a real Map for activeJobs that we can spy on
      mockActiveJobs = new Map<string, string>()
      // Replace the activeJobs with our mock
      ;(connection as any).activeJobs = mockActiveJobs

      // Create spies on the Map methods after assigning to connection
      vi.spyOn(mockActiveJobs, 'set')
      vi.spyOn(mockActiveJobs, 'delete')
      vi.spyOn(mockActiveJobs, 'get')
      vi.spyOn(mockActiveJobs, 'has')

      // Mock the sleep method directly as a function
      ;(connection as any).sleep = vi.fn().mockResolvedValue(undefined)
    })

    it('handles immediate query completion correctly', async () => {
      // Mock response from BigQuery API with jobComplete: true
      const mockResponse = {
        jobComplete: true,
        jobReference: {
          jobId: 'test-job-123',
          projectId: 'test-project-id',
          location: 'US',
        },
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'name', type: 'STRING', mode: 'NULLABLE' },
          ],
        },
        rows: [
          {
            f: [{ v: '1' }, { v: 'Test Item' }],
          },
        ],
      }

      // Mock the fetchEndpoint method
      vi.spyOn(connection, 'fetchEndpoint').mockResolvedValue(mockResponse)

      const sql = 'SELECT * FROM `test_dataset.test_table` LIMIT 1'
      const result = await connection.query_core(sql, {}, 'test-query-id')

      // Verify fetchEndpoint was called correctly
      expect(connection.fetchEndpoint).toHaveBeenCalledWith(
        'queries',
        {
          query: sql,
          useLegacySql: false,
        },
        'POST',
      )

      // Verify the job ID was stored in activeJobs
      expect(mockActiveJobs.set).toHaveBeenCalledWith('test-query-id', 'test-job-123')

      // Verify the result is a Results instance with correct structure
      expect(result).toBeInstanceOf(Results)
      expect(result.headers).toBeInstanceOf(Map)
      expect(result.headers.size).toBe(2)
      expect(result.data.length).toBe(1)
    })

    it('handles async query execution with polling correctly', async () => {
      // First response indicates job is not complete
      const initialResponse = {
        jobComplete: false,
        jobReference: {
          jobId: 'test-job-456',
          projectId: 'test-project-id',
          location: 'US',
        },
      }

      // Second response (after polling) indicates job is complete
      const completedResponse = {
        jobComplete: true,
        jobReference: {
          jobId: 'test-job-456',
          projectId: 'test-project-id',
          location: 'US',
        },
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'name', type: 'STRING', mode: 'NULLABLE' },
          ],
        },
        rows: [
          {
            f: [{ v: '1' }, { v: 'Test Item' }],
          },
        ],
      }

      // Setup the fetchEndpoint mock to return different responses
      //@ts-ignore
      vi.spyOn(connection, 'fetchEndpoint').mockImplementation((endpoint, args, method) => {
        if (endpoint === 'queries') {
          return Promise.resolve(initialResponse)
        } else if (endpoint.includes('queries/test-job-456')) {
          return Promise.resolve(completedResponse)
        }
        return Promise.resolve({})
      })

      // Spy on pollJobCompletion
      const pollSpy = vi.spyOn(connection as any, 'pollJobCompletion')

      const sql = 'SELECT * FROM `test_dataset.test_table` LIMIT 1'
      const result = await connection.query_core(sql, {}, 'test-query-id')

      // Verify pollJobCompletion was called with the correct job ID
      expect(pollSpy).toHaveBeenCalledWith('test-job-456', 'US')

      // Verify the result is a Results instance with correct structure
      expect(result).toBeInstanceOf(Results)
      expect(result.headers).toBeInstanceOf(Map)
      expect(result.headers.size).toBe(2)
      expect(result.data.length).toBe(1)
    })

    it('handles empty results correctly', async () => {
      // Mock response with no rows
      const mockResponse = {
        jobComplete: true,
        jobReference: {
          jobId: 'test-job-789',
          projectId: 'test-project-id',
          location: 'US',
        },
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'name', type: 'STRING', mode: 'NULLABLE' },
          ],
        },
        // No rows property
      }

      // Mock the fetchEndpoint method
      vi.spyOn(connection, 'fetchEndpoint').mockResolvedValue(mockResponse)

      const sql = 'SELECT * FROM `test_dataset.test_table` WHERE 1=0'
      const result = await connection.query_core(sql)

      // Verify the result has headers but no rows
      expect(result).toBeInstanceOf(Results)
      expect(result.headers).toBeInstanceOf(Map)
      expect(result.headers.size).toBe(2)
      expect(result.data.length).toBe(0)
    })

    it('handles errors correctly', async () => {
      // Mock fetchEndpoint to throw an error
      vi.spyOn(connection, 'fetchEndpoint').mockRejectedValue(new Error('Query failed'))

      const sql = 'INVALID SQL'

      // Verify that the error is propagated
      await expect(connection.query_core(sql)).rejects.toThrow('Query failed')
    })

    it('removes job from activeJobs when query completes', async () => {
      // Reset the mockActiveJobs to a clean state
      mockActiveJobs.clear()

      // Create direct spies
      const setSpy = vi.fn()
      const deleteSpy = vi.fn()

      // Override the methods with spies
      mockActiveJobs.set = setSpy.mockImplementation((key, value) => {
        const originalSet = Map.prototype.set
        return originalSet.call(mockActiveJobs, key, value)
      })

      mockActiveJobs.delete = deleteSpy.mockImplementation((key) => {
        const originalDelete = Map.prototype.delete
        return originalDelete.call(mockActiveJobs, key)
      })

      // Mock response with jobComplete: true
      const mockResponse = {
        jobComplete: true,
        jobReference: {
          jobId: 'test-job-123',
          projectId: 'test-project-id',
          location: 'US',
        },
        schema: {
          fields: [{ name: 'id', type: 'INTEGER', mode: 'REQUIRED' }],
        },
        rows: [{ f: [{ v: '1' }] }],
      }

      // Mock the fetchEndpoint method
      vi.spyOn(connection, 'fetchEndpoint').mockResolvedValue(mockResponse)

      const sql = 'SELECT 1'
      await connection.query_core(sql, {}, 'test-query-id')

      // Verify job ID was stored and then removed
      expect(setSpy).toHaveBeenCalledWith('test-query-id', 'test-job-123')
      expect(deleteSpy).toHaveBeenCalledWith('test-query-id')
    })
  })

  describe('cancelQuery', () => {
    it('cancels a running query successfully', async () => {
      // Set up a mock job in activeJobs
      mockActiveJobs.set('test-query-id', 'test-job-123')

      // Mock successful cancellation response
      vi.spyOn(connection, 'fetchEndpoint').mockResolvedValue({ status: 'cancelled' })

      const result = await connection.cancelQuery('test-query-id')

      // Verify fetchEndpoint was called with the correct parameters
      expect(connection.fetchEndpoint).toHaveBeenCalledWith('jobs/test-job-123/cancel', {}, 'POST')

      // Verify the result is true (successful cancellation)
      expect(result).toBe(true)
    })

    it('returns false when no active job is found', async () => {
      // Ensure fetchEndpoint is spied on first
      const fetchSpy = vi.spyOn(connection, 'fetchEndpoint')
      fetchSpy.mockReset()

      // Use the actual has method instead of mocking get
      mockActiveJobs.clear() // Ensure the map is empty

      const result = await connection.cancelQuery('non-existent-query-id')

      // Verify fetchEndpoint was not called
      expect(fetchSpy).not.toHaveBeenCalled()

      // Verify the result is false (cancellation failed)
      expect(result).toBe(false)
    })

    it('handles cancellation errors properly', async () => {
      // Set up a mock job in activeJobs
      mockActiveJobs.set('test-query-id', 'test-job-123')

      // Mock fetchEndpoint to throw an error
      vi.spyOn(connection, 'fetchEndpoint').mockRejectedValue(new Error('Cancellation failed'))

      const result = await connection.cancelQuery('test-query-id')

      // Verify the result is false (cancellation failed)
      expect(result).toBe(false)
    })
  })

  describe('pollJobCompletion', () => {
    it('polls until job completes successfully', async () => {
      // Mock responses for different poll attempts
      const pollResponses = [
        { jobComplete: false, statistics: { query: { totalBytesProcessed: '1024000' } } },
        { jobComplete: false, statistics: { query: { totalBytesProcessed: '2048000' } } },
        { jobComplete: true, schema: { fields: [] }, rows: [] },
      ]

      // Setup fetchEndpoint mock
      let pollCount = 0
      const fetchSpy = vi.spyOn(connection, 'fetchEndpoint')
      fetchSpy.mockImplementation(() => {
        return Promise.resolve(pollResponses[pollCount++])
      })

      // Create a direct mock for sleep since spying doesn't work
      const sleepMock = vi.fn().mockResolvedValue(undefined)
      ;(connection as any).sleep = sleepMock

      // Mock Date.now for consistent timing
      const originalDateNow = Date.now
      let dateNowCallCount = 0
      Date.now = vi.fn(() => {
        // Return increasing timestamps to simulate time passing
        return 1000000 + dateNowCallCount++ * 1000
      })

      try {
        // Call the private method directly
        const result = await (connection as any).pollJobCompletion('test-job-123')

        // Verify fetchEndpoint was called the correct number of times
        expect(fetchSpy).toHaveBeenCalledTimes(3)

        // Verify the result is the completed job response
        expect(result).toEqual(pollResponses[2])

        // Verify sleep was called between polls
        expect(sleepMock).toHaveBeenCalledTimes(2)
      } finally {
        // Restore original Date.now
        Date.now = originalDateNow
      }
    })

    it('throws an error when job fails', async () => {
      // Mock response with errors
      const errorResponse = {
        jobComplete: true,
        errors: [{ message: 'Query syntax error' }],
      }

      vi.spyOn(connection, 'fetchEndpoint').mockResolvedValue(errorResponse)

      // Call the private method and expect it to throw
      await expect((connection as any).pollJobCompletion('test-job-123')).rejects.toThrow(
        'Query failed: Query syntax error',
      )
    })
  })
})
