import { describe, it, expect } from 'vitest';
import { extractLastTripleQuotedText } from './llmStore';

describe('extractLastTripleQuotedText', () => {
  it('should handle basic triple backtick code blocks', () => {
    const input = 'Here is some code:\n```\nconst x = 1;\n```';
    expect(extractLastTripleQuotedText(input)).toBe('\nconst x = 1;\n');
  });

  it('should strip trilogy language prefix', () => {
    const input = 'Here is trilogy code:\n```trilogy\nSELECT * FROM table;\n```';
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM table;\n');
  });

  it('should strip sql language prefix', () => {
    const input = 'Here is SQL code:\n```sql\nSELECT * FROM users;\n```';
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM users;\n');
  });

  it('should strip json language prefix', () => {
    const input = 'Here is JSON:\n```json\n{"name": "John"}\n```';
    expect(extractLastTripleQuotedText(input)).toBe('{"name": "John"}\n');
  });

  it('should handle triple single quotes', () => {
    const input = "Here is some text:\n'''\nSample text\n'''";
    expect(extractLastTripleQuotedText(input)).toBe('\nSample text\n');
  });

  it('should handle triple double quotes', () => {
    const input = 'Here is some text:\n"""\nSample text\n"""';
    expect(extractLastTripleQuotedText(input)).toBe('\nSample text\n');
  });


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
\`\`\``;
    
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
`);
  });

  it('should return the original input if no triple quotes are found', () => {
    const input = 'This is plain text with no code blocks';
    expect(extractLastTripleQuotedText(input)).toBe(input);
  });

  it('should handle multiple code blocks and return the last one', () => {
    const input = '```\nFirst block\n```\nSome text\n```\nSecond block\n```';
    expect(extractLastTripleQuotedText(input)).toBe('\nSecond block\n');
  });

  it('should handle mixed quote types and return the first one', () => {
    const input = '```\nBacktick block\n```\nSome text\n"""\nDouble quote block\n"""';
    expect(extractLastTripleQuotedText(input)).toBe('\nBacktick block\n');
  });

  it('should handle language prefixes with whitespace', () => {
    const input = 'Here is SQL code:\n```sql\nSELECT * FROM users;\n```';
    expect(extractLastTripleQuotedText(input)).toBe('SELECT * FROM users;\n');
  });
  
  it('should handle multiple language prefixes in one document', () => {
    const input = `
\`\`\`sql
SELECT * FROM users;
\`\`\`

Here's some JSON:

\`\`\`json
{"data": [1, 2, 3]}
\`\`\`
`;
    expect(extractLastTripleQuotedText(input)).toBe('{"data": [1, 2, 3]}\n');
  });

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
\`\`\``;

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
`;
    expect(extractLastTripleQuotedText(input)).toBe(expected);
  });
  // handle another real-world example with a dashboard spec
  it('should handle a real-world dashboard example with a filter spec', () => {
    const input = `Reasoning:\n\nThe previous responses failed because they included conversational text before the JSON object, and were cut off. This attempt addresses these issues by:\n\n1.  Ensuring the JSON object starts immediately after the triple backticks.\n2.  Completing the JSON structure, including the missing \"orderPriority\" and \"shipMode\" gridItems.\n3.  Providing clear SQL query prompts for each chart and table.\n4.  Adhering to the specified layout and grid item properties.\n5.  Removing conversational text before the JSON object.\n\n```json\n{\n  \"name\": \"Best Selling Products Performance\",\n  \"description\": \"Dashboard to analyze the performance of our best-selling products.\",\n  \"layout\": [\n    {\n      \"x\": 0,\n      \"y\": 0,\n      \"w\": 20,\n      \"h\": 6,\n      \"id\": \"overview\"\n    },\n    {\n      \"x\": 0,\n      \"y\": 6,\n      \"w\": 20,\n      \"h\": 8,\n      \"id\": \"salesTrend\"\n    },\n    {\n      \"x\": 0,\n      \"y\": 14,\n      \"w\": 10,\n      \"h\": 8,\n      \"id\": \"topProducts\"\n    },\n    {\n      \"x\": 10,\n      \"y\": 14,\n      \"w\": 10,\n      \"h\": 8,\n      \"id\": \"regionalPerformance\"\n    },\n    {\n      \"x\": 0,\n      \"y\": 22,\n      \"w\": 10,\n      \"h\": 8,\n      \"id\": \"orderPriority\"\n    },\n    {\n      \"x\": 10,\n      \"y\": 22,\n      \"w\": 10,\n      \"h\": 8,\n      \"id\": \"shipMode\"\n    }\n  ],\n  \"gridItems\": {\n    \"overview\": {\n      \"type\": \"markdown\",\n      \"content\": \"# Best Selling Products Performance\\n\\nThis dashboard provides insights into the performance of our best-selling products. It includes key metrics such as total revenue, sales trends, regional performance, order priority, and ship mode analysis.\\n\\n*   **Sales Trend:** Visualize monthly revenue trends to identify patterns and anomalies.\\n*   **Top Products:** Identify the best-selling products based on total revenue.\\n*   **Regional Performance:** Analyze revenue distribution across different regions.\\n*   **Order Priority Analysis:** Understand the distribution of orders by priority.\\n*   **Ship Mode Analysis:** Understand the distribution of orders by ship mode.\",\n      \"name\": \"Overview\"\n    },\n    \"salesTrend\": {\n      \"type\": \"chart\",\n      \"content\": \"Write a SQL query to fetch the monthly total revenue. The query should group data by `order.date.year` and `order.date.month` and calculate the sum of `total_revenue` for each month. Order the results chronologically.\",\n      \"name\": \"Sales Trend\"\n    },\n    \"topProducts\": {\n      \"type\": \"table\",\n      \"content\": \"Write a SQL query to retrieve the top 10 best-selling products based on total revenue. The query should join the `order` and `part` tables, group data by `part.name`, and calculate the sum of `total_revenue` for each product. Order the results by total revenue in descending order and limit to the top 10.\",\n      \"name\": \"Top Products\"\n    },\n    \"regionalPerformance\": {\n      \"type\": \"chart\",\n      \"content\": \"Write a SQL query to calculate the total revenue for each region. The query should join the `order` and `order.customer.nation.region` tables, group data by `order.customer.nation.region.name` and calculate the sum of `total_revenue` for each region. Order the results by total revenue in descending order.\",\n      \"name\": \"Regional Performance\"\n    },\n    \"orderPriority\": {\n      \"type\": \"table\",\n      \"content\": \"Write a SQL query to show the distribution of orders by priority. Group by `order.priority` and count the number of orders in each priority level. Order by count descending.\",\n      \"name\": \"Order Priority\"\n    },\n    \"shipMode\": {\n      \"type\": \"table\",\n      "
                    `
});