// class QueryOut(BaseModel):
//     connection: str
//     query: str
//     generated_sql: str
//     headers: list[str]
//     results: list[dict]
//     created_at: datetime = Field(default_factory=datetime.now)
//     refreshed_at: datetime = Field(default_factory=datetime.now)
//     duration: Optional[int]
//     columns: Mapping[str, QueryOutColumn] | None
// class QueryOutColumn(BaseModel):
//     name: str
//     datatype: DataType
//     purpose: Purpose

export enum ColumnType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  INTEGER = 'int',
  DATE = 'date',
  DATETIME = 'datetime',
  TIME = 'time',
  TIMESTAMP = 'timestamp',
  FLOAT = 'float',
  UNKNOWN = 'unknown',

  // COMPLEX
  STRUCT = 'struct',
  ARRAY = 'array',
  MAP = 'map',

  // CUSTOM TYPES
  MONEY = 'money',
  PERCENT = 'percent',
  URL = 'url',
  EMAIL = 'email',
  PHONE = 'phone',
}

export type Row = Readonly<Record<string, any>> // Represents a row, with column names as keys

export interface ResultColumn {
  name: string
  type: ColumnType
  address?: string
  scale?: number
  precision?: number
  children?: Map<string, ResultColumn>
  traits?: string[]
  description?: string
  // purpose: string
}

export interface ResultsInterface {
  headers: Map<String, ResultColumn>
  data: readonly Row[]
}

// Chart configuration interface
export interface ChartConfig {
  chartType: string
  xField?: string
  yField?: string
  yAggregation?: string
  colorField?: string
  sizeField?: string
  groupField?: string
  trellisField?: string
}

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue }

function makeValuesJsonSerializable(
  objects: readonly Readonly<Record<string, any>>[],
): Record<string, SerializableValue>[] {
  return objects.map((obj) => {
    const serializedObj: Record<string, SerializableValue> = {}
    for (const key in obj) {
      const value = obj[key]

      // Handle BigInt specifically
      if (typeof value === 'bigint') {
        serializedObj[key] = value.toString()
      }
      // Handle Dates
      else if (value instanceof Date) {
        serializedObj[key] = value.toISOString()
      }
      // Recursively handle nested objects or arrays
      else if (Array.isArray(value)) {
        serializedObj[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? makeValuesJsonSerializable([item])[0] : item,
        )
      } else if (typeof value === 'object' && value !== null) {
        serializedObj[key] = makeValuesJsonSerializable([value])[0]
      }
      // All other values are JSON serializable as-is
      else {
        serializedObj[key] = value
      }
    }
    return serializedObj
  })
}

export class Results implements ResultsInterface {
  headers: Map<string, ResultColumn>
  data: readonly Row[]

  constructor(headers: Map<string, ResultColumn>, data: readonly Row[]) {
    this.data = data
    this.headers = headers
  }
  toJSON(): object {
    return {
      data: makeValuesJsonSerializable(this.data),
      headers: Object.fromEntries(this.headers), // Convert Map to a plain object
    }
  }
  static fromJSON(json: string | Partial<ResultsInterface>): Results {
    const parsed: Partial<ResultsInterface> = typeof json === 'string' ? JSON.parse(json) : json

    // Parse headers

    const headers = new Map<string, ResultColumn>(
      Object.entries(parsed.headers || {}).map(([key, value]) => [
        key,
        {
          name: value.name || key,
          type: value.type || ColumnType.UNKNOWN,
          description: value.description || '',
        },
      ]),
    )

    // Parse data
    if (Array.isArray(parsed.data)) {
      const data = parsed.data || []
      return new Results(headers, data)
    } else {
      return new Results(headers, [])
    }
  }
}
