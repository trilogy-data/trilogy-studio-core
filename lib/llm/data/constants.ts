export const trilogyRules = [
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
  'To get a max or minimum, there is no need for a subselect - just do max(field) or min(field), such as in "where field_a=max(field_b);"',
  'End a full statement with a semicolon.',
]

export const rulesInput = 'Rule: ' + trilogyRules.join('\nRule: ')
