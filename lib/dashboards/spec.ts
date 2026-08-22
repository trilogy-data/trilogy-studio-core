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
import { TRELLIS_ELIGIBLE, NO_AXES_CHARTS } from './constants'
import { toJsonSafeRows, toJsonSafeValue } from '../utility/jsonSerialization'

import {
  normalizeChartConfig,
  createLayerMarkSpec,
  createPlacementLayers,
  resolveLayerYScale,
  layerSeriesLabel,
  deriveChartTitle,
  BRUSH_DECLARING_CHART_TYPES,
} from './layerSpec'

/** One layer's own result set, for charts whose layers are independent selects. */
export interface LayerDataset {
  data: readonly Row[]
  columns: Map<string, ResultColumn>
}

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
    background: 'transparent',
    config: {
      scale: {
        bandPaddingInner: 0.2,
      },
      view: {
        stroke: null,
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
  inputConfig: ChartConfig,
  columns: Map<string, ResultColumn>,
  chartSelection: Object[] | null,
  isMobile: boolean = false,
  title: string = '',
  currentTheme: 'light' | 'dark' | '' = 'light',
  containerHeight: number = 400,
  containerWidth: number = 600,
  /**
   * One dataset per layer, positionally aligned with `config.layers`. Each
   * layer of a chart statement is an independent select over its own grain, so
   * they cannot share the top-level `data`. When omitted (every non-statement
   * chart), all layers read the single `data` argument.
   */
  layerData: LayerDataset[] | null = null,
) => {
  // A config with sub-layers renders as a Vega-Lite layer array; an ordinary
  // config resolves to exactly one layer and takes the path it always has.
  // `config` below is layer 0 -- the interactive layer -- which for a
  // single-layer chart is the input config itself.
  const { root, layers } = normalizeChartConfig(inputConfig)
  const config = layers[0]
  const isLayered = layers.length > 1 || Boolean(root.placements?.length)

  // Vega-Lite forbids facet channels inside a layered spec. Surface that rather
  // than silently dropping a layer, mirroring pytrilogy's own renderer.
  if (isLayered && (root.trellisField || root.trellisRowField)) {
    throw new Error('Trellis roles cannot be combined with multiple layers or reference lines.')
  }

  // A series legend names the layers, but only when no layer drives colour from
  // a field of its own -- two colour scales in one spec produce two legends.
  const useSeriesLegend = layers.length > 1 && !layers.some((layer) => layer.colorField)

  let intChart: { [key: string]: string | number | Array<any> }[] = chartSelection
    ? (chartSelection.map((x) => toJsonSafeValue(toRaw(x))) as {
        [key: string]: string | number | Array<any>
      }[])
    : ([] as { [key: string]: string | number | Array<any> }[])
  // preprocess data - if any column is a year, map it to a data.forEach(d => d.year = new Date(d.year, 0, 1));
  // Preprocess data - find all columns with 'year' trait and map integer years to dates
  const yearColumns = Array.from(columns.entries())
    .filter(([_, col]) => col.traits?.includes('year'))
    .map(([colName, _]) => colName)
  // const dateTimeColumns = Array.from(columns.entries())
  //   .filter(([_, col]) => col.traits?.includes('datetime'))
  //   .map(([colName, _]) => colName)
  let localData = data ? toJsonSafeRows(data) : []
  // Only convert year integers to Date for temporal charts (line/area).
  // Bar/barh use ordinal scale for discrete time traits — keep as integers so labels render cleanly.
  const isBarChart = config.chartType === 'bar' || config.chartType === 'barh'
  if (yearColumns.length > 0 && localData && !isBarChart) {
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
  // if (dateTimeColumns.length > 0 && localData) {
  //   localData.forEach((row) => {
  //     dateTimeColumns.forEach((colName) => {
  //       const dateTimeValue = row[colName]
  //       //@ts-ignore
  //       row[colName] = dateTimeValue.toJSDate()
  //     })
  //   })
  // }

  // Create base spec
  let spec: any = createBaseSpec(localData)
  const themeChartConfig =
    currentTheme === 'light'
      ? {
          view: {
            fill: '#ffffff',
            stroke: null,
          },
          axis: {
            domainColor: '#cfd6df',
            tickColor: '#cfd6df',
            gridColor: '#e5e9ef',
            labelColor: '#475569',
            titleColor: '#475569',
          },
          legend: {
            labelColor: '#475569',
            titleColor: '#334155',
          },
          header: {},
        }
      : {
          axis: {
            domainColor: '#2a2f37',
            tickColor: '#2a2f37',
            gridColor: '#1f242c',
            labelColor: '#cbd5e1',
            titleColor: '#cbd5e1',
          },
          legend: {
            labelColor: '#cbd5e1',
            titleColor: '#e5e7eb',
          },
          header: {},
        }

  // Set up color encoding
  let encoding: any = {}
  encoding.color = useSeriesLegend
    ? {
        datum: layerSeriesLabel(config, columns, 0),
        type: 'nominal',
        ...(root.hideLegend ? { legend: null } : { legend: { title: null } }),
      }
    : createColorEncoding(
        config,
        !['heatmap'].includes(config.chartType) ? config.colorField : undefined,
        columns,
        isMobile,
        currentTheme,
        config.hideLegend,
        localData,
      )

  const tooltipFields = generateTooltipFields(config, columns)

  // Generate chart specification based on chart type
  let chartSpec: any = {}

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

    case 'geo-map':
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
        containerHeight,
        containerWidth,
      )
      break
  }

  // Stitch the remaining layers on top of layer 0. Layer 0 keeps its full
  // per-type builder -- params, brush scaffolding and all -- so every existing
  // interaction keeps working; layers 1..n are plain marks with suffixed param
  // names and no selections of their own.
  if (isLayered) {
    const extraLayers: any[] = []

    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i]
      // A layer over its own select resolves fields against its own columns
      // and carries its own data; without one it reads the shared top-level
      // dataset, which is what a controls-authored layered chart wants.
      const dataset = layerData?.[i]
      const layerColumns = dataset?.columns ?? columns
      const layerRows = dataset ? toJsonSafeRows(dataset.data) : localData

      const layerSpec = createLayerMarkSpec(
        layer,
        layerColumns,
        generateTooltipFields(layer, layerColumns),
        layerRows,
        {
          layerIndex: i,
          currentTheme,
          isMobile,
          seriesLabel: useSeriesLegend ? layerSeriesLabel(layer, layerColumns, i) : undefined,
          hideLegend: root.hideLegend,
          scaleX: root.scaleX,
          scaleY: root.scaleY,
          brushAvailable: BRUSH_DECLARING_CHART_TYPES.includes(layers[0].chartType),
        },
      )
      if (dataset) {
        layerSpec.data = { values: layerRows }
      }
      const annotation = layerSpec.__annotationLayer
      delete layerSpec.__annotationLayer
      if (annotation && dataset) {
        annotation.data = { values: layerRows }
      }
      extraLayers.push(layerSpec)
      if (annotation) extraLayers.push(annotation)
    }

    for (const placement of root.placements || []) {
      extraLayers.push(...createPlacementLayers(placement, currentTheme))
    }

    // `chartSpec` is layer 0. If its builder already produced a layer array,
    // keep it as one nested entry rather than flattening -- its sub-layers are
    // a base/brush pair that must stay grouped.
    chartSpec = { layer: [chartSpec, ...extraLayers] }
  }

  // Apply chart spec to main spec
  const hasTrellis =
    (config.trellisField || config.trellisRowField) && TRELLIS_ELIGIBLE.includes(config.chartType)
  if (hasTrellis) {
    spec.spec = { ...spec.spec, ...chartSpec }
  } else {
    spec = { ...spec, ...chartSpec }
  }

  if (isLayered) {
    const yResolve = resolveLayerYScale(root, layers, columns)
    if (yResolve === 'independent') {
      spec.resolve = { ...spec.resolve, scale: { ...spec.resolve?.scale, y: 'independent' } }
    }
  } else if (config.yField2 && !config.linkY2) {
    spec.resolve = {
      scale: {
        y: 'independent',
      },
    }
  }
  spec.background = 'transparent'
  spec.config = {
    ...spec.config,
    ...themeChartConfig,
    view: {
      ...(themeChartConfig as any).view,
      ...(spec.config?.view || {}),
      stroke: null,
    },
  }
  // `showTitle` means "show a title", not "show the title someone handed me":
  // an explicit one wins, and otherwise we derive it from the chart's own
  // fields. Without this, `set show_title` on a Trilogy chart statement did
  // nothing in the editor, which never supplies a `chartTitle`.
  if (root.showTitle || config.showTitle) {
    const resolvedTitle = title || deriveChartTitle(layers, columns)
    if (resolvedTitle) {
      spec.title = {
        text: resolvedTitle,
        anchor: 'start',
        offset: 12,
        color: currentTheme === 'dark' ? '#FFFFFF' : '#000000',
      }
    }
  }

  // Handle trellis (facet) layout if specified - must be done before compiling to Vega
  if (
    (config.trellisField || config.trellisRowField) &&
    TRELLIS_ELIGIBLE.includes(config.chartType)
  ) {
    // set width and height based on container size
    // get unique dimension values

    spec.facet = {}

    if (config.trellisField) {
      spec.facet.column = {
        field: config.trellisField,
        type: getVegaFieldType(config.trellisField, columns),
        title: snakeCaseToCapitalizedWords(
          columns.get(config.trellisField)?.description || config.trellisField,
        ),
      }
    }

    if (config.trellisRowField) {
      spec.facet.row = {
        field: config.trellisRowField,
        type: getVegaFieldType(config.trellisRowField, columns),
        title: snakeCaseToCapitalizedWords(
          columns.get(config.trellisRowField)?.description || config.trellisRowField,
        ),
      }
    }

    delete spec.width
    delete spec.height

    // Calculate dimensions based on faceting
    let uniqueColumnValues = 1
    let uniqueRowValues = 1

    if (config.trellisField) {
      uniqueColumnValues = Math.ceil(
        Array.from(new Set(data?.map((d) => d[config.trellisField!]) || [])).length,
      )
    }

    if (config.trellisRowField) {
      uniqueRowValues = Math.ceil(
        Array.from(new Set(data?.map((d) => d[config.trellisRowField!]) || [])).length,
      )
    }

    // Charts without axes need less horizontal padding since they don't have axis labels
    const horizontalPadding = NO_AXES_CHARTS.includes(config.chartType) ? 10 : 70

    spec.spec = {
      ...spec.spec,
      width: (containerWidth - uniqueColumnValues * horizontalPadding) / uniqueColumnValues - 20,
      height: (containerHeight - uniqueRowValues * 10) / uniqueRowValues - 20,
    }
  }

  // Compile point charts to Vega after faceting is applied. In a layered spec
  // this is a property of any layer being a point layer, and the compile has to
  // happen once at the top level rather than per layer.
  if (layers.some((layer) => layer.chartType === 'point')) {
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
