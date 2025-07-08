import { describe, it, expect } from 'vitest'
import { objectToSqlExpression } from './conditions'
import { EscapePlaceholder } from '../connections/base'

describe('objectToSqlExpression', () => {
  // Test single object cases
  describe('single object input', () => {
    it('should handle an empty object', () => {
      expect(objectToSqlExpression({})).toBe('')
    })

    it('should handle a single key-value pair', () => {
      expect(objectToSqlExpression({ id: 1 })).toBe('id=1')
    })

    it('should handle multiple key-value pairs', () => {
      expect(objectToSqlExpression({ id: 1, name: 'test' })).toBe("id=1 AND name='''test'''")
    })

    it('should handle null values', () => {
      expect(objectToSqlExpression({ id: null })).toBe('id IS NULL')
    })

    it('should handle string values', () => {
      expect(objectToSqlExpression({ name: 'John' })).toBe("name='''John'''")
    })

    it('should handle numeric values', () => {
      expect(objectToSqlExpression({ age: 30, score: 95.5 })).toBe('age=30 AND score=95.5')
    })

    it('should handle boolean values', () => {
      expect(objectToSqlExpression({ active: true, deleted: false })).toBe(
        'active=true AND deleted=false',
      )
    })

    it('should escape single quotes in string values', () => {
      expect(objectToSqlExpression({ name: "O'Connor" })).toBe(
        `name='''O${EscapePlaceholder}Connor'''`,
      )
    })

    it('should handle complex objects by converting to JSON strings', () => {
      const complexObj = { data: { x: 1, y: 2 } }
      expect(objectToSqlExpression(complexObj)).toBe('data=\'{"x":1,"y":2}\'')
    })

    it('should handle arrays by converting to JSON strings', () => {
      const arrayObj = { tags: [1, 2, 3] }
      expect(objectToSqlExpression(arrayObj)).toBe('tags between 1 and 3')
    })

    it('should handle mixed data types in a single object', () => {
      const mixedObj = {
        id: 1,
        name: 'Test',
        active: true,
        tags: [1, 2, 3],
        metadata: null,
      }
      expect(objectToSqlExpression(mixedObj)).toBe(
        "id=1 AND name='''Test''' AND active=true AND tags between 1 and 3 AND metadata IS NULL",
      )
    })
  })

  // Test array of objects cases
  describe('array of objects input', () => {
    it('should handle an empty array', () => {
      expect(objectToSqlExpression([])).toBe('')
    })

    it('should handle array with a single empty object', () => {
      expect(objectToSqlExpression([{}])).toBe('')
    })

    it('should handle array with a single object with one property', () => {
      expect(objectToSqlExpression([{ id: 1 }])).toBe('id=1')
    })

    it('should handle multiple objects with different keys', () => {
      expect(objectToSqlExpression([{ id: 1 }, { name: 'test' }])).toBe("id=1 AND name='''test'''")
    })

    it('should group multiple values for the same key with OR in parentheses', () => {
      expect(objectToSqlExpression([{ id: 1 }, { id: 2 }])).toBe('(id=1 OR id=2)')
    })

    it('should handle multiple objects with some shared keys', () => {
      const result = objectToSqlExpression([
        { id: 1, type: 'user' },
        { id: 2, status: 'active' },
      ])
      expect(result).toBe("(id=1 OR id=2) AND type='''user''' AND status='''active'''")
    })

    it('should handle complex mixed case with various data types', () => {
      const result = objectToSqlExpression([
        { id: 1, name: 'John', active: true },
        { id: 2, name: "O'Connor", tags: [1, 2] },
        { status: 'pending', metadata: null },
      ])

      expect(result).toBe(
        `(id=1 OR id=2) AND (name='''John''' OR name='''O${EscapePlaceholder}Connor''') AND active=true AND tags between 1 and 2 AND status='''pending''' AND metadata IS NULL`,
      )
    })
  })

  // Edge cases and special scenarios
  describe('edge cases', () => {
    it('should handle objects with empty string values', () => {
      expect(objectToSqlExpression({ name: '' })).toBe(`name=''''''`)
    })

    it('should handle objects with special characters in string values', () => {
      expect(objectToSqlExpression({ query: 'SELECT * FROM users' })).toBe(
        "query='''SELECT * FROM users'''",
      )
    })

    it('should handle objects with string values containing JSON', () => {
      expect(objectToSqlExpression({ data: '{"name":"John"}' })).toBe(
        "data='''{\"name\":\"John\"}'''",
      )
    })

    it('should handle objects with undefined values', () => {
      // TypeScript may complain about undefined, but testing for robustness
      // @ts-ignore
      expect(objectToSqlExpression({ id: undefined })).toBe('id IS NULL')
    })

    it('should handle deeply nested objects', () => {
      const deepObj = {
        data: {
          user: {
            profile: {
              preferences: {
                theme: 'dark',
              },
            },
          },
        },
      }
      expect(objectToSqlExpression(deepObj)).toMatch(/data='.*'/)
      expect(objectToSqlExpression(deepObj)).toContain('"theme":"dark"')
    })
  })
})
