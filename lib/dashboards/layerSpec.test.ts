import { describe, it, expect } from 'vitest'
import { compile } from 'vega-lite'
import { generateVegaSpec } from './spec'
import {
  normalizeChartConfig,
  resolveLayerYScale,
  deriveChartTitle,
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

  it('leaves line charts owning their own yField2 handling', () => {
    const config: ChartConfig = {
      chartType: 'line',
      xField: 'category',
      yField: 'total',
      yField2: 'pct',
    }
    expect(normalizeChartConfig(config).layers).toHaveLength(1)
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
    expect(() => compile(spec)).not.toThrow()
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

  it('omits selection conditions on non-interactive layers', () => {
    const config = layered()
    config.layers![1].colorField = 'region'

    const spec: any = generateVegaSpec(data, config, columns, null)
    // Layer 1 declares no params, so conditioning on `select`/`highlight`
    // would reference params that do not exist in its scope.
    expect(spec.layer[1].encoding.color.condition).toBeUndefined()
    expect(() => compile(spec)).not.toThrow()
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
