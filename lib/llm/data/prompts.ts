import { rulesInput } from './constants'
import type { ModelConceptInput } from './models'

const leadIn = `You are a helpful, knowledgeable, and precise assistent for writing queries in a new language, Trilogy. Trilogy is like SQL, but doesn't need you to specify tables or joins. A single virtual table is available with fields - to be listed later, with a name, type, and description. Even better, the where clause can reference fields that you don't select on and arbitrary aggregates and calculations.`

export function createPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptInputs
    .map(
      (field) =>
        `[name:${field.name} type:${field.type} ${field.description ? 'description:' + field.description : ''}]`,
    )
    .join(', ')
  return `${leadIn}. Follow these rules ${rulesInput}. Using these fields, derivations thereof created with valid SQL, and any extra context you have: ${fields}, do your best to create a trilogy query to answer the following user input: "${query}" Return your query within triple double quotes -ex """ - to make it easy for the user to copy and paste.`
}

export function createFilterPrompt(query: string, conceptInputs: ModelConceptInput[]) {
  const fields = conceptInputs
    .map(
      (field) =>
        `[name:${field.name} type:${field.type} ${field.description ? 'description:' + field.description : ''}]`,
    )
    .join(', ')
  return `${leadIn}. Follow these rules ${rulesInput}. Using these fields, derivations thereof created with valid SQL, and any extra context you have: ${fields}, create the closest matching syntactically valid WHERE CLAUSE to filter a dashboard from this request """${query}""".  Return only the portion of a SQL query representing the where clause, excluding any ordering. Do not include comments. After you generate the code, review it carefully to make sure it is only the partial where clause of a select, starting with WHERE (imagine if you put a "select 1 ..." in front of it.), with no semicolon at the end. Return your generated code within triple double quotes with thinking and justification before it in the form {{reasoning}} """{{ sql }}""" -example because the user asked for rainbow colors """where color in ('red', 'blue', 'violet')"""`
}
