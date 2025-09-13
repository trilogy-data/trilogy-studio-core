import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdownRenderer'
import { createResults } from './testHelpers'

describe('Integration and Edge Cases', () => {
  ;(describe('Complete Workflow Integration', () => {
    it('should handle a complex real-world template', () => {
      const complexData = createResults([
        {
          name: 'Sarah Johnson',
          role: 'Senior Developer',
          department: 'Engineering',
          email: 'sarah@company.com',
          projects: [
            { name: 'E-commerce Platform', status: 'active', priority: 'high' },
            { name: 'Mobile App', status: 'completed', priority: 'medium' },
          ],
          skills: ['React', 'Node.js', 'TypeScript'],
          performance: { rating: 4.8, reviews: 12 },
          location: { office: 'San Francisco', remote: true },
        },
        {
          name: 'Michael Chen',
          role: 'Product Designer',
          department: 'Design',
          email: 'michael@company.com',
          projects: [{ name: 'Design System', status: 'active', priority: 'high' }],
          skills: ['Figma', 'Sketch', 'Prototyping'],
          performance: { rating: 4.6, reviews: 8 },
          location: { office: 'New York', remote: false },
        },
      ])

      const template = `# Team Directory

**Total Members:** {data.length}

{{#each data}}
## {name} - {role}

**Department:** {department}  
**Email:** {email}  
**Location:** {location.office} {location.remote || "(Office Only)"}  
**Performance:** {performance.rating}/5.0 ({performance.reviews} reviews)

### Current Projects
{{#each projects}}
- **{name}** - *{status}* (Priority: {priority})
{{/each}}

### Skills
{{#each skills}}
* {.}
{{/each}}

---
{{/each}}

## Summary

This directory contains information for **{data.length} team members** across multiple departments.

### Code Example

\`\`\`javascript
// Fetch team member data
const team = {
  total: {data.length},
  members: [
    {{#each data limit=2}}
    { name: "{name}", role: "{role}" }{{#unless @last}},{{/unless}}
    {{/each}}
  ]
};
\`\`\``

      const result = renderMarkdown(template, complexData)

      // Verify structure
      expect(result).toContain('<h1 class="rendered-markdown-h1">Team Directory</h1>')
      expect(result).toContain('<strong>Total Members:</strong> 2')

      // Verify member details
      expect(result).toContain(
        '<h2 class="rendered-markdown-h2">Sarah Johnson - Senior Developer</h2>',
      )
      expect(result).toContain(
        '<h2 class="rendered-markdown-h2">Michael Chen - Product Designer</h2>',
      )
      expect(result).toContain('<strong>Department:</strong> Engineering')
      expect(result).toContain('<strong>Email:</strong> sarah@company.com')
      expect(result).toContain('San Francisco')
      expect(result).toContain('New York')

      // Verify projects and skills
      expect(result).toContain('<strong>E-commerce Platform</strong>')
      expect(result).toContain('<em>active</em>')
      expect(result).toContain('<ul><li>React</li>')
      expect(result).toContain('<ul><li>Figma</li>')

      // Verify code block preservation
      expect(result).toContain('total: {data.length}')
      expect(result).toContain('name: "{name}"')

      // Verify sanitization
      expect(result).not.toContain('<script>')
    })

    it('should handle template with all markdown features', () => {
      const data = createResults([
        {
          title: 'Blog Post',
          author: 'John Doe',
          tags: ['javascript', 'tutorial'],
          links: [
            { text: 'GitHub', url: 'https://github.com/example' },
            { text: 'Documentation', url: 'https://docs.example.com' },
          ],
        },
      ])

      const template = `# {data[0].title}

**Author:** {data[0].author}

## Introduction

This is a blog post about *JavaScript* and **web development**.

### Code Example

\`\`\`javascript
function greet(name) {
  return "Hello, " + name + "!";
}

console.log(greet("{data[0].author}"));
\`\`\`

### Tags

{{#each data[0].tags}}
* {.}
{{/each}}

### Related Links

{{#each data[0].links}}
- [{text}]({url})
{{/each}}

### Summary

- **Author:** {data[0].author}
- **Tags:** {{#each data[0].tags}}
- {.}
{{/each}}

> This concludes the blog post.`

      const result = renderMarkdown(template, data)

      // Headers
      expect(result).toContain('<h1 class="rendered-markdown-h1">Blog Post</h1>')
      expect(result).toContain('<h2 class="rendered-markdown-h2">Introduction</h2>')
      expect(result).toContain('<h3 class="rendered-markdown-h3">Code Example</h3>')

      // Emphasis
      expect(result).toContain('<em>JavaScript</em>')
      expect(result).toContain('<strong>web development</strong>')

      // Code blocks
      expect(result).toContain('<div class="md-code-container"')
      expect(result).toContain('greet("{data[0].author}")')

      // Lists
      expect(result).toContain('<ul><li>javascript</li>')
      expect(result).toContain('<li>tutorial</li>')

      // Links
      expect(result).toContain('<a href="https://github.com/example">GitHub</a>')
      expect(result).toContain('<a href="https://docs.example.com">Documentation</a>')

      // Template processing
      expect(result).toContain('<strong>Author:</strong> John Doe')
    })
  }),
    describe('basics and edge cases', () => {
      it('should handle array loop with data[0].tags syntax correctly', () => {
        const data = createResults([
          {
            title: 'Test Post',
            tags: ['javascript', 'testing', 'vitest', 'markdown'],
          },
        ])

        const template = `# Tags Test

{{#each data[0].tags}}
* {.}
{{/each}}`

        const result = renderMarkdown(template, data)

        // Verify the loop processes all tags correctly
        expect(result).toContain('<ul><li>javascript</li>')
        expect(result).toContain('<li>testing</li>')
        expect(result).toContain('<li>vitest</li>')
        expect(result).toContain('<li>markdown</li></ul>')

        // Verify the structure is correct
        expect(result).toContain('<h1 class="rendered-markdown-h1">Tags Test</h1>')

        // Verify all tags are present in the correct order
        const tagMatches = result.match(/<li>([^<]+)<\/li>/g)
        expect(tagMatches).toBeTruthy()
        expect(tagMatches!).toHaveLength(4)
        expect(tagMatches![0]).toBe('<li>javascript</li>')
        expect(tagMatches![1]).toBe('<li>testing</li>')
        expect(tagMatches![2]).toBe('<li>vitest</li>')
        expect(tagMatches![3]).toBe('<li>markdown</li>')
      })
    }),
    describe('Error Handling and Edge Cases', () => {
      it('should handle null and undefined inputs gracefully', () => {
        expect(() => renderMarkdown(null as any)).not.toThrow()
        expect(() => renderMarkdown(undefined as any)).not.toThrow()
        expect(() => renderMarkdown('')).not.toThrow()

        expect(renderMarkdown(null as any)).toBe('')
        expect(renderMarkdown(undefined as any)).toBe('')
        expect(renderMarkdown('')).toBe('')
      })

      it('should handle malformed JSON-like data', () => {
        const malformedData = createResults([
          { name: 'John', nested: { deep: { value: 'test' } } },
          { name: 'Jane' },
        ])

        const template = '{{#each data}}Name: {name || "Unknown"} {{/each}}'
        const result = renderMarkdown(template, malformedData)

        expect(result).toContain('Name: John')
        expect(result).toContain('Name: Jane')
      })

      it('should handle circular references safely', () => {
        const item: any = { name: 'Test' }
        item.self = item
        const circularData = createResults([item])

        const template = '{{#each data}}{{name}}{{/each}}'

        // Should not throw with circular references
        expect(() => renderMarkdown(template, circularData)).not.toThrow()
      })

      it('should handle extremely large datasets', () => {
        const largeData = createResults(
          Array(1000)
            .fill(0)
            .map((_, i) => ({ id: i, name: `User ${i}` })),
        )

        const template = '{{#each data limit=5}}{name} {{/each}}'
        const result = renderMarkdown(template, largeData)

        expect(result).toContain('User 0')
        expect(result).toContain('User 4')
        expect(result).not.toContain('User 5')
      })

      it('should handle special characters in field names', () => {
        const data = createResults([
          {
            'field-with-dashes': 'dash-value',
            field_with_underscores: 'underscore-value',
            'field with spaces': 'space-value',
            'field.with.dots': 'dot-value',
          },
        ])

        const template = '{data[0].field_with_underscores} {data[0]["field-with-dashes"]}'
        const result = renderMarkdown(template, data)

        // Only safe field names should work
        expect(result).toContain('underscore-value')
        expect(result).toContain('{data[0]["field-with-dashes"]}') // Should remain unprocessed
      })

      it('should handle mixed data types safely', () => {
        const mixedData = createResults([
          { value: 'string' },
          { value: 42 },
          { value: true },
          { value: null },
          { value: undefined },
          { value: { nested: 'object' } },
          { value: ['array', 'values'] },
        ])

        const template = '{{#each data}}{value} {{/each}}'
        const result = renderMarkdown(template, mixedData)

        expect(result).toContain('string')
        expect(result).toContain('42')
        expect(result).toContain('true')
        expect(result).toContain('[object Object]')
        expect(result).toContain('array,values')
      })

      it('should handle unicode and special characters', () => {
        const unicodeData = createResults([
          { name: 'José María', emoji: '🎉', chinese: '你好' },
          { name: 'François', emoji: '🚀', japanese: 'こんにちは' },
        ])

        const template = `# Unicode Test

{{#each data}}
- **{name}** {emoji} says "{chinese || japanese}"
{{/each}}`

        const result = renderMarkdown(template, unicodeData)

        expect(result).toContain('José María')
        expect(result).toContain('François')
        expect(result).toContain('🎉')
        expect(result).toContain('🚀')
        expect(result).toContain('你好')
        expect(result).toContain('こんにちは')
      })

      it('should handle nested template syntax edge cases', () => {
        const data = createResults([{ name: 'Test' }])

        const edgeCases = [
          '{{name}}', // Missing #each
          '{{{name}}}', // Triple braces
          '{{#each}}{{/each}}', // Missing array name
          '{{#each data}}{{#each}}{{/each}}{{/each}}', // Nested missing array
          '{{#each data}}{{name}', // Unclosed expression
          '{{#each data}}{{/each}}{{name}}', // Expression after loop
        ]

        edgeCases.forEach((template) => {
          expect(() => renderMarkdown(template, data)).not.toThrow()
        })
      })

      it('should handle extremely long field names', () => {
        const longFieldName = 'a'.repeat(1000)
        const data = createResults([{ [longFieldName]: 'value' }])

        const template = `{data[0].${longFieldName}}`

        // Should handle gracefully without crashing
        expect(() => renderMarkdown(template, data)).not.toThrow()
      })
    }))

  describe('Performance and Memory', () => {
    it('should handle repeated template processing efficiently', () => {
      const data = createResults([{ name: 'Test', value: 123 }])
      const template = 'Name: {data[0].name}, Value: {data[0].value}'

      const startTime = Date.now()

      // Process template multiple times
      for (let i = 0; i < 100; i++) {
        renderMarkdown(template, data)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000) // 1 second for 100 iterations
    })

    it('should handle deeply nested structures without stack overflow', () => {
      // Create deeply nested structure
      let nested: any = { value: 'deep' }
      for (let i = 0; i < 20; i++) {
        nested = { child: nested, level: i }
      }

      const data = createResults([{ nested }])
      const template = '{{#each data}}{nested.level}{{/each}}'

      expect(() => renderMarkdown(template, data)).not.toThrow()
    })

    it('should handle memory efficiently with large strings', () => {
      const largeString = 'x'.repeat(10000)
      const data = createResults([{ content: largeString }])
      const template = '# Large Content\n\n{data[0].content}'

      const result = renderMarkdown(template, data)
      expect(result).toContain('<h1 class="rendered-markdown-h1">Large Content</h1>')
      expect(result).toContain(largeString)
    })
  })

  describe('Security Edge Cases', () => {
    it('should prevent template injection attacks', () => {
      const maliciousData = createResults([
        { name: '{{#each data}}INJECTED{{/each}}' },
        { name: '{admin.password}' },
        { name: '<script>alert("xss")</script>' },
      ])

      const template = '{{#each data}}User: {name}{{/each}}'
      const result = renderMarkdown(template, maliciousData)

      // Template syntax in data should be treated as literal text
      expect(result).toContain('{{#each data}}INJECTED{{/each}}')
      expect(result).toContain('{admin.password}')

      // HTML should be escaped
      expect(result).not.toContain('<script>')
    })

    it('should prevent prototype pollution attempts', () => {
      const data = createResults([{ __proto__: { admin: true }, name: 'Test' }])

      const template = '{data[0].__proto__.admin} {data[0].name}'
      const result = renderMarkdown(template, data)

      // Should not access prototype properties
      expect(result).toContain('{data[0].__proto__.admin}')
      expect(result).toContain('Test')
    })

    it('should handle function injection attempts', () => {
      const data = createResults([
        {
          toString: () => 'INJECTED',
          valueOf: () => 'INJECTED',
          name: 'Safe',
        },
      ])

      const template = '{data[0].name}'
      const result = renderMarkdown(template, data)

      expect(result).toBe('Safe')
    })

    it('should sanitize output even with valid expressions', () => {
      const data = createResults([
        {
          content: '<img src="x" onerror="alert(1)">',
          script: '<script>alert("xss")</script>',
          name: 'Test & "quotes"',
        },
      ])

      const template = `# {data[0].name}

Content: {data[0].content}

Script: {data[0].script}`

      const result = renderMarkdown(template, data)

      expect(result).toContain('Test &amp; "quotes"')
      expect(result).toContain('Content: <p></p>')
      expect(result).toContain('Script: </p>')
      expect(result).not.toContain('onerror=')
      expect(result).not.toContain('<script>')
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle API response formatting', () => {
      const apiResponse = createResults([
        {
          id: 'usr_123',
          name: 'Alice Johnson',
          email: 'alice@example.com',
          created_at: '2024-01-15T10:30:00Z',
          metadata: {
            department: 'Engineering',
            role: 'Senior Developer',
            permissions: ['read', 'write', 'admin'],
          },
          recent_activity: [
            { action: 'login', timestamp: '2024-01-20T09:00:00Z' },
            { action: 'file_upload', timestamp: '2024-01-20T10:15:00Z' },
          ],
        },
      ])

      const template = `# User Profile: {data[0].name}

**User ID:** \`{data[0].id}\`  
**Email:** {data[0].email}  
**Created:** {data[0].created_at}  
**Department:** {data[0].metadata.department}  
**Role:** {data[0].metadata.role}

## Permissions
{{#each data[0].metadata.permissions}}
* {.}
{{/each}}

## Recent Activity
{{#each data[0].recent_activity}}
- **{action}** at {timestamp}
{{/each}}

## API Response
\`\`\`json
{
  "id": "{data[0].id}",
  "name": "{data[0].name}",
  "email": "{data[0].email}"
}
\`\`\``

      const result = renderMarkdown(template, apiResponse)
      expect(result).toContain('<h1 class="rendered-markdown-h1">User Profile: Alice Johnson</h1>')
      expect(result).toContain('<strong>Department:</strong> Engineering')
      expect(result).toContain('<ul><li>read</li>')
      expect(result).toContain('<strong>login</strong>')
      expect(result).toContain('"id": "{data[0].id}"') // Should not process inside code blocks
    })

    it('should handle dashboard widget content', () => {
      const dashboardData = createResults([
        {
          widget_type: 'metrics',
          title: 'Sales Dashboard',
          metrics: [
            { name: 'Total Revenue', value: '$125,430', change: '+12%' },
            { name: 'New Customers', value: '45', change: '+8%' },
            { name: 'Conversion Rate', value: '3.2%', change: '-2%' },
          ],
          last_updated: '2024-01-20 15:30:00',
        },
      ])

      const template = `# {data[0].title}

{{#each data[0].metrics}}
## {name}
**Current Value:** {value}  
**Change:** {change}
{{/each}}

*Last updated: {data[0].last_updated}*`

      const result = renderMarkdown(template, dashboardData)

      expect(result).toContain('<h1 class="rendered-markdown-h1">Sales Dashboard</h1>')
      expect(result).toContain('<h2 class="rendered-markdown-h2">Total Revenue</h2>')
      expect(result).toContain('<strong>Current Value:</strong> $125,430')
      expect(result).toContain('<em>Last updated: 2024-01-20 15:30:00</em>')
    })
  })
})
