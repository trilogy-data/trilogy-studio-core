import { EscapePlaceholder } from '../connections/base'

// ── Cross-filter entry types ───────────────────────────────────────────────
// CrossFilterScalar and CrossFilterEntry live here (imported by crossFilters.ts)
// so that conditions.ts never needs to import from crossFilters.ts (avoids circular dep).

export type CrossFilterScalar = string | number | Date

export type CrossFilterEntry =
  | { op: 'eq'; value: CrossFilterScalar }
  | { op: 'range'; value: [CrossFilterScalar, CrossFilterScalar] }
  | { op: 'in'; value: CrossFilterScalar[] }
  | { op: 'is_null' }

// ── Parameterized filter builder ──────────────────────────────────────────

function sanitizeParamName(field: string): string {
  return field.replace(/[^a-zA-Z0-9_]/g, '_')
}

/** Short deterministic hash of the full concept address to prevent name collisions
 *  between differently-namespaced concepts that sanitize to the same string. */
function shortHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36).slice(0, 5)
}

function serializeScalar(v: CrossFilterScalar): string | number {
  if (v instanceof Date) {
    const year = v.getFullYear()
    const month = String(v.getMonth() + 1).padStart(2, '0')
    const day = String(v.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  // Luxon DateTime (returned by DuckDB WASM for date/datetime columns) is not
  // a plain JS Date. Use toISODate() so it serializes as YYYY-MM-DD rather than
  // a full ISO timestamp string, which would confuse the backend type inference.
  if (v !== null && typeof v === 'object' && typeof (v as any).toISODate === 'function') {
    return (v as any).toISODate() as string
  }
  return v as string | number
}

/**
 * Builds a parameterized filter expression for a single CrossFilterEntry.
 * Returns a filter string with :param placeholders and a parameters dict
 * (keys include the leading colon, e.g. ":species", matching the backend
 * filters_to_conditional convention).
 *
 * nameSuffix is appended to the sanitized param name to avoid collisions
 * when the same field appears in multiple OR branches.
 */
export function buildFilterExpression(
  key: string,
  entry: CrossFilterEntry,
  nameSuffix: string = '',
): { filterString: string; parameters: Record<string, string | number> } {
  const pname = sanitizeParamName(key) + '_' + shortHash(key) + nameSuffix
  switch (entry.op) {
    case 'eq': {
      const serialized = serializeScalar(entry.value)
      return {
        filterString: `${key} = :${pname}`,
        parameters: { [`:${pname}`]: serialized },
      }
    }
    case 'range': {
      const loVal = serializeScalar(entry.value[0])
      const hiVal = serializeScalar(entry.value[1])
      return {
        filterString: `${key} between :${pname}_min and :${pname}_max`,
        parameters: {
          [`:${pname}_min`]: loVal,
          [`:${pname}_max`]: hiVal,
        },
      }
    }
    case 'in': {
      const paramEntries: Record<string, string | number> = {}
      const placeholders = entry.value.map((v, i) => {
        paramEntries[`:${pname}_${i}`] = serializeScalar(v)
        return `:${pname}_${i}`
      })
      return {
        filterString: `${key} in (${placeholders.join(', ')})`,
        parameters: paramEntries,
      }
    }
    case 'is_null':
      return { filterString: `${key} IS NULL`, parameters: {} }
  }
}

/**
 * Converts an object or array of objects to a SQL WHERE clause expression
 * If multiple objects have the same key, they will be grouped with OR in parentheses
 * @param input - A single object or array of objects to convert to SQL conditions
 * @returns A SQL WHERE clause without the 'WHERE' keyword
 */
export function objectToSqlExpression(
  input: Record<string, unknown> | Record<string, unknown>[],
): string {
  // Handle array of objects case
  if (Array.isArray(input)) {
    // Group by keys to find duplicates
    const keyGroups: Record<string, unknown[]> = {}

    // Collect all conditions by key
    input.forEach((obj: Record<string, unknown>) => {
      Object.entries(obj).forEach(([key, value]) => {
        if (!keyGroups[key]) {
          keyGroups[key] = []
        }
        keyGroups[key].push(value)
      })
    })

    // Process each key group
    const keyConditions: string[] = Object.entries(keyGroups).map(([key, values]) => {
      // If we have multiple values for this key, group them with OR
      if (values.length > 1) {
        const valueConditions: string[] = values.map((value) => formatCondition(key, value))
        return `(${valueConditions.join(' OR ')})`
      } else {
        // Single value case
        return formatCondition(key, values[0])
      }
    })

    // Join all key conditions with AND
    return keyConditions.join(' AND ')
  }

  // Original code for handling a single object
  // Handle empty object case
  if (Object.keys(input).length === 0) {
    return ''
  }

  // Convert each key-value pair to a SQL condition
  const conditions: string[] = Object.entries(input).map(([key, value]) =>
    formatCondition(key, value),
  )

  // Join conditions with 'AND'
  return conditions.join(' AND ')
}

/**
 * Formats a single key-value pair as a SQL condition
 * @param key - The column name
 * @param value - The value to compare against
 * @returns A formatted SQL condition
 */
function formatValue(value: unknown) {
  //handle date
  if (value instanceof Date) {
    // Get year, month, and day
    const year = value.getFullYear()
    // getMonth() is 0-indexed, so add 1
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')

    // Format as YYYY-MM-DD
    return `'${year}-${month}-${day}'::date`
  }
  // Handle null values
  if (value === null) {
    return 'NULL'
  }
  // Handle string values
  if (typeof value === 'string') {
    // Escape single quotes in strings
    const escapedValue = value.replace(/'/g, EscapePlaceholder)
    return `'${escapedValue}'`
  }
  // Handle boolean values
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }
  // Handle number values
  if (typeof value === 'number') {
    return value.toString()
  }
}

function formatCondition(key: string, value: unknown): string {
  // Handle different value types
  if (value === null) {
    return `${key} IS NULL`
  } else if (typeof value === 'string') {
    // Escape single quotes in strings
    const escapedValue = value.replace(/'/g, EscapePlaceholder)
    return `${key}='''${escapedValue}'''`
  } else if (Array.isArray(value)) {
    // Handle array values
    return `${key} between ${formatValue(value[0])} and ${formatValue(value[value.length - 1])}`
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    return `${key}=${value}`
  } else if (value === undefined) {
    return `${key} IS NULL`
  } else {
    // For complex objects, arrays, etc. - convert to JSON string
    const escapedValue = JSON.stringify(value).replace(/'/g, EscapePlaceholder)
    return `${key}='${escapedValue}'`
  }
}
