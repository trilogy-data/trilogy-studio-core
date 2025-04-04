/**
 * Converts an object or array of objects to a SQL WHERE clause expression with parameterized values
 * If multiple objects have the same key, they will be grouped with OR in parentheses
 * @param input - A single object or array of objects to convert to SQL conditions
 * @returns An object containing the SQL WHERE clause without the 'WHERE' keyword and a parameters object
 */
export function objectToSqlExpression(input: Record<string, unknown> | Record<string, unknown>[]): {
  sql: string
  parameters: Record<string, unknown>
} {
  const parameters: Record<string, unknown> = {}
  let paramCounter = 0

  // Function to get next parameter name
  const getNextParamName = (): string => {
    return `:param${++paramCounter}`
  }

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
        const valueConditions: string[] = values.map((value) => {
          return formatCondition(key, value, parameters, getNextParamName)
        })
        return `(${valueConditions.join(' OR ')})`
      } else {
        // Single value case
        return formatCondition(key, values[0], parameters, getNextParamName)
      }
    })

    // Join all key conditions with AND
    return {
      sql: keyConditions.join(' AND '),
      parameters,
    }
  }

  // Handle empty object case
  if (Object.keys(input).length === 0) {
    return {
      sql: '',
      parameters,
    }
  }

  // Convert each key-value pair to a SQL condition
  const conditions: string[] = Object.entries(input).map(([key, value]) =>
    formatCondition(key, value, parameters, getNextParamName),
  )

  // Join conditions with 'AND'
  return {
    sql: conditions.join(' AND '),
    parameters,
  }
}

/**
 * Formats a single key-value pair as a SQL condition with parameterized values
 * @param key - The column name
 * @param value - The value to compare against
 * @param parameters - The parameters object to populate
 * @param getNextParamName - Function to get the next parameter name
 * @returns A formatted SQL condition
 */
function formatCondition(
  key: string,
  value: unknown,
  parameters: Record<string, unknown>,
  getNextParamName: () => string,
): string {
  // Handle different value types
  if (value === null || value === undefined) {
    return `${key} IS NULL`
  } else {
    const paramName = getNextParamName()
    parameters[paramName] = value
    return `${key} = :${paramName}`
  }
}
