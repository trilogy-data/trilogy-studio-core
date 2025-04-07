import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { toRaw } from 'vue'
const temporalTraits = ['year', 'month', 'day', 'hour', 'minute', 'second']

const categoricalTraits = ['year', 'month', 'day', 'hour', 'minute', 'second']

// Helper functions to identify column types
export const isNumericColumn = (column: ResultColumn): boolean => {
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
  if (column.traits && categoricalTraits.some((trait) => column.traits?.includes(trait))) {
    return true
  }
  return false
}

const getVegaFieldType = (fieldName: string, columns: Map<string, ResultColumn>): string => {
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
    case ColumnType.INTEGER:
      return {}
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

export const generateVegaSpec = (
  data: readonly Row[] | null,
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  chartSelection: Object[] | null,
  isMobile: boolean = false,
) => {
  let intChart = chartSelection ? chartSelection.map((x) => toRaw(x)) : []
  let spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: { values: data },
    width: 'container',
    // 28 is the chart control height
    height: 'container',
    // height: isMobile ? containerHeight : containerHeight ? containerHeight - 150 : 'container',
    params: [
      {
        name: 'highlight',
        select: {
          type: 'point',
          on: 'pointerover',
          clear: 'mouseout',
        },
      },
      {
        name: 'select',
        select: 'point',
        value: intChart,
      },
    ],
    mark: {
      type: 'bar',
      fill: '#4C78A8',
      stroke: 'black',
      cursor: 'pointer',
    },
    config: {
      scale: {
        bandPaddingInner: 0.2,
      },
    },
  }

  // Basic encoding object that we'll modify based on chart type
  let encoding: any = {}
  let legendConfig = {}
  if (isMobile) {
    legendConfig = {
      legend: {
        orient: 'bottom',
        direction: 'horizontal',
      },
    }
  }

  console.log(isMobile)
  console.log(legendConfig)

  // Add color encoding if specified (and not for special chart types)
  if (config.colorField && !['heatmap'].includes(config.chartType)) {
    const fieldType = getVegaFieldType(config.colorField, columns)
    encoding.color = {
      field: config.colorField,
      type: fieldType,
      title: columns.get(config.colorField)?.description || config.colorField,
      scale: fieldType === 'quantitative' ? { scheme: 'viridis' } : { scheme: 'category10' },
      ...getFormatHint(config.colorField, columns),
      ...legendConfig,
    }
  } else {
    encoding.color = {
      ...legendConfig,
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
            axis: {
              labelExpr: isMobile ? "slice(datum.label, 0, 10) + '...'" : 'datum.label',
            },
            ...getFormatHint(config.yField || '', columns),
          },
          x: {
            field: config.xField,
            type: getVegaFieldType(config.xField || '', columns),
            title: columns.get(config.xField || '')?.description || config.xField,
            ...getFormatHint(config.xField || '', columns),
          },
          fillOpacity: {
            condition: { param: 'select', value: 1 },
            value: 0.3,
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
    case 'usa-map':
      // First, we need to set up the correct projection
      spec.projection = {
        type: 'albersUsa',
      }

      if (config.xField && config.yField) {
        const usaMapSpec = {
          params: [
            {
              name: 'highlight',
              select: {
                type: 'point',
                on: 'pointerover',
                clear: 'mouseout',
              },
            },
            {
              name: 'select',
              select: 'point',
              // override the default selection for now
            },
          ],
          layer: [
            {
              data: {
                url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2.2.0/data/us-10m.json',
                format: { type: 'topojson', feature: 'states' },
              },
              mark: { type: 'geoshape', fill: '#e5e5e5', stroke: 'white' },
            },
            {
              mark: { type: 'circle', tooltip: true },
              encoding: {
                longitude: { field: config.xField, type: 'quantitative' },
                latitude: { field: config.yField, type: 'quantitative' },
                size: {
                  field: config.sizeField,
                  type: 'quantitative',
                  title: config.sizeField,
                  scale: {
                    type: 'quantize',
                    nice: true,
                  },
                },

                color: config.colorField
                  ? {
                      field: config.colorField,
                      type: 'quantitative',
                      title: config.colorField,
                      scale: { scheme: 'viridis' },
                      ...legendConfig,
                    }
                  : { value: 'steelblue' },
                tooltip: [
                  {
                    field: config.xField,
                    type: 'quantitative',
                    title: config.xField
                      ? columns.get(config.xField)?.description || config.xField
                      : config.xField,
                  },
                  {
                    field: config.yField,
                    type: 'quantitative',
                    title: config.yField
                      ? columns.get(config.yField)?.description || config.yField
                      : config.yField,
                  },
                  {
                    field: config.sizeField,
                    type: 'quantitative',
                    title: config.sizeField
                      ? columns.get(config.sizeField)?.description || config.sizeField
                      : config.sizeField,
                  },
                ],
              },
            },
          ],
        }

        // Replace the existing spec with the updated usaMapSpec
        spec = { ...spec, ...usaMapSpec }
      } else if (config.geoField) {
        const usaStateSpec = {
          params: [
            {
              name: 'highlight',
              select: { type: 'point', on: 'pointerover', clear: 'mouseout' },
            },
            {
              name: 'select',
              select: 'point',
              // override the default selection for now
            },
          ],
          config: {
            scale: { bandPaddingInner: 0.2 },
            view: { stroke: null },
          },
          transform: [
            {
              lookup: 'id',
              from: {
                data: {
                  values: [
                    { id: 1, abbr: 'AL' },
                    { id: 2, abbr: 'AK' },
                    { id: 4, abbr: 'AZ' },
                    { id: 5, abbr: 'AR' },
                    { id: 6, abbr: 'CA' },
                    { id: 8, abbr: 'CO' },
                    { id: 9, abbr: 'CT' },
                    { id: 10, abbr: 'DE' },
                    { id: 11, abbr: 'DC' },
                    { id: 12, abbr: 'FL' },
                    { id: 13, abbr: 'GA' },
                    { id: 15, abbr: 'HI' },
                    { id: 16, abbr: 'ID' },
                    { id: 17, abbr: 'IL' },
                    { id: 18, abbr: 'IN' },
                    { id: 19, abbr: 'IA' },
                    { id: 20, abbr: 'KS' },
                    { id: 21, abbr: 'KY' },
                    { id: 22, abbr: 'LA' },
                    { id: 23, abbr: 'ME' },
                    { id: 24, abbr: 'MD' },
                    { id: 25, abbr: 'MA' },
                    { id: 26, abbr: 'MI' },
                    { id: 27, abbr: 'MN' },
                    { id: 28, abbr: 'MS' },
                    { id: 29, abbr: 'MO' },
                    { id: 30, abbr: 'MT' },
                    { id: 31, abbr: 'NE' },
                    { id: 32, abbr: 'NV' },
                    { id: 33, abbr: 'NH' },
                    { id: 34, abbr: 'NJ' },
                    { id: 35, abbr: 'NM' },
                    { id: 36, abbr: 'NY' },
                    { id: 37, abbr: 'NC' },
                    { id: 38, abbr: 'ND' },
                    { id: 39, abbr: 'OH' },
                    { id: 40, abbr: 'OK' },
                    { id: 41, abbr: 'OR' },
                    { id: 42, abbr: 'PA' },
                    { id: 44, abbr: 'RI' },
                    { id: 45, abbr: 'SC' },
                    { id: 46, abbr: 'SD' },
                    { id: 47, abbr: 'TN' },
                    { id: 48, abbr: 'TX' },
                    { id: 49, abbr: 'UT' },
                    { id: 50, abbr: 'VT' },
                    { id: 51, abbr: 'VA' },
                    { id: 53, abbr: 'WA' },
                    { id: 54, abbr: 'WV' },
                    { id: 55, abbr: 'WI' },
                    { id: 56, abbr: 'WY' },
                  ],
                },
                key: 'id',
                fields: ['abbr'],
              },
            },
            {
              lookup: 'abbr',
              from: {
                data: { ...spec.data },
                key: config.geoField,
                fields: [config.colorField, config.sizeField].filter((x) => x),
              },
            },
          ],
          mark: {
            type: 'geoshape',
          },
          encoding: {
            color: {
              field: config.colorField,
              type: 'quantitative',
              scale: {
                type: 'quantize',
                nice: true,
              },
              legend: {
                title: config.colorField,
              },
            },
            opacity: {
              condition: { param: 'select', value: 1 },
              value: 0.3,
            },
            stroke: {
              condition: { param: 'highlight', empty: false, value: 'black' },
              value: null,
            },
            strokeWidth: {
              condition: { param: 'highlight', empty: false, value: 2 },
              value: 0.5,
            },
          },
        }
        spec = {
          ...spec,
          ...{
            data: {
              url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/us-10m.json',
              format: {
                type: 'topojson',
                feature: 'states',
              },
            },
            ...usaStateSpec,
          },
        }
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

export const columHasTraitEnding = (column: ResultColumn, trait: string): boolean => {
  if (column.traits) {
    return column.traits.some((t) => t.endsWith(trait))
  }
  return false
}

// Filter columns by type for UI controls
export const filteredColumns = (
  filter: 'numeric' | 'categorical' | 'temporal' | 'latitude' | 'longitude' | 'all',
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

  if (numericColumns.length === 0) {
    console.log('No numeric columns found')
    return defaults
  }

  // Select appropriate chart type based on available column types
  if (chartType) {
    defaults.chartType = chartType
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
  } else if (defaults.chartType === 'line') {
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
    if (latitudeColumns.length > 0) {
      defaults.yField = latitudeColumns[0].name
    }
    if (longitudeColumns.length > 0) {
      defaults.xField = longitudeColumns[0].name
    }

    // Use the first numeric column for the color encoding
    if (numericColumns.length > 0) {
      defaults.sizeField = numericColumns[0].name
    }
    if (numericColumns.length > 1) {
      defaults.colorField = numericColumns[1].name
    }
  }

  return defaults
}

// Helper to create a default selection config based on chart type
export const getDefaultSelectionConfig = (
  chartType: string,
  config: ChartConfig,
): SelectionConfig => {
  const defaultConfig: SelectionConfig = {
    enabled: true,
    selectionType: 'single',
    on: 'click',
  }

  switch (chartType) {
    case 'bar':
    case 'barh':
      defaultConfig.encodings = ['x']
      break
    case 'line':
      if (config.colorField) {
        defaultConfig.fields = [config.colorField]
      } else {
        defaultConfig.encodings = ['x']
      }
      break
    case 'point':
      defaultConfig.nearest = true
      defaultConfig.encodings = ['x', 'y']
      break
    case 'area':
      defaultConfig.encodings = ['x']
      break
    case 'heatmap':
      defaultConfig.encodings = ['x', 'y']
      break
    case 'boxplot':
      defaultConfig.encodings = ['x']
      break
    default:
      defaultConfig.encodings = ['x']
      break
  }

  return defaultConfig
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
  }

  eligibleCharts.push('usa-map')
  // Ensure all chart types are from the predefined list
  return eligibleCharts.filter((chart) =>
    ['bar', 'barh', 'line', 'point', 'area', 'heatmap', 'boxplot', 'usa-map'].includes(chart),
  )
}
