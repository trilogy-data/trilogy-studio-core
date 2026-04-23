import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { Charts, Controls } from './constants'
import { snakeCaseToCapitalizedWords } from './formatting'
import { type FieldEncodingOutput } from './types'

export const HIGHLIGHT_COLOR = '#FF7F7F'

/** Safely access an array element by index, returning undefined if out of bounds. */
const at = <T>(arr: T[], index: number): T | undefined => arr[index]

// Temporal traits: treated as dates by Vega. 'decade' is NOT here — decade values
// are integer buckets (e.g. 1970, 1980) and should render as categorical ordinal axes.
const temporalTraits = ['year', 'week', 'day', 'hour', 'minute', 'second', 'quarter']

// Discrete time traits: integer/string buckets that should use ordinal scale on bar charts
// (continuous/temporal scale makes bars too thin)
export const discreteTimeTraits = [
  'decade',
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
  'day_of_week',
]

const hasDiscreteTimeTraitOnColumn = (column: ResultColumn): boolean => {
  if (!column.traits) return false
  return column.traits.some((t) =>
    discreteTimeTraits.some((dt) => t === dt || t.endsWith('_' + dt)),
  )
}

export const hasDiscreteTimeTrait = (
  fieldName: string,
  columns: Map<string, ResultColumn>,
): boolean => {
  const column = columns.get(fieldName)
  if (!column) return false
  return hasDiscreteTimeTraitOnColumn(column)
}

const geoTraits = ['us_state', 'us_state_short', 'country', 'latitude', 'longitude']

const ordinalTraits = ['rank', 'index', 'grade', 'flag', 'letter_grade']

const categoricalTraits = [...temporalTraits, ...ordinalTraits, 'identifier', 'decade']

export function convertTimestampToISODate(timestamp: number): Date {
  const date = new Date(timestamp)
  return date
}

export const getColumnHasTrait = (
  fieldName: string | undefined,
  columns: Map<string, ResultColumn>,
  trait: string,
): boolean => {
  if (!fieldName || !columns.get(fieldName)) return false

  const column = columns.get(fieldName)
  if (!column) return false
  return getColumnHasTraitInternal(column, trait)
}

const getColumnHasTraitInternal = (column: ResultColumn, trait: string) => {
  if (column.traits && column.traits.some((t) => t.endsWith(trait))) {
    return true
  }
  return false
}

// Helper functions to identify column types
export const isNumericColumn = (column: ResultColumn): boolean => {
  if (column.purpose === 'key') {
    return false
  }
  if (hasDiscreteTimeTraitOnColumn(column)) {
    return false
  }
  return (
    [ColumnType.NUMBER, ColumnType.INTEGER, ColumnType.FLOAT].includes(column.type) &&
    !column.traits?.some((trait) => trait.endsWith('latitude') || trait.endsWith('longitude'))
  )
}

export const isOrdinalColumn = (column: ResultColumn): boolean => {
  if (column.traits && ordinalTraits.some((trait) => column.traits?.includes(trait))) {
    return true
  }
  return false
}

export const isImageColumn = (column: ResultColumn): boolean => {
  return [ColumnType.STRING].includes(column.type) &&
    column.traits?.some((trait) => trait.endsWith('url_image'))
    ? true
    : false
}

export const getGeoTraitType = (column: ResultColumn): string => {
  if (getColumnHasTraitInternal(column, 'us_state')) {
    return 'us_state'
  }
  if (getColumnHasTraitInternal(column, 'us_state_short')) {
    return 'us_state_short'
  }
  if (getColumnHasTraitInternal(column, 'country')) {
    return 'country'
  }
  return 'unknown'
}

export const isTemporalColumn = (column: ResultColumn): boolean => {
  let base = [ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIME, ColumnType.TIMESTAMP].includes(
    column.type,
  )
  if (base) {
    return true
  }
  if (column.traits && temporalTraits.some((trait) => column.traits?.includes(trait))) {
    return true
  }
  return false
}

export const isCategoricalColumn = (column: ResultColumn): boolean => {
  let base = [ColumnType.STRING, ColumnType.BOOLEAN].includes(column.type)
  if (base) {
    return true
  }
  if (column.purpose === 'key') {
    return true
  }
  if (column.traits && categoricalTraits.some((trait) => column.traits?.includes(trait))) {
    return true
  }
  return false
}

export const isGeographicColumn = (column: ResultColumn): boolean => {
  if (column.traits && geoTraits.some((trait) => column.traits?.includes(trait))) {
    return true
  }
  return false
}

export const isHexColumn = (column: ResultColumn): boolean => {
  return column.traits?.includes('hex') ?? false
}

// Interface for selection configuration
export interface SelectionConfig {
  enabled: boolean
  selectionType: 'single' | 'multi' | 'interval'
  fields?: string[]
  encodings?: ('x' | 'y' | 'color')[]
  on?: string // Default will be 'click'
  nearest?: boolean
  resolve?: 'global' | 'union' | 'intersect'
}

export const columHasTraitEnding = (column: ResultColumn, trait: string): boolean => {
  if (column.traits) {
    return column.traits.some((t) => t.endsWith(trait))
  }
  return false
}

// Filter columns by type for UI controls
export const filteredColumns = (
  filter: 'numeric' | 'categorical' | 'temporal' | 'latitude' | 'longitude' | 'geographic' | 'all',
  columns: Map<string, ResultColumn>,
) => {
  const result: ResultColumn[] = []
  columns.forEach((column, _) => {
    if (filter === 'all') {
      result.push(column)
    } else if (filter === 'numeric' && isNumericColumn(column) && !isTemporalColumn(column)) {
      result.push(column)
    } else if (filter === 'categorical' && isCategoricalColumn(column)) {
      result.push(column)
    } else if (filter === 'temporal' && isTemporalColumn(column)) {
      result.push(column)
    } else if (filter === 'latitude' && columHasTraitEnding(column, 'latitude')) {
      result.push(column)
    } else if (filter === 'longitude' && columHasTraitEnding(column, 'longitude')) {
      result.push(column)
    } else if (
      filter === 'geographic' &&
      column.traits?.some(
        (trait) =>
          trait.endsWith('state') || trait.endsWith('state_short') || trait.endsWith('country'),
      )
    ) {
      result.push(column)
    }
  })

  return result
}

const firstNonCategoricalNumericColumn = (
  defaults: Partial<ChartConfig>,
  numericColumns: ResultColumn[],
): ResultColumn => {
  let candidates = numericColumns.filter(
    (col) => col.name !== defaults.xField && col.name !== defaults.yField,
  )
  if (candidates.length > 0) {
    return candidates[0]
  }
  return numericColumns[0]
}

// Determine default configuration based on column types
export const determineDefaultConfig = (
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
  chartType?:
    | 'line'
    | 'bar'
    | 'barh'
    | 'point'
    | 'geo-map'
    | 'tree'
    | 'area'
    | 'heatmap'
    | 'headline'
    | 'donut',
): Partial<ChartConfig> => {
  const defaults: Partial<ChartConfig> = {
    showTitle: true,
    hideLegend: false,
  }

  const numericColumns = filteredColumns('numeric', columns)
  // Filter out hex columns from categorical - hex columns are used for color mapping, not as categorical dimensions
  const categoricalColumns = filteredColumns('categorical', columns).filter(
    (col) => !isHexColumn(col),
  )
  const temporalColumns = filteredColumns('temporal', columns)
  const latitudeColumns = filteredColumns('latitude', columns)
  const longitudeColumns = filteredColumns('longitude', columns)
  const geoColumns = filteredColumns('geographic', columns)

  // if the columns map is empty, return {}
  if (columns.size === 0) {
    return {}
  }
  if (
    !chartType &&
    numericColumns.length === 0 &&
    geoColumns.length === 0 &&
    longitudeColumns.length === 0 &&
    latitudeColumns.length === 0
  ) {
    defaults.chartType = 'headline'
    return defaults
  }

  // Categorical columns with a discrete time trait (e.g. decade) are ordered time
  // buckets — they should drive a line chart when present alongside a numeric value.
  const discreteTimeCategoricalColumns = categoricalColumns.filter((col) =>
    hasDiscreteTimeTraitOnColumn(col),
  )

  // Select appropriate chart type based on available column types
  if (chartType) {
    defaults.chartType = chartType
  } else if (longitudeColumns.length > 0 && latitudeColumns.length > 0) {
    // Geospatial data - use map
    defaults.chartType = 'geo-map'
  } else if (geoColumns.length > 0) {
    defaults.chartType = 'geo-map'
  } else if (temporalColumns.length > 0 && numericColumns.length > 0) {
    // Time series data - use line chart
    defaults.chartType = 'line'
  } else if (discreteTimeCategoricalColumns.length > 0 && numericColumns.length > 0) {
    // Discrete time buckets (e.g. decade) + numeric — vertical bar by default
    // (line remains eligible via determineEligibleChartTypes).
    defaults.chartType = 'bar'
  } else if (categoricalColumns.length > 0 && numericColumns.length > 0) {
    // Categorical vs numeric - check category count for bar orientation
    const firstCatField = categoricalColumns[0].name
    const uniqueCategories = new Set()

    for (let i = 0; i < Math.min(data.length, 50); i++) {
      if (data[i] && data[i][firstCatField] !== undefined) {
        uniqueCategories.add(data[i][firstCatField])
      }
    }

    if (uniqueCategories.size > 7) {
      // Many categories - use horizontal bar
      defaults.chartType = 'barh'
    } else {
      // Few categories - use vertical bar
      defaults.chartType = 'bar'
    }
  } else if (numericColumns.length >= 2) {
    // Multiple numeric columns - use scatter plot
    if (data.length === 1) {
      defaults.chartType = 'headline'
    } else {
      defaults.chartType = 'point'
    }
  } else if (categoricalColumns.length >= 2 && numericColumns.length > 0) {
    // Two categorical dimensions and a numeric - use heatmap
    defaults.chartType = 'heatmap'
  } else if (numericColumns.length > 0 && categoricalColumns.length == 0) {
    defaults.chartType = 'headline'
  }

  // now set defaults for each chart type
  if (defaults.chartType === 'barh') {
    defaults.yField = at(categoricalColumns, 0)?.name
    if (numericColumns.length > 0) {
      defaults.xField = firstNonCategoricalNumericColumn(defaults, numericColumns).name
    }
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    if (numericColumns.length > 1 && !defaults.colorField) {
      defaults.colorField = numericColumns[1].name
    }
    // Use extra categorical columns for trellising
    const trellisableCategorical = categoricalColumns.filter(
      (col) =>
        col.name !== defaults.yField &&
        col.name !== defaults.xField &&
        col.name !== defaults.colorField,
    )
    if (trellisableCategorical.length > 0) {
      defaults.trellisRowField = trellisableCategorical[0].name
    }
    if (trellisableCategorical.length > 1) {
      defaults.trellisField = trellisableCategorical[1].name
    }
  } else if (defaults.chartType === 'donut') {
    defaults.yField = at(categoricalColumns, 0)?.name
    defaults.xField = at(numericColumns, 0)?.name
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    if (numericColumns.length > 1 && !defaults.colorField) {
      defaults.colorField = numericColumns[1].name
    }
  } else if (defaults.chartType === 'point') {
    defaults.xField = at(numericColumns, 0)?.name
    defaults.yField = at(numericColumns, 1)?.name

    // If we have a categorical column, use it for color
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    // if we have another numeric column, use it for size
    const nonAssignedNumeric = numericColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedNumeric.length > 0) {
      defaults.sizeField = nonAssignedNumeric[0].name
    }
    // if we still don't have a color field and we have another numeric column, use it
    if (!defaults.colorField && nonAssignedNumeric.length > 1) {
      defaults.colorField = nonAssignedNumeric[1].name
    }
    // Use extra categorical columns for trellising
    const trellisableCategorical = categoricalColumns.filter(
      (col) =>
        col.name !== defaults.yField &&
        col.name !== defaults.xField &&
        col.name !== defaults.colorField,
    )
    if (trellisableCategorical.length > 0) {
      defaults.trellisRowField = trellisableCategorical[0].name
    }
    if (trellisableCategorical.length > 1) {
      defaults.trellisField = trellisableCategorical[1].name
    }
  } else if (defaults.chartType === 'heatmap') {
    defaults.xField = at(categoricalColumns, 0)?.name
    defaults.yField = at(categoricalColumns, 1)?.name
    defaults.colorField = at(numericColumns, 0)?.name
    // Use extra categorical columns for trellising
    const trellisableCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (trellisableCategorical.length > 0) {
      defaults.trellisRowField = trellisableCategorical[0].name
    }
    if (trellisableCategorical.length > 1) {
      defaults.trellisField = trellisableCategorical[1].name
    }
  } else if (defaults.chartType === 'bar') {
    // Prefer a discrete time trait column (e.g. decade) as xField so bar charts
    // render time buckets along the x-axis by default.
    defaults.xField =
      at(discreteTimeCategoricalColumns, 0)?.name ?? at(categoricalColumns, 0)?.name
    let nonDateNumeric = numericColumns.filter(
      (col) => !isTemporalColumn(col) && col.name !== defaults.xField,
    )
    defaults.yField =
      nonDateNumeric.length > 0 ? nonDateNumeric[0].name : at(numericColumns, 0)?.name
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    if (numericColumns.length > 1 && !defaults.colorField) {
      defaults.colorField = numericColumns[1].name
    }
    // Use extra categorical columns for trellising
    const trellisableCategorical = categoricalColumns.filter(
      (col) =>
        col.name !== defaults.yField &&
        col.name !== defaults.xField &&
        col.name !== defaults.colorField,
    )
    if (trellisableCategorical.length > 0) {
      defaults.trellisRowField = trellisableCategorical[0].name
    }
    if (trellisableCategorical.length > 1) {
      defaults.trellisField = trellisableCategorical[1].name
    }
  } else if (defaults.chartType === 'headline') {
    defaults.xField = at(numericColumns, 0)?.name
  } else if (['line', 'area'].includes(defaults.chartType || '')) {
    const xFieldColumn =
      at(temporalColumns, 0) ?? at(discreteTimeCategoricalColumns, 0) ?? null
    defaults.xField = xFieldColumn?.name
    const nonTemporalNumericColumns = numericColumns.filter(
      (col) => col.name !== xFieldColumn?.name,
    )

    // Use the first non-temporal numeric column if available, otherwise use the first numeric column
    defaults.yField =
      nonTemporalNumericColumns.length > 0
        ? nonTemporalNumericColumns[0].name
        : at(numericColumns, 0)?.name
    defaults.yField2 =
      nonTemporalNumericColumns.length > 1 ? nonTemporalNumericColumns[1].name : undefined
    // If we have a categorical column, use it for color
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    // Use extra categorical columns for trellising
    const trellisableCategorical = categoricalColumns.filter(
      (col) =>
        col.name !== defaults.yField &&
        col.name !== defaults.xField &&
        col.name !== defaults.colorField,
    )
    if (trellisableCategorical.length > 0) {
      defaults.trellisRowField = trellisableCategorical[0].name
    }
    if (trellisableCategorical.length > 1) {
      defaults.trellisField = trellisableCategorical[1].name
    }
  } else if (defaults.chartType === 'geo-map') {
    // For USA map, we need:
    // 1. A field to join with geographic data (state codes/names)
    // 2. A numeric field for the color encoding

    // Look for columns that might contain state information
    let isLatLong = false
    if (latitudeColumns.length > 0 && longitudeColumns.length > 0) {
      isLatLong = true
      defaults.yField = latitudeColumns[0].name
      defaults.xField = longitudeColumns[0].name
      if (numericColumns.length > 0) {
        defaults.sizeField = numericColumns[0].name
      }
      if (numericColumns.length > 1) {
        defaults.colorField = numericColumns[1].name
      }
    }
    if (geoColumns.length > 0) {
      defaults.geoField = geoColumns[0].name
      if (numericColumns.length > 0 && !isLatLong) {
        defaults.colorField = numericColumns[0].name
      }
    }
    // if we have a non-used categorical column, use it for default
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) =>
        col.name !== defaults.colorField &&
        col.name !== defaults.xField &&
        col.name !== defaults.yField &&
        col.name !== defaults.geoField,
    )
    if (nonAssignedCategorical.length > 0 && !defaults.annotationField) {
      defaults.annotationField = nonAssignedCategorical[0].name
    }
    // Use extra categorical columns for trellising
    const trellisableCategorical = categoricalColumns.filter(
      (col) =>
        col.name !== defaults.geoField &&
        col.name !== defaults.xField &&
        col.name !== defaults.yField &&
        col.name !== defaults.colorField &&
        col.name !== defaults.annotationField,
    )
    if (trellisableCategorical.length > 0) {
      defaults.trellisRowField = trellisableCategorical[0].name
    }
    if (trellisableCategorical.length > 1) {
      defaults.trellisField = trellisableCategorical[1].name
    }
  }

  return defaults
}

/**
 * Determines which chart types are applicable based on available column types
 * @param data - The dataset rows
 * @param columns - Map of column names to column metadata
 * @returns An array of eligible chart types from the predefined list
 */
export const determineEligibleChartTypes = (
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
): string[] => {
  const numericColumns = filteredColumns('numeric', columns)
  const categoricalColumns = filteredColumns('categorical', columns)
  const temporalColumns = filteredColumns('temporal', columns)
  const latitudeColumns = filteredColumns('latitude', columns)
  const longitudeColumns = filteredColumns('longitude', columns)
  const geoColumns = filteredColumns('geographic', columns)
  const eligibleCharts: string[] = []

  if (categoricalColumns.length > 0) {
    eligibleCharts.push('beeswarm')
  }
  // If no numeric columns, very limited chart options
  if (numericColumns.length === 0) {
    if ((latitudeColumns.length > 0 && longitudeColumns.length > 0) || geoColumns.length > 0) {
      eligibleCharts.push('geo-map')
    }
    eligibleCharts.push('headline')
    return eligibleCharts
  }

  // Time series data - line chart. Also allow columns with a discrete time trait
  // (e.g. decade) that are categorical but represent an ordered time bucket.
  const discreteTimeCategoricalColumns = categoricalColumns.filter((col) =>
    hasDiscreteTimeTraitOnColumn(col),
  )
  if (
    (temporalColumns.length > 0 || discreteTimeCategoricalColumns.length > 0) &&
    numericColumns.length > 0
  ) {
    eligibleCharts.push('line')
    // Area chart is also good for time series
    eligibleCharts.push('area')
  }

  // Categorical vs numeric - bar charts
  if (categoricalColumns.length > 0 && numericColumns.length > 0) {
    const firstCatField = categoricalColumns[0].name
    const uniqueCategories = new Set()

    for (let i = 0; i < Math.min(data.length, 50); i++) {
      if (data[i] && data[i][firstCatField] !== undefined) {
        uniqueCategories.add(data[i][firstCatField])
      }
    }
    eligibleCharts.push('bar')
    eligibleCharts.push('barh')
    eligibleCharts.push('donut')
  }

  // Multiple numeric columns - scatter plot
  if (numericColumns.length >= 2) {
    eligibleCharts.push('point')
  }

  // Two categorical dimensions and numeric - heatmap
  if (categoricalColumns.length >= 2 && numericColumns.length > 0) {
    eligibleCharts.push('heatmap')
  }

  // Boxplot for numeric data with potential grouping
  if (numericColumns.length > 0) {
    eligibleCharts.push('boxplot')
    eligibleCharts.push('headline')
  }
  if ((latitudeColumns.length > 0 && longitudeColumns.length > 0) || geoColumns.length > 0) {
    eligibleCharts.push('geo-map')
  }
  // Ensure all chart types are from the predefined list
  return eligibleCharts.filter((chart) => Charts.map((x) => x.value).includes(chart))
}

export interface ChartConfigValidationResult {
  valid: boolean
  /** Non-empty when the chart type itself is not eligible for the data */
  chartTypeError?: string
  /** Per-field issues (e.g. xField is not a latitude column for geo-map) */
  fieldErrors: string[]
  /** The eligible chart types for this data, for suggestion messages */
  eligibleChartTypes: string[]
  /** Auto-detected default config as a fallback suggestion */
  suggestedConfig: Partial<ChartConfig>
}

const classifyColumnType = (column: ResultColumn): string => {
  if (columHasTraitEnding(column, 'latitude')) return 'latitude'
  if (columHasTraitEnding(column, 'longitude')) return 'longitude'
  if (
    column.traits?.some(
      (trait) =>
        trait.endsWith('state') || trait.endsWith('state_short') || trait.endsWith('country'),
    )
  ) {
    return 'geographic'
  }
  if (isTemporalColumn(column)) return 'temporal'
  if (hasDiscreteTimeTraitOnColumn(column)) return 'categorical'
  if (isNumericColumn(column)) return 'numeric'
  if (isCategoricalColumn(column)) return 'categorical'
  return 'other'
}

/** Build a comma-separated "name (type)" summary of the data columns for error messages. */
const describeFieldTypes = (columns: Map<string, ResultColumn>): string => {
  const parts: string[] = []
  columns.forEach((column) => {
    parts.push(`${column.name} (${classifyColumnType(column)})`)
  })
  return parts.length > 0 ? parts.join(', ') : 'no fields'
}

/**
 * Validate a chart config against actual column metadata.
 * Returns detailed errors if the chart type or field assignments are invalid.
 */
export const validateChartConfigForData = (
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
  config: ChartConfig,
): ChartConfigValidationResult => {
  const eligible = determineEligibleChartTypes(data, columns)
  const fieldErrors: string[] = []

  // Check if the chart type is eligible for this data
  if (!eligible.includes(config.chartType)) {
    const fieldSummary = describeFieldTypes(columns)
    return {
      valid: false,
      chartTypeError: `Chart type "${config.chartType}" is not compatible with the available fields (${fieldSummary}). Eligible chart types: ${eligible.join(', ')}.`,
      fieldErrors: [],
      eligibleChartTypes: eligible,
      suggestedConfig: determineDefaultConfig(data, columns),
    }
  }

  // Compute defaults scoped to the user's requested chart type so the suggested
  // config can auto-fill missing required fields without discarding the user's
  // other choices (e.g. keep their colorField, fill in the missing xField/yField).
  const defaultableChartTypes = [
    'line',
    'bar',
    'barh',
    'point',
    'geo-map',
    'tree',
    'area',
    'heatmap',
    'headline',
    'donut',
  ] as const
  type DefaultableChartType = (typeof defaultableChartTypes)[number]
  const scopedChartType: DefaultableChartType | undefined = (
    defaultableChartTypes as readonly string[]
  ).includes(config.chartType)
    ? (config.chartType as DefaultableChartType)
    : undefined
  const typeDefaults = determineDefaultConfig(data, columns, scopedChartType)

  const columnNames = Array.from(columns.keys())

  // Validate that referenced fields exist in the data
  const fieldKeys: (keyof ChartConfig)[] = [
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
  ]
  for (const key of fieldKeys) {
    const val = config[key]
    if (typeof val === 'string' && val !== '' && !columns.has(val)) {
      fieldErrors.push(
        `Field "${val}" (${key}) does not exist in the query results. Available columns: ${columnNames.join(', ')}.`,
      )
    }
  }

  // Validate that all required fields for this chart type are specified.
  // A field is required when a Control entry targets this chart type with allowEmpty=false.
  const requiredControls = Controls.filter(
    (c) => !c.allowEmpty && c.visibleFor.includes(config.chartType),
  )
  for (const control of requiredControls) {
    const val = config[control.field]
    if (typeof val !== 'string' || val === '') {
      fieldErrors.push(
        `Chart type "${config.chartType}" requires ${control.label} (${String(control.field)}) to be specified, but it is missing.`,
      )
    }
  }

  // Chart-type-specific field validation
  if (config.chartType === 'geo-map') {
    const latCols = filteredColumns('latitude', columns)
    const lonCols = filteredColumns('longitude', columns)
    const geoCols = filteredColumns('geographic', columns)

    const hasLatLon = latCols.length > 0 && lonCols.length > 0
    const hasGeo = geoCols.length > 0

    if (!hasLatLon && !hasGeo) {
      fieldErrors.push(
        `geo-map requires geographic columns (latitude/longitude pairs or state/country codes) but none were found. ` +
          `Available columns: ${columnNames.join(', ')}. ` +
          `Consider using a different chart type or adjusting the query to include geographic fields.`,
      )
    }

    // Validate xField/yField are actual lat/long when used for geo-map without geoField
    if (!config.geoField && !hasGeo) {
      if (config.xField && lonCols.length > 0 && !lonCols.some((c) => c.name === config.xField)) {
        fieldErrors.push(
          `For geo-map, xField should be a longitude column. "${config.xField}" is not a longitude field. ` +
            `Available longitude columns: ${lonCols.map((c) => c.name).join(', ') || 'none'}.`,
        )
      }
      if (config.yField && latCols.length > 0 && !latCols.some((c) => c.name === config.yField)) {
        fieldErrors.push(
          `For geo-map, yField should be a latitude column. "${config.yField}" is not a latitude field. ` +
            `Available latitude columns: ${latCols.map((c) => c.name).join(', ') || 'none'}.`,
        )
      }
    }
  }

  if (config.chartType === 'line' || config.chartType === 'area') {
    // These chart types work best with temporal x-axis
    if (config.xField && columns.has(config.xField)) {
      const col = columns.get(config.xField)!
      if (!isTemporalColumn(col) && !isCategoricalColumn(col) && !isNumericColumn(col)) {
        fieldErrors.push(
          `For ${config.chartType} charts, xField should typically be a temporal or categorical column.`,
        )
      }
    }
  }

  // Build the suggested config: start from type-scoped defaults, then overlay
  // the user's explicit (non-empty) choices so auto-correction preserves them.
  const mergedSuggested: Partial<ChartConfig> = { ...typeDefaults }
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v === '') continue
    ;(mergedSuggested as any)[k] = v
  }

  return {
    valid: fieldErrors.length === 0,
    fieldErrors,
    eligibleChartTypes: eligible,
    suggestedConfig: mergedSuggested,
  }
}

/**
 * Format a chart config validation result as a user-facing error message
 * suitable for returning to an LLM agent.
 */
export const formatChartConfigValidationError = (
  validation: ChartConfigValidationResult,
): string => {
  const errors = [validation.chartTypeError, ...validation.fieldErrors].filter(Boolean)
  return (
    `Chart configuration is invalid for the data:\n` +
    `${errors.map((e) => `  - ${e}`).join('\n')}\n` +
    `Eligible chart types for this data: ${validation.eligibleChartTypes.join(', ') || 'none'}.\n` +
    `Suggested auto-detected config: ${JSON.stringify(validation.suggestedConfig)}\n` +
    `Tip: Omit chartConfig to let auto-detection choose the best chart type and field mapping.`
  )
}

/**
 * Get formatting hints for a field based on its column type
 */
export const getFormatHint = (
  fieldName: string | undefined,
  columns: Map<string, ResultColumn>,
): any => {
  if (!fieldName || !columns.get(fieldName)) return {}

  const column = columns.get(fieldName)
  if (!column) return {}
  if (getColumnHasTrait(fieldName, columns, 'usd')) {
    return { format: '$,.2f' }
  }
  if (getColumnHasTrait(fieldName, columns, 'percent')) {
    return { format: '.1%' }
  }
  if (getColumnHasTrait(fieldName, columns, 'year')) {
    return {
      labelAngle: -45, // optional: tilt labels to fit better
      format: '%Y',
      timeUnit: 'year',
    }
  }
  if (getColumnHasTrait(fieldName, columns, 'month')) {
    return { format: 'd' }
  }
  if (getColumnHasTrait(fieldName, columns, 'day_of_week')) {
    return { format: 'd' }
  }
  switch (column.type) {
    case ColumnType.DATE:
      return { timeUnit: 'yearmonthdate', labelAngle: -45 }
    case ColumnType.TIME:
      return { timeUnit: 'hoursminutesseconds', labelAngle: -45 }
    case ColumnType.DATETIME:
      return { timeUnit: 'yearmonthdate-hours' }
    case ColumnType.INTEGER:
      return {}
    default:
      return {}
  }
}

export const getSortOrder = (
  fieldName: string,
  columns: Map<string, ResultColumn>,
  valueColumn: string | null = null,
): any => {
  if (!fieldName || !columns.get(fieldName)) return {}
  const column = columns.get(fieldName)
  if (!column) return {}
  // if it has a week_day trait, sort by week days explicitly
  if (getColumnHasTrait(fieldName, columns, 'day_of_week_name')) {
    return { sort: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] }
  }
  if (isOrdinalColumn(column)) {
    return { sort: { field: fieldName, order: 'ascending' } }
  }
  if (hasDiscreteTimeTraitOnColumn(column)) {
    return { sort: { field: fieldName, order: 'ascending' } }
  }
  if (isTemporalColumn(column)) {
    return { sort: { field: fieldName, order: 'ascending' } }
  } else if (isNumericColumn(column)) {
    if (valueColumn) {
      return {
        sort: { field: valueColumn, op: 'sum', order: 'descending' },
      }
    }
    return { sort: { field: fieldName, order: 'descending' } }
  } else {
    if (valueColumn) {
      return {
        sort: { field: valueColumn, op: 'sum', order: 'descending' },
      }
    }
    return { sort: { field: fieldName, order: 'ascending' } }
  }
}

/**
 * Get Vega field type based on column type
 */
export const getVegaFieldType = (
  fieldName: string,
  columns: Map<string, ResultColumn>,
): 'nominal' | 'temporal' | 'ordinal' | 'quantitative' => {
  if (!fieldName || !columns.get(fieldName)) return 'nominal'

  const column = columns.get(fieldName)
  if (!column) return 'nominal'
  if (isTemporalColumn(column)) {
    if ([ColumnType.DATETIME, ColumnType.TIMESTAMP, ColumnType.INTEGER].includes(column.type)) {
      return 'temporal'
    }
    if ([ColumnType.DATE].includes(column.type)) {
      return 'temporal'
    }
    return 'ordinal'
  } else if (isOrdinalColumn(column)) {
    return 'ordinal'
  } else if (hasDiscreteTimeTraitOnColumn(column)) {
    return 'ordinal'
  } else if (isNumericColumn(column)) {
    return 'quantitative'
  } else {
    return 'nominal'
  }
}

export const createFieldEncoding = (
  fieldName: string,
  columns: Map<string, ResultColumn>,
  axisOptions = {},
  sort: boolean = true,
  options: {
    scale?: string | undefined
    zero?: boolean | undefined
  } = {},
): FieldEncodingOutput => {
  if (!fieldName) return {}
  return {
    field: fieldName,
    type: getVegaFieldType(fieldName, columns),
    title: snakeCaseToCapitalizedWords(columns.get(fieldName)?.description || fieldName),
    ...getFormatHint(fieldName, columns),
    ...axisOptions,
    ...(sort ? getSortOrder(fieldName, columns) : {}),
    ...(options.scale !== undefined || options.zero !== undefined
      ? {
          scale: {
            ...(options.scale !== undefined && { type: options.scale }),
            ...(options.zero !== undefined && { zero: options.zero }),
          },
        }
      : {}),
  }
}

/**
 * Create standard opacity and stroke width encoding for interaction
 */
export const createInteractionEncodings = () => {
  return {
    fillOpacity: {
      condition: { param: 'select', value: 1 },
      value: 0.3,
    },
    strokeWidth: {
      condition: [
        {
          param: 'select',
          empty: false,
          value: 2,
        },
        {
          param: 'highlight',
          empty: false,
          value: 1,
        },
      ],
      value: 0,
    },
  }
}

export const getLegendOrientation = (
  field: string,
  isMobile: boolean,
  fieldType: string,
  legendType: 'size' | 'color' = 'color',
) => {
  let labelRight = false
  if (fieldType === 'quantitative' && legendType === 'color') {
    labelRight = true
  }
  if (field && field.length > 10) {
    return {
      orient: isMobile ? 'bottom' : 'right',
      titleOrient: isMobile ? 'center' : labelRight ? 'right' : 'top',
      direction: isMobile ? 'horizontal' : 'vertical',
      titleFontSize: isMobile ? 10 : 10,
    }
  }
  return {
    orient: isMobile ? 'bottom' : 'right',
    titleOrient: isMobile ? 'bottom' : 'top',
    direction: isMobile ? 'horizontal' : 'vertical',
    titleFontSize: isMobile ? 10 : 12,
  }
}
const legendTicks = 15

export const createColorEncoding = (
  _: ChartConfig,
  colorField: string | undefined,
  columns: Map<string, ResultColumn>,
  isMobile: boolean = false,
  currentTheme: string = 'light',
  hideLegend: boolean = false,
  data: readonly Row[] | null = [],
) => {
  let legendConfig = { tickCount: legendTicks }
  let uniqueValues: any[] = []
  let allCategories: string[] = []
  const localData = data || []

  // Find any hex fields in the columns
  const hexfields = Array.from(columns.entries())
    .filter(([_, col]) => col.traits?.includes('hex'))
    .map(([colName, _]) => colName)

  if (colorField) {
    const fieldType = getVegaFieldType(colorField, columns)
    legendConfig = {
      ...legendConfig,
      ...getLegendOrientation(colorField, isMobile, fieldType),
    }

    // Compute all unique values for the domain (full dataset)

    if (fieldType === 'nominal' || fieldType === 'ordinal') {
      allCategories = Array.from(new Set(localData.map((r) => String(r[colorField] ?? '')))).sort(
        (a, b) => a.localeCompare(b),
      )
    }

    // Slice for legend display
    uniqueValues = allCategories.slice(0, legendTicks)
  }

  // Helper function to conditionally add legend
  const addLegendIfNeeded = (obj: any) => {
    if (!hideLegend && Object.keys(legendConfig).length > 0) {
      obj.legend = legendConfig
    } else if (hideLegend) {
      obj.legend = null
    }
    return obj
  }

  if (colorField && columns.get(colorField)) {
    const fieldType = getVegaFieldType(colorField, columns)
    legendConfig = {
      ...legendConfig,
      ...getFormatHint(colorField, columns),
      // Only legend shows top `legendTicks` values
      ...((fieldType === 'nominal' || fieldType === 'ordinal') && uniqueValues.length > 0
        ? { values: uniqueValues }
        : {}),
    }

    // default scale choices
    let scale =
      fieldType === 'quantitative'
        ? { scheme: currentTheme === 'light' ? 'viridis' : 'plasma' }
        : { scheme: currentTheme === 'light' ? 'category20c' : 'plasma' }

    // HEX mapping logic: create full domain/range arrays
    if (hexfields.length > 0) {
      const hexField = hexfields[0]

      // Map each unique category to the first found hex, fallback if missing
      const range = allCategories.map((cat) => {
        const foundRow = localData.find((r) => String(r[colorField]) === cat && r[hexField] != null)
        return foundRow ? String(foundRow[hexField]) : '#999999'
      })
      // @ts-ignore
      scale = { domain: allCategories, range }
    }

    const rval = {
      field: colorField,
      type: fieldType,
      title: snakeCaseToCapitalizedWords(columns.get(colorField)?.description || colorField),
      scale: scale,
      condition: [
        { param: 'highlight', empty: false, value: HIGHLIGHT_COLOR },
        { param: 'select', empty: false, value: HIGHLIGHT_COLOR },
      ],
      ...getFormatHint(colorField, columns),
    }

    return addLegendIfNeeded(rval)
  }

  return addLegendIfNeeded({})
}

export const createSizeEncoding = (
  sizeField: string | undefined,
  columns: Map<string, ResultColumn>,
  isMobile: boolean = false,
  hideLegend: boolean = false,
): any => {
  let legendConfig = {
    tickCount: 5,
  }

  if (sizeField) {
    const fieldType = getVegaFieldType(sizeField, columns)
    legendConfig = {
      ...legendConfig,
      ...getLegendOrientation(sizeField, isMobile, fieldType, 'size'),
    }
  }

  // Helper function to conditionally add legend
  const addLegendIfNeeded = (obj: any) => {
    if (!hideLegend && Object.keys(legendConfig).length > 0) {
      obj.legend = legendConfig
    } else if (hideLegend) {
      obj.legend = null
    }
    return obj
  }
  // "scale": { "rangeMin": 75, "nice": true},
  if (sizeField && columns.get(sizeField)) {
    return addLegendIfNeeded({
      scale: { rangeMin: 30, nice: true, type: 'linear' },
      field: sizeField,
      title: snakeCaseToCapitalizedWords(columns.get(sizeField)?.description || sizeField),
    })
  }
  return {}
}
