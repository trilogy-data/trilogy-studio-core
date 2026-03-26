type SerializablePrimitive = string | number | boolean | null
type SerializableValue =
  | SerializablePrimitive
  | SerializableValue[]
  | { [key: string]: SerializableValue }

function normalizeBigInt(value: bigint): string | number {
  const asNumber = Number(value)
  if (Number.isSafeInteger(asNumber)) {
    return asNumber
  }
  return value.toString()
}

export function toJsonSafeValue(value: any): SerializableValue {
  if (typeof value === 'bigint') {
    return normalizeBigInt(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value !== null && value !== undefined && value.isLuxonDateTime === true) {
    return value.toISO()
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafeValue(item))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, toJsonSafeValue(nestedValue)]),
    )
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }

  return String(value)
}

export function toJsonSafeRows(
  rows: readonly Readonly<Record<string, any>>[],
): Record<string, SerializableValue>[] {
  return rows.map((row) => toJsonSafeValue(row) as Record<string, SerializableValue>)
}

export function safeJsonStringify(value: any): string {
  return JSON.stringify(toJsonSafeValue(value))
}
