import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { toRaw } from 'vue'
import { lookupCountry } from './countryLookup'
import { snakeCaseToCapitalizedWords } from './formatting'
import { isTemporalColumn, isNumericColumn, getColumnHasTrait } from './helpers'

const HIGHLIGHT_COLOR = '#FF7F7F'

/**
 * Determines if more than 80% of data rows are within the US bounding box
 * @param rows - Array of data objects
 * @param latField - Name of the field containing latitude value
 * @param longField - Name of the field containing longitude value
 * @returns Boolean indicating if more than 80% of points are in the US bounding box
 */
function isDataMostlyInUS<T>(rows: T[], latField: keyof T, longField: keyof T): boolean {
  // US bounding box coordinates
  const top = 49.3457868 // north lat
  const left = -124.7844079 // west long
  const right = -66.9513812 // east long
  const bottom = 24.7433195 // south lat

  // Count points inside the bounding box
  let insideCount = 0

  for (const row of rows) {
    const lat = Number(row[latField])
    const lng = Number(row[longField])

    // Check if point is inside the bounding box
    if (bottom <= lat && lat <= top && left <= lng && lng <= right) {
      insideCount++
    }
  }

  // Calculate percentage of points inside the box
  const percentageInside = (insideCount / rows.length) * 100

  // Return true if more than 80% of points are inside the box
  return percentageInside > 80
}

/**
 * Get formatting hints for a field based on its column type
 */
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
    : {}

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
  const layer = {
    ...(filtered ? { transform: [{ filter: { param: 'brush' } }] } : {}),
    mark: {
      type: config.chartType === 'line' ? 'line' : 'area',
      ...(config.chartType === 'area' ? { line: true } : {}),
      ...(filtered ? { color: markColor } : { color: 'lightgray' }),
    },
    data: { values: data },
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
      y: createFieldEncoding(config.yField || '', columns),
      tooltip: tooltipFields,
      ...encoding,
    },
    params: [] as Array<any>,
  }

  if (!filtered) {
    layer.params = [
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

  return layer
}

/**
 * Create chart specification for bar chart
 */
const createBarChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
) => {
  return {
    mark: 'bar',
    encoding: {
      x: createFieldEncoding(config.xField || '', columns, { axis: { labelAngle: -45 } }),
      y: createFieldEncoding(config.yField || '', columns),
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
      x: createFieldEncoding(config.xField || '', columns),
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
  return {
    data: undefined,
    params: [],
    layer: [
      createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart),
      createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart, true),
    ],
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
      createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart),
      createInteractiveLayer(config, data, columns, tooltipFields, encoding, intChart, true),
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
const createHeadlineSpec = (data: readonly Row[] | null, config: ChartConfig) => {
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
          fontSize: 36,
          fontWeight: 'bold',
          align: 'center',
          baseline: 'middle',
          dx: 0,
          dy: -20,
        },
        encoding: {
          text: { field: config.xField, type: 'quantitative' },
          color: { value: '#333333' },
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
          color: { value: '#666666' },
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
 * Create chart specification for USA map
 */
const createUSAMapSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
) => {
  const legendConfig = isMobile
    ? {
        legend: {
          orient: 'bottom',
          direction: 'horizontal',
        },
      }
    : {}

  if (config.xField && config.yField) {
    //@ts-ignore
    if (isDataMostlyInUS(data, config.yField, config.xField)) {
      return {
        projection: {
          type: 'albersUsa',
        },
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
            // value: intChart,
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
                title: snakeCaseToCapitalizedWords(config.sizeField),
                scale: {
                  type: 'quantize',
                  nice: true,
                },
              },
              color: config.colorField
                ? {
                    field: config.colorField,
                    type: 'quantitative',
                    title: snakeCaseToCapitalizedWords(config.colorField),
                    scale: { scheme: 'viridis' },
                    ...legendConfig,
                  }
                : { value: 'steelblue' },
              tooltip: [
                {
                  field: config.xField,
                  type: 'quantitative',
                  title: snakeCaseToCapitalizedWords(
                    config.xField
                      ? columns.get(config.xField)?.description || config.xField
                      : config.xField,
                  ),
                },
                {
                  field: config.yField,
                  type: 'quantitative',
                  title: snakeCaseToCapitalizedWords(
                    config.yField
                      ? columns.get(config.yField)?.description || config.yField
                      : config.yField,
                  ),
                },
                {
                  field: config.sizeField,
                  type: 'quantitative',
                  title: snakeCaseToCapitalizedWords(
                    config.sizeField
                      ? columns.get(config.sizeField)?.description || config.sizeField
                      : config.sizeField,
                  ),
                },
              ],
            },
          },
        ],
      }
    }
  } else if (config.geoField && getColumnHasTrait(config.geoField, columns, 'us_state_short')) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 'container',
      projection: { type: 'albersUsa' },
      layer: [
        {
          data: {
            url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/us-10m.json',
            format: { type: 'topojson', feature: 'states' },
          },
          mark: { type: 'geoshape', fill: '#e5e5e5', stroke: 'white' },
        },
        {
          data: {
            url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/us-10m.json',
            format: { type: 'topojson', feature: 'states' },
          },
          mark: { type: 'geoshape' },
          params: [
            {
              name: 'highlight',
              select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
            },
            { name: 'select', select: 'point', value: intChart}
          ],
          encoding: {
            color: {
              field: config.colorField,
              type: 'quantitative',
              scale: { type: 'quantize', nice: true, zero: true },
              legend: { title: snakeCaseToCapitalizedWords(config.colorField) },
            },
            opacity: { condition: { param: 'select', value: 1 }, value: 0.3 },
            stroke: {
              condition: { param: 'highlight', empty: false, value: 'black' },
              value: null,
            },
            strokeWidth: {
              condition: { param: 'highlight', empty: false, value: 2 },
              value: 0.5,
            },
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
                data: {
                  values: data,
                },
                key: config.geoField,
                fields: [config.colorField, config.sizeField, config.geoField].filter((x) => x),
              },
            },
          ],
        },
      ],
    }
  } else if (config.geoField && getColumnHasTrait(config.geoField, columns, 'country')) {
    let lookupField: string = config.geoField
    //@ts-ignore
    const idLookup = (row) => {
      const lookup = lookupCountry(row[lookupField], 'name')
      if (lookup) {
        return Number(lookup['country-code'])
      } else {
        return null
      }
    }

    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 'container',
      layer: [
        {
          data: {
            url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/world-110m.json',
            format: { type: 'topojson', feature: 'countries' },
          },
          transform: [
            {
              filter: 'datum.id !== 10', // Filter out Antarctica (country code 10)
            },
          ],
          mark: { type: 'geoshape', fill: '#e0e0e0', stroke: '#bbb', strokeWidth: 0.5 },
          projection: { type: 'mercator' },
        },
        {
          data: {
            url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/world-110m.json',
            format: { type: 'topojson', feature: 'countries' },
          },
          transform: [
            {
              lookup: 'id',
              from: {
                data: {
                  values: data?.map((row) => {
                    return {
                      id: idLookup(row),
                      ...row,
                    }
                  }),
                },
                key: 'id',
                fields: [config.colorField, config.sizeField, config.geoField].filter((x) => x),
              },
            },
          ],
          params: [
            {
              name: 'highlight',
              select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
            },
            {
              name: 'select',
              select: 'point',
              value: intChart,
            },
          ],
          mark: { type: 'geoshape' },
          projection: { type: 'mercator' },
          encoding: {
            color: {
              field: config.colorField,
              type: 'quantitative',
              scale: { type: 'quantize', nice: true },
              legend: { title: config.colorField },
            },
            opacity: { condition: { param: 'select', value: 1 }, value: 0.3 },
            tooltip: [
              { field: config.geoField, type: 'nominal', title: config.geoField },
              { field: config.colorField, type: 'quantitative', title: config.colorField },
            ],
            stroke: {
              condition: { param: 'highlight', empty: false, value: 'black' },
              value: '#666',
            },
            strokeWidth: {
              condition: { param: 'highlight', empty: false, value: 2 },
              value: 0.5,
            },
          },
        },
      ],
      config: { view: { stroke: null } },
    }
  }

  return {}
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
      chartSpec = createBarChartSpec(config, columns, tooltipFields, encoding)

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
      chartSpec = createHeadlineSpec(data, config)
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
  if (config.chartType === 'barh') {
    console.log('look at this')
    console.log(spec)
  }
  return spec
}
