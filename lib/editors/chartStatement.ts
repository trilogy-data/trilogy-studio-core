/**
 * Trilogy `chart ...` statements, translated into the studio's ChartConfig.
 *
 * A chart statement looks like
 *
 *   chart layer bar (x_axis <- category, y_axis <- sum(value) as total)
 *     set hide_legend
 *     order by total desc limit 10;
 *
 * The resolver compiles each layer to its own SELECT and hands back the role
 * bindings alongside; this module turns that into the same ChartConfig the
 * chart controls produce, so a statement-authored chart and a hand-configured
 * one render through exactly one path.
 *
 * Role names on the wire are pytrilogy's (`x_trellis`, `y_trellis`), not the
 * studio's (`trellisField`, `trellisRowField`) -- the wire format stays a
 * faithful projection of the language and the translation lives here.
 */
import type { ChartConfig, chartTypes } from './results'

export interface ChartStatementPlacement {
  kind: string
  value?: string | number | boolean | null
  label?: string | null
}

export interface ChartStatementLayer {
  chart_type: string
  generated_sql?: string | null
  parameters?: Record<string, string | number | (string | number)[]> | null
  x_fields?: string[]
  y_fields?: string[]
  color_field?: string | null
  size_field?: string | null
  group_field?: string | null
  x_trellis_field?: string | null
  y_trellis_field?: string | null
  geo_field?: string | null
  annotation_field?: string | null
  field_labels?: Record<string, string>
}

export interface ChartStatementSpec {
  layers: ChartStatementLayer[]
  placements?: ChartStatementPlacement[]
  hide_legend?: boolean
  show_title?: boolean
  scale_x?: string | null
  scale_y?: string | null
}

export interface ChartStatementResolution {
  config: ChartConfig
  /** Parts of the statement the studio can't render, in author-facing terms. */
  warnings: string[]
}

/** Trilogy's CHART_TYPE terminal. Every member is also a studio chart type,
 *  so the type name passes through untranslated. The studio's `tree`,
 *  `beeswarm` and `geo-map` have no statement spelling. */
const TRILOGY_CHART_TYPES: chartTypes[] = [
  'line',
  'bar',
  'barh',
  'point',
  'area',
  'headline',
  'donut',
  'heatmap',
  'boxplot',
  'treemap',
]

const SCALE_TYPES = ['linear', 'log', 'sqrt'] as const
type ScaleType = (typeof SCALE_TYPES)[number]

function asScale(value: string | null | undefined): ScaleType | undefined {
  return SCALE_TYPES.includes(value as ScaleType) ? (value as ScaleType) : undefined
}

/**
 * Build a ChartConfig from a resolved chart statement, or null if the spec
 * carries no layer to render.
 *
 * Only the first layer becomes the config: the studio renders one dataset per
 * chart, while a statement may layer several independent selects. Extra layers
 * are reported in `warnings` rather than dropped silently.
 */
export function chartStatementToConfig(
  spec: ChartStatementSpec | null | undefined,
): ChartStatementResolution | null {
  const layer = spec?.layers?.[0]
  if (!spec || !layer) {
    return null
  }
  const warnings: string[] = []

  if (spec.layers.length > 1) {
    const extra = spec.layers
      .slice(1)
      .map((l) => l.chart_type)
      .join(', ')
    warnings.push(
      `Only the first layer (${layer.chart_type}) is rendered; ` +
        `the studio charts a single result set, so the ${extra} layer(s) were skipped.`,
    )
  }
  if (spec.placements?.length) {
    warnings.push(
      `Reference lines (${spec.placements
        .map((p) => p.kind)
        .join(', ')}) aren't supported by studio charts yet.`,
    )
  }

  const xFields = layer.x_fields ?? []
  const yFields = layer.y_fields ?? []

  // `geo` has no chart type of its own in the language -- the role is what
  // makes a chart a map -- so a layer that binds it renders as the studio's
  // geo-map regardless of the declared layer type.
  let chartType: chartTypes
  if (layer.geo_field) {
    chartType = 'geo-map'
  } else if (TRILOGY_CHART_TYPES.includes(layer.chart_type as chartTypes)) {
    chartType = layer.chart_type as chartTypes
  } else {
    chartType = 'bar'
    warnings.push(`Unknown chart type '${layer.chart_type}'; rendering as a bar chart.`)
  }

  const config: ChartConfig = {
    chartType,
    xField: xFields[0] || undefined,
    yField: yFields[0] || undefined,
    yField2: yFields[1] || undefined,
    colorField: layer.color_field || undefined,
    sizeField: layer.size_field || undefined,
    groupField: layer.group_field || undefined,
    trellisField: layer.x_trellis_field || undefined,
    trellisRowField: layer.y_trellis_field || undefined,
    geoField: layer.geo_field || undefined,
    annotationField: layer.annotation_field || undefined,
    hideLegend: spec.hide_legend || undefined,
    showTitle: spec.show_title || undefined,
    scaleX: asScale(spec.scale_x),
    scaleY: asScale(spec.scale_y),
  }

  // Drop the undefined keys so a persisted config stays comparable with one
  // the controls produced, and so JSON round-trips don't grow null noise.
  for (const key of Object.keys(config) as (keyof ChartConfig)[]) {
    if (config[key] === undefined) {
      delete config[key]
    }
  }

  return { config, warnings }
}
