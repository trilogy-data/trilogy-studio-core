import { describe, expect, it } from 'vitest'
import { safeJsonStringify, toJsonSafeRows, toJsonSafeValue } from './jsonSerialization'

describe('jsonSerialization', () => {
  it('converts safe bigints to numbers', () => {
    expect(toJsonSafeValue(42n)).toBe(42)
  })

  it('converts unsafe bigints to strings', () => {
    expect(toJsonSafeValue(BigInt(Number.MAX_SAFE_INTEGER) + 2n)).toBe(
      (BigInt(Number.MAX_SAFE_INTEGER) + 2n).toString(),
    )
  })

  it('normalizes bigint values inside rows', () => {
    expect(
      toJsonSafeRows([
        {
          count: 5n,
          nested: { huge: BigInt(Number.MAX_SAFE_INTEGER) + 10n },
        },
      ]),
    ).toEqual([
      {
        count: 5,
        nested: { huge: (BigInt(Number.MAX_SAFE_INTEGER) + 10n).toString() },
      },
    ])
  })

  it('stringifies objects with bigint values without throwing', () => {
    expect(() => safeJsonStringify({ value: 99n })).not.toThrow()
    expect(safeJsonStringify({ value: 99n })).toBe('{"value":99}')
  })
})
