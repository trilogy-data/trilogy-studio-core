import { describe, it, expect } from 'vitest'
import { extractLastTripleQuotedText } from './llmStore'

describe('extractLastTripleQuotedText', () => {
  it('should handle basic triple backtick code blocks', () => {
    const input = 'Here is some code:\n```\nconst x = 1;\n```'
    expect(extractLastTripleQuotedText(input)).toBe('\nconst x = 1;\n')
  })

  it('should strip trilogy language prefix', () => {
    const input = 'Here is trilogy code:\n```trilogy\nSELECT * FROM table;\n```'
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM table;\n')
  })

  it('should strip sql language prefix', () => {
    const input = 'Here is SQL code:\n```sql\nSELECT * FROM users;\n```'
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM users;\n')
  })

  it('should strip json language prefix', () => {
    const input = 'Here is JSON:\n```json\n{"name": "John"}\n```'
    expect(extractLastTripleQuotedText(input)).toBe('{"name": "John"}\n')
  })

  it('should handle triple single quotes', () => {
    const input = "Here is some text:\n'''\nSample text\n'''"
    expect(extractLastTripleQuotedText(input)).toBe('\nSample text\n')
  })

  it('should handle triple double quotes', () => {
    const input = 'Here is some text:\n"""\nSample text\n"""'
    expect(extractLastTripleQuotedText(input)).toBe('\nSample text\n')
  })

  it('should handle a complex example with json prefix', () => {
    const input = `Here's a dashboard spec:

\`\`\`json
{
  "name": "Dashboard",
  "layout": [
    {
      "x": 0,
      "y": 0,
      "w": 10,
      "h": 5
    }
  ]
}
\`\`\``

    expect(extractLastTripleQuotedText(input)).toBe(`{
  "name": "Dashboard",
  "layout": [
    {
      "x": 0,
      "y": 0,
      "w": 10,
      "h": 5
    }
  ]
}
`)
  })

  it('should return the original input if no triple quotes are found', () => {
    const input = 'This is plain text with no code blocks'
    expect(extractLastTripleQuotedText(input)).toBe(input)
  })

  it('should handle multiple code blocks and return the last one', () => {
    const input = '```\nFirst block\n```\nSome text\n```\nSecond block\n```'
    expect(extractLastTripleQuotedText(input)).toBe('\nSecond block\n')
  })

  it('should handle mixed quote types and return the first one', () => {
    const input = '```\nBacktick block\n```\nSome text\n"""\nDouble quote block\n"""'
    expect(extractLastTripleQuotedText(input)).toBe('\nBacktick block\n')
  })

  it('should handle language prefixes with whitespace', () => {
    const input = 'Here is SQL code:\n```sql\nSELECT * FROM users;\n```'
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM users;\n')
  })

  it('should handle multiple language prefixes in one document', () => {
    const input = `
\`\`\`sql
SELECT * FROM users;
\`\`\`

Here's some JSON:

\`\`\`json
{"data": [1, 2, 3]}
\`\`\`
`
    expect(extractLastTripleQuotedText(input)).toBe('{"data": [1, 2, 3]}\n')
  })

  it('should handle a real-world dashboard example', () => {
    const input = `Okay, I will generate a JSON spec for the dashboard:

\`\`\`json
{
  "name": "Best Selling Products Analysis",
  "description": "Dashboard overview",
  "layout": [
    {
      "x": 0,
      "y": 0,
      "w": 20,
      "h": 3,
      "id": "overview_markdown"
    }
  ],
  "gridItems": {
    "overview_markdown": {
      "type": "markdown",
      "content": "# Dashboard Overview",
      "name": "Overview"
    }
  }
}
\`\`\``

    const expected = `{
  "name": "Best Selling Products Analysis",
  "description": "Dashboard overview",
  "layout": [
    {
      "x": 0,
      "y": 0,
      "w": 20,
      "h": 3,
      "id": "overview_markdown"
    }
  ],
  "gridItems": {
    "overview_markdown": {
      "type": "markdown",
      "content": "# Dashboard Overview",
      "name": "Overview"
    }
  }
}
`
    expect(extractLastTripleQuotedText(input)).toBe(expected)
  })
})
