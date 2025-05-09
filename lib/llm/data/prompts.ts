import { rulesInput, functions, datatypes } from './constants'
import type { ModelConceptInput } from './models'
import { generateDashboardPrompt } from '../../dashboards/prompts'

const leadIn = `You are a world-class, knowledgeable, and precise assistent for writing queries in a new language, Trilogy. Trilogy is like SQL, but doesn't need you to specify tables or joins. 
The following functions are available: ${functions} (all of these are called as "name(...args)") in Trilogy.
You can also use standard ANSI SQL constructs like window clauses, mathematical operators, etc. You can try a function and will be told if it doesn\t exist. Valid datatypes are ${datatypes}. `

function conceptsToFieldPrompt(conceptInputs: ModelConceptInput[]) {
  return conceptInputs
    .map(
      (field) =>
        `[name:${field.name} type:${field.type} ${field.calculation ? 'use in place of (named calculation):' + field.calculation : ''} ${field.description ? 'description:' + field.description : ''} ]`,
    )
    .join(', ')
}

export function createPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return `${leadIn}. Follow these syntax rules carefully ${rulesInput}. Using these base and aliased calculations, derivations thereof created with valid SQL, and any extra context you have: ${fields}, create the best valid Trilogy query to answer the following user input: "${query}" Return the query within triple double quotes with your thinking and justification before it in the reasoning placeholder, so of the form Reasoning:{{reasoning_placeholder}} """{{ trilogy }}""". Example: Because the user asked for sales by year, and revenue is the best sales related field available, we can aggregate revenue by year: """SELECT order.year, sum(revenue) as year_revenue order by order.year asc;"""`
}

export function createFilterPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return `${leadIn}. Follow these syntax rules carefully ${rulesInput}. Using these ba  se and aliased calculations, derivations thereof created with valid SQL, and any extra context you have: ${fields}, create the closest matching syntactically valid WHERE CLAUSE to filter a dashboard from this request """${query}""".  Return only the portion of a SQL query representing the where clause, excluding any ordering. Do not include comments. After you generate the code, review it carefully to make sure it is only the partial where clause of a select, starting with WHERE (imagine if you put a "select 1 ..." in front of it.), with no semicolon at the end. Return your generated code within triple double quotes with thinking and justification before it in the form Reasoning: {{reasoning}} """{{ trilogy }}""". Example: Because the user asked for rainbow colors, returning """where color in ('red', 'blue', 'violet')"""`
}

export function createDashboardPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptsToFieldPrompt(conceptInputs)
  return generateDashboardPrompt(query, fields)
}
