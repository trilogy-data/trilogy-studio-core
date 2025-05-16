import type { ModelConceptInput } from './models'
import { createPrompt } from './prompts'

export interface TestScenario {
  name: string
  description: string
  prompt: string
  expectedResponse: {
    contains?: string[]
    notContains?: string[]
    mustIdentify?: string // What issue must be identified
  }
}

const testFields: ModelConceptInput[] = [
  { name: 'id', type: 'int' },
  { name: 'quantity', type: 'float' },
  { name: 'extended_price', type: 'float::money' },
  { name: 'discount', type: 'float::percent', description: 'percent discount' },
  { name: 'tax', type: 'float::percent', description: 'tax, as percentage' },
  { name: 'return_flag', type: 'string' },
  { name: 'line_status', type: 'string' },
  { name: 'ship_date', type: 'date' },
  { name: 'commit_date', type: 'date' },
  { name: 'receipt_date', type: 'date' },
  { name: 'ship_instruct', type: 'string' },
  { name: 'ship_mode', type: 'string' },
  { name: 'comment', type: 'string' },
  { name: 'supplier.id', type: 'int' },
  { name: 'supplier.nation.name', type: 'string' },
  { name: 'supplier.name', type: 'string' },
  { name: 'order.id', type: 'int' },
  { name: 'order.date', type: 'date' },
  { name: 'order.customer.name', type: 'string' },
  { name: 'order.customer.nation.name', type: 'string' },
  { name: 'order.customer.id', type: 'int' },
]

const testCases: TestScenario[] = [
  {
    name: 'Basic Query',
    description: 'Tests if the LLM can create a simple trilogy query from user input.',
    prompt: createPrompt('what were sales for the last 3 months by order date?', testFields),
    expectedResponse: {
      contains: ['extended_price'],
      mustIdentify: 'order.date',
      notContains: ['FROM'],
    },
  },
  {
    name: 'Aggregate Query',
    description: 'Tests if the LLM can generate an aggregate query.',
    prompt: createPrompt('what are sales by supplier name and nation?', testFields),
    expectedResponse: {
      contains: ['extended_price'],
      mustIdentify: 'supplier.nation.name',
      notContains: ['FROM', 'GROUP BY'],
    },
  },
  {
    name: 'Complex Query',
    description: 'Tests for a more complex query, with limits and ordering.',
    prompt: createPrompt('Who were the top ten customers by sales in august 1995?', testFields),
    expectedResponse: {
      contains: ['extended_price', 'order.customer.name', '8'],
      mustIdentify: 'order.customer.name',
      notContains: ['FROM', 'GROUP BY'],
    },
  },

  {
    name: 'Multi-part Conditions',
    description: 'Tests for a query that includes multiple conditions.',
    prompt: createPrompt(
      'Who were the top ten customers by sales in august 1995 who had orders that shipped in october or september?',
      testFields,
    ),
    expectedResponse: {
      contains: ['extended_price', 'order.customer.name', '8',],
      mustIdentify: 'order.customer.name',
      notContains: ['FROM', 'GROUP BY'],
    },
  },

  {
    name: 'Test Count(*) Handling',
    description: 'Test proper counting of identifiers',
    prompt: createPrompt('How many customers are there by country?', testFields),
    expectedResponse: {
      contains: ['order.customer.id'],
      mustIdentify: 'order.customer.nation.name',
      notContains: ['FROM', 'GROUP BY', '*'],
    },
  },
]

export default testCases
