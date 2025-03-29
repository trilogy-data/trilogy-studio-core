import { SnowflakeConnectionBase } from './snowflake'
import { ColumnType, Results } from '../editors/results'
import { DateTime } from 'luxon'
import { describe, beforeEach, it, expect, vi } from 'vitest'

// Mock implementation of the abstract class for testing
//@ts-ignore
class MockSnowflakeConnection extends SnowflakeConnectionBase {
  constructor() {
    super('test-connection', 'snowflake', 'test-account')
  }

  async connect(): Promise<boolean> {
    return true
  }

  protected getAuthHeaders(): Record<string, string> {
    return {}
  }

  // protected async executeQuery(sql: string): Promise<any> {
  //   return {};
  // }

  // protected extractMetadata(resultData: any): any[] {
  //   return [];
  // }

  // protected extractRows(resultData: any): any[][] {
  //   return [];
  // }

  protected getSchema(): string | undefined {
    return 'TEST_SCHEMA'
  }
}

describe('SnowflakeConnectionBase', () => {
  let connection: MockSnowflakeConnection

  beforeEach(() => {
    connection = new MockSnowflakeConnection()
  })

  describe('objectToType', () => {
    it('correctly identifies string type', () => {
      expect(connection.objectToType('test')).toBe(ColumnType.STRING)
    })

    it('correctly identifies integer type', () => {
      expect(connection.objectToType(42)).toBe(ColumnType.INTEGER)
    })

    it('correctly identifies float type', () => {
      expect(connection.objectToType(42.5)).toBe(ColumnType.FLOAT)
    })

    it('correctly identifies boolean type', () => {
      expect(connection.objectToType(true)).toBe(ColumnType.BOOLEAN)
    })

    it('correctly identifies date type', () => {
      expect(connection.objectToType(new Date())).toBe(ColumnType.DATETIME)
    })

    it('correctly identifies array type', () => {
      expect(connection.objectToType([1, 2, 3])).toBe(ColumnType.ARRAY)
    })

    it('correctly identifies object/struct type', () => {
      expect(connection.objectToType({ key: 'value' })).toBe(ColumnType.STRUCT)
    })

    it('defaults to string for null values', () => {
      expect(connection.objectToType(null)).toBe(ColumnType.STRING)
    })

    it('returns unknown for undefined', () => {
      expect(connection.objectToType(undefined)).toBe(ColumnType.UNKNOWN)
    })
  })

  describe('columnsFromObject', () => {
    it('correctly maps primitive types in an object', () => {
      const obj = {
        string: 'test',
        integer: 42,
        float: 3.14,
        boolean: true,
        nullValue: null,
      }

      const headers = connection.columnsFromObject(obj)

      expect(headers.get('string')?.type).toBe(ColumnType.STRING)
      expect(headers.get('integer')?.type).toBe(ColumnType.INTEGER)
      expect(headers.get('float')?.type).toBe(ColumnType.FLOAT)
      expect(headers.get('boolean')?.type).toBe(ColumnType.BOOLEAN)
      expect(headers.get('nullValue')?.type).toBe(ColumnType.STRING)
    })

    it('correctly maps nested objects', () => {
      const obj = {
        person: {
          name: 'John',
          age: 30,
        },
      }

      const headers = connection.columnsFromObject(obj)
      const personColumn = headers.get('person')

      expect(personColumn?.type).toBe(ColumnType.STRUCT)
      expect(personColumn?.children?.size).toBe(2)
      expect(personColumn?.children?.get('name')?.type).toBe(ColumnType.STRING)
      expect(personColumn?.children?.get('age')?.type).toBe(ColumnType.INTEGER)
    })

    it('correctly maps arrays', () => {
      const obj = {
        numbers: [{ v: 1 }, { v: 2 }, { v: 3 }],
      }

      const headers = connection.columnsFromObject(obj)
      const arrayColumn = headers.get('numbers')

      expect(arrayColumn?.type).toBe(ColumnType.ARRAY)
      expect(arrayColumn?.children?.get('v')?.type).toBe(ColumnType.INTEGER)
    })

    it('handles empty arrays', () => {
      const obj = {
        emptyArray: [],
      }

      const headers = connection.columnsFromObject(obj)
      const arrayColumn = headers.get('emptyArray')

      expect(arrayColumn?.type).toBe(ColumnType.ARRAY)
      expect(arrayColumn?.children?.get('v')?.type).toBe(ColumnType.STRING)
    })

    it('correctly maps arrays of objects', () => {
      const obj = {
        employees: [
          {
            v: {
              name: 'John',
              position: 'Developer',
            },
          },
        ],
      }

      const headers = connection.columnsFromObject(obj)
      const arrayColumn = headers.get('employees')

      expect(arrayColumn?.type).toBe(ColumnType.ARRAY)
      expect(arrayColumn?.children?.get('v')?.type).toBe(ColumnType.STRUCT)

      const childrenMap = arrayColumn?.children?.get('v')?.children
      expect(childrenMap?.get('name')?.type).toBe(ColumnType.STRING)
      expect(childrenMap?.get('position')?.type).toBe(ColumnType.STRING)
    })

    it('returns empty map for non-object values', () => {
      expect(connection.columnsFromObject('string')).toEqual(new Map())
      expect(connection.columnsFromObject(null)).toEqual(new Map())
      expect(connection.columnsFromObject(undefined)).toEqual(new Map())
    })
  })

  describe('processValue', () => {
    it('returns null or undefined values as is', () => {
      expect(connection.processValue(null, { name: 'test', type: ColumnType.STRING })).toBe(null)
      expect(connection.processValue(undefined, { name: 'test', type: ColumnType.STRING })).toBe(
        undefined,
      )
    })

    it('processes date values', () => {
      const timestamp = 1612345678 // Unix timestamp in seconds
      const result = connection.processValue(timestamp, { name: 'test', type: ColumnType.DATE })

      expect(result).toBeInstanceOf(DateTime)
      expect(result.toMillis()).toBe(timestamp * 1000)
    })

    it('processes datetime values', () => {
      const timestamp = 1612345678 // Unix timestamp in seconds
      const result = connection.processValue(timestamp, { name: 'test', type: ColumnType.DATETIME })

      expect(result).toBeInstanceOf(DateTime)
      expect(result.toMillis()).toBe(timestamp * 1000)
    })

    it('processes integer values', () => {
      expect(connection.processValue('42', { name: 'test', type: ColumnType.INTEGER })).toBe(42)
    })

    it('processes float values', () => {
      expect(connection.processValue('3.14', { name: 'test', type: ColumnType.FLOAT })).toBe(3.14)
    })

    it('processes boolean values', () => {
      expect(connection.processValue('true', { name: 'test', type: ColumnType.BOOLEAN })).toBe(true)
      expect(connection.processValue('false', { name: 'test', type: ColumnType.BOOLEAN })).toBe(
        false,
      )
    })

    it('processes string values', () => {
      expect(connection.processValue('test', { name: 'test', type: ColumnType.STRING })).toBe(
        'test',
      )
    })

    it('processes array values with undefined elements', () => {
      const arrayJson = '[ 1, undefined, "abc" ]'
      const result = connection.processValue(arrayJson, { name: 'test', type: ColumnType.ARRAY })

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(3)
      expect(result[0]).toEqual({ v: 1 })
      expect(result[1]).toEqual({ v: null }) // undefined gets converted to null
      expect(result[2]).toEqual({ v: 'abc' })
    })

    it('processes struct values with undefined elements', () => {
      const structJson = '{ "a": 1, "b": undefined, "c": "abc" }'
      const result = connection.processValue(structJson, { name: 'test', type: ColumnType.STRUCT })

      expect(typeof result).toBe('object')
      expect(result.a).toBe(1)
      expect(result.b).toBe(null) // undefined gets converted to null
      expect(result.c).toBe('abc')
    })

    it('processes nested arrays correctly', () => {
      const nestedArrayJson = '[[1, 2], [3, undefined]]'
      const result = connection.processValue(nestedArrayJson, {
        name: 'test',
        type: ColumnType.ARRAY,
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
      expect(result[0]).toEqual({ v: [{ v: 1 }, { v: 2 }] })
      expect(result[1]).toEqual({ v: [{ v: 3 }, { v: null }] })
    })

    it('processes complex nested structures', () => {
      const complexJson = `{
        "name": "John",
        "age": 30,
        "hobbies": ["skiing", undefined, "reading"],
        "employment": {
          "current": "Company X",
          "previous": undefined
        }
      }`

      const result = connection.processValue(complexJson, { name: 'test', type: ColumnType.STRUCT })

      expect(typeof result).toBe('object')
      expect(result.name).toBe('John')
      expect(result.age).toBe(30)
      expect(Array.isArray(result.hobbies)).toBe(true)
      expect(result.hobbies[0]).toEqual({ v: 'skiing' })
      expect(result.hobbies[1]).toEqual({ v: null }) // undefined gets converted to null
      expect(result.hobbies[2]).toEqual({ v: 'reading' })
      expect(result.employment.current).toBe('Company X')
      expect(result.employment.previous).toBe(null) // undefined gets converted to null
    })
  })

  describe('processRawJSON', () => {
    it('processes arrays into objects with v key', () => {
      const arr = [1, 2, 3]
      const result = connection.processRawJSON(arr)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(3)
      expect(result[0]).toEqual({ v: 1 })
      expect(result[1]).toEqual({ v: 2 })
      expect(result[2]).toEqual({ v: 3 })
    })

    it('processes nested arrays correctly', () => {
      const nestedArr = [1, [2, 3], 4]
      const result = connection.processRawJSON(nestedArr)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(3)
      expect(result[0]).toEqual({ v: 1 })
      expect(result[1]).toEqual({ v: [{ v: 2 }, { v: 3 }] })
      expect(result[2]).toEqual({ v: 4 })
    })

    it('processes objects with array properties', () => {
      const obj = {
        name: 'John',
        scores: [85, 90, 95],
      }

      const result = connection.processRawJSON(obj)

      expect(typeof result).toBe('object')
      expect(result.name).toBe('John')
      expect(Array.isArray(result.scores)).toBe(true)
      expect(result.scores[0]).toEqual({ v: 85 })
      expect(result.scores[1]).toEqual({ v: 90 })
      expect(result.scores[2]).toEqual({ v: 95 })
    })

    it('handles complex nested objects with arrays', () => {
      const complex = {
        person: {
          name: 'John',
          hobbies: ['skiing', 'reading'],
          employment: {
            history: [
              { company: 'A', years: [2018, 2019] },
              { company: 'B', years: [2020, 2021] },
            ],
          },
        },
      }

      const result = connection.processRawJSON(complex)

      expect(typeof result).toBe('object')
      expect(result.person.name).toBe('John')
      expect(result.person.hobbies[0]).toEqual({ v: 'skiing' })
      expect(result.person.hobbies[1]).toEqual({ v: 'reading' })
      expect(result.person.employment.history[0].v.company).toBe('A')
      expect(result.person.employment.history[0].v.years[0]).toEqual({ v: 2018 })
      expect(result.person.employment.history[1].v.company).toBe('B')
      expect(result.person.employment.history[1].v.years[1]).toEqual({ v: 2021 })
    })

    it('returns non-array, non-object values as is', () => {
      expect(connection.processRawJSON('test')).toBe('test')
      expect(connection.processRawJSON(42)).toBe(42)
      expect(connection.processRawJSON(true)).toBe(true)
      expect(connection.processRawJSON(null)).toBe(null)
      expect(connection.processRawJSON(undefined)).toBe(undefined)
    })
  })

  describe('query_core with example response', () => {
    it('correctly processes the example Snowflake response', async () => {
      // Mock the executeQuery method to return our example response
      const mockResponse = {
        resultSetMetaData: {
          numRows: 1,
          format: 'jsonv2',
          partitionInfo: [
            {
              rowCount: 1,
              uncompressedSize: 619,
            },
          ],
          rowType: [
            {
              name: 'NAME',
              type: 'text',
            },
            {
              name: 'TEST',
              type: 'array',
            },
            {
              name: 'TEST_TWO',
              type: 'array',
            },
            {
              name: 'HOBBY_DEBUGZ',
              type: 'object',
            },
            {
              name: 'PERSON_DETAILS',
              type: 'object',
            },
          ],
        },
        data: [
          [
            'John',
            '[\n  1,\n  2,\n  3,\n  4\n]',
            '[\n  1,\n  undefined,\n  "abc"\n]',
            '{\n  "hobbies": [\n    "skiing",\n    "reading"\n  ]\n}',
            '{\n  "age": 25,\n  "city": "New York",\n  "employment_history": [\n    {\n      "date": "2020-01-15",\n      "employer": "Company A",\n      "salary": 60000\n    },\n    {\n      "date": "2021-06-01",\n      "employer": "Company B",\n      "salary": 75000\n    },\n    {\n      "date": "2023-03-10",\n      "employer": "Company C",\n      "salary": 90000\n    }\n  ],\n  "hobbies": [\n    "skiing",\n    "reading"\n  ]\n}',
          ],
        ],
        code: '090001',
        message: 'Statement executed successfully.',
      }

      // Mock implementation
      //@ts-ignore
      vi.spyOn(connection, 'executeQuery').mockResolvedValue(mockResponse)
      //@ts-ignore
      vi.spyOn(connection, 'extractMetadata').mockReturnValue(
        //@ts-ignore
        mockResponse.resultSetMetaData.rowType,
      )
      //@ts-ignore
      vi.spyOn(connection, 'extractRows').mockReturnValue(mockResponse.data)

      // Execute query_core
      const results = await connection.query_core('SELECT * FROM test_table')

      // Verify results
      expect(results).toBeInstanceOf(Results)
      expect(results.headers.size).toBe(5)

      // Check first row data
      const firstRow = results.data[0]

      // Check NAME column
      expect(firstRow.NAME).toBe('John')

      // Check TEST array
      expect(Array.isArray(firstRow.TEST)).toBe(true)
      expect(firstRow.TEST.length).toBe(4)
      expect(firstRow.TEST[0]).toEqual({ v: 1 })
      expect(firstRow.TEST[3]).toEqual({ v: 4 })

      // Check TEST_TWO array with undefined value (converted to null)
      expect(Array.isArray(firstRow.TEST_TWO)).toBe(true)
      expect(firstRow.TEST_TWO.length).toBe(3)
      expect(firstRow.TEST_TWO[0]).toEqual({ v: 1 })
      expect(firstRow.TEST_TWO[1]).toEqual({ v: null }) // undefined converted to null
      expect(firstRow.TEST_TWO[2]).toEqual({ v: 'abc' })

      // Check HOBBY_DEBUGZ object with nested array
      expect(typeof firstRow.HOBBY_DEBUGZ).toBe('object')
      expect(Array.isArray(firstRow.HOBBY_DEBUGZ.hobbies)).toBe(true)
      expect(firstRow.HOBBY_DEBUGZ.hobbies[0]).toEqual({ v: 'skiing' })
      expect(firstRow.HOBBY_DEBUGZ.hobbies[1]).toEqual({ v: 'reading' })

      // Check PERSON_DETAILS with complex nested structure
      expect(typeof firstRow.PERSON_DETAILS).toBe('object')
      expect(firstRow.PERSON_DETAILS.age).toBe(25)
      expect(firstRow.PERSON_DETAILS.city).toBe('New York')

      // Check nested employment_history array
      expect(Array.isArray(firstRow.PERSON_DETAILS.employment_history)).toBe(true)
      expect(firstRow.PERSON_DETAILS.employment_history.length).toBe(3)
      expect(firstRow.PERSON_DETAILS.employment_history[0].v.date).toBe('2020-01-15')
      expect(firstRow.PERSON_DETAILS.employment_history[0].v.employer).toBe('Company A')
      expect(firstRow.PERSON_DETAILS.employment_history[0].v.salary).toBe(60000)

      // Verify column types in headers are correctly identified
      expect(results.headers.get('NAME')?.type).toBe(ColumnType.STRING)
      expect(results.headers.get('TEST')?.type).toBe(ColumnType.ARRAY)
      expect(results.headers.get('TEST_TWO')?.type).toBe(ColumnType.ARRAY)
      expect(results.headers.get('HOBBY_DEBUGZ')?.type).toBe(ColumnType.STRUCT)
      expect(results.headers.get('PERSON_DETAILS')?.type).toBe(ColumnType.STRUCT)

      // Check that array headers have children
      expect(results.headers.get('TEST')?.children?.get('v')?.type).toBe(ColumnType.STRING)
      expect(results.headers.get('TEST_TWO')?.children?.get('v')?.type).toBe(ColumnType.STRING)

      // Check that struct headers have children
      const hobbyDebugzChildren = results.headers.get('HOBBY_DEBUGZ')?.children
      expect(hobbyDebugzChildren?.get('hobbies')?.type).toBe(ColumnType.ARRAY)

      const personDetailsChildren = results.headers.get('PERSON_DETAILS')?.children
      expect(personDetailsChildren?.get('age')?.type).toBe(ColumnType.INTEGER)
      expect(personDetailsChildren?.get('city')?.type).toBe(ColumnType.STRING)
      expect(personDetailsChildren?.get('employment_history')?.type).toBe(ColumnType.ARRAY)
      expect(personDetailsChildren?.get('hobbies')?.type).toBe(ColumnType.ARRAY)
    })
  })
})
