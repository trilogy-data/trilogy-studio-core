import { DATA_TYPES } from '@trilogy-data/prism-trilogy/vocabulary'

export interface DataTypeCompletion {
  label: string
  detail: string
  documentation: string
}

// Prose only. The list of types itself comes from the shared vocabulary, so a
// type added to the language cannot go missing from `::` autocomplete just
// because nobody remembered to add it here -- which is how this list ended up
// disagreeing with both the Monarch grammar and the grammar file.
const DOCUMENTATION: Record<string, string> = {
  string: 'Text value',
  bytes: 'Raw byte sequence',
  geography: 'Geospatial value',
  number: 'Generic number type',
  numeric: 'Arbitrary precision number',
  decimal: 'Arbitrary precision number (alias of numeric)',
  map: 'Key-value pair collection',
  list: 'Ordered collection of items',
  array: 'Ordered collection of items (alias of list)',
  any: 'Any type',
  int: 'Integer value',
  bigint: '64-bit integer value',
  date: 'Calendar date without time',
  datetime: 'Date with time',
  timestamp: 'Point in time',
  double: 'Double-precision floating-point number',
  float: 'Floating-point number',
  bool: 'True/False boolean value',
  struct: 'Composite data structure',
  enum: 'Enumerated set of allowed values',
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export const dataTypes: DataTypeCompletion[] = DATA_TYPES.map((label) => ({
  label,
  detail: `${titleCase(label)} type`,
  documentation: DOCUMENTATION[label] ?? `${titleCase(label)} data type`,
}))
