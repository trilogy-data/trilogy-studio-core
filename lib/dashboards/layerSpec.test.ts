import { describe, it, expect } from 'vitest'
import { compile } from 'vega-lite'
import { parse as vegaParse } from 'vega'

/**
 * Compile all the way to a Vega dataflow.
 *
 * `compile()` alone is too weak a guard: a layer filtering on a `brush` param
 * that nothing declares compiles cleanly and only fails at `vega.parse` with
 * "Unrecognized signal name". Anything asserting that a layered spec is
 * renderable has to go this far.
 */
const parseToVega = (spec: any) => vegaParse(compile(spec).spec)
import { generateVegaSpec } from './spec'
import {
  normalizeChartConfig,
  resolveLayerYScale,
  deriveChartTitle,
  resolveLayerForDatum,
  UnlayerableChartTypeError,
} from './layerSpec'
import { ColumnType, type ChartConfig, type ResultColumn, type Row } from '../editors/results'

const columns = new Map<string, ResultColumn>([
  ['category', { name: 'category', type: ColumnType.STRING, description: 'Category' }],
  ['total', { name: 'total', type: ColumnType.NUMBER, description: 'Total' }],
  ['average', { name: 'average', type: ColumnType.NUMBER, description: 'Average' }],
  ['pct', { name: 'pct', type: ColumnType.NUMBER, description: 'Pct', traits: ['percent'] }],
  ['region', { name: 'region', type: ColumnType.STRING, description: 'Region' }],
  ['sum_charge', { name: 'sum_charge', type: ColumnType.NUMBER }],
])

const data: Row[] = [
  { category: 'a', total: 10, average: 4, pct: 0.1, region: 'east' },
  { category: 'b', total: 20, average: 6, pct: 0.4, region: 'west' },
]

const layered = (over: Partial<ChartConfig> = {}): ChartConfig => ({
  chartType: 'bar',
  layers: [
    { chartType: 'bar', xField: 'category', yField: 'total' },
    { chartType: 'line', xField: 'category', yField: 'average' },
  ],
  ...over,
})

describe('normalizeChartConfig', () => {
  it('leaves an ordinary config as a single layer', () => {
    const config: ChartConfig = { chartType: 'bar', xField: 'category', yField: 'total' }
    const { root, layers } = normalizeChartConfig(config)

    expect(layers).toHaveLength(1)
    expect(layers[0]).toBe(config)
    expect(root).toBe(config)
  })

  it('expands yField2 on a bar chart into a real second layer', () => {
    const config: ChartConfig = {
      chartType: 'bar',
      xField: 'category',
      yField: 'total',
      yField2: 'pct',
    }
    const { layers } = normalizeChartConfig(config)

    expect(layers).toHaveLength(2)
    expect(layers[0].yField2).toBeUndefined()
    expect(layers[1]).toMatchObject({
      chartType: 'line',
      xField: 'category',
      yField: 'pct',
      yAxisOrient: 'right',
    })
  })

  it('shares the axis instead of orienting right when linkY2 is set', () => {
    const { root, layers } = normalizeChartConfig({
      chartType: 'bar',
      xField: 'category',
      yField: 'total',
      yField2: 'pct',
      linkY2: true,
    })

    expect(layers[1].yAxisOrient).toBeUndefined()
    expect(root.linkLayerY).toBe(true)
  })

  it('folds yField2 on line and area too, keeping the primary type', () => {
    // Held back while layers past 0 were inert marks: a line's secondary series
    // is a brush-linked pair, which a plain mark cannot reproduce.
    for (const chartType of ['line', 'area'] as const) {
      const { layers } = normalizeChartConfig({
        chartType,
        xField: 'category',
        yField: 'total',
        yField2: 'pct',
      })
      expect(layers).toHaveLength(2)
      expect(layers[0].yField2).toBeUndefined()
      // A secondary on a line stays a line; only bar's becomes one.
      expect(layers[1].chartType).toBe(chartType)
      expect(layers[1].yField).toBe('pct')
    }
  })

  it('pushes statement-level settings down onto every layer', () => {
    const { layers } = normalizeChartConfig(layered({ hideLegend: true, scaleY: 'log' }))

    expect(layers.every((layer) => layer.hideLegend === true)).toBe(true)
    expect(layers.every((layer) => layer.scaleY === 'log')).toBe(true)
  })
})

describe('resolveLayerYScale', () => {
  it('shares the scale when the layers measure the same kind of thing', () => {
    const { root, layers } = normalizeChartConfig(layered())
    expect(resolveLayerYScale(root, layers, columns)).toBe('shared')
  })

  it('goes independent when the layers disagree on format', () => {
    const config = layered()
    config.layers![1].yField = 'pct'
    const { root, layers } = normalizeChartConfig(config)
    expect(resolveLayerYScale(root, layers, columns)).toBe('independent')
  })

  it('honours an explicit linkLayerY override', () => {
    const config = layered({ linkLayerY: true })
    config.layers![1].yField = 'pct'
    const { root, layers } = normalizeChartConfig(config)
    expect(resolveLayerYScale(root, layers, columns)).toBe('shared')
  })
})

describe('generateVegaSpec with layers', () => {
  it('emits one entry per layer', () => {
    const spec: any = generateVegaSpec(data, layered(), columns, null)

    expect(spec.layer).toHaveLength(2)
    expect(spec.layer[1].mark.type).toBe('line')
    expect(spec.layer[1].encoding.y.field).toBe('average')
  })

  it('compiles without duplicate param names when layering the same chart type', () => {
    const sameType = layered()
    sameType.layers![1].chartType = 'bar'

    const spec: any = generateVegaSpec(data, sameType, columns, null)
    // Duplicate Vega param names are a compile-time failure, not a shape
    // problem, so this has to go all the way through vega-lite.
    expect(() => parseToVega(spec)).not.toThrow()
  })

  it('gives the layers a shared series legend naming each one', () => {
    const spec: any = generateVegaSpec(data, layered(), columns, null)

    expect(spec.layer[0].encoding.color.datum).toBe('Total')
    expect(spec.layer[1].encoding.color.datum).toBe('Average')
  })

  it('does not add a series legend when a layer colours by a field', () => {
    const config = layered()
    config.layers![0].colorField = 'region'

    const spec: any = generateVegaSpec(data, config, columns, null)
    expect(spec.layer[1].encoding.color?.datum).toBeUndefined()
  })

  it('gives every layer its own selection params', () => {
    const config = layered()
    config.layers![1].colorField = 'region'

    const spec: any = generateVegaSpec(data, config, columns, null)

    // Layer 0 keeps the unsuffixed names the event listeners bind to.
    const layer0Params = spec.layer[0].params.map((p: any) => p.name)
    expect(layer0Params).toContain('highlight')
    expect(layer0Params).toContain('select')

    // Layer 1 declares its own, suffixed -- param names are global to a Vega
    // spec, so reusing layer 0's would fail to compile.
    const layer1Params = spec.layer[1].params.map((p: any) => p.name)
    expect(layer1Params).toContain('highlight_l1')
    expect(layer1Params).toContain('select_l1')

    // ...and conditions reference its own params, not layer 0's.
    const conditionParams = spec.layer[1].encoding.color.condition.map((c: any) => c.param)
    expect(conditionParams).toEqual(['highlight_l1', 'select_l1'])

    expect(() => parseToVega(spec)).not.toThrow()
  })

  it('lets every layer be highlighted independently', () => {
    const spec: any = generateVegaSpec(data, layered(), columns, null)

    // Each layer's opacity/stroke conditions point at its own params, so
    // hovering one layer does not dim or highlight the other.
    for (const [i, layerSpec] of spec.layer.entries()) {
      const suffix = i === 0 ? '' : `_l${i}`
      expect(layerSpec.encoding.fillOpacity.condition.param).toBe(`select${suffix}`)
    }
    expect(() => parseToVega(spec)).not.toThrow()
  })

  it('renders placements as labelled rule layers', () => {
    const config = layered({ placements: [{ kind: 'hline', value: 5, label: 'target' }] })
    const spec: any = generateVegaSpec(data, config, columns, null)

    const rule = spec.layer.find((l: any) => l.mark?.type === 'rule')
    const label = spec.layer.find((l: any) => l.mark?.type === 'text')
    expect(rule.encoding.y.datum).toBe(5)
    expect(label.encoding.text.value).toBe('target')
  })

  it('rejects a trellis combined with layers instead of dropping one', () => {
    expect(() =>
      generateVegaSpec(data, layered({ trellisField: 'region' }), columns, null),
    ).toThrow(/Trellis roles cannot be combined/)
  })

  it('rejects a chart type that cannot be a layer', () => {
    const config = layered()
    config.layers![1].chartType = 'headline'

    expect(() => generateVegaSpec(data, config, columns, null)).toThrow(UnlayerableChartTypeError)
  })

  it('leaves a single-layer chart as a flat spec', () => {
    const spec: any = generateVegaSpec(
      data,
      { chartType: 'bar', xField: 'category', yField: 'total' },
      columns,
      null,
    )

    expect(spec.layer).toBeUndefined()
    expect(spec.encoding.x.field).toBe('category')
  })
})

describe('chart titles', () => {
  it('derives from the value axis, humanized', () => {
    // 'total' has description 'Total'; a field with no description falls back
    // to the field name itself.
    expect(
      deriveChartTitle([{ chartType: 'bar', xField: 'category', yField: 'total' }], columns),
    ).toBe('Total')
    expect(
      deriveChartTitle([{ chartType: 'bar', xField: 'category', yField: 'sum_charge' }], columns),
    ).toBe('Sum Charge')
  })

  it('falls back to the category axis when there is no value axis', () => {
    expect(deriveChartTitle([{ chartType: 'bar', xField: 'category' }], columns)).toBe('Category')
  })

  it('takes the first layer that binds a field', () => {
    const { layers } = normalizeChartConfig(layered())
    expect(deriveChartTitle(layers, columns)).toBe('Total')
  })

  it('returns empty when nothing is bound', () => {
    expect(deriveChartTitle([{ chartType: 'headline' }], columns)).toBe('')
  })

  it('shows a derived title when showTitle is set and no title is supplied', () => {
    // This is the `set show_title` case: the editor never passes a chartTitle,
    // so before this the flag rendered nothing at all.
    const spec: any = generateVegaSpec(
      data,
      { chartType: 'bar', xField: 'category', yField: 'total', showTitle: true },
      columns,
      null,
    )
    expect(spec.title.text).toBe('Total')
  })

  it('prefers an explicitly supplied title', () => {
    const spec: any = generateVegaSpec(
      data,
      { chartType: 'bar', xField: 'category', yField: 'total', showTitle: true },
      columns,
      null,
      false,
      'Revenue by Region',
    )
    expect(spec.title.text).toBe('Revenue by Region')
  })

  it('shows no title when showTitle is unset', () => {
    const spec: any = generateVegaSpec(
      data,
      { chartType: 'bar', xField: 'category', yField: 'total' },
      columns,
      null,
    )
    expect(spec.title).toBeUndefined()
  })

  it('titles a layered chart from its first layer', () => {
    const spec: any = generateVegaSpec(data, layered({ showTitle: true }), columns, null)
    expect(spec.title.text).toBe('Total')
  })
})

describe('per-layer datasets', () => {
  const layerTwoColumns = new Map<string, ResultColumn>([
    ['category', { name: 'category', type: ColumnType.STRING, description: 'Category' }],
    ['avg_value', { name: 'avg_value', type: ColumnType.NUMBER, description: 'Avg Value' }],
  ])
  const layerTwoRows: Row[] = [
    { category: 'a', avg_value: 4 },
    { category: 'b', avg_value: 6 },
  ]

  const statementConfig = (): ChartConfig => ({
    chartType: 'bar',
    layers: [
      { chartType: 'bar', xField: 'category', yField: 'total' },
      { chartType: 'line', xField: 'category', yField: 'avg_value' },
    ],
  })

  it('attaches each layer its own data and resolves fields against its own columns', () => {
    const spec: any = generateVegaSpec(
      data,
      statementConfig(),
      columns,
      null,
      false,
      '',
      'light',
      400,
      600,
      [
        { data, columns },
        { data: layerTwoRows, columns: layerTwoColumns },
      ],
    )

    // Layer 0 inherits the top-level data; layer 1 carries its own.
    expect(spec.data.values).toHaveLength(2)
    expect(spec.layer[0].data).toBeUndefined()
    expect(spec.layer[1].data.values).toEqual(layerTwoRows)
    // `avg_value` exists only in layer 1's columns, so its title proves the
    // encoding resolved against the right column map.
    expect(spec.layer[1].encoding.y.field).toBe('avg_value')
    expect(spec.layer[1].encoding.y.title).toBe('Avg Value')
  })

  it('shares the top-level data when no per-layer datasets are supplied', () => {
    const spec: any = generateVegaSpec(data, statementConfig(), columns, null)

    expect(spec.layer[1].data).toBeUndefined()
  })
})

describe('resolveLayerForDatum', () => {
  const bindings = [
    { config: { chartType: 'bar' as const, xField: 'category', yField: 'total' }, columns },
    { config: { chartType: 'line' as const, xField: 'category', yField: 'avg_value' }, columns },
  ]

  it('attributes a datum to the layer whose fields it carries', () => {
    // Layers over independent selects have disjoint field sets, so the datum
    // identifies its own layer.
    expect(resolveLayerForDatum({ category: 'a', avg_value: 4 }, bindings)).toBe(bindings[1])
    expect(resolveLayerForDatum({ category: 'a', total: 10 }, bindings)).toBe(bindings[0])
  })

  it('prefers layer 0 when layers share a result set', () => {
    // A yField2-style chart puts every field on one row, so both layers match.
    // Layer 0 is the right answer -- they describe the same row, and it owns
    // the interaction params.
    const datum = { category: 'a', total: 10, avg_value: 4 }
    expect(resolveLayerForDatum(datum, bindings)).toBe(bindings[0])
  })

  it('falls back to layer 0 for a datum it cannot place', () => {
    expect(resolveLayerForDatum({ unrelated: 1 }, bindings)).toBe(bindings[0])
    expect(resolveLayerForDatum(null, bindings)).toBe(bindings[0])
  })
})

describe('brush-linked layers', () => {
  const withPrimary = (primary: 'bar' | 'line'): ChartConfig => ({
    chartType: primary,
    layers: [
      { chartType: primary, xField: 'category', yField: 'total' },
      { chartType: 'line', xField: 'category', yField: 'average' },
    ],
  })

  it('renders a line layer as a brush-linked pair when a brush exists', () => {
    // A line primary declares the shared `brush`, so the secondary series can
    // filter on it and gets the same grey-context/coloured-selection treatment.
    const spec: any = generateVegaSpec(data, withPrimary('line'), columns, null)
    const secondary = spec.layer[1]

    expect(secondary.layer).toHaveLength(2)
    expect(secondary.layer[0].mark.color).toBe('lightgray')
    expect(secondary.layer[1].transform).toContainEqual({ filter: { param: 'brush' } })
    expect(() => parseToVega(spec)).not.toThrow()
  })

  it('renders a plain line layer when no brush exists', () => {
    // A bar primary declares no brush. Emitting the pair anyway compiles fine
    // and then dies at vega.parse with "Unrecognized signal name: brush".
    const spec: any = generateVegaSpec(data, withPrimary('bar'), columns, null)

    expect(spec.layer[1].mark.type).toBe('line')
    expect(spec.layer[1].layer).toBeUndefined()
    expect(() => parseToVega(spec)).not.toThrow()
  })
})

describe('dual-axis line and area (folded yField2)', () => {
  // These assertions used to live on createLineChartSpec's secondary-layer
  // branch. That branch is gone: the fold happens in normalizeChartConfig and
  // the secondary series is built by createLayerMarkSpec like any other layer.
  for (const chartType of ['line', 'area'] as const) {
    it(`renders a dual-axis ${chartType} chart as two brush-linked pairs`, () => {
      const spec: any = generateVegaSpec(
        data,
        { chartType, xField: 'category', yField: 'total', yField2: 'pct' },
        columns,
        null,
      )

      expect(spec.layer).toHaveLength(2)
      // Primary and secondary are each a base/filtered pair.
      expect(spec.layer[0].layer).toHaveLength(2)
      expect(spec.layer[1].layer).toHaveLength(2)

      // The secondary declares its own hover/select params rather than reusing
      // the primary's, and filters on the primary's shared brush.
      const secondaryBase = spec.layer[1].layer[0]
      expect(secondaryBase.params.map((p: any) => p.name)).toEqual(['highlight_l1', 'select_l1'])
      expect(spec.layer[1].layer[1].transform).toContainEqual({ filter: { param: 'brush' } })

      // Differing formats (pct is a percent) put the series on its own axis.
      expect(spec.resolve.scale.y).toBe('independent')
      expect(() => parseToVega(spec)).not.toThrow()
    })
  }
})
