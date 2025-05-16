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


  it('should handle language prefixes with whitespace', () => {
    const input = 'Here is SQL code:\n```sql\nSELECT * FROM users;\n```'
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM users;\n')
  })

  it('should keep non trilogy prefixes', () => {
    const input = `
\`\`\`{"data": [1, 2, 3]}
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

  it('should handle straight double quotes', () => {
    const input = `getting value from  Reasoning:{{To get the ratio of returned items to quantity sold, we need to divide the count of returned items by the sum of the quantity. The quantity field represents the quantity of a part within an order. We can use a filtered count for the returned items, dividing by the sum of the quantity to get the ratio. We should filter out null quantity values for a safe division. }}
"""
where quantity is not null
select
    part.name,
    count(id ? return_flag = 'R') / sum(quantity) as return_ratio
order by return_ratio desc;
"""`
    expect(extractLastTripleQuotedText(input)).toBe(`
where quantity is not null
select
    part.name,
    count(id ? return_flag = 'R') / sum(quantity) as return_ratio
order by return_ratio desc;
`)
  })

  it ('should handle this response', () => {
    const input = `Reasoning:The user is asking "what states have the most people?". From the provided data, \`state.population\` represents the population of each state. Thus, we need to select the state and its population, and order by population descending to find the states with the most people. Also, based on the description of the \`state.population\` field, it has grain \`state\`.

\`\`\`trilogy
"""select
    state,
    state.population
order by
    state.population desc
limit 10;
"""
\`\`\``

expect(extractLastTripleQuotedText(input)).toBe(`select
    state,
    state.population
order by
    state.population desc
limit 10;
`)

  })
})
