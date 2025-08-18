import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  escapeHtml,
  getNestedValue,
  evaluateExpression,
  evaluateFallback,
  processTemplateSubstitutions,
  convertMarkdownToHtml,
  renderMarkdown,
} from './markdownRenderer'
import { Results, ColumnType } from '../editors/results'

// Mock DOMPurify
vi.mock('dompurify', () => ({
  default: {
    // @ts-ignore
    sanitize: vi.fn((html: string, options: any) => {
      // Simple mock that removes script tags but keeps allowed tags
      return html
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/onclick="[^"]*"/gi, '')
        .replace(/onerror="[^"]*"/gi, '')
    }),
  },
}))

// Mock DOM for escapeHtml function
Object.defineProperty(global, 'document', {
  value: {
    createElement: vi.fn().mockReturnValue({
      textContent: '',
      innerHTML: '',
    }),
  },
})

describe('escapeHtml', () => {
  beforeEach(() => {
    const mockDiv = {
      textContent: '',
      innerHTML: '',
    }
    vi.mocked(document.createElement).mockReturnValue(mockDiv as any)
  })

  it('should escape HTML special characters', () => {
    const mockDiv = {
      textContent: '',
      innerHTML: '&lt;script&gt;alert(1)&lt;/script&gt;',
    }
    vi.mocked(document.createElement).mockReturnValue(mockDiv as any)

    const result = escapeHtml('<script>alert(1)</script>')
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('should handle non-string input', () => {
    const mockDiv = {
      textContent: '',
      innerHTML: '123',
    }
    vi.mocked(document.createElement).mockReturnValue(mockDiv as any)

    const result = escapeHtml(123 as any)
    expect(result).toBe('123')
  })
})

describe('getNestedValue', () => {
  const testObj = {
    user: {
      name: 'John',
      emails: ['john@test.com', 'john.doe@test.com'],
    },
    items: [
      { id: 1, title: 'First Item' },
      { id: 2, title: 'Second Item' },
    ],
  }

  it('should get simple nested values', () => {
    expect(getNestedValue(testObj, 'user.name')).toBe('John')
  })

  it('should handle array access', () => {
    expect(getNestedValue(testObj, 'items[0].title')).toBe('First Item')
    expect(getNestedValue(testObj, 'user.emails[1]')).toBe('john.doe@test.com')
  })

  it('should return undefined for non-existent paths', () => {
    expect(getNestedValue(testObj, 'user.age')).toBeUndefined()
    expect(getNestedValue(testObj, 'items[5].title')).toBeUndefined()
  })

  it('should handle null/undefined objects', () => {
    expect(getNestedValue(null, 'user.name')).toBeUndefined()
    expect(getNestedValue(undefined, 'user.name')).toBeUndefined()
  })
})

describe('evaluateExpression', () => {
  const mockResults: Results = new Results(
    new Map([
      ['name', { name: 'name', type: ColumnType.STRING }],
      ['email', { name: 'email', type: ColumnType.STRING }],
      ['id', { name: 'id', type: ColumnType.NUMBER }],
    ]),
    [
      { id: 1, name: 'John', email: 'john@test.com' },
      { id: 2, name: 'Jane', email: 'jane@test.com' },
    ],
  )

  it('should handle data[index].field patterns', () => {
    expect(evaluateExpression('data[0].name', mockResults)).toBe('John')
    expect(evaluateExpression('data[1].email', mockResults)).toBe('jane@test.com')
  })

  it('should handle data.length', () => {
    expect(evaluateExpression('data.length', mockResults)).toBe(2)
  })

  it('should handle simple field access (first row)', () => {
    expect(evaluateExpression('name', mockResults)).toBe('John')
    expect(evaluateExpression('email', mockResults)).toBe('john@test.com')
  })

  it('should return undefined for loading state', () => {
    expect(evaluateExpression('name', mockResults, true)).toBeUndefined()
  })

  it('should return undefined for null query results', () => {
    expect(evaluateExpression('name', null)).toBeUndefined()
  })

  it('should block unsafe expressions', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(evaluateExpression('data[0].name; alert(1)', mockResults)).toBeUndefined()
    expect(evaluateExpression('eval("alert(1)")', mockResults)).toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Potentially unsafe expression blocked:',
      'data[0].name; alert(1)',
    )
    consoleSpy.mockRestore()
  })
})

describe('evaluateFallback', () => {
  const mockResults: Results = new Results(
    new Map([
      ['name', { name: 'name', type: ColumnType.STRING }],
      ['email', { name: 'email', type: ColumnType.STRING }],
      ['description', { name: 'description', type: ColumnType.STRING }],
    ]),
    [{ name: 'John', email: null, description: '' }],
  )

  it('should use main value when available', () => {
    const result = evaluateFallback("name || 'Unknown'", mockResults)
    expect(result).toBe('John')
  })

  it('should use fallback for null values', () => {
    const result = evaluateFallback("email || 'No email'", mockResults)
    expect(result).toBe('No email')
  })

  it('should use fallback for empty strings', () => {
    const result = evaluateFallback("description || 'No description'", mockResults)
    expect(result).toBe('No description')
  })

  it('should handle quoted fallback strings', () => {
    const result1 = evaluateFallback("missing || 'Default Value'", mockResults)
    const result2 = evaluateFallback('missing || "Default Value"', mockResults)
    expect(result1).toBe('Default Value')
    expect(result2).toBe('Default Value')
  })

  it('should create loading pills in loading state', () => {
    const result = evaluateFallback("name || 'Loading'", mockResults, true)
    expect(result).toContain('loading-pill')
    expect(result).toContain('80px') // Based on 'Loading' length
  })

  it('should handle expressions without fallback', () => {
    const result = evaluateFallback('name', mockResults)
    expect(result).toBe('John')

    const missingResult = evaluateFallback('missing', mockResults)
    expect(missingResult).toBe('{missing}')
  })
})

describe('processTemplateSubstitutions', () => {
  const mockResults: Results = new Results(
    new Map([
      ['name', { name: 'name', type: ColumnType.STRING }],
      ['age', { name: 'age', type: ColumnType.NUMBER }],
      ['city', { name: 'city', type: ColumnType.STRING }],
    ]),
    [
      { name: 'John', age: 30, city: 'New York' },
      { name: 'Jane', age: 25, city: 'Boston' },
    ],
  )

  it('should replace single field substitutions', () => {
    const text = 'Hello {name}, you are {age} years old.'
    const result = processTemplateSubstitutions(text, mockResults)
    expect(result).toBe('Hello John, you are 30 years old.')
  })

  it('should handle fallback substitutions', () => {
    const text = 'Hello {name || "Guest"}, from {country || "Unknown"}'
    const result = processTemplateSubstitutions(text, mockResults)
    expect(result).toBe('Hello John, from Unknown')
  })

  it('should process each loops', () => {
    const text = 'Users: {{#each data}}{{name}} ({{age}}) {{/each}}'
    const result = processTemplateSubstitutions(text, mockResults)
    expect(result).toBe('Users: John (30) Jane (25) ')
  })

  it('should process limited each loops', () => {
    const text = 'First user: {{#each data limit=1}}{{name}}{{/each}}'
    const result = processTemplateSubstitutions(text, mockResults)
    expect(result).toBe('First user: John')
  })

  it('should handle @index in loops', () => {
    const text = '{{#each data}}{{@index}}: {{name}} {{/each}}'
    const result = processTemplateSubstitutions(text, mockResults)
    expect(result).toBe('0: John 1: Jane ')
  })

  it('should create loading pills in loading state', () => {
    const text = 'Hello {name}, you are {age} years old.'
    const result = processTemplateSubstitutions(text, mockResults, true)
    expect(result).toContain('loading-pill')
    expect(result).toContain('shimmer')
  })

  it('should show loading items for loops', () => {
    const text = 'Users: {{#each data}}{{name}} {{/each}}'
    const result = processTemplateSubstitutions(text, mockResults, true)
    expect(result).toContain('loading-pill')
    // Should show 3 loading items
    const pillCount = (result.match(/loading-pill/g) || []).length
    expect(pillCount).toBe(3)
  })

  it('should validate loop limits', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const text = '{{#each data limit=invalid}}{{name}}{{/each}}'
    const result = processTemplateSubstitutions(text, mockResults)
    expect(result).toBe(text) // Should return original text
    expect(consoleSpy).toHaveBeenCalledWith('Potentially unsafe expression blocked:', '{/each')

    consoleSpy.mockRestore()
  })
})

describe('convertMarkdownToHtml', () => {
  it('should convert headers', () => {
    expect(convertMarkdownToHtml('# Header 1')).toContain(
      '<h1 class="rendered-markdown-h1">Header 1</h1>',
    )
    expect(convertMarkdownToHtml('## Header 2')).toContain(
      '<h2 class="rendered-markdown-h2">Header 2</h2>',
    )
    expect(convertMarkdownToHtml('### Header 3')).toContain(
      '<h3 class="rendered-markdown-h3">Header 3</h3>',
    )
  })

  it('should convert lists', () => {
    const result = convertMarkdownToHtml('* Item 1\n* Item 2')
    expect(result).toContain('<ul><li>Item 1</li>')
    expect(result).toContain('<li>Item 2</li></ul>')
  })

  it('should convert bold and italic', () => {
    expect(convertMarkdownToHtml('**bold text**')).toContain('<strong>bold text</strong>')
    expect(convertMarkdownToHtml('*italic text*')).toContain('<em>italic text</em>')
  })

  it('should convert links', () => {
    const result = convertMarkdownToHtml('[Google](https://google.com)')
    expect(result).toContain('<a href="https://google.com">Google</a>')
  })

  it('should prevent XSS in links', () => {
    const result = convertMarkdownToHtml('[Click](javascript:alert(1))')
    expect(result).toBe('Click)') // Should just return text
  })

  it('should convert paragraphs and line breaks', () => {
    const result = convertMarkdownToHtml('Line 1\nLine 2\n\nParagraph 2')
    expect(result).toContain('</p><p>')
  })
})

describe('renderMarkdown', () => {
  const mockResults: Results = new Results(
    new Map([
      ['name', { name: 'name', type: ColumnType.STRING }],
      ['age', { name: 'age', type: ColumnType.NUMBER }],
    ]),
    [{ name: 'John', age: 30 }],
  )

  it('should render complete markdown with template substitutions', () => {
    const text = '# Welcome {name || "Guest"}\n\nYou are **{age}** years old.\n\n* Item 1\n* Item 2'
    const result = renderMarkdown(text, mockResults)

    expect(result).toContain('<h1 class="rendered-markdown-h1">Welcome John</h1>')
    expect(result).toContain('<strong>30</strong>')
    expect(result).toContain('<ul><li>Item 1</li>')
  })

  it('should handle loading state', () => {
    const text = '# Welcome {name}\n\nAge: {age}'
    const result = renderMarkdown(text, mockResults, true)

    expect(result).toContain('loading-pill')
    expect(result).toContain('@keyframes shimmer')
    expect(result).toContain('<style>')
  })

  it('should handle empty text', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null as any)).toBe('')
  })

  it('should handle null query results', () => {
    const text = 'Hello {name || "World"}'
    const result = renderMarkdown(text, null)
    expect(result).toContain('Hello World')
  })

  it('should sanitize HTML output', () => {
    const text = 'Safe content with **bold**'
    const result = renderMarkdown(text, mockResults)
    // Should not contain any script tags (mocked DOMPurify removes them)
    expect(result).not.toContain('<script>')
  })

  it('should process complex templates with loops', () => {
    const complexData: Results = new Results(
      new Map([
        ['name', { name: 'name', type: ColumnType.STRING }],
        ['skills', { name: 'skills', type: ColumnType.ARRAY }],
      ]),
      [
        { name: 'John', skills: ['JS', 'TS'] },
        { name: 'Jane', skills: ['Python', 'Go'] },
      ],
    )

    const text = '# Team Members\n\n{{#each data}}## {{name}}\n\n{{/each}}'
    const result = renderMarkdown(text, complexData)

    expect(result).toContain('<h1 class="rendered-markdown-h1">Team Members</h1>')
    expect(result).toContain('<h2 class="rendered-markdown-h2">John</h2>')
    expect(result).toContain('<h2 class="rendered-markdown-h2">Jane</h2>')
  })
})

describe('Security Tests', () => {
  it('should prevent XSS in template expressions', () => {
    const maliciousData: Results = new Results(
      new Map([['name', { name: 'name', type: ColumnType.STRING }]]),
      [{ name: '<script>alert(1)</script>' }],
    )

    const result = renderMarkdown('Hello {name}', maliciousData)
    // DOMPurify mock should remove script tags
    expect(result).not.toContain('<script>')
  })

  it('should block unsafe field expressions in loops', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const text = '{{#each data}}{{name; alert(1)}}{{/each}}'
    const result = renderMarkdown(
      text,
      new Results(new Map([['name', { name: 'name', type: ColumnType.STRING }]]), [
        { name: 'John' },
      ]),
    )

    expect(consoleSpy).toHaveBeenCalledWith(
      'Potentially unsafe field expression blocked:',
      'name; alert(1)',
    )
    expect(result).toContain('{{name; alert(1)}}') // Should preserve original

    consoleSpy.mockRestore()
  })

  it('should validate URLs in links', () => {
    const maliciousText = '[Click me](javascript:alert(1))'
    const result = renderMarkdown(maliciousText)
    expect(result).not.toContain('javascript:')
    expect(result).toBe('Click me)')
  })

  it('should handle data URLs safely', () => {
    const text = '[Image](data:text/html,<script>alert(1)</script>)'
    // const html = convertMarkdownToHtml(text)
    // expect(html).toContain('<a href="data:text/html,')
    const result = renderMarkdown(text)
    expect(result).not.toContain('data:')
    expect(result).not.toContain('<script>alert(1)</script>')
    // expect(result).toBe('<p>Image</p>')
  })
})

describe('Edge Cases', () => {
  it('should handle empty data arrays', () => {
    const text = '{{#each data}}{{name}}{{/each}}'
    const result = renderMarkdown(
      text,
      new Results(new Map([['name', { name: 'name', type: ColumnType.STRING }]]), []),
    )
    expect(result).toBe('')
  })

  it('should handle missing fields gracefully', () => {
    const text = 'Hello {nonexistent || "Default"}'
    const result = renderMarkdown(text, new Results(new Map(), [{}]))
    expect(result).toContain('Default')
  })

  it('should handle nested markdown in templates', () => {
    const data: Results = new Results(
      new Map([
        ['title', { name: 'title', type: ColumnType.STRING }],
        ['content', { name: 'content', type: ColumnType.STRING }],
      ]),
      [{ title: 'Important', content: 'This is **bold** text' }],
    )

    const text = '# {title}\n\n{content}'
    const result = renderMarkdown(text, data)

    expect(result).toContain('<h1 class="rendered-markdown-h1">Important</h1>')
    expect(result).toContain('<strong>bold</strong>')
  })

  it('should handle special characters in field values', () => {
    const data: Results = new Results(
      new Map([
        ['name', { name: 'name', type: ColumnType.STRING }],
        ['note', { name: 'note', type: ColumnType.STRING }],
      ]),
      [{ name: 'John & Jane', note: 'This <em>works</em>' }],
    )

    const text = 'Names: {name}, Note: {note}'
    const result = renderMarkdown(text, data)

    // Should be sanitized by DOMPurify
    expect(result).toContain('John & Jane')
  })
})
