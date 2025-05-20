export const rulesInput = `- No FROM, JOIN, GROUP BY, SUB SELECTS, DISTINCT, UNION, or SELECT *.
- All fields exist in a global namespace; field paths look like \`order.product.id\`. Always use the full path. NEVER include a from clause.
- If a field has a grain defined, and that grain is not in the query output, aggregate it to get desired result. 
- If a field has a 'alias_for' defined, it is shorthand for that calculation. Use the field name instead of the calculation in your query to be concise. 
- Newly created fields at the output of the select must be aliased with as (e.g. \`sum(births) as all_births\`). 
- Aliases cannot happen inside calculations or in the where/having/order clause. Never alias fields with existing names. 'sum(revenue) as total_revenue' is valid, but '(sum(births) as total_revenue) +1 as revenue_plus_one' is not.
- Implicit grouping: NEVER include a group by clause. Grouping is by non-aggregated fields in the SELECT clause.
- You can dynamically group inline to get groups at different grains - ex:  \`sum(metric) by dim1, dim2 as sum_by_dim1_dm2\` for alternate grouping.
- Count must specify a field (no \`count(*)\`) Counts are automatically deduplicated. Do not ever use DISTINCT.
- Since there are no underlying tables, sum/count of a constant should always specify a grain field (e.g. \`sum(1) by x as count\`). 
- Aggregates in SELECT must be filtered via HAVING. Use WHERE for pre-aggregation filters.
- Use \`field ? condition\` for inline filters (e.g. \`sum(x ? x > 0)\`).
- Always use a reasonable \`LIMIT\` for final queries unless the request is for a time series or line chart.
- Window functions: \`rank entity [optional over group] by field desc\` (e.g. \`rank name over state by sum(births) desc as top_name\`).
- For lag/lead, offset is first: lag/lead offset field order by expr asc/desc.
- For lag/lead with a window clause: lag/lead offset field by window_clause order by expr asc/desc.
- Use \`::type\` casting, e.g., \`"2020-01-01"::date\`.
- Comments use \`#\` only, per line.
- Two example queries: "where year between 1940 and 1950
  select
      name,
      state,
      sum(births) AS all_births,
      sum(births ? state = 'VT') AS vermont_births,
      rank name over state by all_births desc AS state_rank,
      rank name by sum(births) by name desc AS all_rank
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

export const aggFunctions = ['avg', 'count', 'max', 'min', 'sum']

export const functions = [
  'abs',
  'alias',
  // 'attr_access',
  'bool',
  'case <normal when/then/else/end structure>',
  'cast',
  'coalesce',
  'concat',
  'contains',
  'current_date()',
  'current_datetime()',
  'date',
  'date_add',
  'date_diff',
  'date_part',
  'date_sub',
  'date_truncate',
  'datetime',
  'day',
  'day_of_week',
  // 'group',
  'hour',
  // 'index_access',
  'isnull',
  'len',
  'length',
  'like',
  'lower',
  // 'map_access',
  'minute',
  'month',
  'now',
  'nullif',
  'quarter',
  'random',
  'regexp_contains',
  'regexp_extract',
  'regexp_replace',
  'round',
  'floor',
  'ceil',
  'second',
  'split',
  'sqrt',
  'strpos',
  'struct',
  'substring (1-indexed)',
  'sum',
  'timestamp',
  'trim',
  'unix_to_timestamp',
  'unnest',
  'upper',
  'week',
  'year',
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
