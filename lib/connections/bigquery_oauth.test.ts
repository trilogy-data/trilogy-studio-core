import { describe, it, expect, beforeEach, vi } from 'vitest'
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

  beforeEach(() => {
    connection = new BigQueryOauthConnection('test-connection', 'test-project-id')
    // Mock accessToken
    ;(connection as any).accessToken = 'mock-token'
    // Reset fetch mock
    vi.mocked(fetch).mockReset()
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
    it('processes query results correctly', async () => {
      // Mock response from BigQuery API
      const mockResponse = {
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'name', type: 'STRING', mode: 'NULLABLE' },
            { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
            {
              name: 'tags',
              type: 'STRING',
              mode: 'REPEATED',
            },
            {
              name: 'metadata',
              type: 'RECORD',
              mode: 'NULLABLE',
              fields: [
                { name: 'source', type: 'STRING', mode: 'NULLABLE' },
                { name: 'version', type: 'INTEGER', mode: 'NULLABLE' },
              ],
            },
          ],
        },
        rows: [
          {
            f: [
              { v: '1' },
              { v: 'Test Item' },
              { v: '1609459200' },
              { v: [{ v: 'tag1' }, { v: 'tag2' }] },
              { v: { f: [{ v: 'web' }, { v: '2' }] } },
            ],
          },
        ],
      }

      // Mock the fetchEndpoint method
      vi.spyOn(connection, 'fetchEndpoint').mockResolvedValue(mockResponse)

      // Mock the processing methods
      const fieldToResultColumnSpy = vi.spyOn(connection, 'fieldToResultColumn')
      const processRowSpy = vi.spyOn(connection, 'processRow')

      const sql = 'SELECT * FROM `test_dataset.test_table` LIMIT 1'
      const result = await connection.query_core(sql)

      // Verify fetchEndpoint was called correctly
      expect(connection.fetchEndpoint).toHaveBeenCalledWith(
        'queries',
        {
          query: sql,
          useLegacySql: false,
        },
        'POST',
      )

      // Verify fieldToResultColumn was called for each field + recursion
      expect(fieldToResultColumnSpy).toHaveBeenCalledTimes(8)

      // Verify processRow was called for each row + nested
      expect(processRowSpy).toHaveBeenCalledTimes(4)

      // Verify the result is a Results instance
      expect(result).toBeInstanceOf(Results)
      expect(result.headers).toBeInstanceOf(Map)
      expect(result.headers.size).toBe(5)
      expect(result.data.length).toBe(1)
    })

    it('handles empty results correctly', async () => {
      // Mock response with no rows
      const mockResponse = {
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
  })
})
