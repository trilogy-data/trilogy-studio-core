// Shared Arrow → Results decoding.
//
// Both DuckDBConnection (duckdb-wasm) and the new RemoteWorkerConnection
// (Arrow IPC streamed from a Rust worker) end up holding apache-arrow
// RecordBatch objects, then need to lower them into the lib's Results /
// ResultColumn shape — including the lib-specific quirks: scaled DECIMAL,
// luxon DateTime for date/datetime, ARRAY/STRUCT child traversal, BigInt
// flattening of 128-bit integers, etc. Keeping that logic in one place
// means any backend that produces Arrow gets identical row semantics.

import { DateTime } from 'luxon'
import { Type, type RecordBatch } from 'apache-arrow'
import { Results, ColumnType, type ResultColumn } from '../editors/results'
import { ARRAY_IMPLICIT_COLUMN } from './constants'

interface ArrowFieldLike {
  name: string
  type: DataTypeLike
}

interface DataTypeLike {
  typeId: number
  scale?: number
  precision?: number
  children?: ArrowFieldLike[]
  dictionary?: DataTypeLike
}

interface ArrowSchemaLike {
  fields: ArrowFieldLike[]
}

// Dictionary-encoded fields (Type.Dictionary, typeId = -1) wrap a value type
// in `dictionary`. Unwrap them so we surface the user-visible type — Arrow JS
// already resolves dictionary indices to values when we materialize rows via
// `row.toJSON()`, so no row-level handling is needed.
function unwrapDictionary(type: DataTypeLike): DataTypeLike {
  let cur = type
  while (cur.typeId === Type.Dictionary && cur.dictionary) {
    cur = cur.dictionary
  }
  return cur
}

export function mapArrowTypeIdToColumnType(typeId: number): ColumnType {
  switch (typeId) {
    case Type.Utf8:
    case Type.LargeUtf8:
      return ColumnType.STRING
    case Type.Int:
      return ColumnType.INTEGER
    case Type.Float:
      return ColumnType.FLOAT
    case Type.Bool:
      return ColumnType.BOOLEAN
    case Type.Decimal:
      return ColumnType.FLOAT
    case Type.Date:
      return ColumnType.DATE
    case Type.Timestamp:
      return ColumnType.DATETIME
    case Type.Time:
      return ColumnType.TIME
    case Type.Struct:
      return ColumnType.STRUCT
    case Type.List:
    case Type.FixedSizeList:
    case Type.Map:
      return ColumnType.ARRAY
    default:
      return ColumnType.UNKNOWN
  }
}

export function processArrowSchema(
  schema: ArrowSchemaLike | { fields: ArrowFieldLike[] },
): Map<string, ResultColumn> {
  const headers = new Map<string, ResultColumn>()
  for (const field of schema.fields) {
    const effective = unwrapDictionary(field.type)
    headers.set(field.name, {
      name: field.name,
      type: mapArrowTypeIdToColumnType(effective.typeId),
      description: '',
      scale: effective.scale,
      precision: effective.precision,
      children: effective.children
        ? processArrowSchema({ fields: effective.children })
        : undefined,
    })
  }
  return headers
}

function parseUint32ArrayToBigInt(arr: Uint32Array): bigint {
  if (arr.length !== 4) {
    throw new Error('Expected Uint32Array of length 4')
  }
  return (
    BigInt(arr[0]) +
    (BigInt(arr[1]) << 32n) +
    (BigInt(arr[2]) << 64n) +
    (BigInt(arr[3]) << 96n)
  )
}

function handleNumber(value: any): number {
  if (value instanceof Uint32Array && value.length === 4) {
    return Number(parseUint32ArrayToBigInt(value))
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value)
  }
  const numValue = Number(value)
  if (Number.isFinite(numValue)) {
    return numValue
  }
  throw new Error(`Cannot parse value: ${value}`)
}

export function processArrowRow(
  row: any,
  headers: Map<string, ResultColumn>,
): Record<string, any> {
  const out: Record<string, any> = {}
  Object.keys(row).forEach((key) => {
    const column = headers.get(key)
    if (!column) {
      console.warn(`Column ${key} not found in headers`)
      return
    }
    switch (column.type) {
      case ColumnType.INTEGER:
        out[key] =
          row[key] !== null && row[key] !== undefined ? handleNumber(row[key]) : null
        break
      case ColumnType.FLOAT: {
        const scale = column.scale || 0
        if (row[key] !== null && row[key] !== undefined) {
          const top = handleNumber(row[key])
          out[key] = top / Math.pow(10, scale)
        } else {
          out[key] = null
        }
        break
      }
      case ColumnType.DATE:
      case ColumnType.DATETIME:
        out[key] = row[key] ? DateTime.fromMillis(row[key], { zone: 'UTC' }) : null
        break
      case ColumnType.ARRAY: {
        const arrayData = row[key] ? Array.from(row[key].toArray()) : null
        if (!arrayData) {
          out[key] = null
          break
        }
        out[key] = arrayData.map((item: any) =>
          processArrowRow({ [ARRAY_IMPLICIT_COLUMN]: item }, column.children!),
        )
        break
      }
      case ColumnType.STRUCT:
        out[key] = row[key] ? processArrowRow(row[key], column.children!) : null
        break
      default:
        out[key] = row[key]
        break
    }
  })
  return out
}

// Build a Results from a sequence of Arrow RecordBatches. Schema is taken from
// the first batch; an empty batch list produces an empty Results.
export function arrowBatchesToResults(batches: RecordBatch[]): Results {
  if (batches.length === 0) {
    return new Results(new Map(), [])
  }
  const schema = batches[0].schema as unknown as ArrowSchemaLike
  const headers = processArrowSchema(schema)
  const rows: Record<string, any>[] = []
  for (const batch of batches) {
    const arr = batch.toArray()
    for (const row of arr) {
      rows.push(processArrowRow(row.toJSON(), headers))
    }
  }
  return new Results(headers, rows)
}
