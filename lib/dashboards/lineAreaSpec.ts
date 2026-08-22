import { getFormatHint, createFieldEncoding, createColorEncoding } from './helpers'
import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'

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

const createInteractiveLayer = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  // Only the deleted `yField2` secondary branch merged these extra encodings;
  // the main layer builds its own. Kept positionally so the two public
  // builders' signatures stay unchanged.
  _encoding: any,
  intChart: Array<Partial<ChartConfig>> = [],
  filtered: boolean = false,
  currentTheme: string = 'light',
  isMobile: boolean = false,
) => {
  // Create the main layer for the primary y-axis
  const markColor = currentTheme === 'light' ? 'steelblue' : '#4FC3F7'
  const mainLayer = {
    ...(filtered
      ? {
          transform: [{ filter: { param: 'brush' } }, { filter: `datum.${config.yField} != null` }],
        }
      : { transform: [{ filter: `datum.${config.yField} != null` }] }),
    mark: {
      type: config.chartType === 'line' ? 'line' : 'area',
      ...(config.chartType === 'area' ? { line: filtered ? true : { color: 'darkgray' } } : {}),
      ...(filtered ? { color: markColor } : { color: 'lightgray' }),
      interpolate: 'step-after',
    },

    encoding: {
      x: createFieldEncoding(config.xField || '', columns, {
        axis: { ...getFormatHint(config.xField, columns) },
      }),
      y: createFieldEncoding(
        config.yField || '',
        columns,
        {
          axis: { ...getFormatHint(config.yField, columns) },
        },
        false,
        { scale: config.scaleY },
      ),

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
        ...{
          color: createColorEncoding(
            config,
            config.colorField,
            columns,
            isMobile,
            currentTheme,
            config.hideLegend,
            data,
          ),
        },
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

  // `yField2` no longer branches here: `normalizeChartConfig` expands it into a
  // real second layer before this builder is called, and `createLayerMarkSpec`
  // reproduces the brush-linked base/filtered pair the secondary series needs.
  // One series per builder, layered generically like every other chart type.
  return [mainLayer]
}

export const createLineChartSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  intChart: { [key: string]: string | number | Array<any> }[],
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
    layer: layers,
  }
}

/**
 * Create chart specification for area chart
 */
export const createAreaChartSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  isMobile: boolean = false,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
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
    layer: layers,
  }
}
