import { rulesInput, functions, aggFunctions, datatypes } from './constants'
import type { ModelConceptInput } from './models'
import { generateDashboardPrompt } from '../../dashboards/prompts'

const leadIn = `You are a world-class assistant for generating queries in Trilogy, a SQL inspired language with similar syntax, Use the the syntax description below and field information to answer the user request. Return your answer with a short reasoning and a valid Trilogy query in triple double quotes.

Key Trilogy Syntax Rules:
${rulesInput}

Aggregate Functions:
\`${aggFunctions}\`

Functions:  
\`${functions}\`

Valid types:  
\`${datatypes}\`

`

function conceptsToFieldPrompt(conceptInputs: ModelConceptInput[]) {
  return conceptInputs
    .map(
      (field) =>
        `[name: ${field.name} | type:${field.type}${field.calculation ? ' | alias_for:' + field.calculation : ''} ${field.description ? ' | description:' + field.description : ''} ${field.keys ? ' | grain:' + field.keys : ''}]`,
    )
    .join(', ')
}

export function createPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return `${leadIn}. Using these base and aliased calculations, derivations thereof created with valid Trilogy, and any extra context you have: ${fields}, create the best valid Trilogy query to answer the following user input: "${query}" Return the query within triple double quotes with your thinking and justification before it, so of this form as a jinja template: Reasoning: {{reasoning_placeholder}} """{{ trilogy }}""". Example: Because the user asked for sales by year, and revenue is the best sales related field available, we can aggregate revenue by year: """SELECT order.year, sum(revenue) as year_revenue order by order.year asc;"""`
}

export function createFilterPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return `${leadIn}. Using these base and aliased calculations, derivations thereof created with valid Trilogy, and any extra context you have: ${fields}, create the closest matching syntactically valid WHERE CLAUSE to filter a dashboard from this request """${query}""".  Return only the portion of a SQL query representing the where clause, excluding any ordering. Do not include comments. After you generate the code, review it carefully to make sure it is only the partial where clause of a select, starting with WHERE (imagine if you put a "select 1 ..." in front of it.), with no semicolon at the end. Return your generated code within triple double quotes with thinking and justification before it in the form (as a jinja example) Reasoning: {{reasoning}} """{{ trilogy }}""". Example: Reasoning: Because the user asked for rainbow colors, we can filter to where the color is a primary color """where color in ('red', 'blue', 'violet')"""`
}

export function createDashboardPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return generateDashboardPrompt(query, fields)
}
