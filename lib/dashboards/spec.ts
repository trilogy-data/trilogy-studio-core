import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { toRaw } from 'vue'
import { snakeCaseToCapitalizedWords } from './formatting'
import {
  createSizeEncoding,
  createColorEncoding,
  createFieldEncoding,
  getFormatHint,
  getVegaFieldType,
} from './helpers'
import { lightDefaultColor, darkDefaultColor } from './constants'
import { createTreemapSpec } from './treeSpec'
import { createMapSpec } from './mapSpec'
import { createHeadlineSpec } from './headlineSpec'
import { createBarChartSpec } from './barChartSpec'
import { createDonutChartSpec } from './donutSpec'
import { createBarHChartSpec } from './barHChartSpec'
import { createLineChartSpec, createAreaChartSpec } from './lineAreaSpec'

/**
 * Create a field encoding for Vega-Lite
 */

/**
 * Generate tooltip fields with proper formatting
 */
const generateTooltipFields = (config: ChartConfig, columns: Map<string, ResultColumn>): any[] => {
  const fields: any[] = []

  if (config.xField && columns.get(config.xField)) {
    fields.push(createFieldEncoding(config.xField, columns, {}, false))
  }

  if (config.yField && columns.get(config.yField)) {
    fields.push(createFieldEncoding(config.yField, columns, {}, false))
  }
  if (config.yField2 && columns.get(config.yField2)) {
    fields.push(createFieldEncoding(config.yField2, columns, {}, false))
  }
  if (config.colorField && columns.get(config.colorField)) {
    fields.push(createFieldEncoding(config.colorField, columns, {}, false))
  }
  if (config.sizeField && columns.get(config.sizeField)) {
    fields.push(createFieldEncoding(config.sizeField, columns, {}, false))
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
  const color = currentTheme === 'light' ? lightDefaultColor : darkDefaultColor
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
      color: createColorEncoding(
        config,
        config.colorField,
        columns,
        false,
        currentTheme,
        config.hideLegend,
      ),
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
  currentTheme: 'light' | 'dark' | '' = 'light',
) => {
  let intChart: { [key: string]: string | number | Array<any> }[] = chartSelection
    ? (chartSelection.map((x) => toRaw(x)) as { [key: string]: string | number | Array<any> }[])
    : ([] as { [key: string]: string | number | Array<any> }[])

  // Create base spec
  let spec: any = createBaseSpec(data)

  // Set up color encoding
  let encoding: any = {}
  encoding.color = createColorEncoding(
    config,
    !['heatmap'].includes(config.chartType) ? config.colorField : undefined,
    columns,
    isMobile,
    currentTheme,
    config.hideLegend,
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

  const tooltipFields = generateTooltipFields(config, columns)

  // Generate chart specification based on chart type
  let chartSpec = {}

  switch (config.chartType) {
    case 'bar':
      chartSpec = createBarChartSpec(
        config,
        columns,
        tooltipFields,
        encoding,
        data,
        intChart,
        currentTheme,
      )

      break

    case 'barh':
      chartSpec = createBarHChartSpec(
        config,
        columns,
        tooltipFields,
        encoding,
        isMobile,
        intChart,
        currentTheme,
      )
      break
    case 'donut':
      chartSpec = createDonutChartSpec(
        config,
        columns,
        tooltipFields,
        encoding,
        intChart,
        currentTheme,
      )
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
      chartSpec = createHeadlineSpec(config, data, columns, currentTheme, isMobile, intChart)
      break

    case 'heatmap':
      chartSpec = createHeatmapSpec(config, columns, tooltipFields, intChart)
      break

    case 'usa-map':
      chartSpec = createMapSpec(config, data || [], columns, isMobile, intChart, currentTheme)
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
      background: '#262626',
    }
  }
  if (currentTheme === 'light') {
    spec.config = {
      background: '#FBFBFB',
    }
  }
  if (config.showTitle && title) {
    spec.title = {
      text: title,
      // fontSize: 20,
      // fontWeight: 'bold',
      color: currentTheme === 'dark' ? '#FFFFFF' : '#000000',
    }
  }
  return spec
}
