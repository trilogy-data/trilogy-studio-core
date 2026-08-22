/**
 * Multi-layer chart rendering.
 *
 * A `ChartConfig` with a non-empty `layers` array is a *container*: its own
 * field bindings are ignored and it contributes only statement-level settings
 * (title, legend, scales, reference lines). Each entry in `layers` is a chart
 * config in its own right and becomes one Vega-Lite layer.
 *
 * Two rules keep this compatible with everything that came before:
 *
 *  - **Layer 0 is the interactive layer.** It keeps the unsuffixed `highlight`
 *    / `select` / `brush` param names, so `chartHelpers.setupEventListeners`,
 *    the brush filter transforms and cross-filtering all keep working without
 *    knowing layers exist. Layers 1..n get suffixed params and no selections.
 *  - **A single layer is not a layered spec.** `normalizeChartConfig` returns
 *    one layer for an ordinary config and the caller renders it exactly as it
 *    did before, so no existing chart changes shape.
 */
import { type Row, type ResultColumn, type ChartConfig } from '../editors/results'
import { isLayeredConfig } from '../editors/results'
import {
  createFieldEncoding,
  createColorEncoding,
  createSizeEncoding,
  createInteractionEncodings,
  getFormatHint,
  getSortOrder,
  hasDiscreteTimeTrait,
  layerParamSuffix,
  paramName,
} from './helpers'
import { LAYERABLE_CHART_TYPES, lightDefaultColor, darkDefaultColor } from './constants'
import { snakeCaseToCapitalizedWords } from './formatting'

/** Thrown when a config asks for a chart type that can't be a Vega-Lite layer. */
export class UnlayerableChartTypeError extends Error {
  constructor(public readonly chartType: string) {
    super(
      `Chart type '${chartType}' cannot be used as a layer. ` +
        `Layerable types: ${LAYERABLE_CHART_TYPES.join(', ')}.`,
    )
    this.name = 'UnlayerableChartTypeError'
  }
}

export interface NormalizedChartConfig {
  /** Statement-level settings: title, legend, scales, placements. */
  root: ChartConfig
  /** One entry per rendered layer. Length 1 means "not a layered chart". */
  layers: ChartConfig[]
}

/**
 * Resolve any config into a root plus its layers.
 *
 * This is also where `yField2` becomes a real second layer, rather than in
 * `migrateChartConfig`: that only runs on dashboard item data, whereas every
 * chart -- editor, dashboard, LLM-authored, statement-authored -- renders
 * through here. `yField2` therefore stays a valid *authoring* shape (the
 * controls panel and the LLM tool schema keep it) while layering is the
 * *rendering* model.
 *
 * The fold is deliberately limited to `bar`: it is the only chart type whose
 * secondary series is a plain mark. `line`/`area` build their secondary series
 * with their own brush-linked base/filtered pair, which the generic layer
 * machinery does not reproduce, so they keep owning `yField2` for now.
 */
export const normalizeChartConfig = (config: ChartConfig): NormalizedChartConfig => {
  if (isLayeredConfig(config)) {
    // Statement-level settings live on the container but every downstream
    // builder reads them off the config it is handed, so push them down. This
    // is what lets layer 0 take the ordinary single-chart code path untouched.
    const inherited = {
      hideLegend: config.hideLegend,
      showTitle: config.showTitle,
      scaleX: config.scaleX,
      scaleY: config.scaleY,
    }
    return {
      root: config,
      layers: (config.layers as ChartConfig[]).map((layer) => ({ ...inherited, ...layer })),
    }
  }

  if (config.yField2 && config.chartType === 'bar') {
    const independent = !config.linkY2
    return {
      root: { ...config, linkLayerY: !independent },
      layers: [
        { ...config, yField2: undefined },
        {
          chartType: 'line',
          xField: config.xField,
          yField: config.yField2,
          hideLegend: config.hideLegend,
          scaleY: config.scaleY,
          ...(independent ? { yAxisOrient: 'right' as const } : {}),
          layerLabel: config.yField2,
        },
      ],
    }
  }

  return { root: config, layers: [config] }
}

/**
 * Should the layers share one y scale, or get independent ones?
 *
 * The language has no setting for this, so it is inferred: layers whose value
 * axes disagree on format (currency vs percent vs plain) are measuring
 * different things and get independent scales; otherwise they share, which is
 * what makes `layer bar (total) layer line (average)` comparable. `linkLayerY`
 * on the root overrides either way.
 */
export const resolveLayerYScale = (
  root: ChartConfig,
  layers: ChartConfig[],
  columns: Map<string, ResultColumn>,
): 'shared' | 'independent' => {
  if (root.linkLayerY === true) return 'shared'
  if (root.linkLayerY === false) return 'independent'
  if (layers.some((layer) => layer.yAxisOrient === 'right')) return 'independent'

  const formats = new Set(
    layers.map((layer) => JSON.stringify(getFormatHint(layer.yField, columns) || {})),
  )
  return formats.size > 1 ? 'independent' : 'shared'
}

/** A layer paired with the columns its fields resolve against. */
export interface LayerBinding {
  config: ChartConfig
  columns: Map<string, ResultColumn>
}

/**
 * Which layer did this datum come from?
 *
 * Interaction handlers read fields off `item.datum` by name and map them to
 * concept addresses through a column map. With layers over independent selects
 * those differ per layer, so handing every click layer 0's config emits filters
 * against fields the datum does not have.
 *
 * Layers are tried in order and the first whose bound fields are all present
 * wins. That resolves both cases correctly: layers sharing one result set all
 * match, and layer 0 -- the right answer, since they describe the same row --
 * is returned; layers over separate selects only match their own datum.
 */
export const resolveLayerForDatum = (
  datum: Record<string, any> | null | undefined,
  layers: LayerBinding[],
): LayerBinding => {
  if (!datum || layers.length === 0) return layers[0]

  for (const layer of layers) {
    const bound = [layer.config.xField, layer.config.yField, layer.config.geoField].filter(
      Boolean,
    ) as string[]
    if (bound.length === 0) continue
    if (bound.every((field) => field in datum)) return layer
  }
  return layers[0]
}

/** Display name for a layer in the series legend. */
export const layerSeriesLabel = (
  layer: ChartConfig,
  columns: Map<string, ResultColumn>,
  index: number,
): string => {
  if (layer.layerLabel) return layer.layerLabel
  const field = layer.yField || layer.xField
  if (field) {
    return columns.get(field)?.description || field
  }
  return `Layer ${index + 1}`
}

/**
 * Title for a chart that asked for one but wasn't given a string.
 *
 * `showTitle` used to mean "render the title someone else handed me", which is
 * why `set show_title` on a Trilogy chart statement did nothing in the editor:
 * only dashboards pass a `chartTitle`. It now means "show a title", with an
 * explicit one winning and this standing in otherwise.
 *
 * The precedence is pytrilogy's (`AltairRenderer._statement_title`): the first
 * layer's value axis, falling back to its category axis, humanized -- so the
 * studio and `trilogy` render the same statement with the same title.
 */
export const deriveChartTitle = (
  layers: ChartConfig[],
  columns: Map<string, ResultColumn>,
): string => {
  for (const layer of layers) {
    for (const field of [layer.yField, layer.xField]) {
      if (!field) continue
      const label = layer.layerLabel || columns.get(field)?.description || field
      if (label) return snakeCaseToCapitalizedWords(label)
    }
  }
  return ''
}

const MARK_TYPE_BY_CHART: Partial<Record<ChartConfig['chartType'], string>> = {
  bar: 'bar',
  barh: 'bar',
  line: 'line',
  area: 'area',
  point: 'point',
  boxplot: 'boxplot',
  donut: 'arc',
  heatmap: 'rect',
}

const layerMark = (
  layer: ChartConfig,
  currentTheme: 'light' | 'dark' | '',
  seriesColored: boolean,
): any => {
  const type = MARK_TYPE_BY_CHART[layer.chartType]
  const mark: any = { type }

  if (layer.chartType === 'line' || layer.chartType === 'point') {
    mark.point = layer.chartType === 'line' ? true : undefined
    if (mark.point === undefined) delete mark.point
  }
  if (layer.chartType === 'line') {
    mark.strokeWidth = 2
  }
  if (layer.chartType === 'area') {
    mark.opacity = 0.7
  }
  if (layer.chartType === 'boxplot') {
    mark.extent = 'min-max'
  }

  // A series-coloured layer takes its colour from the shared colour scale; a
  // lone layer keeps the theme's default mark colour.
  if (!seriesColored && !layer.colorField) {
    mark.color = currentTheme === 'light' ? lightDefaultColor : darkDefaultColor
  }
  return mark
}

/**
 * Build one Vega-Lite unit spec for a single layer.
 *
 * This is deliberately *not* the full per-type builder: those carry brush
 * scaffolding, faceting and container chrome that belong to the top-level spec
 * and cannot be repeated per layer. A layer is a mark plus its encodings.
 */
export const createLayerMarkSpec = (
  layer: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  data: readonly Row[] | null,
  options: {
    layerIndex: number
    currentTheme: 'light' | 'dark' | ''
    isMobile: boolean
    seriesLabel?: string
    hideLegend?: boolean
    scaleX?: ChartConfig['scaleX']
    scaleY?: ChartConfig['scaleY']
    /** Current cross-filter selection, so a re-render keeps the highlight. */
    selectedValues?: Array<Record<string, any>>
  },
): any => {
  if (!LAYERABLE_CHART_TYPES.includes(layer.chartType)) {
    throw new UnlayerableChartTypeError(layer.chartType)
  }

  const { layerIndex, currentTheme, isMobile, seriesLabel } = options
  const suffix = layerParamSuffix(layerIndex)

  // `barh` swaps the axis roles: its yField is the category and xField the
  // measure, matching the language's literal x_axis/y_axis semantics.
  const isHorizontal = layer.chartType === 'barh'
  const categoryField = (isHorizontal ? layer.yField : layer.xField) || ''
  const valueField = (isHorizontal ? layer.xField : layer.yField) || ''

  const categoryIsDiscreteTime = hasDiscreteTimeTrait(categoryField, columns)
  const categoryEncoding: any = {
    ...createFieldEncoding(categoryField, columns, {}),
    ...getSortOrder(categoryField, columns, valueField),
  }
  if (categoryIsDiscreteTime) {
    categoryEncoding.type = 'ordinal'
    delete categoryEncoding.timeUnit
    delete categoryEncoding.format
  }

  const valueEncoding = createFieldEncoding(
    valueField,
    columns,
    {
      axis: {
        ...getFormatHint(valueField, columns),
        ...(layer.yAxisOrient ? { orient: layer.yAxisOrient } : {}),
      },
    },
    false,
    { scale: isHorizontal ? options.scaleX : options.scaleY },
  )

  const encoding: any = isHorizontal
    ? { y: categoryEncoding, x: valueEncoding }
    : { x: categoryEncoding, y: valueEncoding }

  // Colour: an explicit colorField wins; otherwise a constant datum per layer
  // drives a shared scale, which is what gives a layered chart a legend that
  // names its series rather than one legend per layer.
  if (layer.colorField) {
    encoding.color = createColorEncoding(
      layer,
      layer.colorField,
      columns,
      isMobile,
      currentTheme,
      options.hideLegend,
      data,
      // Every layer declares its own suffixed selection params, so each can
      // condition on its own.
      suffix,
    )
  } else if (seriesLabel) {
    encoding.color = {
      datum: seriesLabel,
      type: 'nominal',
      ...(options.hideLegend ? { legend: null } : { legend: { title: null } }),
    }
  }

  if (layer.sizeField) {
    encoding.size = createSizeEncoding(layer.sizeField, columns, isMobile, options.hideLegend)
  }

  // Each layer declares its own hover/select params under a suffix. Param names
  // are global to a Vega spec, so the suffix is what makes N layers of the same
  // chart type compile at all -- and giving every layer its own means a click
  // on any of them highlights that layer rather than layer 0.
  const params: any[] = [
    {
      name: paramName('highlight', suffix),
      select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
    },
    {
      name: paramName('select', suffix),
      select: { type: 'point', on: 'click,touchend' },
      value: options.selectedValues ?? [],
      nearest: true,
    },
  ]

  Object.assign(encoding, createInteractionEncodings(suffix))

  if (tooltipFields.length) {
    encoding.tooltip = tooltipFields
  }

  const spec: any = {
    mark: layerMark(layer, currentTheme, Boolean(seriesLabel)),
    encoding,
    params,
  }

  if (layer.annotationField && columns.get(layer.annotationField)) {
    // Annotations ride along as a sibling text mark rather than mutating this
    // layer, so the caller can splice both into the top-level layer array.
    spec.__annotationLayer = {
      mark: { type: 'text', align: 'left', baseline: 'middle', dx: 5, fontSize: 8 },
      encoding: {
        ...(isHorizontal
          ? { y: categoryEncoding, x: valueEncoding }
          : { x: categoryEncoding, y: valueEncoding }),
        text: { field: layer.annotationField, type: 'nominal' },
        color: { value: currentTheme === 'light' ? '#333333' : '#dddddd' },
      },
    }
  }

  return spec
}

/**
 * Build the rule (and optional label) marks for a `place hline|vline` entry.
 * Ported from pytrilogy's `AltairRenderer._render_placement`.
 */
export const createPlacementLayers = (
  placement: NonNullable<ChartConfig['placements']>[number],
  currentTheme: 'light' | 'dark' | '',
): any[] => {
  const isHline = placement.kind === 'hline'
  const datumKey = isHline ? 'y' : 'x'
  const otherKey = isHline ? 'x' : 'y'
  const color = currentTheme === 'light' ? '#64748b' : '#94a3b8'

  const layers: any[] = [
    {
      mark: { type: 'rule', color, strokeDash: [4, 4] },
      encoding: { [datumKey]: { datum: placement.value } },
    },
  ]

  if (placement.label) {
    layers.push({
      mark: {
        type: 'text',
        align: 'left',
        baseline: isHline ? 'bottom' : 'top',
        dx: 4,
        dy: isHline ? -4 : 0,
        fontSize: 11,
        color,
      },
      encoding: {
        [datumKey]: { datum: placement.value },
        [otherKey]: { value: 4 },
        text: { value: placement.label },
      },
    })
  }

  return layers
}
