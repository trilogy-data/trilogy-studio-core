import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { toRaw } from 'vue'
import { snakeCaseToCapitalizedWords } from './formatting'
import {
  createColorEncoding,
  createFieldEncoding,
  getFormatHint,
  getVegaFieldType,
} from './helpers'
import { createTreemapSpec } from './treeSpec'
import { createMapSpec } from './mapSpec'
import { createHeadlineSpec } from './headlineSpec'
import { createBarChartSpec } from './barChartSpec'
import { createDonutChartSpec } from './donutSpec'
import { createBarHChartSpec } from './barHChartSpec'
import { createHeatmapSpec } from './heatmapSpec'
import { createLineChartSpec, createAreaChartSpec } from './lineAreaSpec'
import { createPointChartSpec, addLabelTransformToTextMarks } from './pointSpec'
import { createBeeSwarmSpec } from './beeSwarmSpec'
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
  if (config.annotationField) {
    fields.push(createFieldEncoding(config.annotationField, columns, {}, false))
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
 * Create chart specification for heatmap
 */

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
import { compile } from 'vega-lite'
export const generateVegaSpec = (
  data: readonly Row[] | null,
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  chartSelection: Object[] | null,
  isMobile: boolean = false,
  title: string = '',
  currentTheme: 'light' | 'dark' | '' = 'light',
  containerHeight: number = 400,
  containerWidth: number = 600,
) => {
  let intChart: { [key: string]: string | number | Array<any> }[] = chartSelection
    ? (chartSelection.map((x) => toRaw(x)) as { [key: string]: string | number | Array<any> }[])
    : ([] as { [key: string]: string | number | Array<any> }[])
  // preprocess data - if any column is a year, map it to a data.forEach(d => d.year = new Date(d.year, 0, 1));
  // Preprocess data - find all columns with 'year' trait and map integer years to dates
  const yearColumns = Array.from(columns.entries())
    .filter(([_, col]) => col.traits?.includes('year'))
    .map(([colName, _]) => colName)

  let localData = data ? [...data] : []
  if (yearColumns.length > 0 && localData) {
    localData.forEach((row) => {
      yearColumns.forEach((colName) => {
        const yearValue = row[colName]
        // Check if the value is a number (integer year) and convert to Date
        if (typeof yearValue === 'number' && Number.isInteger(yearValue)) {
          // Create date for January 1st of the given year
          //@ts-ignore
          row[colName] = new Date(yearValue, 0, 1)
        }
      })
    })
  }
  
  // Create base spec
  let spec: any = createBaseSpec(localData)


  // Set up color encoding
  let encoding: any = {}
  encoding.color = createColorEncoding(
    config,
    !['heatmap'].includes(config.chartType) ? config.colorField : undefined,
    columns,
    isMobile,
    currentTheme,
    config.hideLegend,
    localData,
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
        localData,
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
        localData,
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
        localData,
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
        intChart,
        currentTheme,
        isMobile,
        localData,
      )
      break

    case 'headline':
      chartSpec = createHeadlineSpec(config, localData, columns, currentTheme, isMobile, intChart)
      break

    case 'heatmap':
      chartSpec = createHeatmapSpec(
        config,
        columns,
        tooltipFields,
        currentTheme,
        isMobile,
        data,
        intChart,
      )
      break

    case 'usa-map':
      chartSpec = createMapSpec(config, localData || [], columns, isMobile, intChart, currentTheme)
      break

    case 'boxplot':
      chartSpec = createBoxplotSpec(config, columns, tooltipFields, encoding)
      break

    case 'tree':
      chartSpec = createTreemapSpec(config, localData, columns, tooltipFields, encoding)
      break
    case 'beeswarm':
      chartSpec = createBeeSwarmSpec(
        config,
        columns,
        tooltipFields,
        encoding,
        isMobile,
        intChart,
        currentTheme,
        localData,
        containerHeight, containerWidth,
      )
      break
  }

  // Apply chart spec to main spec
  if (config.trellisField && !['headline', 'usa-map'].includes(config.chartType)) {
    spec.spec = { ...spec.spec, ...chartSpec }
  } else {
    spec = { ...spec, ...chartSpec }
  }

  if (config.yField2 && !config.linkY2) {
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
  if (config.chartType === 'point') {
    const customLabelTransform = {
      type: 'label',
      anchor: ['right', 'top', 'bottom', 'left'],
      offset: [2],
      size: { signal: '[width + 100, height]' },
    }
    return addLabelTransformToTextMarks(compile(spec).spec, customLabelTransform)
  }
  return spec
}
