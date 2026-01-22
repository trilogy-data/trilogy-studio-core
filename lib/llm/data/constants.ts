export const rulesInput = `
Trilogy statements define a semantic model or query. If a user is asking for data, they want a SELECT.
Semantic model statements:
- import <> imports a model to reuse. The output of imports will be visible in fields available to use.
- key|property|auto|metric defines fields locally. The output will also be visible in fields available to use, so you generally don't need to edit these unless requested.
- datasource statements define a datasource, which is a mapping of fields to a SQL database table. The left side is the SQL column name, the right side is the field name.

SELECT RULES:
- No FROM, JOIN, GROUP BY, SUB SELECTS, DISTINCT, UNION, or SELECT *.
- All fields exist in a global namespace; field paths look like \`order.product.id\`. Always use the full path. NEVER include a from clause.
- If a field has a grain defined, and that grain is not in the query output, aggregate it to get desired result. 
- If a field has a 'alias_for' defined, it is shorthand for that calculation. Use the field name instead of the calculation in your query to be concise. 
- Newly created fields at the output of the select must be aliased with as (e.g. \`sum(births) as all_births\`). 
- Aliases cannot happen inside calculations or in the where/having/order clause. Never alias fields with existing names. 'sum(revenue) as total_revenue' is valid, but '(sum(births) as total_revenue) +1 as revenue_plus_one' is not.
- Implicit grouping: NEVER include a group by clause. Grouping is by non-aggregated fields in the SELECT clause.
- You can dynamically group inline to get groups at different grains - ex:  \`sum(metric) by dim1, dim2 as sum_by_dim1_dm2\` for grouping different from inferred by dimension fields. Aggregate by \`*\` to get the total regardless of select dimensions.
- Count must specify a field (no \`count(*)\`) Counts are automatically deduplicated. Do not ever use DISTINCT. COUNT/SUM(1) will always be 1 unless you group 1 by a field and then count/sum it.
- Use a sum/count/avg/max/min over a field to get aggregates at different grains (e.g. \`sum(births) over state as state_births\`).
- Since there are no underlying tables, sum/count of a constant should always specify a grain field (e.g. \`sum(1) by x as count\`). 
- Aggregates in SELECT must be filtered via HAVING. Use WHERE for pre-aggregation filters.
- Use \`field ? condition\` for inline filters (e.g. \`sum(x ? x > 0)\`).
- Always use a reasonable \`LIMIT\` for final queries unless the request is for a time series or line chart.
- Window functions: \`rank entity [optional over group] by field desc\` (e.g. \`rank name over state by sum(births) desc as top_name\`) Do not use parentheses for over.
- Functions. All function names have parenthese (e.g. \`sum(births)\`, \`date_part('year', dep_time)\`). For no arguments, use empty parentheses (e.g. \`current_date()\`).
- For lag/lead, offset is first: lag/lead offset field order by expr asc/desc.
- For lag/lead with a window clause: lag/lead offset field by window_clause order by expr asc/desc.
- Use \`::type\` casting, e.g., \`"2020-01-01"::date\`.
- Import the std.lib to access special rendering types; import std.display; at the top of a query will let you cast a field to ::percent which will render it properly.
- Date_parts have no quotes; use \`date_part(order_date, year)\` instead of \`date_part(order_date, 'year')\`. date parts are: year, quarter, month, week, day, day_of_week, year_start, month_start, hour, minute, second.
- date_parts can be accessed directly through dot notation, e.g., \`order_date.year\`.
- Comments use \`#\` only, per line.
- Use \`--\` before a field in a select to hide it from output. This is useful for having a field available for filtering without returning it when making charts, for example. Hidden fields are still available for use in WHERE, HAVING, ORDER BY, and calculations.
- Two example queries: "where year between 1940 and 1950
  select
      name,
      state,
      sum(births) by * as all_births_no_dims,
      sum(births) AS births_by_name_state,
      sum(births ? state = 'VT') AS vermont_births,
      rank name over state by all_births desc AS state_rank,
      rank name by sum(births) by name desc AS all_rank,
      -- sum(births ? state = 'MA') as hidden_mass_births
  having 
      all_rank<11
      and state = 'ID'
  order by 
    all_rank asc
    limit 5;", "where dep_time between '2002-01-01'::datetime and '2010-01-31'::datetime
  select
      carrier.name,
      count(id2) AS total_flights,
      total_flights / date_diff(min(dep_time.date), max(dep_time.date), DAY) AS average_daily_flights
  order by 
    total_flights desc;
  "`

export const aggFunctions = [
  'avg',
  'count',
  // 'count_distinct',
  'max',
  'min',
  'sum',
  'array_agg',
  'any',
]
export const functions = [
  'abs',
  'alias',
  // 'attr_access',
  'bool',
  'case <normal when/then/else structure>',
  'cast',
  'coalesce',
  'concat',
  'contains',
  'current_date',
  'current_datetime',
  'current_timestamp',
  "date_add #date_add(date, unit, interval), ex date_add('2020-01-01'::date, month, 1)",
  "date_diff #date_diff(date1, date2, unit), ex date_diff('2020-01-01'::date, '2020-01-02'::date, day)",
  "date_part #date_part(date, unit), ex date_part('2020-01-01'::date, year)",
  "date_sub #date_sub(date, unit, interval), ex date_sub('2020-01-01'::date, day, 1)",
  "date_trunc #date_trunc(date, unit), ex date_trunc('2020-01-01'::date, month)",
  'date_spine',
  'datetime',
  'day',
  'day_of_week',
  'day_name',
  'month_name',
  'divide',
  'multiply',
  'add',
  'subtract',
  'mod',
  'log',
  // 'group',
  'hour',
  // 'index_access',
  'isnull',
  'len',
  'length',
  'like',
  'ilike',
  'lower',
  // 'map_access',
  'minute',
  'month',
  'now #now()',
  'nullif',
  'quarter',
  'random',
  'regexp_contains #regexp_contains(string, pattern)',
  'regexp_extract #regexp_extract(string, pattern)',
  'regexp_replace #regexp_replace(string, pattern, replacement)',
  'replace #replace(string, search, replacement)',
  "hash #hash(value, 'SHA256'|'MD5')",
  'round #round(value, decimals)',
  'floor',
  'ceil',
  'second',
  'split',
  'sqrt',
  'strpos',
  'struct',
  'substring (1-indexed)',
  'trim',
  'timestamp',
  'trim',
  'unix_to_timestamp',
  'unnest',
  'upper',
  'week',
  'year',
  'custom',
  'recurse_edge',
  'union',
  'parenthetical',
  'constant',
  'typed_constant',
  'array',
  'date_literal',
  'datetime_literal',
  'array_distinct',
  'array_sort',
  'array_transform',
  'array_to_string #array_to_string(values, ',
  ')',
  'array_filter # def filter(x) -> x > 2; SELECT array_filter(num_list, @filter) AS filtered_values;',
  'map_keys',
  'map_values',
]

export const datatypes = [
  // PRIMITIVES
  'string',
  'bool',
  'map',
  'list',
  'number',
  'float',
  'numeric',
  'int',
  'date',
  'datetime',
  'timestamp',
  'array',
  'struct',
  'null',
  // GRANULAR
  'unix_seconds',
  // PARSING
  'unknown',
]
