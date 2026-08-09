import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdownRenderer'
import { createResults } from './testHelpers'
describe('Loading State', () => {
  const sampleData = createResults([
    { name: 'John', age: 30, email: 'john@example.com' },
    { name: 'Jane', age: 25, email: 'jane@example.com' },
  ])

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
      // two fields, + css
      expect(pillCount).toBe(3)
    })

    it('should use fallback text for pill sizing in simple substitutions', () => {
      const template = 'Status: {status || "Loading status..."}'
      const result = renderMarkdown(template, sampleData, true)

      expect(result).toContain('Status: ')
      expect(result).toContain('loading-pill')
      expect(result).toContain('width: 120px') // Based on "Loading status..." length
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
      const manyItemsData = createResults(
        Array(10)
          .fill(0)
          .map((_, i) => ({ name: `User${i}` })),
      )
      const template = '{{#each data}}{{name}} {{/each}}'
      const result = renderMarkdown(template, manyItemsData, true)

      // Should only generate 3 loading items max
      const items = result.split('loading-pill').length - 1
      expect(items).toBeLessThanOrEqual(4)
    })

    it('should respect explicit limits in loading state', () => {
      const template = '{{#each data limit=1}}{{name}}{{/each}}'
      const result = renderMarkdown(template, sampleData, true)

      const pillCount = (result.match(/loading-pill/g) || []).length
      //1 + css
      expect(pillCount).toBe(2)
    })

    it('should handle @index in loading loops', () => {
      const template = '{{#each data}}{{@index}}: {{name}} {{/each}}'
      const result = renderMarkdown(template, sampleData, true)

      expect(result).toContain('loading-pill')
      expect(result).toContain(': ')
    })

    it('should show loading pills for nested loops', () => {
      const nestedData = createResults([
        { name: 'User1', tags: ['tag1', 'tag2'] },
        { name: 'User2', tags: ['tag3'] },
      ])
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
      const result = renderMarkdown(template, createResults([]), true)

      expect(result).toContain('loading-pill')
    })
  })

  /**
   * Loop headers are double-braced but the fields inside them single-braced,
   * and the loading and loaded passes each used to substitute only one of the
   * two spellings. A markdown item therefore rendered fine in one state and
   * flashed its raw `{{field}}` / `{field}` source in the other while
   * refreshing. Whichever spelling is authored, neither state may leak braces.
   */
  describe('Brace-spelling parity between loading and loaded', () => {
    it.each([
      ['single-braced fields', '{{#each data}}- {name}\n{{/each}}'],
      ['double-braced fields', '{{#each data}}- {{name}}\n{{/each}}'],
    ])('renders %s with no raw source in either state', (_label, template) => {
      const loadingResult = renderMarkdown(template, sampleData, true)
      expect(loadingResult).toContain('loading-pill')
      expect(loadingResult).not.toContain('name')

      const loadedResult = renderMarkdown(template, sampleData, false)
      expect(loadedResult).toContain('John')
      expect(loadedResult).toContain('Jane')
      expect(loadedResult).not.toContain('{')
      expect(loadedResult).not.toContain('}')
    })

    it.each([
      ['single-braced scalar', '{name}'],
      ['double-braced scalar', '{{name}}'],
    ])('substitutes a %s outside a loop in both states', (_label, template) => {
      expect(renderMarkdown(template, sampleData, true)).toContain('loading-pill')
      expect(renderMarkdown(template, sampleData, false)).toContain('John')
    })

    it('leaves an unmatched loop directive alone rather than substituting it', () => {
      const result = renderMarkdown('{{/each}}', sampleData, false)
      expect(result).toContain('{{/each}}')
    })
  })

  /**
   * Substitution runs before markdown conversion, so a pill is already sitting
   * in the cell text by the time the table builder escapes it — and escaping is
   * right for data, so the pill has to be hidden from that pass rather than the
   * escaping relaxed. Otherwise the cell renders the literal `<span
   * class="loading-pill" …>` source.
   */
  describe('Loading pills inside tables', () => {
    it('renders a live pill in a static table cell, not escaped source', () => {
      const template = '| Metric | Value |\n| --- | --- |\n| Headcount | {name} |'
      const result = renderMarkdown(template, sampleData, true)

      expect(result).toContain('<td style="text-align: left"><span class="loading-pill"')
      expect(result).not.toContain('&lt;span')
    })

    it('renders live pills in a looped table body', () => {
      const template = '| Name |\n| --- |\n{{#each data}}| {name} |\n{{/each}}'
      const result = renderMarkdown(template, sampleData, true)

      expect(result).toContain('<span class="loading-pill"')
      expect(result).not.toContain('&lt;span')
    })

    /**
     * jsdom has no layout engine, so this pins the emitted box rather than the
     * measured height. Verified in Chromium: with these three pieces a table
     * row is 36px whether it holds pills or text; without them a pill-only row
     * collapses to 31px and the table jumps when results land.
     */
    it('reserves a full line box so rows do not resize when results land', () => {
      const result = renderMarkdown('{name}', sampleData, true)

      // Pads the bar's margin box out to one line without resizing the bar.
      expect(result).toContain('margin: calc((1lh - 1em) / 2) 0')
      // `middle` would extend the line box once the margin box is a line tall.
      expect(result).toContain('vertical-align: top')
      // A real text node, or a pill-only line box collapses to the bar height.
      expect(result).toContain('</span>​')
    })

    it('still escapes table data that is not generated markup', () => {
      const template = '| A |\n| --- |\n| <script>alert(1)</script> |'
      const result = renderMarkdown(template, sampleData, false)

      expect(result).toContain('&lt;script&gt;')
      expect(result).not.toContain('<script>')
    })
  })

  describe('Loading Performance', () => {
    it('should not generate excessive loading items for large limits', () => {
      const template = '{{#each data limit=100}}{{name}}{{/each}}'
      const result = renderMarkdown(template, sampleData, true)

      // Should still respect the 3-item max for loading
      const pillCount = (result.match(/loading-pill/g) || []).length
      // 3 + css
      expect(pillCount).toBeLessThanOrEqual(4)
    })

    it('should handle deeply nested loading efficiently', () => {
      const template =
        '{{#each data}}{{#each nested}}{{#each deep}}{{value}}{{/each}}{{/each}}{{/each}}'

      // Should not throw or hang
      expect(() => {
        renderMarkdown(template, sampleData, true)
      }).not.toThrow()
    })
  })
})
