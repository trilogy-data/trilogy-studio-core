export const trilogyRules = [
  'Trilogy replaces the GROUP BY clause with implicit grouping based on the non-aggregated fields in the SELECT list. For aggregations requiring different dimensions within the same query, use the by specifier inside the aggregate function: agg_func(metric) by dim1, dim2.',
  'Trilogy does not use the FROM clause. All fields are resolved from a global namespace. No answer should contain the FROM sql keyword.',
  'Trilogy does not ever require joins. Joins will happen automatically. No answer should have the JOIN keyword.',
  'Trilogy does not have a standalone DISTINCT keyword. count_distinct can be used as a function to get the unique count of an object, but in most cases, when getting a count of an item, just do a count of the field as trilogy will resolve to the unique grain.',
  'Trilogy does not have the UNION keyword. To combine fields, use a coalesce for dimensions and just add (or whatever appropriate) for metrics.',
  'Trilogy uses the where clause to filter before a query, and the having clause to filter the output of a query. Notably, an aggregate that is output in the query can only be filtered in the having; other aggregates can be filtered in the where',
  'Some datatypes will have traits - traits are hints on semantic meaning and the value of a field, such as "this decimal is a percent" or "this string is a zipcode"',
  'Trilogy uses # for comments. For multiline comments, comment each line. A comment must have a newline after it. DO NOT use -- or /* */ for comments.',
  'For full query generation, you should limit results by using the LIMIT clause at the end of the query to something reasonable to consume by a human. For example, "select order.product, sum(order.revenue) as total_revenue order by total_revenue desc limit 25". Generally do not limit queries on dates or other items likely to be rendered in line charts, only tabular results.',
  'If you use a where clause, place it before the select.',
  'Trilogy fields will look like struct paths - order.product.id. Use the full path.',
  'Whenever you see a field with a calculation that matches a portion of your SQL, replace that SQL with the field name. For example, if you want to write sum(revenue) and there is a field called total_revenue with a calculation of sum(revenue), replace sum(revenue) in your query with total_revenue.',
  'You cannot reuse the name of an existing field. If you get an error on this, and the existing field has the same definition as your calculation - use it directly instead.',
  'Use current_date() and current_datetime() to get current time, instead of now(). Use date_add to manipulate dates, like date_add(ship_date, month, 3). Use date_diff for date differences. It expects date_diff(<date_to_subtract>, <date_to_subtract_from>, DAY|MONTH|YEAR|SECOND|HOUR|ETC) date_diff will subtract the first date from the second date, so a early and later is positive.',
  'Avoid naming fields after SQL keywords. For example, do not name a field just "cast" or "select". Do not use quotes on fields. Prefer underscores and avoid special characters. Prefer not to alias a field in select unless it is a transformation, in which case you must always alias it.',
  'Ordering must always explicitly specify direction for each member - asc or desc. There is no default. Example: "order by birth_date asc, name asc".',
  'If you filter on an aggregate in the select, add a HAVING clause for that portion of logic. Aggregates can be used in a where clause if they are not also selected.',
  'When comparing a field against a string in your query, if the field is not a string explicitly cast the string to ensure the comparison is safe. Use the :: operator to cast, example "2021-01-01"::date. Wrap any multi-part transformations that need to be cast in parentheses before applying the cast.',
  'Any select field that is a transformation must be aliased with as. You cannot leave out the as keyword. Don\t alias fields that are not transformations. For example, "select order.year, sum(order.revenue) as total_revenue". Do NOT rename scalar fields in select. This will confuse users. Do not shadow the name of any existing fields when aliasing. ',
  'You can derive a new field from an existing field using sql functions in any position. If you need - and only if you need - an aggregate to have a different grouping than the select, you can do an inline group - ex sum(revenue) by order.year, order.customer.state as revenue_per_year_and_state. You can use this to get aggregates at different levels than the default select aggregation in the same query. ',
  'Window syntax is not like SQL. If you are trying to get the top X based on ordering by A and B (optionally within a group Z), use the syntax "rank X over Z by A desc, B desc" - ex "rank customer over state by sum(revenue) desc as top_per_state_customers". This applies to other similar window functions as well.',
  'Trilogy does not have the * symbol for counting. The count function requires a field as an argument. ID fields are good options for counts.',
  'Trilogy will let you immediately reuse a field by name after defining it in the select; if you can reuse a calculation you just defined, do that rather than repeating it.',
  'Only reference fields from the select in the HAVING clause. You can create new fields and hide them with a # comment to reference them for filtering. A -- modified field will not be selected but will be available to filter (this is a special "hide" syntax). The where clause is less restrictive, and can include anonymous calculations.',
  'To get a max or minimum in where/having clauses, there is no need for a subselect - just do max(field) or min(field), such as in "where field_a=max(field_b);"',
  'You can inline filter a field (helpful inside a sum) using the form `field ? condition`, for example max(field ? field % 2 =0) as max_even',
  'End a full statement with a semicolon.',
  `Here are two full valid Trilogy query demonstrating various features: "where year between 1940 and 1950
select
    name,
    state,
    sum(births) as all_births,
    sum(births ? state = 'VT') vermont_births,
    rank name over state by all_births desc as state_rank,
    rank name by sum(births) by name desc as all_rank
having 
    all_rank<11
    and state = 'ID'
order by all_rank asc
limit 5;", "where dep_time between '2002-01-01'::datetime and '2010-01-31'::datetime
select
    carrier.name,
    count(id2) as total_flights,
    total_flights / date_diff(min(dep_time.date), max(dep_time.date), DAY) as average_daily_flights
order by total_flights desc;
"`,
  'Only ever generate a single select query at a time. Do not use subselects/CTEs, they are not required.',
  'REMEMBER TO REPLACE ANY SQL THAT HAS A NAMED CALCULATION WITH THE CALCULATION NAME.',
]

export const functions = [
  'abs',
  'alias',
  // 'attr_access',
  'avg',
  'bool',
  'cast',
  'coalesce',
  'concat',
  'contains',
  'count',
  'count_distinct',
  'current_date',
  'current_datetime',
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
  'max',
  'min',
  'minute',
  'month',
  'now',
  'quarter',
  'random',
  'round',
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

export const rulesInput = 'Rule: ' + trilogyRules.join('\nRule: ')
