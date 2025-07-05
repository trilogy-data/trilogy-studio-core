import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { ColumnType } from '../editors/results'
import { toRaw } from 'vue'
import { snakeCaseToCapitalizedWords } from './formatting'
import { isTemporalColumn, isNumericColumn, getColumnHasTrait, getColumnFormat, createFieldEncoding, getFormatHint, getVegaFieldType, createInteractionEncodings } from './helpers'
import { createTreemapSpec } from './treeSpec'
import { createMapSpec } from './mapSpec'
import { createHeadlineSpec } from './headlineSpec'
import { createBarChartSpec } from './barChartSpec'

const HIGHLIGHT_COLOR = '#FF7F7F'

/**
 * Create a field encoding for Vega-Lite
 */

/**
 * Generate tooltip fields with proper formatting
 */
const generateTooltipFields = (
  _: string,
  xField: string,
  yField: string,
  columns: Map<string, ResultColumn>,
  colorField?: string,
  sizeField?: string,
): any[] => {
  const fields: any[] = []

  if (xField && columns.get(xField)) {
    fields.push(createFieldEncoding(xField, columns, {}, false))
  }

  if (yField && columns.get(yField)) {
    fields.push(createFieldEncoding(yField, columns, {}, false))
  }

  if (colorField && columns.get(colorField)) {
    fields.push(createFieldEncoding(colorField, columns, {}, false))
  }
  if (sizeField && columns.get(sizeField)) {
    fields.push(createFieldEncoding(sizeField, columns, {}, false))
  }
  return fields
}

/**
 * Create a base chart specification
 */
export const createBaseSpec = (data: readonly Row[] | null) => {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: { values: data },
    width: 'container',
    height: 'container',
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
  currentTheme: string = 'light',
  hideLegend: boolean = false,
) => {

  let legendConfig = {}
  if (isMobile) {
    legendConfig = {
      ...legendConfig,
      ...{
        orient: 'bottom',
        direction: 'horizontal',
      },
    }
  }

  if (colorField && columns.get(colorField)) {
    const fieldType = getVegaFieldType(colorField, columns)
    legendConfig = { ...legendConfig, ...getFormatHint(colorField, columns) }
    let rval = {
      field: colorField,
      type: fieldType,
      title: snakeCaseToCapitalizedWords(columns.get(colorField)?.description || colorField),
      scale:
        fieldType === 'quantitative'
          ? { scheme: currentTheme === 'light' ? 'viridis' : 'plasma' }
          : { scheme: 'category20c' },
      condition: [
        {
          param: 'highlight',
          empty: false,
          value: HIGHLIGHT_COLOR,
        },
        { param: 'select', empty: false, value: HIGHLIGHT_COLOR },
      ],
      ...getFormatHint(colorField, columns),
      legend: hideLegend ? null : {
        ...legendConfig,
      },
    }
    return rval
  }

  return {
    legend: hideLegend ? null : {
      ...legendConfig,
    },
  }
}

const createSizeEncoding = (
  sizeField: string | undefined,
  columns: Map<string, ResultColumn>,
): any => {
  if (sizeField && columns.get(sizeField)) {
    return { scale: { type: 'sqrt' }, field: sizeField }
  }
  return {}
}


/**
 * Create brush parameter for line/area charts
 */
const createBrushParam = (intChart: Array<Partial<ChartConfig>>, config: ChartConfig) => {
  return {
    name: 'brush',
    select: {
      type: 'interval',
      encodings: ['x'],
      // value: intChart
    },
    value:
      intChart.length > 0 && config.xField
        ? [{ x: intChart[0][config.xField as keyof typeof config] }]
        : [],
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
  currentTheme: string = 'light',
  isMobile: boolean = false,
) => {
  // Create the main layer for the primary y-axis
  const markColor = currentTheme === 'light' ? 'steelblue' : '#4FC3F7'
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
    },
    params: [] as Array<any>,
  }

  if (config.colorField) {
    if (!filtered) {
      mainLayer.encoding = {
        ...mainLayer.encoding,
        ...{ detail: { field: config.colorField, color: 'lightgray' } },
      }
    } else {
      mainLayer.encoding = {
        ...mainLayer.encoding,
        ...{ color: createColorEncoding(config.colorField, columns, isMobile, currentTheme) },
      }
    }
  }
  mainLayer.params = []
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
      {
        name: 'select',
        select: {
          type: 'point',
          on: 'click',
          clear: 'dragleave,dblclick',
          encodings: ['y'],
        },
        // @ts-ignore
        value: intChart.filter((obj) => !(config.xField in obj)) ? intChart : [],
      },

      createBrushParam(
        // @ts-ignore
        intChart.filter((obj) => config.xField in obj).length > 0
          ? // @ts-ignore
          intChart.filter((obj) => config.xField in obj)
          : [],
        config,
      ),
    ]
  }

  // If no secondary y field is defined, return just the main layer
  // no secondary field for area charts
  if (!config.yField2 || config.chartType === 'area') {
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
 * Create chart specification for horizontal bar chart
 */
const createBarHChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
) => {
  return {
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
  currentTheme: string = 'light',
  isMobile: boolean = false,
) => {
  let base = createInteractiveLayer(
    config,
    data,
    columns,
    tooltipFields,
    encoding,
    intChart,
    false,
    currentTheme,
    isMobile,
  )
  let filtered = createInteractiveLayer(
    config,
    data,
    columns,
    tooltipFields,
    encoding,
    intChart,
    true,
    currentTheme,
    isMobile,
  )
  // if there are two fields in both, we have two y-axes. Layer them independently.
  let layers = []
  if (base.length > 1 && filtered.length > 1) {
    layers = [{ layer: [base[0], filtered[0]] }, { layer: [base[1], filtered[1]] }]
  } else {
    layers = [...base, ...filtered]
  }
  return {
    data: undefined,
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
  isMobile: boolean = false,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
) => {
  return {
    data: undefined,
    layer: [
      ...createInteractiveLayer(
        config,
        data,
        columns,
        tooltipFields,
        encoding,
        intChart,
        false,
        currentTheme,
        isMobile,
      ),
      ...createInteractiveLayer(
        config,
        data,
        columns,
        tooltipFields,
        encoding,
        intChart,
        true,
        currentTheme,
        isMobile,
      ),
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
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
) => {
  const color = currentTheme === 'light' ? '#4FC3F7' : '#FF7043'
  return {
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
      type: 'point',
      filled: true,
      color: color,
    },
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
      y: createFieldEncoding(config.yField || '', columns),
      color: createColorEncoding(config.colorField, columns, false, currentTheme),
      size: createSizeEncoding(config.sizeField, columns),
      tooltip: tooltipFields,
      ...encoding,
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
  intChart: Array<Partial<ChartConfig>>,
) => {
  return {
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
  let spec: any = createBaseSpec(data)

  // Set up color encoding
  let encoding: any = {}
  encoding.color = createColorEncoding(
    !['heatmap'].includes(config.chartType) ? config.colorField : undefined,
    columns,
    isMobile,
    currentTheme,
    config.hideLegend
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
    config.sizeField,
  )

  // Generate chart specification based on chart type
  let chartSpec = {}

  switch (config.chartType) {
    case 'bar':
      chartSpec = createBarChartSpec(config, columns, tooltipFields, encoding, data, intChart)

      break

    case 'barh':
      chartSpec = createBarHChartSpec(config, columns, tooltipFields, encoding, isMobile, intChart)
      break

    case 'line':
      chartSpec = createLineChartSpec(
        config,
        data,
        columns,
        tooltipFields,
        encoding,
        intChart,
        currentTheme,
        isMobile,
      )
      break

    case 'area':
      chartSpec = createAreaChartSpec(
        config,
        data,
        columns,
        tooltipFields,
        encoding,
        isMobile,
        intChart,
        currentTheme,
      )
      break

    case 'point':
      chartSpec = createPointChartSpec(
        config,
        columns,
        tooltipFields,
        encoding,
        intChart,
        currentTheme,
      )
      break

    case 'headline':
      chartSpec = createHeadlineSpec(data, columns, currentTheme, isMobile)
      break

    case 'heatmap':
      chartSpec = createHeatmapSpec(config, columns, tooltipFields, intChart)
      break

    case 'usa-map':
      chartSpec = createMapSpec(config, data || [], columns, isMobile, intChart)
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
  if (currentTheme === 'dark') {
    spec.config = {
      // TODO - figure how to get this from css
      background: '#262626'
    }
  }
  return spec
}
