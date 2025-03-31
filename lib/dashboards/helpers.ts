import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'

// Helper functions to identify column types
export const isNumericColumn = (column: ResultColumn): boolean => {
  return [
    ColumnType.NUMBER,
    ColumnType.INTEGER,
    ColumnType.FLOAT,
    ColumnType.MONEY,
    ColumnType.PERCENT,
  ].includes(column.type)
}

export const isTemporalColumn = (column: ResultColumn): boolean => {
  return [ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIME, ColumnType.TIMESTAMP].includes(
    column.type,
  )
}

export const isCategoricalColumn = (column: ResultColumn): boolean => {
  return [
    ColumnType.STRING,
    ColumnType.BOOLEAN,
    ColumnType.URL,
    ColumnType.EMAIL,
    ColumnType.PHONE,
  ].includes(column.type)
}

const getVegaFieldType = (fieldName: string, columns: Map<string, ResultColumn>): string => {
  if (!fieldName || !columns.get(fieldName)) return 'nominal'

  const column = columns.get(fieldName)
  if (!column) return 'nominal'
  if (isTemporalColumn(column)) {
    return 'temporal'
  } else if (isNumericColumn(column)) {
    return 'quantitative'
  } else {
    return 'nominal'
  }
}

const getFormatHint = (fieldName: string, columns: Map<string, ResultColumn>): any => {
  if (!fieldName || !columns.get(fieldName)) return {}

  const column = columns.get(fieldName)
  if (!column) return {}

  switch (column.type) {
    case ColumnType.MONEY:
      return { format: '$,.2f' }
    case ColumnType.PERCENT:
      return { format: '.1%' }
    case ColumnType.DATE:
      return { timeUnit: 'yearmonthdate' }
    case ColumnType.TIME:
      return { timeUnit: 'hoursminutesseconds' }
    case ColumnType.DATETIME:
      return { timeUnit: 'yearmonthdate-hours' }
    default:
      return {}
  }
}

// Generate tooltip fields with proper formatting
const generateTooltipFields = (
  _: string,
  xField: string,
  yField: string,
  columns: Map<string, ResultColumn>,
  colorField?: string,
): any[] => {
  const fields: any[] = []

  if (xField && columns.get(xField)) {
    fields.push({
      field: xField,
      type: getVegaFieldType(xField, columns),
      title: columns.get(xField)?.description || xField,
      ...getFormatHint(xField, columns),
    })
  }

  if (yField && columns.get(yField)) {
    fields.push({
      field: yField,
      type: getVegaFieldType(yField, columns),
      title: columns.get(yField)?.description || yField,
      ...getFormatHint(yField, columns),
    })
  }

  if (colorField && columns.get(colorField)) {
    fields.push({
      field: colorField,
      type: getVegaFieldType(colorField, columns),
      title: columns.get(colorField)?.description || colorField,
      ...getFormatHint(colorField, columns),
    })
  }

  return fields
}

export const generateVegaSpec = (
  data: readonly Row[] | null,
  config: ChartConfig,
  isMobile: boolean,
  containerHeight: number | undefined,
  columns: Map<string, ResultColumn>,
) => {
  if (!data || data.length === 0) return null

  let spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: { values: data },
    width: 'container',
    // 28 is the chart control height
    height: isMobile ? containerHeight : containerHeight ? containerHeight - 150 : 'container',
  }

  // Basic encoding object that we'll modify based on chart type
  let encoding: any = {}

  // Add color encoding if specified (and not for special chart types)
  if (config.colorField && !['heatmap'].includes(config.chartType)) {
    const fieldType = getVegaFieldType(config.colorField, columns)
    encoding.color = {
      field: config.colorField,
      type: fieldType,
      title: columns.get(config.colorField)?.description || config.colorField,
      scale: fieldType === 'quantitative' ? { scheme: 'viridis' } : { scheme: 'category10' },
      ...getFormatHint(config.colorField, columns),
    }
  }

  // Handle trellis (facet) layout if specified
  if (config.trellisField && config.chartType === 'line') {
    spec.facet = {
      field: config.trellisField,
      type: getVegaFieldType(config.trellisField, columns),
      title: columns.get(config.trellisField)?.description || config.trellisField,
    }
    spec.spec = { width: 'container', height: 200 }
  }

  const tooltipFields = generateTooltipFields(
    config.chartType,
    config.xField || '',
    config.yField || '',
    columns,
    config.colorField,
  )

  // Build encodings for specific chart types
  switch (config.chartType) {
    case 'bar':
      const barSpec = {
        mark: 'bar',
        encoding: {
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            axis: { labelAngle: -45 },
            ...getFormatHint(config.xField || '', columns),
          },
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            ...getFormatHint(config.yField || '', columns),
          },
          tooltip: tooltipFields,
          ...encoding,
        },
      }

      if (config.trellisField) {
        spec.spec = barSpec
      } else {
        spec = { ...spec, ...barSpec }
      }

      break

    case 'barh':
      const barHSpec = {
        mark: 'bar',
        encoding: {
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            sort: '-x',
            ...getFormatHint(config.yField || '', columns),
          },
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            ...getFormatHint(config.xField || '', columns),
          },
          tooltip: tooltipFields,
          ...encoding,
        },
      }

      if (config.trellisField) {
        spec.spec = barHSpec
      } else {
        spec = { ...spec, ...barHSpec }
      }
      break

    case 'line':
      const lineSpec = {
        mark: { type: 'line', point: true },
        encoding: {
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            ...getFormatHint(config.xField || '', columns),
          },
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            ...getFormatHint(config.yField || '', columns),
          },
          tooltip: tooltipFields,
          ...encoding,
        },
      }

      if (config.trellisField) {
        spec.spec = lineSpec
      } else {
        spec = { ...spec, ...lineSpec }
      }
      break

    case 'point':
      const pointSpec = {
        mark: { type: 'point', filled: true },
        encoding: {
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            ...getFormatHint(config.xField || '', columns),
          },
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            ...getFormatHint(config.yField || '', columns),
          },
          tooltip: tooltipFields,
          ...encoding,
        },
      }

      if (config.trellisField) {
        spec.spec = pointSpec
      } else {
        spec = { ...spec, ...pointSpec }
      }
      break

    case 'area':
      const areaSpec = {
        mark: { type: 'area', line: true, point: true },
        encoding: {
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            ...getFormatHint(config.xField || '', columns),
          },
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            ...getFormatHint(config.yField || '', columns),
          },
          tooltip: tooltipFields,
          ...encoding,
        },
      }

      if (config.trellisField) {
        spec.spec = areaSpec
      } else {
        spec = { ...spec, ...areaSpec }
      }
      break

    case 'heatmap':
      const heatmapSpec = {
        mark: 'rect',
        encoding: {
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            ...getFormatHint(config.xField || '', columns),
          },
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            ...getFormatHint(config.yField || '', columns),
          },
          color: {
            field: config.colorField,
            type: getVegaFieldType(config.colorField || '', columns),
            title: columns.get(config.colorField || '')?.description || config.colorField,
            scale: { scheme: 'viridis' },
            ...getFormatHint(config.colorField || '', columns),
          },
          tooltip: tooltipFields,
        },
      }

      if (config.trellisField) {
        spec.spec = heatmapSpec
      } else {
        spec = { ...spec, ...heatmapSpec }
      }
      break

    case 'boxplot':
      const boxplotSpec = {
        mark: { type: 'boxplot', extent: 'min-max' },
        encoding: {
          x: {
            field: config.groupField,
            type: getVegaFieldType(config.groupField || '', columns),
            title: columns.get(config.groupField || '')?.description || config.groupField,
            ...getFormatHint(config.groupField || '', columns),
          },
          y: {
            field: config.yField,
            type: getVegaFieldType(config.yField || '', columns),
            title: columns.get(config.yField || '')?.description || config.yField,
            ...getFormatHint(config.yField || '', columns),
          },
          tooltip: tooltipFields,
          ...encoding,
        },
      }

      if (config.trellisField) {
        spec.spec = boxplotSpec
      } else {
        spec = { ...spec, ...boxplotSpec }
      }
      break
  }

  return spec
}

// Filter columns by type for UI controls
export const filteredColumns = (
  filter: 'numeric' | 'categorical' | 'temporal' | 'all',
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
    }
  })

  return result
}
// Determine default configuration based on column types
export const determineDefaultConfig = (
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
): Partial<ChartConfig> => {
  const defaults: Partial<ChartConfig> = {}

  const numericColumns = filteredColumns('numeric', columns)
  const categoricalColumns = filteredColumns('categorical', columns)
  const temporalColumns = filteredColumns('temporal', columns)

  if (numericColumns.length === 0) {
    console.log('No numeric columns found')
    return defaults
  }

  // Select appropriate chart type based on available column types
  if (temporalColumns.length > 0 && numericColumns.length > 0) {
    // Time series data - use line chart
    defaults.chartType = 'line'
    defaults.xField = temporalColumns[0].name
    defaults.yField = numericColumns[0].name

    // If we have a categorical column, use it for color
    if (categoricalColumns.length > 0) {
      defaults.colorField = categoricalColumns[0].name
    }
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
      defaults.yField = firstCatField
      defaults.xField = numericColumns[0].name
    } else {
      // Few categories - use vertical bar
      defaults.chartType = 'bar'
      defaults.xField = firstCatField
      defaults.yField = numericColumns[0].name
    }

    // If we have a second categorical column, use it for color
    if (categoricalColumns.length > 1) {
      defaults.colorField = categoricalColumns[1].name
    }
  } else if (numericColumns.length >= 2) {
    // Multiple numeric columns - use scatter plot
    defaults.chartType = 'point'
    defaults.xField = numericColumns[0].name
    defaults.yField = numericColumns[1].name

    // If we have a categorical column, use it for color
    if (categoricalColumns.length > 0) {
      defaults.colorField = categoricalColumns[0].name
    }
  } else if (categoricalColumns.length >= 2 && numericColumns.length > 0) {
    // Two categorical dimensions and a numeric - use heatmap
    defaults.chartType = 'heatmap'
    defaults.xField = categoricalColumns[0].name
    defaults.yField = categoricalColumns[1].name
    defaults.colorField = numericColumns[0].name
  }

  return defaults
}
