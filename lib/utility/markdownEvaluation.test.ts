import { describe, it, expect } from 'vitest'
import {
  evaluateExpression,
  evaluateFallback,
  getNestedValue,
  renderMarkdown,
} from './markdownRenderer'
import { Results } from '../editors/results'
describe('Expression Evaluation', () => {
  const sampleData = [
    { name: 'John', age: 30, email: 'john@example.com', profile: { city: 'NYC', country: 'USA' } },
    { name: 'Jane', age: 25, email: 'jane@example.com', profile: { city: 'LA', country: 'USA' } },
    { name: 'Bob', age: null, email: '', profile: { city: 'Chicago' } },
  ]
  const sampleResult = new Results(new Map(), sampleData)

  describe('evaluateExpression', () => {
    it('should evaluate data[index].field patterns', () => {
      expect(evaluateExpression('data[0].name', sampleData)).toBe('John')
      expect(evaluateExpression('data[1].age', sampleData)).toBe(25)
      expect(evaluateExpression('data[2].email', sampleData)).toBe('')
    })

    it('should evaluate data.length', () => {
      expect(evaluateExpression('data.length', sampleData)).toBe(3)
    })

    it('should evaluate simple field names using first row', () => {
      expect(evaluateExpression('name', sampleData)).toBe('John')
      expect(evaluateExpression('age', sampleData)).toBe(30)
    })

    it('should return undefined for non-existent fields', () => {
      expect(evaluateExpression('data[0].nonexistent', sampleData)).toBeUndefined()
      expect(evaluateExpression('data[99].name', sampleData)).toBeUndefined()
      expect(evaluateExpression('nonexistent', sampleData)).toBeUndefined()
    })

    it('should return undefined when loading', () => {
      expect(evaluateExpression('data[0].name', sampleData, true)).toBeUndefined()
    })

    it('should return undefined for unsafe expressions', () => {
      expect(evaluateExpression('data[0].__proto__', sampleData)).toBeUndefined()
      expect(evaluateExpression('eval("test")', sampleData)).toBeUndefined()
      expect(evaluateExpression('window.location', sampleData)).toBeUndefined()
    })

    it('should handle empty or null data', () => {
      expect(evaluateExpression('data[0].name', null)).toBeUndefined()
      expect(evaluateExpression('data[0].name', [])).toBeUndefined()
    })
  })

  describe('evaluateFallback', () => {
    it('should use main value when available', () => {
      expect(evaluateFallback('data[0].name || "Unknown"', sampleData)).toBe('John')
      expect(evaluateFallback('name || "Default"', sampleData)).toBe('John')
    })

    it('should use fallback when main value is undefined', () => {
      expect(evaluateFallback('data[0].nonexistent || "Default"', sampleData)).toBe('Default')
      expect(evaluateFallback('nonexistent || "Fallback"', sampleData)).toBe('Fallback')
    })

    it('should use fallback when main value is null', () => {
      expect(evaluateFallback('data[2].age || "No age"', sampleData)).toBe('No age')
    })

    it('should use fallback when main value is empty string', () => {
      expect(evaluateFallback('data[2].email || "No email"', sampleData)).toBe('No email')
    })

    it('should handle string literals in fallback', () => {
      expect(evaluateFallback('nonexistent || "String literal"', sampleData)).toBe('String literal')
      expect(evaluateFallback("nonexistent || 'Single quotes'", sampleData)).toBe('Single quotes')
    })

    it('should handle field references in fallback', () => {
      expect(evaluateFallback('data[0].nonexistent || data[0].name', sampleData)).toBe('John')
    })

    it('should return loading pills when loading', () => {
      const result = evaluateFallback('data[0].name || "Loading"', sampleData, true)
      expect(result).toContain('loading-pill')
      expect(result).toContain('shimmer')
    })

    it('should handle expressions without fallback', () => {
      expect(evaluateFallback('data[0].name', sampleData)).toBe('John')
      expect(evaluateFallback('nonexistent', sampleData)).toBe('{nonexistent}')
    })
  })

  describe('getNestedValue', () => {
    const nestedData = {
      user: {
        profile: {
          address: {
            city: 'NYC',
            country: 'USA',
          },
          preferences: ['dark', 'compact'],
        },
        name: 'John',
      },
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ],
    }

    it('should access nested object properties', () => {
      expect(getNestedValue(nestedData, 'user.name')).toBe('John')
      expect(getNestedValue(nestedData, 'user.profile.address.city')).toBe('NYC')
      expect(getNestedValue(nestedData, 'user.profile.address.country')).toBe('USA')
    })

    it('should handle array access', () => {
      expect(getNestedValue(nestedData, 'items[0].name')).toBe('Item 1')
      expect(getNestedValue(nestedData, 'items[1].id')).toBe(2)
      expect(getNestedValue(nestedData, 'user.profile.preferences[0]')).toBe('dark')
    })

    it('should return undefined for non-existent paths', () => {
      expect(getNestedValue(nestedData, 'user.nonexistent')).toBeUndefined()
      expect(getNestedValue(nestedData, 'user.profile.nonexistent.deep')).toBeUndefined()
      expect(getNestedValue(nestedData, 'items[99].name')).toBeUndefined()
    })

    it('should handle null/undefined objects safely', () => {
      expect(getNestedValue(null, 'user.name')).toBeUndefined()
      expect(getNestedValue(undefined, 'user.name')).toBeUndefined()
      expect(getNestedValue({}, 'user.name')).toBeUndefined()
    })

    it('should handle single property access', () => {
      expect(getNestedValue(nestedData, 'user')).toBe(nestedData.user)
      expect(getNestedValue({ name: 'test' }, 'name')).toBe('test')
    })
  })

  describe('Simple Template Substitutions', () => {
    it('should replace simple expressions in text', () => {
      const template = 'Hello {data[0].name}, you are {data[0].age} years old.'
      const result = renderMarkdown(template, sampleResult)
      expect(result).toBe('Hello John, you are 30 years old.')
    })

    it('should handle multiple expressions', () => {
      const template = '{data[0].name} ({data[0].email}) and {data[1].name} ({data[1].email})'
      const result = renderMarkdown(template, sampleResult)
      expect(result).toBe('John (john@example.com) and Jane (jane@example.com)')
    })

    it('should handle fallback expressions in simple substitutions', () => {
      const template =
        'Name: {data[0].nonexistent || "Unknown"}, Age: {data[2].age || "Not specified"}'
      const result = renderMarkdown(template, sampleResult)
      expect(result).toBe('Name: Unknown, Age: Not specified')
    })

    it('should preserve unmatched expressions', () => {
      const template = 'Hello {data[0].name} and {unmatched.expression}'
      const result = renderMarkdown(template, sampleResult)
      expect(result).toBe('Hello John and {unmatched.expression}')
    })

    it('should handle edge cases with braces', () => {
      const template = 'Code: {function() { return true; }} and {data[0].name}'
      const result = renderMarkdown(template, sampleResult)
      expect(result).toContain('John')
      expect(result).toContain('function() { return true; }')
    })
  })
})
