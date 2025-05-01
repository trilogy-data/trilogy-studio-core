import { rulesInput, functions, datatypes } from './constants'
import type { ModelConceptInput } from './models'
import { type PromptGridItemData, type PromptDashboard, type PromptLayoutItem, generateDashboardPrompt } from '../../dashboards/prompts'

const leadIn = `You are a helpful, knowledgeable, and precise assistent for writing queries in a new language, Trilogy. Trilogy is like SQL, but doesn't need you to specify tables or joins. A single virtual table is available with fields - to be listed later, with a name, type, and description. Even better, the where clause can reference fields that you don't select on and arbitrary aggregates and calculations. The following functions are available: ${functions}, as well as standard SQL constructs like window clauses, mathematical operators, etc. You can try a function and will be told if it doesn\t exist. Valid datatypes are ${datatypes}. `

function conceptsToFieldPrompt(conceptInputs: ModelConceptInput[]) {
  return conceptInputs
    .map(
      (field) =>
        `[name:${field.name} type:${field.type} ${field.description ? 'description:' + field.description : ''}]`,
    )
    .join(', ')
}

export function createPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return `${leadIn}. Follow these syntax rules carefully ${rulesInput}. Using these fields, derivations thereof created with valid SQL, and any extra context you have: ${fields}, do your best to create a trilogy query to answer the following user input: "${query}" Return the query within triple double quotes with your thinking and justification before it in the reasoning placeholder, so of the form Reasoning:{{reasoning_placeholder}} """{{ trilogy }}""". Example: Because the user asked for sales by year, and revenue is the best sales related field available, we can aggregate revenue by year: """SELECT order.year, sum(revenue) as year_revenue order by order.year asc;"""`
}

export function createFilterPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return `${leadIn}. Follow these syntax rules carefully ${rulesInput}. Using these fields, derivations thereof created with valid SQL, and any extra context you have: ${fields}, create the closest matching syntactically valid WHERE CLAUSE to filter a dashboard from this request """${query}""".  Return only the portion of a SQL query representing the where clause, excluding any ordering. Do not include comments. After you generate the code, review it carefully to make sure it is only the partial where clause of a select, starting with WHERE (imagine if you put a "select 1 ..." in front of it.), with no semicolon at the end. Return your generated code within triple double quotes with thinking and justification before it in the form Reasoning: {{reasoning}} """{{ trilogy }}""". Example: Because the user asked for rainbow colors, returning """where color in ('red', 'blue', 'violet')"""`
}

export function createDashboardPrompt(query: string, conceptInputs: ModelConceptInput[]) {

  const fields = conceptsToFieldPrompt(conceptInputs)
  return generateDashboardPrompt(query, fields)
}