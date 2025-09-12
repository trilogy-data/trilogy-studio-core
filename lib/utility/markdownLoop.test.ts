import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdownRenderer'

describe('Template Loops', () => {
    const sampleData = {
        data: [
            {
                name: 'John',
                age: 30,
                tags: ['developer', 'frontend'],
                projects: [
                    { name: 'Project A', status: 'active' },
                    { name: 'Project B', status: 'completed' }
                ]
            },
            {
                name: 'Jane',
                age: 25,
                tags: ['designer', 'ux'],
                projects: [
                    { name: 'Design System', status: 'active' }
                ]
            }
        ]
    }

    describe('Data Loops', () => {
        it('should loop through main data array', () => {
            const template = '{{#each data}}- {{name}} ({{age}}){{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('- John (30)- Jane (25)')
        })

        it('should handle @index in data loops', () => {
            const template = '{{#each data}}{{@index}}: {{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('0: John1: Jane')
        })

        it('should work with multiline templates', () => {
            const template = `{{#each data}}
## {{name}}
Age: {{age}}
{{/each}}`
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('<h2 class="rendered-markdown-h2">John</h2>')
            expect(result).toContain('<h2 class="rendered-markdown-h2">Jane</h2>')
            expect(result).toContain('Age: 30')
            expect(result).toContain('Age: 25')
        })

        it('should handle empty data arrays', () => {
            const template = '{{#each data}}{{name}}{{/each}}'
            const result = renderMarkdown(template, { data: [] })
            expect(result).toBe('')
        })

        it('should handle data loops with limits', () => {
            const template = '{{#each data limit=1}}{{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('John')
        })
    })

    describe('Array Field Loops', () => {
        it('should loop through array fields', () => {
            const template = '{{#each data}}{{name}}: {{#each tags}}{{.}} {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('John: developer frontend Jane: designer ux ')
        })

        it('should handle nested object arrays', () => {
            const template = '{{#each data}}{{name}}\'s projects: {{#each projects}}{{name}} ({{status}}) {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('John\'s projects: Project A (active) Project B (completed)')
            expect(result).toContain('Jane\'s projects: Design System (active)')
        })

        it('should handle @index in array field loops', () => {
            const template = '{{#each data}}{{#each tags}}{{@index}}: {{.}} {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('0: developer 1: frontend 0: designer 1: ux ')
        })

        it('should handle fallbacks in array loops', () => {
            const template = '{{#each data}}{{#each projects}}{{name || "Unnamed"}} {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('Project A')
            expect(result).toContain('Project B')
            expect(result).toContain('Design System')
        })

        it('should handle nested property access in array loops', () => {
            const complexData = {
                data: [{
                    name: 'Team',
                    members: [
                        { profile: { name: 'Alice', role: 'Lead' } },
                        { profile: { name: 'Bob', role: 'Dev' } }
                    ]
                }]
            }
            const template = '{{#each data}}{{#each members}}{{profile.name}} ({{profile.role}}) {{/each}}{{/each}}'
            const result = renderMarkdown(template, complexData)
            expect(result).toBe('Alice (Lead) Bob (Dev) ')
        })
    })

    describe('Loop Limits', () => {
        it('should respect limits on data loops', () => {
            const template = '{{#each data limit=1}}- {{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('- John')
        })

        it('should respect limits on array field loops', () => {
            const template = '{{#each data}}{{#each tags limit=1}}{{.}} {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('developer designer ')
        })

        it('should handle zero limits', () => {
            const template = '{{#each data limit=0}}{{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('')
        })

        it('should handle limits larger than array size', () => {
            const template = '{{#each data limit=10}}{{name}} {{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('John Jane ')
        })

        it('should reject invalid limits', () => {
            const template = '{{#each data limit=invalid}}{{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('{{#each data limit=invalid}}') // Should remain unprocessed
        })

        it('should reject unsafe limits', () => {
            const template = '{{#each data limit=99999}}{{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('{{#each data limit=99999}}') // Should remain unprocessed
        })
    })

    describe('Nested Loops', () => {
        it('should handle deeply nested loops', () => {
            const nestedData = {
                data: [{
                    name: 'Company',
                    departments: [
                        {
                            name: 'Engineering',
                            teams: [
                                { name: 'Frontend', members: ['Alice', 'Bob'] },
                                { name: 'Backend', members: ['Charlie'] }
                            ]
                        }
                    ]
                }]
            }

            const template = `{{#each data}}
{{name}}:
{{#each departments}}
  - {{name}}:
  {{#each teams}}
    - {{name}}: {{#each members}}{{.}} {{/each}}
  {{/each}}
{{/each}}
{{/each}}`

            const result = renderMarkdown(template, nestedData)
            expect(result).toContain('Company:')
            expect(result).toContain('Engineering:')
            expect(result).toContain('Frontend: Alice Bob')
            expect(result).toContain('Backend: Charlie')
        })

        it('should handle context switching in nested loops', () => {
            const template = '{{#each data}}{{name}}: {{#each projects}}[{{name}}] {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('John: [Project A] [Project B]')
            expect(result).toContain('Jane: [Design System]')
        })

        it('should handle mixed field access in nested loops', () => {
            const template = '{{#each data}}User {{name}} has {{#each tags}}{{.}}{{/each}} skills{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('User John has developerfrontend skills')
            expect(result).toContain('User Jane has designerux skills')
        })
    })

    describe('Loading State', () => {
        it('should show loading pills for data loops', () => {
            const template = '{{#each data}}{{name}} {{/each}}'
            const result = renderMarkdown(template, sampleData, true)
            expect(result).toContain('loading-pill')
            expect(result).toContain('shimmer')
            expect(result).toContain('@keyframes shimmer')
        })

        it('should show loading pills for array field loops', () => {
            const template = '{{#each data}}{{#each tags}}{{.}} {{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData, true)
            expect(result).toContain('loading-pill')
        })

        it('should limit loading items to 3', () => {
            const template = '{{#each data}}- {{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData, true)
            const pillCount = (result.match(/loading-pill/g) || []).length
            expect(pillCount).toBeLessThanOrEqual(3)
        })

        it('should respect limits in loading state', () => {
            const template = '{{#each data limit=1}}{{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData, true)
            const pillCount = (result.match(/loading-pill/g) || []).length
            expect(pillCount).toBe(1)
        })

        it('should handle @index in loading state', () => {
            const template = '{{#each data}}{{@index}}: {{name}}{{/each}}'
            const result = renderMarkdown(template, sampleData, true)
            expect(result).toContain('loading-pill')
        })
    })

    describe('Error Handling', () => {
        it('should handle malformed loop syntax', () => {
            const template = '{{#each data}}{{name}}{{/missing}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toContain('{{#each data}}') // Should remain unprocessed
        })

        it('should handle missing array fields', () => {
            const template = '{{#each data}}{{#each nonexistent}}{{.}}{{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('') // Empty result for missing arrays
        })

        it('should handle non-array fields in loops', () => {
            const template = '{{#each data}}{{#each name}}{{.}}{{/each}}{{/each}}'
            const result = renderMarkdown(template, sampleData)
            expect(result).toBe('') // Empty result for non-arrays
        })

        it('should handle null data safely', () => {
            const template = '{{#each data}}{{name}}{{/each}}'
            const result = renderMarkdown(template, null)
            expect(result).toBe('')
        })
    })
})