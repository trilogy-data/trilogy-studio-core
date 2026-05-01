import { describe, it, expect } from 'vitest'
import { buildConnectionTree } from './helpers'
import { Database, Schema, Table, AssetType } from './base'

function makeConnection(overrides: {
  name: string
  type: string
  hasSchema: boolean
  databases: Database[]
}) {
  return {
    id: `local:${overrides.name}`,
    name: overrides.name,
    type: overrides.type,
    hasSchema: overrides.hasSchema,
    connected: true,
    deleted: false,
    databases: overrides.databases,
  } as any
}

function makeTable(name: string, schema: string, database: string): Table {
  return new Table(name, schema, database, [], null, AssetType.TABLE)
}

describe('buildConnectionTree', () => {
  describe('schema-less connections (hasSchema=false)', () => {
    const tables = [makeTable('artists', 'main', 'main'), makeTable('albums', 'main', 'main')]
    const schema = new Schema('main', tables, 'main')
    const db = new Database('main', [schema])

    const conn = makeConnection({
      name: 'sqlite-test',
      type: 'sqlite',
      hasSchema: false,
      databases: [db],
    })

    it('skips the schema node and shows tables at indent 2', () => {
      const collapsed = { 'local:sqlite-test': false, 'local:sqlite-test+main': false }
      const tree = buildConnectionTree([conn], collapsed, {}, {})

      const schemaNodes = tree.filter((n) => n.type === 'schema')
      expect(schemaNodes).toHaveLength(0)

      const tableNodes = tree.filter((n) => n.type === 'table')
      expect(tableNodes).toHaveLength(2)
      expect(tableNodes[0].indent).toBe(2)
      const tableNames = tableNodes.map((n) => n.name).sort()
      expect(tableNames).toEqual(['albums', 'artists'])
    })

    it('shows table count on the database node', () => {
      const collapsed = { 'local:sqlite-test': false, 'local:sqlite-test+main': false }
      const tree = buildConnectionTree([conn], collapsed, {}, {})

      const dbNode = tree.find((n) => n.type === 'database')
      expect(dbNode).toBeDefined()
      expect(dbNode!.count).toBe(2)
    })

    it('handles empty schemas without crashing', () => {
      const emptyDb = new Database('main', [])
      const emptyConn = makeConnection({
        name: 'sqlite-empty',
        type: 'sqlite',
        hasSchema: false,
        databases: [emptyDb],
      })

      const collapsed = { 'local:sqlite-empty': false, 'local:sqlite-empty+main': false }
      const tree = buildConnectionTree([emptyConn], collapsed, {}, {})

      const dbNode = tree.find((n) => n.type === 'database')
      expect(dbNode).toBeDefined()
      expect(dbNode!.count).toBe(0)
    })

    it('hides tables when database is collapsed', () => {
      const collapsed = { 'local:sqlite-test': false, 'local:sqlite-test+main': true }
      const tree = buildConnectionTree([conn], collapsed, {}, {})

      const tableNodes = tree.filter((n) => n.type === 'table')
      expect(tableNodes).toHaveLength(0)
    })
  })

  describe('schema connections (hasSchema=true)', () => {
    const tables = [makeTable('users', 'public', 'mydb'), makeTable('orders', 'public', 'mydb')]
    const schema = new Schema('public', tables, 'mydb')
    const db = new Database('mydb', [schema])

    const conn = makeConnection({
      name: 'pg-test',
      type: 'postgres',
      hasSchema: true,
      databases: [db],
    })

    it('includes the schema node at indent 2 and tables at indent 3', () => {
      const collapsed = {
        'local:pg-test': false,
        'local:pg-test+mydb': false,
        'local:pg-test+mydb+public': false,
      }
      const tree = buildConnectionTree([conn], collapsed, {}, {})

      const schemaNodes = tree.filter((n) => n.type === 'schema')
      expect(schemaNodes).toHaveLength(1)
      expect(schemaNodes[0].indent).toBe(2)
      expect(schemaNodes[0].name).toBe('public')

      const tableNodes = tree.filter((n) => n.type === 'table')
      expect(tableNodes).toHaveLength(2)
      expect(tableNodes[0].indent).toBe(3)
    })

    it('shows schema count on the database node', () => {
      const collapsed = { 'local:pg-test': false, 'local:pg-test+mydb': false }
      const tree = buildConnectionTree([conn], collapsed, {}, {})

      const dbNode = tree.find((n) => n.type === 'database')
      expect(dbNode!.count).toBe(1)
    })

    it('hides tables when schema is collapsed', () => {
      const collapsed = {
        'local:pg-test': false,
        'local:pg-test+mydb': false,
        'local:pg-test+mydb+public': true,
      }
      const tree = buildConnectionTree([conn], collapsed, {}, {})

      const tableNodes = tree.filter((n) => n.type === 'table')
      expect(tableNodes).toHaveLength(0)
    })
  })
})
