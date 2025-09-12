import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdownRenderer'

describe('Loading State', () => {
  const sampleData = {
    data: [
      { name: 'John', age: 30, email: 'john@example.com' },
      { name: 'Jane', age: 25, email: 'jane@example.com' }
    ]
  }

  describe('Loading Pills', () => {
    it('should generate loading pills with appropriate widths', () => {
      const shortTemplate = '{name}'
      const result = renderMarkdown(shortTemplate, sampleData, true)
      expect(result).toContain('loading-pill')
      expect(result).toContain('width: 60px') // Short text
    })

    it('should adjust pill width based on fallback text length', () => {
      const mediumTemplate = '{name || "Medium length"}'
      const result = renderMarkdown(mediumTemplate, sampleData, true)
      expect(result).toContain('loading-pill')
      expect(result).toContain('width: 120px') // Medium text
    })

    it('should use maximum width for long fallback text', () => {
      const longTemplate = '{name || "This is a very long fallback text"}'
      const result = renderMarkdown(longTemplate, sampleData, true)
      expect(result).toContain('loading-pill')
      expect(result).toContain('width: 160px') // Long text
    })

    it('should include shimmer animation CSS', () => {
      const template = '{name}'
      const result = renderMarkdown(template, sampleData, true)
      expect(result).toContain('<style>')
      expect(result).toContain('@keyframes shimmer')
      expect(result).toContain('background-position: -200% 0')
      expect(result).toContain('background-position: 200% 0')
      expect(result).toContain('animation: shimmer 1.5s infinite')
    })

    it('should include loading pill styling', () => {
      const template = '{name}'
      const result = renderMarkdown(template, sampleData, true)
      expect(result).toContain('background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)')
      expect(result).toContain('background-size: 200% 100%')
      expect(result).toContain('border-radius: 4px')
      expect(result).toContain('filter: blur(0.5px)')
    })
  })

  describe('Simple Substitutions Loading', () => {
    it('should show loading pills for simple expressions', () => {
      const template = 'Hello {name}, you are {age} years old.'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('Hello ')
      expect(result).toContain('loading-pill')
      expect(result).toContain(', you are ')
      expect(result).toContain(' years old.')
      
      // Should have 2 loading pills (one for name, one for age)
      const pillCount = (result.match(/loading-pill/g) || []).length
      expect(pillCount).toBe(2)
    })

    it('should use fallback text for pill sizing in simple substitutions', () => {
      const template = 'Status: {status || "Loading status..."}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('Status: ')
      expect(result).toContain('loading-pill')
      expect(result).toContain('width: 160px') // Based on "Loading status..." length
    })

    it('should handle multiple expressions with different lengths', () => {
      const template = '{a || "X"} {b || "Medium text"} {c || "Very long fallback text here"}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('width: 60px') // X
      expect(result).toContain('width: 120px') // Medium text
      expect(result).toContain('width: 160px') // Very long fallback text here
    })
  })

  describe('Loop Loading', () => {
    it('should show loading pills in data loops', () => {
      const template = '{{#each data}}- {{name}} ({{age}}){{/each}}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('loading-pill')
      expect(result).toContain('- ')
      expect(result).toContain(' (')
      expect(result).toContain(')')
    })

    it('should limit loading loop items to 3', () => {
      const manyItemsData = {
        data: Array(10).fill(0).map((_, i) => ({ name: `User${i}` }))
      }
      const template = '{{#each data}}{{name}} {{/each}}'
      const result = renderMarkdown(template, manyItemsData, true)
      
      // Should only generate 3 loading items max
      const items = result.split('loading-pill').length - 1
      expect(items).toBeLessThanOrEqual(3)
    })

    it('should respect explicit limits in loading state', () => {
      const template = '{{#each data limit=1}}{{name}}{{/each}}'
      const result = renderMarkdown(template, sampleData, true)
      
      const pillCount = (result.match(/loading-pill/g) || []).length
      expect(pillCount).toBe(1)
    })

    it('should handle @index in loading loops', () => {
      const template = '{{#each data}}{{@index}}: {{name}} {{/each}}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('loading-pill')
      expect(result).toContain(': ')
    })

    it('should show loading pills for nested loops', () => {
      const nestedData = {
        data: [
          { name: 'User1', tags: ['tag1', 'tag2'] },
          { name: 'User2', tags: ['tag3'] }
        ]
      }
      const template = '{{#each data}}{{name}}: {{#each tags}}{{.}} {{/each}}{{/each}}'
      const result = renderMarkdown(template, nestedData, true)
      
      expect(result).toContain('loading-pill')
      expect(result).toContain(': ')
    })
  })

  describe('Loading with Markdown', () => {
    it('should apply markdown formatting to loading content', () => {
      const template = `# {title || "Loading title"}

**Name:** {name}

## Projects
{{#each data}}
- **{{name}}:** {{description || "Loading description"}}
{{/each}}`

      const result = renderMarkdown(template, sampleData, true)
      
      // Should contain markdown elements
      expect(result).toContain('<h1 class="rendered-markdown-h1">')
      expect(result).toContain('<h2 class="rendered-markdown-h2">Projects</h2>')
      expect(result).toContain('<strong>')
      expect(result).toContain('<ul><li>')
      
      // Should contain loading pills
      expect(result).toContain('loading-pill')
      expect(result).toContain('@keyframes shimmer')
    })

    it('should handle loading in code blocks properly', () => {
      const template = `# API Example

\`\`\`json
{
  "name": "{name}",
  "age": {age}
}
\`\`\`

Current user: {name}`

      const result = renderMarkdown(template, sampleData, true)
      
      // Templates in code blocks should not become loading pills
      expect(result).toContain('"{name}"')
      expect(result).toContain('{age}')
      
      // Templates outside code blocks should become loading pills
      expect(result).toContain('Current user: ')
      expect(result).toContain('loading-pill')
    })
  })

  describe('Loading State Edge Cases', () => {
    it('should handle empty template expressions in loading', () => {
      const template = '{} {name}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('{}')
      expect(result).toContain('loading-pill')
    })

    it('should handle malformed expressions in loading', () => {
      const template = '{unclosed {name}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('{unclosed')
      expect(result).toContain('loading-pill')
    })

    it('should handle expressions without fallbacks in loading', () => {
      const template = '{nonexistent}'
      const result = renderMarkdown(template, sampleData, true)
      
      expect(result).toContain('loading-pill')
      expect(result).toContain('width: 120px') // Based on "nonexistent" length
    })

    it('should not show loading CSS when not in loading state', () => {
      const template = '{name}'
      const result = renderMarkdown(template, sampleData, false)
      
      expect(result).not.toContain('<style>')
      expect(result).not.toContain('@keyframes shimmer')
      expect(result).not.toContain('loading-pill')
    })

    it('should handle null data in loading state', () => {
      const template = '{name} {{#each data}}{{name}}{{/each}}'
      const result = renderMarkdown(template, null, true)
      
      expect(result).toContain('loading-pill')
      expect(result).toContain('@keyframes shimmer')
    })

    it('should handle empty data array in loading state', () => {
      const template = '{{#each data}}{{name}}{{/each}}'
      const result = renderMarkdown(template, { data: [] }, true)
      
      expect(result).toContain('loading-pill')
    })
  })

  describe('Loading Performance', () => {
    it('should not generate excessive loading items for large limits', () => {
      const template = '{{#each data limit=100}}{{name}}{{/each}}'
      const result = renderMarkdown(template, sampleData, true)
      
      // Should still respect the 3-item max for loading
      const pillCount = (result.match(/loading-pill/g) || []).length
      expect(pillCount).toBeLessThanOrEqual(3)
    })

    it('should handle deeply nested loading efficiently', () => {
      const template = '{{#each data}}{{#each nested}}{{#each deep}}{{value}}{{/each}}{{/each}}{{/each}}'
      
      // Should not throw or hang
      expect(() => {
        renderMarkdown(template, sampleData, true)
      }).not.toThrow()
    })
  })
})