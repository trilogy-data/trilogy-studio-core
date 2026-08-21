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
  /** This layer's own output columns. Each layer is an independent select over
   *  its own grain, so field types and format hints resolve against these
   *  rather than against the promoted first layer's. */
  columns?: any[]
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

/** Strip undefined keys so a persisted config stays comparable with one the
 *  controls produced, and JSON round-trips don't grow null noise. */
function compact(config: ChartConfig): ChartConfig {
  for (const key of Object.keys(config) as (keyof ChartConfig)[]) {
    if (config[key] === undefined) {
      delete config[key]
    }
  }
  return config
}

/** One `layer <type> (...)` as a standalone chart config. */
function layerToConfig(layer: ChartStatementLayer, warnings: string[]): ChartConfig {
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

  // The `as` alias is the layer's display name in the series legend; the
  // labels are keyed by the field's safe address, which is also the y field.
  const labelKey = yFields[0] || xFields[0]
  const layerLabel = labelKey ? layer.field_labels?.[labelKey] : undefined

  return compact({
    chartType,
    xField: xFields[0] || undefined,
    yField: yFields[0] || undefined,
    // A layer can only bind `y_axis` once (the grammar rejects a repeated
    // role), so a second y field can only come from a client that built this
    // spec by hand. Keep honouring it rather than dropping data.
    yField2: yFields[1] || undefined,
    colorField: layer.color_field || undefined,
    sizeField: layer.size_field || undefined,
    groupField: layer.group_field || undefined,
    trellisField: layer.x_trellis_field || undefined,
    trellisRowField: layer.y_trellis_field || undefined,
    geoField: layer.geo_field || undefined,
    annotationField: layer.annotation_field || undefined,
    layerLabel: layerLabel || undefined,
  })
}

/**
 * Build a ChartConfig from a resolved chart statement, or null if the spec
 * carries no layer to render.
 *
 * A single-layer statement produces a flat config, identical to what the chart
 * controls would build. A multi-layer statement produces a container config
 * whose `layers` are the per-layer configs and whose own fields are unset --
 * see `lib/dashboards/layerSpec.ts` for how that renders.
 */
export function chartStatementToConfig(
  spec: ChartStatementSpec | null | undefined,
): ChartStatementResolution | null {
  const first = spec?.layers?.[0]
  if (!spec || !first) {
    return null
  }
  const warnings: string[] = []

  const statementSettings: ChartConfig = compact({
    chartType: 'bar', // overwritten below for the single-layer case
    hideLegend: spec.hide_legend || undefined,
    showTitle: spec.show_title || undefined,
    scaleX: asScale(spec.scale_x),
    scaleY: asScale(spec.scale_y),
    placements: spec.placements?.length
      ? spec.placements
          .filter((p) => p.kind === 'hline' || p.kind === 'vline')
          .map((p) => ({
            kind: p.kind as 'hline' | 'vline',
            value: (p.value ?? 0) as string | number,
            label: p.label || undefined,
          }))
      : undefined,
  })

  const layerConfigs = spec.layers.map((layer) => layerToConfig(layer, warnings))

  // A single layer stays flat, reference lines or not: `normalizeChartConfig`
  // resolves a flat config to one layer and `generateVegaSpec` still takes the
  // layered path when placements are present. Keeping it flat means it stays
  // comparable with a controls-authored config and the controls panel remains
  // usable on it.
  if (layerConfigs.length === 1) {
    // `layerLabel` only means something in a layered chart's series legend;
    // leaving it on a flat config would make a statement-authored chart stop
    // comparing equal to the same chart built in the controls panel.
    const { layerLabel: _unused, ...flat } = layerConfigs[0]
    return { config: compact({ ...statementSettings, ...flat }), warnings }
  }

  return {
    config: compact({
      ...statementSettings,
      chartType: layerConfigs[0].chartType,
      layers: layerConfigs,
    }),
    warnings,
  }
}
