import { describe, it, expect } from 'vitest'
import { escapeHtml, sanitizeHtml, renderMarkdown } from './markdownRenderer'
import { createResults } from './testHelpers'
describe('Security and Validation', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert("xss")&lt;/script&gt;',
      )
      expect(escapeHtml('Hello & "World"')).toBe('Hello &amp; "World"')
      expect(escapeHtml("It's a 'test'")).toBe("It's a 'test'")
    })

    it('should handle non-string inputs', () => {
      expect(escapeHtml(123 as any)).toBe('123')
      expect(escapeHtml(null as any)).toBe('null')
      expect(escapeHtml(undefined as any)).toBe('undefined')
    })

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('')
    })
  })

  describe('sanitizeHtml', () => {
    it('should allow safe HTML tags', () => {
      const safeHtml = '<p>Hello <strong>world</strong></p>'
      expect(sanitizeHtml(safeHtml)).toBe(safeHtml)
    })

    it('should remove dangerous script tags', () => {
      const dangerousHtml = '<p>Hello</p><script>alert("xss")</script>'
      expect(sanitizeHtml(dangerousHtml)).toBe('<p>Hello</p>')
    })

    it('should remove dangerous event handlers', () => {
      const dangerousHtml = '<p onclick="alert(\'xss\')">Click me</p>'
      expect(sanitizeHtml(dangerousHtml)).toBe('<p>Click me</p>')
    })

    it('should allow safe SVG elements and attributes', () => {
      const svgHtml =
        '<svg width="100" height="100"><rect x="10" y="10" width="30" height="30" fill="red"/></svg>'
      expect(sanitizeHtml(svgHtml)).toContain('<svg')
      expect(sanitizeHtml(svgHtml)).toContain('<rect')
    })

    it('should remove forbidden tags', () => {
      const forbiddenHtml = '<iframe src="evil.com"></iframe><form><input type="text"></form>'
      expect(sanitizeHtml(forbiddenHtml)).toBe('')
    })

    it('should preserve data attributes', () => {
      const htmlWithData = '<div data-test="value">Content</div>'
      expect(sanitizeHtml(htmlWithData)).toBe(htmlWithData)
    })
  })

  describe('Expression Security', () => {
    it('should block potentially unsafe expressions in templates', () => {
      const maliciousTemplate = '{eval("alert(1)")} {window.location}'
      const result = renderMarkdown(maliciousTemplate, createResults([{ name: 'test' }]))
      expect(result).toContain('{eval("alert(1)")}') // Should remain as-is, not evaluated
      expect(result).toContain('{window.location}')
    })

    it('should only allow safe data access patterns', () => {
      const queryResults = createResults([{ name: 'John', age: 30 }])

      // Safe expressions should work
      expect(renderMarkdown('{data[0].name}', queryResults)).toContain('John')
      expect(renderMarkdown('{data.length}', queryResults)).toContain('1')

      // Unsafe expressions should be blocked
      expect(renderMarkdown('{data[0].__proto__}', queryResults)).toContain('{data[0].__proto__}')
    })

    it('should validate field expressions in loops', () => {
      const template = '{{#each data}}{name} {{<script>alert(1)</script>}}{{/each}}'
      const queryResults = createResults([{ name: 'John' }])
      const result = renderMarkdown(template, queryResults)

      expect(result).toContain('John')
      expect(result).not.toContain('<script>')
    })

    it('should validate URLs in markdown links', () => {
      const maliciousLink = '[Click me](javascript:alert("xss"))'
      const result = renderMarkdown(maliciousLink)
      expect(result).toBe('Click me)') // Link should be stripped, only text remains

      const safeLink = '[Google](https://google.com)'
      const safeResult = renderMarkdown(safeLink)
      expect(safeResult).toContain('<a href="https://google.com">Google</a>')
    })
  })

  describe('Input Validation Edge Cases', () => {
    it('should handle extremely long inputs safely', () => {
      const longInput = 'a'.repeat(10000)
      expect(() => renderMarkdown(longInput)).not.toThrow()
    })

    it('should handle special characters in expressions', () => {
      const template = '{data[0].field-with-dashes} {data[0].field_with_underscores}'
      const queryResults = createResults([
        { 'field-with-dashes': 'dash', field_with_underscores: 'underscore' },
      ])
      const result = renderMarkdown(template, queryResults)

      // These should be blocked due to special characters
      expect(result).toContain('{data[0].field-with-dashes}')
      expect(result).toContain('underscore') // Underscores are allowed
    })

    it('should handle nested template expressions', () => {
      const template = '{data[0].{nested}}'
      const result = renderMarkdown(template, createResults([{}]))
      expect(result).toContain('{data[0].{nested}}') // Should not be processed
    })

    it('should handle malformed template syntax', () => {
      const malformed = '{unclosed {nested}} {}'
      const result = renderMarkdown(malformed, createResults([]))
      expect(result).toContain('{unclosed')
      expect(result).toContain('{}')
    })
  })
})
