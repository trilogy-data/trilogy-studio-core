/**
 * The Trilogy vocabulary, derived from `trilogy/parsing/trilogy.lark` in
 * pytrilogy (see README for the version this was cut against).
 *
 * This module is deliberately free of any highlighter, editor or framework
 * dependency: it is plain data, so a Prism grammar, a Monaco Monarch grammar,
 * a TextMate bundle and an autocomplete provider can all be driven from one
 * list instead of drifting apart.
 *
 * Names are lower-case here. Trilogy keywords are case-insensitive (`"select"i`
 * in the grammar), so every consumer should match with an `i` flag rather than
 * duplicating an upper-case copy of each list.
 */

/**
 * Statement and clause words. Excludes anything that belongs in a more specific
 * list below -- purposes, data types, functions and window functions are their
 * own categories because most themes colour them differently.
 *
 * Words that only ever appear as part of a longer phrase (`nulls first`,
 * `by rollup`, `layer bar`, `state published`) are NOT here: matching them
 * standalone would light up any concept that happens to be called `first`,
 * `set` or `line`. They live in CONTEXTUAL_KEYWORD_PATTERNS instead.
 */
export const KEYWORDS = [
  // imports
  'import',
  'from',
  'self',
  'as',
  // select
  'select',
  'where',
  'having',
  'order',
  'by',
  'limit',
  'asc',
  'desc',
  'nulls',
  'group',
  'distinct',
  'over',
  'partition',
  'filter',
  'natural',
  // joins (JOIN_TYPE in the grammar)
  'join',
  'left',
  'inner',
  'right',
  'full',
  'cross',
  'subset',
  'union',
  // multi-select
  'merge',
  'align',
  'derive',
  'rowset',
  'with',
  'into',
  // persist / copy
  'persist',
  'append',
  'overwrite',
  'copy',
  // datasource
  'datasource',
  'grain',
  'address',
  'query',
  'file',
  'complete',
  'root',
  'refresh',
  'within',
  'incremental',
  'freshness',
  // definitions
  'def',
  'type',
  'drop',
  'metadata',
  'default',
  // statements
  'raw_sql',
  'validate',
  'matches',
  'mock',
  'publish',
  'unpublish',
  'create',
  'chart',
  'show',
  // call: run an external program -- `call <path|string> [from <select>]`
  'call',
  // VALIDATE_SCOPE, used by validate/mock/publish/create
  'concept',
  'concepts',
  'datasources',
  'all',
  // expressions
  'and',
  'or',
  'not',
  'is',
  'in',
  'between',
  'case',
  'when',
  'then',
  'else',
  'end',
] as const

/**
 * Multi-word constructs, and words that are only keywords in a specific
 * neighbourhood. Each entry is a source string for a case-insensitive RegExp.
 */
export const CONTEXTUAL_KEYWORD_PATTERNS = [
  // `by rollup (...)` / `by cube (...)` / `by grouping sets (...)`
  String.raw`\bby\s+rollup\b`,
  String.raw`\bby\s+cube\b`,
  String.raw`\bby\s+grouping\s+sets\b`,
  // ordering tail: `order by x asc nulls last`
  String.raw`\bnulls\s+(?:first|last|auto)\b`,
  // `def table name(...)`
  String.raw`\bdef\s+table\b`,
  // create modifiers
  String.raw`\bif\s+not\s+exists\b`,
  String.raw`\bor\s+replace\b`,
  String.raw`\bwith\s+data\b`,
  // datasource status clause
  String.raw`\bstate\s+(?:published|unpublished)\b`,
  // chart statement: the chart types are far too generic to match standalone
  String.raw`\blayer\s+(?:line|barh|bar|point|area|headline|donut|heatmap|boxplot|treemap)\b`,
  String.raw`\bplace\s+(?:hline|vline)\s+at\b`,
  String.raw`\bset\s+(?:hide_legend|show_title|scale_x|scale_y)\b`,
] as const

/** PURPOSE / PROPERTY / AUTO / parameter declarations -- what introduces a name. */
export const PURPOSES = [
  'key',
  'metric',
  'property',
  'properties',
  'const',
  'constant',
  'auto',
  'parameter',
  'param',
  'unique',
] as const

/** MODIFIER in the grammar. */
export const MODIFIERS = ['optional', 'partial', 'nullable'] as const

/**
 * `data_type` in the grammar. Note that `date`, `datetime`, `timestamp`, `bool`,
 * `any`, `struct` and `array` are ALSO function names -- consumers must resolve
 * that by call position (a name followed by `(` is the function), not by list
 * precedence.
 */
export const DATA_TYPES = [
  'string',
  'bytes',
  'geography',
  'number',
  'numeric',
  'decimal',
  'map',
  'list',
  'array',
  'any',
  'int',
  'bigint',
  'date',
  'datetime',
  'timestamp',
  'double',
  'float',
  'bool',
  'struct',
  'enum',
] as const

/** DATE_PART, the second argument to the date_* functions. */
export const DATE_PARTS = [
  'second',
  'minute',
  'hour',
  'day',
  'day_of_week',
  'week',
  'month',
  'quarter',
  'year',
] as const

/** WINDOW_TYPE_LEGACY / WINDOW_TYPE_SQL_*, minus the aggregates already in FUNCTIONS. */
export const WINDOW_FUNCTIONS = ['row_number', 'rank', 'dense_rank', 'lag', 'lead'] as const

export const MATH_FUNCTIONS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'mod',
  'log',
  'round',
  'floor',
  'ceil',
  'abs',
  'sqrt',
  'random',
] as const

export const STRING_FUNCTIONS = [
  'like',
  'ilike',
  'upper',
  'lower',
  'split',
  'strpos',
  'contains',
  'trim',
  'ltrim',
  'rtrim',
  'replace',
  'substring',
  'regexp_extract',
  'regexp_contains',
  'regexp_replace',
  'hash',
  'hex',
] as const

export const AGGREGATE_FUNCTIONS = [
  'count',
  'count_distinct',
  'grouping',
  'grouping_id',
  'sum',
  'avg',
  'stddev',
  'variance',
  'max',
  'min',
  'array_agg',
  'bool_and',
  'bool_or',
  'any',
  'group',
] as const

export const DATE_FUNCTIONS = [
  'date',
  'datetime',
  'timestamp',
  'second',
  'minute',
  'hour',
  'day',
  'day_name',
  'day_of_week',
  'week',
  'month',
  'month_name',
  'quarter',
  'year',
  'format_time',
  'parse_time',
  'date_part',
  'date_trunc',
  'date_truncate',
  'date_add',
  'date_sub',
  'date_diff',
  'date_spine',
] as const

export const ARRAY_FUNCTIONS = [
  'array_sum',
  'array_distinct',
  'array_to_string',
  'array_sort',
  'array_transform',
  'array_filter',
  'generate_array',
] as const

export const MAP_FUNCTIONS = ['map_keys', 'map_values'] as const

export const GEO_FUNCTIONS = [
  'geo_from_text',
  'geo_point',
  'geo_distance',
  'geo_x',
  'geo_y',
  'geo_centroid',
  'geo_transform',
] as const

export const GENERIC_FUNCTIONS = [
  'cast',
  'concat',
  'concat_ws',
  'grain',
  'coalesce',
  'greatest',
  'least',
  'nullif',
  'len',
  'bool',
  'recurse_edge',
  'struct',
  'unnest',
  'subselect',
  'raw',
  'getattr',
  // Table-valued functions. `union` doubles as a join type and as the blend
  // expression; `except`/`intersect` exist only at the TVF positions.
  'union',
  'except',
  'intersect',
] as const

/** Constant functions -- always written with empty parens. */
export const CONSTANT_FUNCTIONS = ['current_date', 'current_datetime', 'current_timestamp'] as const

/** Every callable name, for consumers that just want one list. */
export const FUNCTIONS = [
  ...MATH_FUNCTIONS,
  ...STRING_FUNCTIONS,
  ...AGGREGATE_FUNCTIONS,
  ...DATE_FUNCTIONS,
  ...ARRAY_FUNCTIONS,
  ...MAP_FUNCTIONS,
  ...GEO_FUNCTIONS,
  ...GENERIC_FUNCTIONS,
  ...CONSTANT_FUNCTIONS,
] as const

export const BOOLEAN_LITERALS = ['true', 'false'] as const
export const NULL_LITERAL = 'null'

/** Line comment openers (PARSE_COMMENT). Trilogy has no block comment. */
export const LINE_COMMENT_TOKENS = ['#', '//'] as const

/**
 * `--` hides a select item from the output; `~` marks it partial. Both are
 * single-character prefixes on one item -- emphatically NOT line comments.
 */
export const SELECT_HIDE_MODIFIER = '--'
export const SELECT_PARTIAL_MODIFIER = '~'

export const OPERATORS = [
  '<-',
  '->',
  '::',
  '..',
  '>=',
  '<=',
  '!=',
  '**',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '>',
  '<',
  '?',
] as const

/** Build a case-insensitive alternation, longest-first so `count_distinct` wins over `count`. */
export function alternation(words: readonly string[]): string {
  return [...words].sort((a, b) => b.length - a.length || a.localeCompare(b)).join('|')
}

/** `\b(?:a|b|c)\b` for a word list. */
export function wordBoundaryPattern(words: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${alternation(words)})\\b`, 'i')
}

/** `\b(?:a|b|c)(?=\s*\()` -- matches a name only where it is being called. */
export function callPattern(words: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${alternation(words)})(?=\\s*\\()`, 'i')
}
