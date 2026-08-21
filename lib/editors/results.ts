import { DateTime } from 'luxon'
import { toJsonSafeRows } from '../utility/jsonSerialization'

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
  NUMERIC = 'numeric',
  BOOLEAN = 'bool',
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
  purpose?: string
  keys?: string[]
}

export interface ResultsInterface {
  headers: Map<String, ResultColumn>
  data: readonly Row[]
}

export type FieldKey =
  | 'xField'
  | 'yField'
  | 'colorField'
  | 'sizeField'
  | 'geoField'
  | 'groupField'
  | 'trellisField'
  | 'annotationField'

export type BoolFieldKey = 'hideLegend' | 'showTitle'

export type chartTypes =
  | 'line'
  | 'bar'
  | 'barh'
  | 'point'
  | 'geo-map'
  | 'tree'
  | 'area'
  | 'headline'
  | 'donut'
  | 'heatmap'
  | 'boxplot'
  | 'treemap'
  | 'beeswarm'

/** A `place hline|vline at <value> [as <label>]` reference line. */
export interface ChartPlacement {
  kind: 'hline' | 'vline'
  value: string | number
  label?: string
}

// Chart configuration interface
export interface ChartConfig {
  chartType: chartTypes
  xField?: string
  yField?: string
  yField2?: string
  colorField?: string
  sizeField?: string
  groupField?: string
  trellisField?: string
  trellisRowField?: string
  geoField?: string
  annotationField?: string
  hideLegend?: boolean
  showTitle?: boolean
  scaleX?: 'linear' | 'log' | 'sqrt'
  scaleY?: 'linear' | 'log' | 'sqrt'
  linkY2?: boolean

  /**
   * Sub-layers, each a chart config in its own right. Present and non-empty
   * means this config is a *container*: its own field bindings are ignored and
   * only its statement-level settings (title, legend, scales, placements)
   * apply. Absent -- the overwhelmingly common case -- means this is a plain
   * single-layer config and nothing about its handling changes.
   */
  layers?: ChartConfig[]

  /** Reference lines drawn over every layer. Container-level only. */
  placements?: ChartPlacement[]

  /**
   * Display name for this layer in the series legend. Set from a chart
   * statement's `as` alias; ignored on a container.
   */
  layerLabel?: string

  /**
   * Force shared (`true`) or independent (`false`) y scales across layers.
   * Unset lets the renderer decide from the layers' format hints.
   */
  linkLayerY?: boolean

  /** Which side this layer's value axis is drawn on. Layer-level. */
  yAxisOrient?: 'left' | 'right'
}

/** Field keys that bind a layer to data, as opposed to statement-level settings. */
export const LAYER_FIELD_KEYS = [
  'xField',
  'yField',
  'yField2',
  'colorField',
  'sizeField',
  'groupField',
  'trellisField',
  'trellisRowField',
  'geoField',
  'annotationField',
] as const

/** True when this config delegates its rendering to sub-layers. */
export function isLayeredConfig(config: ChartConfig | undefined | null): boolean {
  return Boolean(config?.layers && config.layers.length > 0)
}

// Migration map for deprecated chart type names
const CHART_TYPE_MIGRATIONS: Record<string, chartTypes> = {
  'usa-map': 'geo-map',
}

/**
 * Migrates a ChartConfig from older versions to the current schema.
 * Handles renamed chart types (e.g., 'usa-map' -> 'geo-map'), recursing into
 * sub-layers so a nested config gets the same treatment as a flat one.
 * Returns a new config object if migration was needed, or the original if not.
 *
 * Note this is *not* where `yField2` becomes a second layer: that fold happens
 * at render time in `normalizeChartConfig`, because this function only runs on
 * dashboard item data and would miss the editor, LLM and statement paths.
 */
export function migrateChartConfig(
  config: ChartConfig | undefined | null,
): ChartConfig | undefined {
  if (!config) return undefined

  const migratedType = CHART_TYPE_MIGRATIONS[config.chartType]

  let migratedLayers: ChartConfig[] | undefined
  if (config.layers?.length) {
    const next = config.layers.map((layer) => migrateChartConfig(layer) as ChartConfig)
    // Only allocate a new array if a layer actually changed.
    if (next.some((layer, i) => layer !== config.layers![i])) {
      migratedLayers = next
    }
  }

  if (!migratedType && !migratedLayers) {
    return config
  }

  return {
    ...config,
    ...(migratedType ? { chartType: migratedType } : {}),
    ...(migratedLayers ? { layers: migratedLayers } : {}),
  }
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
      data: toJsonSafeRows(this.data),
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
          traits: value.traits || [],
          scale: value.scale,
          precision: value.precision,
          purpose: value.purpose,
        },
      ]),
    )

    // Parse data, restoring date/datetime columns from ISO strings back to luxon DateTime
    if (Array.isArray(parsed.data)) {
      const data = (parsed.data as Record<string, any>[]).map((row) => {
        const processedRow: Record<string, any> = { ...row }
        headers.forEach((column, key) => {
          const val = processedRow[key]
          if (
            (column.type === ColumnType.DATE ||
              column.type === ColumnType.DATETIME ||
              column.type === ColumnType.TIMESTAMP) &&
            typeof val === 'string' &&
            val
          ) {
            processedRow[key] = DateTime.fromISO(val, { zone: 'UTC' })
          }
        })
        return processedRow
      })
      return new Results(headers, data)
    } else {
      return new Results(headers, [])
    }
  }
}
