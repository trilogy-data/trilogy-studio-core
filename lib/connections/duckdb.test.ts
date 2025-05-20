import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { DateTime } from 'luxon'
import DuckDBConnection from './duckdb'
import { Results, ColumnType } from '../editors/results'
import { AssetType } from './base' // Ensure AssetType is imported correctly
// Mock the duckdb module
vi.mock('@duckdb/duckdb-wasm', () => {
  return {
    getJsDelivrBundles: vi.fn().mockReturnValue({}),
    selectBundle: vi.fn().mockResolvedValue({
      mainWorker: 'mock-worker-url',
      mainModule: 'mock-module',
      pthreadWorker: 'mock-pthread-worker',
    }),
    AsyncDuckDB: vi.fn().mockImplementation(() => ({
      instantiate: vi.fn().mockResolvedValue(true),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn(),
      }),
    })),
    ConsoleLogger: vi.fn(),
  }
})

// Mock the URL and Worker globals
global.URL = {
  createObjectURL: vi.fn().mockReturnValue('mock-object-url'),
} as any

global.Worker = vi.fn() as any

// Create a helper function to generate mock query results
//@ts-ignore
function createMockQueryResult(schema, data) {
  return {
    schema: {
      fields: schema,
    },
    //@ts-ignore
    toArray: () =>
      data.map((row: Record<string, any>) => ({
        toJSON: () => row,
      })),
  }
}

describe('DuckDBConnection', () => {
  //@ts-ignore
  let connection

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Create a new connection instance
    connection = new DuckDBConnection('test-connection')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      //@ts-ignore
      expect(connection.name).toBe('test-connection')
      //@ts-ignore
      expect(connection.type).toBe('duckdb')
      //@ts-ignore
      expect(connection.query_type).toBe('duckdb')
    })

    it('should set model if provided', () => {
      const connectionWithModel = new DuckDBConnection('test-connection', 'test-model')
      expect(connectionWithModel.model).toBe('test-model')
    })
  })

  describe('fromJSON', () => {
    it('should create a connection from JSON with name', () => {
      const conn = DuckDBConnection.fromJSON({ name: 'json-connection', model: null })
      expect(conn.name).toBe('json-connection')
      expect(conn.type).toBe('duckdb')
      expect(conn.model).toBeNull()
    })

    it('should create a connection from JSON with name and model', () => {
      const conn = DuckDBConnection.fromJSON({ name: 'json-connection', model: 'json-model' })
      expect(conn.name).toBe('json-connection')
      expect(conn.model).toBe('json-model')
    })
  })

  describe('toJSON', () => {
    it('should convert connection to JSON', () => {
      //@ts-ignore
      const json = connection.toJSON()
      expect(json).toEqual({
        name: 'test-connection',
        type: 'duckdb',
        model: null,
      })
    })
  })

  describe('processSchema', () => {
    it('should process simple schema correctly', () => {
      const schema = [
        { name: 'id', type: { typeId: 2 } },
        { name: 'name', type: { typeId: 5 } },
        { name: 'active', type: { typeId: 6 } },
      ]
      //@ts-ignore
      const headers = connection.processSchema(schema)

      expect(headers.size).toBe(3)
      expect(headers.get('id').type).toBe(ColumnType.INTEGER)
      expect(headers.get('name').type).toBe(ColumnType.STRING)
      expect(headers.get('active').type).toBe(ColumnType.BOOLEAN)
    })

    it('should process nested schema with arrays', () => {
      const schema = [
        { name: 'id', type: { typeId: 2 } },
        {
          name: 'tags',
          type: {
            typeId: 12,
            children: [{ name: 'l', type: { typeId: 5 } }],
          },
        },
      ]
      //@ts-ignore
      const headers = connection.processSchema(schema)

      expect(headers.size).toBe(2)
      expect(headers.get('id').type).toBe(ColumnType.INTEGER)
      expect(headers.get('tags').type).toBe(ColumnType.ARRAY)
      expect(headers.get('tags').children.get('l').type).toBe(ColumnType.STRING)
    })

    it('should process nested schema with structs', () => {
      const schema = [
        { name: 'id', type: { typeId: 2 } },
        {
          name: 'metadata',
          type: {
            typeId: 13,
            children: [
              { name: 'created_at', type: { typeId: 10 } },
              { name: 'updated_at', type: { typeId: 10 } },
            ],
          },
        },
      ]
      //@ts-ignore
      const headers = connection.processSchema(schema)

      expect(headers.size).toBe(2)
      expect(headers.get('id').type).toBe(ColumnType.INTEGER)
      expect(headers.get('metadata').type).toBe(ColumnType.STRUCT)
      expect(headers.get('metadata').children.get('created_at').type).toBe(ColumnType.DATETIME)
      expect(headers.get('metadata').children.get('updated_at').type).toBe(ColumnType.DATETIME)
    })
  })

  describe('processRow', () => {
    it('should process basic row types correctly', () => {
      const headers = new Map([
        ['id', { name: 'id', type: ColumnType.INTEGER }],
        ['name', { name: 'name', type: ColumnType.STRING }],
        ['active', { name: 'active', type: ColumnType.BOOLEAN }],
        ['score', { name: 'score', type: ColumnType.FLOAT, scale: 2 }],
      ])

      const row = {
        id: '42',
        name: 'Test',
        active: true,
        score: 4200,
      }
      //@ts-ignore
      const processedRow = connection.processRow(row, headers)

      expect(processedRow.id).toBe(42)
      expect(processedRow.name).toBe('Test')
      expect(processedRow.active).toBe(true)
      expect(processedRow.score).toBe(42.0) // scaled by 10^2
    })

    it('should handle null values correctly', () => {
      const headers = new Map([
        ['id', { name: 'id', type: ColumnType.INTEGER }],
        ['name', { name: 'name', type: ColumnType.STRING }],
      ])

      const row = {
        id: null,
        name: null,
      }
      //@ts-ignore
      const processedRow = connection.processRow(row, headers)

      expect(processedRow.id).toBeNull()
      expect(processedRow.name).toBeNull()
    })

    it('should process date and datetime types correctly', () => {
      const headers = new Map([
        ['created_date', { name: 'created_date', type: ColumnType.DATE }],
        ['updated_at', { name: 'updated_at', type: ColumnType.DATETIME }],
      ])

      const timestamp = 1609459200000 // 2021-01-01 00:00:00 UTC

      const row = {
        created_date: timestamp,
        updated_at: timestamp,
      }
      //@ts-ignore
      const processedRow = connection.processRow(row, headers)

      expect(processedRow.created_date).toBeInstanceOf(DateTime)
      expect(processedRow.created_date.toISO()).toBe('2021-01-01T00:00:00.000Z')
      expect(processedRow.updated_at).toBeInstanceOf(DateTime)
      expect(processedRow.updated_at.toISO()).toBe('2021-01-01T00:00:00.000Z')
    })

    it('should process array types correctly', () => {
      const innerHeaders = new Map([['l', { name: 'l', type: ColumnType.STRING }]])

      const headers = new Map([
        [
          'tags',
          {
            name: 'tags',
            type: ColumnType.ARRAY,
            children: innerHeaders,
          },
        ],
      ])

      const row = {
        tags: {
          toArray: () => ['tag1', 'tag2', 'tag3'],
        },
      }
      //@ts-ignore
      const processedRow = connection.processRow(row, headers)

      expect(Array.isArray(processedRow.tags)).toBe(true)
      expect(processedRow.tags.length).toBe(3)
      expect(processedRow.tags[0].l).toBe('tag1')
      expect(processedRow.tags[1].l).toBe('tag2')
      expect(processedRow.tags[2].l).toBe('tag3')
    })

    it('should process struct types correctly', () => {
      const metadataHeaders = new Map([
        ['created_at', { name: 'created_at', type: ColumnType.DATETIME }],
        ['updated_at', { name: 'updated_at', type: ColumnType.DATETIME }],
      ])

      const headers = new Map([
        [
          'metadata',
          {
            name: 'metadata',
            type: ColumnType.STRUCT,
            children: metadataHeaders,
          },
        ],
      ])

      const timestamp = 1609459200000 // 2021-01-01 00:00:00 UTC

      const row = {
        metadata: {
          created_at: timestamp,
          updated_at: timestamp,
        },
      }
      //@ts-ignore
      const processedRow = connection.processRow(row, headers)

      expect(processedRow.metadata).toBeDefined()
      expect(processedRow.metadata.created_at).toBeInstanceOf(DateTime)
      expect(processedRow.metadata.created_at.toISO()).toBe('2021-01-01T00:00:00.000Z')
      expect(processedRow.metadata.updated_at).toBeInstanceOf(DateTime)
      expect(processedRow.metadata.updated_at.toISO()).toBe('2021-01-01T00:00:00.000Z')
    })
  })

  describe('query_core', () => {
    it('should process query results correctly', async () => {
      const mockSchema = [
        { name: 'id', type: { typeId: 2 } },
        { name: 'name', type: { typeId: 5 } },
      ]

      const mockData = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ]

      const mockResult = createMockQueryResult(mockSchema, mockData)

      // Set up the mock connection
      //@ts-ignore
      connection.connection = {
        query: vi.fn().mockResolvedValue(mockResult),
      }
      //@ts-ignore
      const results = await connection.query_core('SELECT * FROM test')
      //@ts-ignore
      expect(connection.connection.query).toHaveBeenCalledWith('SELECT * FROM test')
      expect(results).toBeInstanceOf(Results)
      expect(results.headers.size).toBe(2)
      expect(results.headers.get('id').type).toBe(ColumnType.INTEGER)
      expect(results.headers.get('name').type).toBe(ColumnType.STRING)
      expect(results.data.length).toBe(2)
      expect(results.data[0].id).toBe(1)
      expect(results.data[0].name).toBe('Item 1')
      expect(results.data[1].id).toBe(2)
      expect(results.data[1].name).toBe('Item 2')
    })
  })

  describe('mapDuckDBTypeToColumnType', () => {
    it('should map DuckDB types to column types correctly', () => {
      // Directly test the private method by accessing it through "any" type casting
      //@ts-ignore
      const mapType = (connection as any).mapDuckDBTypeToColumnType.bind(connection)

      expect(mapType({ typeId: 2 })).toBe(ColumnType.INTEGER)
      expect(mapType({ typeId: 3 })).toBe(ColumnType.FLOAT)
      expect(mapType({ typeId: 5 })).toBe(ColumnType.STRING)
      expect(mapType({ typeId: 6 })).toBe(ColumnType.BOOLEAN)
      expect(mapType({ typeId: 7 })).toBe(ColumnType.FLOAT)
      expect(mapType({ typeId: 8 })).toBe(ColumnType.DATE)
      expect(mapType({ typeId: 10 })).toBe(ColumnType.DATETIME)
      expect(mapType({ typeId: 12 })).toBe(ColumnType.ARRAY)
      expect(mapType({ typeId: 13 })).toBe(ColumnType.STRUCT)
      expect(mapType({ typeId: 999 })).toBe(ColumnType.UNKNOWN)
    })
  })

  describe('mapDuckDBStringTypeToColumnType', () => {
    it('should map DuckDB string types to column types correctly', () => {
      // Directly test the private method by accessing it through "any" type casting
      //@ts-ignore
      const mapType = (connection as any).mapDuckDBStringTypeToColumnType.bind(connection)

      expect(mapType('VARCHAR')).toBe(ColumnType.STRING)
      expect(mapType('BIGINT')).toBe(ColumnType.INTEGER)
      expect(mapType('DOUBLE')).toBe(ColumnType.FLOAT)
      expect(mapType('BOOLEAN')).toBe(ColumnType.BOOLEAN)
      expect(mapType('FLOAT')).toBe(ColumnType.FLOAT)
      expect(mapType('DATE')).toBe(ColumnType.DATE)
      expect(mapType('TIMESTAMP')).toBe(ColumnType.DATETIME)
      expect(mapType('UNKNOWN_TYPE')).toBe(ColumnType.UNKNOWN)
    })
  })

  describe('getDatabases', () => {
    it('should return mapped database results', async () => {
      const mockData = [{ database_name: 'db1' }, { database_name: 'db2' }]

      const mockResult = createMockQueryResult([], mockData)

      // Set up the mock connection
      //@ts-ignore
      connection.connection = {
        query: vi.fn().mockResolvedValue(mockResult),
      }
      //@ts-ignore
      const databases = await connection.getDatabases()
      //@ts-ignore
      expect(connection.connection.query).toHaveBeenCalledWith('SHOW DATABASES')
      expect(databases.length).toBe(2)
      expect(databases[0].name).toBe('db1')
      expect(databases[1].name).toBe('db2')
    })
  })

  describe('getTables', () => {
    it('should return mapped table results for the specified database', async () => {
      const mockData = [
        {
          table_catalog: 'db1',
          table_name: 'table1',
          TABLE_COMMENT: 'Comment 1',
          table_type: 'BASE TABLE',
        },
        {
          table_catalog: 'db1',
          table_name: 'view1',
          TABLE_COMMENT: 'Comment 2',
          table_type: 'VIEW',
        },
      ]

      const mockResult = createMockQueryResult([], mockData)

      // Set up the mock connection
      //@ts-ignore
      connection.connection = {
        query: vi.fn().mockResolvedValue(mockResult),
      }
      //@ts-ignore
      const tables = await connection.getTables('db1', 'main')
      //@ts-ignore
      expect(connection.connection.query).toHaveBeenCalledWith(
        "SELECT * FROM information_schema.tables where table_catalog='db1' and table_schema='main'",
      )
      expect(tables.length).toBe(2)
      expect(tables[0].name).toBe('table1')
      expect(tables[0].description).toBe('Comment 1')
      expect(tables[0].assetType).toBe(AssetType.TABLE)
      expect(tables[1].name).toBe('view1')
      expect(tables[1].description).toBe('Comment 2')
      expect(tables[1].assetType).toBe(AssetType.VIEW)
    })
  })

  describe('getColumns', () => {
    it('should return mapped column results', async () => {
      const mockData = [
        {
          column_name: 'id',
          column_type: 'BIGINT',
          null: 'NO',
          key: 'PRI',
          default: null,
          extra: 'auto_increment',
        },
        {
          column_name: 'name',
          column_type: 'VARCHAR',
          null: 'YES',
          key: '',
          default: null,
          extra: '',
        },
      ]

      const mockResult = createMockQueryResult([], mockData)

      // Set up the mock connection
      //@ts-ignore
      connection.connection = {
        query: vi.fn().mockResolvedValue(mockResult),
      }
      //@ts-ignore
      const columns = await connection.getColumns('test_db', 'main', 'test_table')
      //@ts-ignore
      expect(connection.connection.query).toHaveBeenCalledWith('DESCRIBE test_db.main.test_table')
      expect(columns.length).toBe(2)
      expect(columns[0].name).toBe('id')
      expect(columns[0].type).toBe('BIGINT')
      expect(columns[0].trilogyType).toBe(ColumnType.INTEGER)
      expect(columns[0].nullable).toBe(false)
      expect(columns[0].primary).toBe(true)
      expect(columns[0].unique).toBe(false)

      expect(columns[1].name).toBe('name')
      expect(columns[1].type).toBe('VARCHAR')
      expect(columns[1].trilogyType).toBe(ColumnType.STRING)
      expect(columns[1].nullable).toBe(true)
      expect(columns[1].primary).toBe(false)
      expect(columns[1].unique).toBe(false)
    })
  })
})
