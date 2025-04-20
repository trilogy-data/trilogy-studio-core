import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { Charts } from './constants'

const temporalTraits = ['year', 'month', 'day', 'hour', 'minute', 'second']

const categoricalTraits = ['year', 'month', 'day', 'hour', 'minute', 'second']

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
    [
      ColumnType.NUMBER,
      ColumnType.INTEGER,
      ColumnType.FLOAT,
      ColumnType.MONEY,
      ColumnType.PERCENT,
    ].includes(column.type) &&
    !column.traits?.some((trait) => trait.endsWith('latitude') || trait.endsWith('longitude'))
  )
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
  let base = [
    ColumnType.STRING,
    ColumnType.BOOLEAN,
    ColumnType.URL,
    ColumnType.EMAIL,
    ColumnType.PHONE,
  ].includes(column.type)
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
  chartType?: string,
): Partial<ChartConfig> => {
  const defaults: Partial<ChartConfig> = {}

  const numericColumns = filteredColumns('numeric', columns)
  const categoricalColumns = filteredColumns('categorical', columns)
  const temporalColumns = filteredColumns('temporal', columns)
  const latitudeColumns = filteredColumns('latitude', columns)
  const longitudeColumns = filteredColumns('longitude', columns)
  const geoColumns = filteredColumns('geographic', columns)

  if (numericColumns.length === 0) {
    console.log('No numeric columns found')
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
    defaults.chartType = 'point'
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
  } else if (defaults.chartType === 'heatmap') {
    defaults.xField = categoricalColumns[0].name
    defaults.yField = categoricalColumns[1].name
    defaults.colorField = numericColumns[0].name
  } else if (defaults.chartType === 'bar') {
    defaults.xField = categoricalColumns[0].name
    defaults.yField = numericColumns[0].name
    const nonAssignedCategorical = categoricalColumns.filter(
      (col) => col.name !== defaults.yField && col.name !== defaults.xField,
    )
    if (nonAssignedCategorical.length > 0) {
      defaults.colorField = nonAssignedCategorical[0].name
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
    return eligibleCharts
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
