import { describe, it, expect } from 'vitest'
import { Field, Int32, List, Table, Utf8, vectorFromArray } from 'apache-arrow'
import { arrowBatchesToResults } from './arrowResults'
import { ARRAY_IMPLICIT_COLUMN } from './constants'
import { ColumnType } from '../editors/results'

function listTable(childName: string): Table {
  const ints = vectorFromArray(
    [[1, 2], null, []],
    new List(new Field(childName, new Int32(), true)),
  )
  const strs = vectorFromArray(
    [['a'], ['b', 'c'], null],
    new List(new Field(childName, new Utf8(), true)),
  )
  return new Table({ ints, strs })
}

describe('arrowBatchesToResults lists', () => {
  // DuckDB names the list child `l`, Arrow's default is `item`, and
  // Databricks/Spark use `element`. All must decode the same way.
  it.each(['l', 'item', 'element'])('decodes lists whose child field is %s', (childName) => {
    const results = arrowBatchesToResults(listTable(childName).batches as any)
    expect(results.headers.get('ints')?.type).toBe(ColumnType.ARRAY)
    expect(results.data.map((r) => r.ints)).toEqual([
      [{ [ARRAY_IMPLICIT_COLUMN]: 1 }, { [ARRAY_IMPLICIT_COLUMN]: 2 }],
      null,
      [],
    ])
    expect(results.data.map((r) => r.strs)).toEqual([
      [{ [ARRAY_IMPLICIT_COLUMN]: 'a' }],
      [{ [ARRAY_IMPLICIT_COLUMN]: 'b' }, { [ARRAY_IMPLICIT_COLUMN]: 'c' }],
      null,
    ])
  })
})
