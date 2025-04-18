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

export interface ModelConceptInput {
  name: string
  type: string
  description?: string
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

const trilogyRules = [
  'Trilogy does not use GROUP BY clauses. Do not include a GROUP BY even if you aggregate. No answer should contain the GROUP BY sql keywords.',
  'Trilogy does not use the FROM clause. All fields are resolved from a global namespace. No answer should contain the FROM sql keyword.',
  'Trilogy does not have the DISTINCT keyword. Do not use it. When getting a count of an item, just do a count of the field.',
  'Trilogy uses # for comments. For multiline comments, comment each line. A comment must have a newline after it.',
  'If you use a where clause, place it before the select.',
  'Trilogy fields will look like struct paths - order.product.id. Use the full path.',
  'use date_add to manipulate dates, like date_add(ship_date, month, 3)',
  'If you filter on an aggregate in the select, add a HAVING clause for that portion of logic',
  'When comparing a field against a string in your query, explicitly cast the string to ensure the comparison is safe if the field is not also a string. Use the :: operator to cast, like "2021-01-01"::date',
  'Do not ever make up a field. Only use the fields provided. If you need a field that is not provided, you can put a comment in as a placeholder.',
  'Trilogy does not have the * symbol for counting. The count function requires a field as an argument. ID fields are good options for counts.',
  'Trilogy will let you immediately reuse a field by name after defining it in the select; do not duplicate calculations if you can avoid it.',
  'Only reference selected fields by name in the HAVING clause. Anything in HAVING should have been selected and addressable in the columns - the bit after the as.',
  'End all statements with a semicolon.',
]

const rulesInput = 'Rule: ' + trilogyRules.join('\nRule: ')

export function createPrompt(query: string, conceptInputs: ModelConceptInput[] = testFields) {
  const fields = conceptInputs
    .map(
      (field) =>
        `[name:${field.name} type:${field.type} ${field.description ? 'description:' + field.description : ''}]`,
    )
    .join(', ')
  return `You are a helpful assistent for writing queries in a new language, Trilogy. Trilogy is like SQL, but doesn't need you to specify tables or joins. A single virtual table is available with fields - to be listed later, with a name, type, and description. Even better, the where clause can reference fields that you don't select on. Follow these rules ${rulesInput}. Using only these fields: ${fields}, do your best to create a trilogy query to answer the following user input: "${query}" Return your query within triple double quotes -ex """ - to make it easy for the user to copy and paste.`
}

export function createFilterPrompt(query: string, conceptInputs: ModelConceptInput[] = testFields) {
  const fields = conceptInputs
    .map(
      (field) =>
        `[name:${field.name} type:${field.type} ${field.description ? 'description:' + field.description : ''}]`,
    )
    .join(', ')
  return `You are a helpful assistent for writing queries in a new language, Trilogy. Trilogy is like SQL, but doesn't need you to specify tables or joins. A single virtual table is available with fields - to be listed later, with a name, type, and description. Even better, the where clause can reference fields that you don't select on and arbitrary aggregates and calculations. Follow these rules ${rulesInput}. Using only these fields: ${fields}, do your best to create a trilogy WHERE CLAUSE to filter a dashboard by the following user request - "show me data where: ${query}" Return your where clause within triple double quotes -ex """ - to make it easy for the user to copy and paste. This should be only the portion of a SQL query after the WHERE keyword, excluding any ordering.`
}

const testCases: TestScenario[] = [
  {
    name: 'Basic Query',
    description: 'Tests if the LLM can create a simple trilogy query from user input.',
    prompt: createPrompt('what were sales for the last 3 months by order date?'),
    expectedResponse: {
      contains: ['extended_price'],
      mustIdentify: 'order.date',
      notContains: ['FROM'],
    },
  },
  {
    name: 'Aggregate Query',
    description: 'Tests if the LLM can generate an aggregate query.',
    prompt: createPrompt('what are sales by supplier name and nation?'),
    expectedResponse: {
      contains: ['extended_price'],
      mustIdentify: 'supplier.nation.name',
      notContains: ['FROM', 'GROUP BY'],
    },
  },
  {
    name: 'Complex Query',
    description: 'Tests for a more complex query, with limits and ordering.',
    prompt: createPrompt('Who were the top ten customers by sales in august 1995?'),
    expectedResponse: {
      contains: ['extended_price', 'order.customer.name', '8', '::date'],
      mustIdentify: 'order.customer.name',
      notContains: ['FROM', 'GROUP BY'],
    },
  },

  {
    name: 'Multi-part Conditions',
    description: 'Tests for a query that includes multiple conditions.',
    prompt: createPrompt(
      'Who were the top ten customers by sales in august 1995 who had orders that shipped in october or september?',
    ),
    expectedResponse: {
      contains: ['extended_price', 'order.customer.name', '8', '::date'],
      mustIdentify: 'order.customer.name',
      notContains: ['FROM', 'GROUP BY'],
    },
  },

  {
    name: 'Test Count(*) Handling',
    description: 'Test proper counting of identifiers',
    prompt: createPrompt('How many customers are there by country?'),
    expectedResponse: {
      contains: ['order.customer.id'],
      mustIdentify: 'order.customer.nation.name',
      notContains: ['FROM', 'GROUP BY', '*'],
    },
  },
]

export default testCases
