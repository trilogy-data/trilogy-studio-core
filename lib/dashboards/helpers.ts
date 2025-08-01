import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { Charts } from './constants'
import { snakeCaseToCapitalizedWords } from './formatting'
const temporalTraits = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
  'day_of_week',
  'quarter',
]

const geoTraits = ['us_state', 'us_state_short', 'country', 'latitude', 'longitude']

const categoricalTraits = [...temporalTraits]

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
  return (
    [ColumnType.NUMBER, ColumnType.INTEGER, ColumnType.FLOAT].includes(column.type) &&
    !column.traits?.some((trait) => trait.endsWith('latitude') || trait.endsWith('longitude'))
  )
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

export const getColumnFormat = (
  field: string | undefined,
  columns: Map<string, ResultColumn>,
): string | null => {
  if (!field || !columns.get(field)) return null
  if (getColumnHasTrait(field, columns, 'usd')) {
    return '$,.2f'
  }
  if (getColumnHasTrait(field, columns, 'percent')) {
    return '.1%'
  }
  return null
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
    } else if (filter === 'numeric' && isNumericColumn(column)) {
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
// Determine default configuration based on column types
export const determineDefaultConfig = (
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
  chartType?:
    | 'line'
    | 'bar'
    | 'barh'
    | 'point'
    | 'usa-map'
    | 'tree'
    | 'area'
    | 'heatmap'
    | 'headline'
    | 'donut',
): Partial<ChartConfig> => {
  const defaults: Partial<ChartConfig> = {
    showDebug: false,
    showTitle: true,
    hideLegend: false,
  }

  const numericColumns = filteredColumns('numeric', columns)
  const categoricalColumns = filteredColumns('categorical', columns)
  const temporalColumns = filteredColumns('temporal', columns)
  const latitudeColumns = filteredColumns('latitude', columns)
  const longitudeColumns = filteredColumns('longitude', columns)
  const geoColumns = filteredColumns('geographic', columns)

  // if the columns map is empty, return {}
  if (columns.size === 0) {
    return {}
  }
  if (numericColumns.length === 0) {
    defaults.chartType = 'headline'
    return defaults
  }

  // Select appropriate chart type based on available column types
  if (chartType) {
    defaults.chartType = chartType
  } else if (longitudeColumns.length > 0 && latitudeColumns.length > 0) {
    // Geospatial data - use map
    defaults.chartType = 'usa-map'
  } else if (geoColumns.length > 0) {
    defaults.chartType = 'usa-map'
  } else if (temporalColumns.length > 0 && numericColumns.length > 0) {
    // Time series data - use line chart
    defaults.chartType = 'line'
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
    defaults.yField = categoricalColumns[0].name
    defaults.xField = numericColumns[0].name
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    if (numericColumns.length > 1 && !defaults.colorField) {
      defaults.colorField = numericColumns[1].name
    }
  } else if (defaults.chartType === 'donut') {
    defaults.yField = categoricalColumns[0].name
    defaults.xField = numericColumns[0].name
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
    defaults.xField = numericColumns[0].name
    defaults.yField = numericColumns[1].name

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
  } else if (defaults.chartType === 'heatmap') {
    defaults.xField = categoricalColumns[0].name
    defaults.yField = categoricalColumns[1].name
    defaults.colorField = numericColumns[0].name
  } else if (defaults.chartType === 'bar') {
    defaults.xField = categoricalColumns[0].name
    let nonDateNumeric = numericColumns.filter(
      (col) => !isTemporalColumn(col) && col.name !== defaults.xField,
    )
    defaults.yField = nonDateNumeric ? nonDateNumeric[0].name : numericColumns[0].name
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
    if (numericColumns.length > 1 && !defaults.colorField) {
      defaults.colorField = numericColumns[1].name
    }
  } else if (defaults.chartType === 'headline') {
    defaults.xField = numericColumns[0].name
  } else if (['line', 'area'].includes(defaults.chartType || '')) {
    defaults.xField = temporalColumns[0].name
    const nonTemporalNumericColumns = numericColumns.filter(
      (col) => col.name !== temporalColumns[0].name,
    )

    // Use the first non-temporal numeric column if available, otherwise use the first numeric column
    defaults.yField =
      nonTemporalNumericColumns.length > 0
        ? nonTemporalNumericColumns[0].name
        : numericColumns[0].name
    defaults.yField2 =
      nonTemporalNumericColumns.length > 1 ? nonTemporalNumericColumns[1].name : undefined
    // If we have a categorical column, use it for color
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
    }
  } else if (defaults.chartType === 'usa-map') {
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

  // If no numeric columns, very limited chart options
  if (numericColumns.length === 0) {
    return ['headline']
  }

  // Time series data - line chart
  if (temporalColumns.length > 0 && numericColumns.length > 0) {
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
    eligibleCharts.push('usa-map')
  }
  // Ensure all chart types are from the predefined list
  return eligibleCharts.filter((chart) => Charts.map((x) => x.value).includes(chart))
}

/**
 * Get formatting hints for a field based on its column type
 */
export const getFormatHint = (fieldName: string, columns: Map<string, ResultColumn>): any => {
  if (!fieldName || !columns.get(fieldName)) return {}

  const column = columns.get(fieldName)
  if (!column) return {}
  if (getColumnHasTrait(fieldName, columns, 'usd')) {
    return { format: '$,.2f' }
  }
  if (getColumnHasTrait(fieldName, columns, 'percent')) {
    return { format: '.1%' }
  }
  switch (column.type) {
    case ColumnType.DATE:
      return { timeUnit: 'yearmonthdate' }
    case ColumnType.TIME:
      return { timeUnit: 'hoursminutesseconds' }
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
  if (isTemporalColumn(column)) {
    return { sort: { field: fieldName, order: 'ascending' } }
  } else if (isNumericColumn(column)) {
    if (valueColumn) {
      return {
        sort: { field: valueColumn, order: 'descending' },
      }
    }
    return { sort: { field: fieldName, order: 'descending' } }
  } else {
    if (valueColumn) {
      return {
        sort: { field: valueColumn, order: 'descending' },
      }
    }
    return { sort: { field: fieldName, order: 'ascending' } }
  }
}

/**
 * Get Vega field type based on column type
 */
export const getVegaFieldType = (fieldName: string, columns: Map<string, ResultColumn>): string => {
  if (!fieldName || !columns.get(fieldName)) return 'nominal'

  const column = columns.get(fieldName)
  if (!column) return 'nominal'
  if (isTemporalColumn(column)) {
    if ([ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIMESTAMP].includes(column.type)) {
      return 'temporal'
    }
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
): any => {
  if (!fieldName) return {}

  return {
    field: fieldName,
    type: getVegaFieldType(fieldName, columns),
    title: snakeCaseToCapitalizedWords(columns.get(fieldName)?.description || fieldName),
    ...getFormatHint(fieldName, columns),
    ...axisOptions,
    ...(sort ? getSortOrder(fieldName, columns) : {}),
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
