import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { toRaw } from 'vue'
import { snakeCaseToCapitalizedWords } from './formatting'
import { isTemporalColumn, isNumericColumn, getColumnHasTrait, getColumnFormat } from './helpers'
import { createTreemapSpec } from './treeSpec'
import { createUSAMapSpec } from './mapSpec'

const HIGHLIGHT_COLOR = '#FF7F7F'

/**
 * Get formatting hints for a field based on its column type
 */
const getFormatHint = (fieldName: string, columns: Map<string, ResultColumn>): any => {
  if (!fieldName || !columns.get(fieldName)) return {}

  const column = columns.get(fieldName)
  if (!column) return {}
  if (getColumnHasTrait(fieldName, columns, 'usd')) {
    return { format: '$,.2f' }
  }
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

/**
 * Get Vega field type based on column type
 */
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

/**
 * Create a field encoding for Vega-Lite
 */
const createFieldEncoding = (
  fieldName: string,
  columns: Map<string, ResultColumn>,
  axisOptions = {},
): any => {
  if (!fieldName) return {}

  return {
    field: fieldName,
    type: getVegaFieldType(fieldName, columns),
    title: snakeCaseToCapitalizedWords(columns.get(fieldName)?.description || fieldName),
    ...getFormatHint(fieldName, columns),
    ...axisOptions,
  }
}

/**
 * Generate tooltip fields with proper formatting
 */
const generateTooltipFields = (
  _: string,
  xField: string,
  yField: string,
  columns: Map<string, ResultColumn>,
  colorField?: string,
): any[] => {
  const fields: any[] = []

  if (xField && columns.get(xField)) {
    fields.push(createFieldEncoding(xField, columns))
  }

  if (yField && columns.get(yField)) {
    fields.push(createFieldEncoding(yField, columns))
  }

  if (colorField && columns.get(colorField)) {
    fields.push(createFieldEncoding(colorField, columns))
  }

  return fields
}

/**
 * Create a base chart specification
 */
const createBaseSpec = (data: readonly Row[] | null, chartSelection: Object[] | null) => {
  const intChart: Array<Partial<ChartConfig>> = chartSelection
    ? chartSelection.map((x) => toRaw(x))
    : []

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: { values: data },
    width: 'container',
    height: 'container',
    params: [
      {
        name: 'highlight',
        select: {
          type: 'point',
          on: 'mouseover',
          clear: 'mouseout',
        },
      },
      {
        name: 'select',
        select: {
          type: 'point',
          on: 'click,touchend',
        },
        value: intChart,
        nearest: true,
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
}

/**
 * Create color encoding configuration
 */
const createColorEncoding = (
  colorField: string | undefined,
  columns: Map<string, ResultColumn>,
  isMobile: boolean = false,
) => {
  const legendConfig = isMobile
    ? {
        legend: {
          orient: 'bottom',
          direction: 'horizontal',
        },
      }
    : {
        condition: [
          {
            param: 'highlight',
            empty: false,
            value: HIGHLIGHT_COLOR,
          },
        ],
      }

  if (colorField && columns.get(colorField)) {
    const fieldType = getVegaFieldType(colorField, columns)
    return {
      field: colorField,
      type: fieldType,
      title: snakeCaseToCapitalizedWords(columns.get(colorField)?.description || colorField),
      scale: fieldType === 'quantitative' ? { scheme: 'viridis' } : { scheme: 'category20c' },
      condition: [
        {
          param: 'highlight',
          empty: false,
          value: HIGHLIGHT_COLOR,
        },
      ],

      ...getFormatHint(colorField, columns),
      ...legendConfig,
    }
  }

  return { ...legendConfig }
}

/**
 * Create standard opacity and stroke width encoding for interaction
 */
const createInteractionEncodings = () => {
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

/**
 * Create brush parameter for line/area charts
 */
const createBrushParam = (intChart: Array<Partial<ChartConfig>>, config: ChartConfig) => {
  return {
    name: 'brush',
    select: { type: 'interval', encodings: ['x'], value: intChart },
    //@ts-ignore
    value:
      intChart.length > 0 && config.xField
        ? { x: intChart[0][config.xField as keyof typeof config] }
        : undefined,
  }
}

/**
 * Create layer for interactive charts (line/area)
 */
const createInteractiveLayer = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  intChart: Array<Partial<ChartConfig>> = [],
  filtered: boolean = false,
  markColor: string = 'steelblue',
) => {
  // Create the main layer for the primary y-axis
  const mainLayer = {
    ...(filtered ? { transform: [{ filter: { param: 'brush' } }] } : {}),
    mark: {
      type: config.chartType === 'line' ? 'line' : 'area',
      ...(config.chartType === 'area' ? { line: true } : {}),
      ...(filtered ? { color: markColor } : { color: 'lightgray' }),
    },
    data: { values: data },
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
      y: createFieldEncoding(config.yField || '', columns, {
        axis: { format: getColumnFormat(config.yField, columns) },
      }),
      tooltip: tooltipFields,
      ...encoding,
    },
    params: [] as Array<any>,
  }

  if (!filtered) {
    mainLayer.params = [
      {
        name: 'highlight',
        select: {
          type: 'point',
          on: 'mouseover',
          clear: 'mouseout',
        },
      },
      createBrushParam(intChart, config),
    ]
  }

  // If no secondary y field is defined, return just the main layer
  if (!config.yField2) {
    return [mainLayer]
  }

  // Create a secondary layer for the second y-axis
  const secondaryLayer = {
    ...(filtered ? { transform: [{ filter: { param: 'brush' } }] } : {}),
    mark: {
      type: config.chartType === 'line' ? 'line' : 'area',
      ...(config.chartType === 'area' ? { line: true } : {}),
      ...(filtered ? { color: 'orange' } : { color: 'lightgray' }),
      strokeDash: [4, 2], // Add dashed line to distinguish from primary y-axis
    },
    data: { values: data },
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
      y: createFieldEncoding(config.yField2, columns),
      tooltip: tooltipFields,
      ...encoding,
    },
    params: !filtered
      ? [
          {
            name: 'highlight2',
            select: {
              type: 'point',
              on: 'mouseover',
              clear: 'mouseout',
            },
          },
        ]
      : [],
  }

  // Return an array containing both layers
  return [mainLayer, secondaryLayer]
}

/**
 * Create chart specification for bar chart
 */
const createBarChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  data: readonly Row[] | null,
) => {
  // Determine the number of unique values in the x-field
  let xValueCount = 0
  if (data && config.xField) {
    // Create a Set to count unique values
    const uniqueValues = new Set()
    let lookup = config.xField
    data.forEach((row) => {
      if (row[lookup]) {
        uniqueValues.add(row[lookup])
      }
    })
    xValueCount = uniqueValues.size
  }

  // Set the label angle based on the count
  const labelAngle = xValueCount > 7 ? -45 : 0
  return {
    mark: 'bar',
    encoding: {
      x: createFieldEncoding(config.xField || '', columns, { axis: { labelAngle } }),
      y: createFieldEncoding(config.yField || '', columns, {
        axis: { format: getColumnFormat(config.yField, columns) },
      }),
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      ...encoding,
    },
  }
}

/**
 * Create chart specification for horizontal bar chart
 */
const createBarHChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  isMobile: boolean,
) => {
  return {
    mark: 'bar',
    encoding: {
      y: {
        ...createFieldEncoding(config.yField || '', columns),
        sort: '-x',
        axis: {
          labelExpr: isMobile
            ? "datum.label.length > 13 ? slice(datum.label, 0, 10) + '...' : datum.label"
            : 'datum.label',
        },
      },
      x: createFieldEncoding(config.xField || '', columns, {
        axis: { format: getColumnFormat(config.xField, columns) },
      }),
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      ...encoding,
    },
  }
}

/**
 * Create chart specification for line chart
 */
const createLineChartSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  intChart: Array<Partial<ChartConfig>>,
) => {
  let base = createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart)
  let filtered = createInteractiveLayer(
    config,
    data,
    columns,
    tooltipFields,
    encoding,
    intChart,
    true,
  )
  // if there are two fields in both, we have two ys. Layer them independently
  let layers = []
  if (base.length > 1 && filtered.length > 1) {
    layers = [{ layer: [base[0], filtered[0]] }, { layer: [base[1], filtered[1]] }]
  } else {
    layers = [...base, ...filtered]
  }
  return {
    data: undefined,
    params: [],
    layer: layers,
  }
}

/**
 * Create chart specification for area chart
 */
const createAreaChartSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  intChart: Array<Partial<ChartConfig>>,
) => {
  return {
    data: undefined,
    layer: [
      ...createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart),
      ...createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart, true),
    ],
  }
}

/**
 * Create chart specification for point chart
 */
const createPointChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
) => {
  return {
    mark: { type: 'point', filled: true },
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
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
}

/**
 * Create chart specification for headline display
 */
const createHeadlineSpec = (
  data: readonly Row[] | null,
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  currentTheme: string,
) => {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'A simple headline metric display',
    width: 'container',
    height: 'container',
    data: {
      values: data ? data[0] : [],
    },
    layer: [
      {
        mark: {
          type: 'text',
          fontSize: { expr: 'min(30, width/8)' },
          fontWeight: 'bold',
          align: 'center',
          baseline: 'middle',
          dx: 0,
          dy: -20,
        },
        encoding: {
          text: {
            field: config.xField,
            type: 'quantitative',
            format: getColumnFormat(config.xField, columns),
          },
          // color: { value: currentTheme === 'light'? '#333333': '#ffffff'},
          color: { value: currentTheme === 'light' ? '#262626' : '#f0f0f0' },
        },
      },
      {
        mark: {
          type: 'text',
          fontSize: 14,
          fontWeight: 'normal',
          align: 'center',
          baseline: 'top',
          dx: 0,
          dy: 10,
        },
        encoding: {
          text: { value: snakeCaseToCapitalizedWords(config.xField) },
          color: { value: currentTheme === 'light' ? '#595959' : '#d1d1d1' },
          // color: { value: '#666666' },
        },
      },
    ],
    config: {
      view: { stroke: null },
      axis: { grid: false, domain: false },
    },
  }
}

/**
 * Create chart specification for heatmap
 */
const createHeatmapSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
) => {
  return {
    mark: 'rect',
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
      y: createFieldEncoding(config.yField || '', columns),
      color: {
        field: config.colorField,
        type: getVegaFieldType(config.colorField || '', columns),
        title: snakeCaseToCapitalizedWords(
          columns.get(config.colorField || '')?.description || config.colorField,
        ),
        scale: { scheme: 'viridis' },
        ...getFormatHint(config.colorField || '', columns),
      },
      tooltip: tooltipFields,
    },
  }
}

/**
 * Create chart specification for boxplot
 */
const createBoxplotSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
) => {
  return {
    mark: { type: 'boxplot', extent: 'min-max' },
    encoding: {
      x: createFieldEncoding(config.groupField || '', columns),
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
}

/**
 * Generate Vega-Lite specification for visualization
 */
export const generateVegaSpec = (
  data: readonly Row[] | null,
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  chartSelection: Object[] | null,
  isMobile: boolean = false,
  title: string = '',
  currentTheme: string = 'light',
) => {
  let intChart: Array<Partial<ChartConfig>> = chartSelection
    ? chartSelection.map((x) => toRaw(x))
    : []

  // Create base spec
  let spec: any = createBaseSpec(data, chartSelection)

  // Set up color encoding
  let encoding: any = {}
  encoding.color = createColorEncoding(
    !['heatmap'].includes(config.chartType) ? config.colorField : undefined,
    columns,
    isMobile,
  )

  // Handle trellis (facet) layout if specified
  if (config.trellisField && config.chartType === 'line') {
    spec.facet = {
      field: config.trellisField,
      type: getVegaFieldType(config.trellisField, columns),
      title: snakeCaseToCapitalizedWords(
        columns.get(config.trellisField)?.description || config.trellisField,
      ),
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

  // Generate chart specification based on chart type
  let chartSpec = {}

  switch (config.chartType) {
    case 'bar':
      chartSpec = createBarChartSpec(config, columns, tooltipFields, encoding, data)

      break

    case 'barh':
      chartSpec = createBarHChartSpec(config, columns, tooltipFields, encoding, isMobile)
      break

    case 'line':
      chartSpec = createLineChartSpec(config, data, columns, tooltipFields, encoding, intChart)
      break

    case 'area':
      chartSpec = createAreaChartSpec(config, data, columns, tooltipFields, encoding, intChart)
      break

    case 'point':
      chartSpec = createPointChartSpec(config, columns, tooltipFields, encoding)
      break

    case 'headline':
      chartSpec = createHeadlineSpec(data, config, columns, currentTheme)
      break

    case 'heatmap':
      chartSpec = createHeatmapSpec(config, columns, tooltipFields)
      break

    case 'usa-map':
      chartSpec = createUSAMapSpec(config, data, columns, isMobile, intChart)
      break

    case 'boxplot':
      chartSpec = createBoxplotSpec(config, columns, tooltipFields, encoding)
      break

    case 'tree':
      chartSpec = createTreemapSpec(config, data, columns, tooltipFields, encoding)
      break
  }

  // Apply chart spec to main spec
  if (config.trellisField && !['headline', 'usa-map'].includes(config.chartType)) {
    spec.spec = { ...spec.spec, ...chartSpec }
  } else {
    spec = { ...spec, ...chartSpec }
  }

  // Add mobile-specific configurations
  if (isMobile) {
    spec.point = {
      size: 80, // Larger hit area for touch targets
    }
    spec.signals = [
      {
        name: 'touchSignal',
        on: [
          {
            events: 'touchend',
            update: 'datum', // This is crucial for touch events
          },
        ],
      },
    ]
  }

  if (title && config.chartType === 'usa-map') {
    spec.title = title
  }

  if (config.yField2) {
    spec.resolve = {
      scale: {
        y: 'independent',
      },
    }
  }
  return spec
}
