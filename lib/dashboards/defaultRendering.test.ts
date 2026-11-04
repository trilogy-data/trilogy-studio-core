// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { compile } from 'vega-lite'
import { parse, View } from 'vega'
import { ColumnType, type ChartConfig, type ResultColumn, type Row } from '../editors/results'
import { determineDefaultConfig, type DefaultableChartType } from './helpers'
import { generateVegaSpec } from './spec'

const columns = new Map<string, ResultColumn>([
  ['category', { name: 'category', type: ColumnType.STRING }],
  ['region', { name: 'region', type: ColumnType.STRING }],
  ['day', { name: 'day', type: ColumnType.DATE }],
  ['value', { name: 'value', type: ColumnType.FLOAT }],
  ['cost', { name: 'cost', type: ColumnType.FLOAT }],
])
const data: Row[] = Array.from({ length: 12 }, (_, i) => ({
  category: `C${i % 3}`,
  region: `R${i % 2}`,
  day: `2024-01-${String(i + 1).padStart(2, '0')}`,
  value: i + 1,
  cost: i * 2 + 1,
}))

async function render(data: Row[], columns: Map<string, ResultColumn>, config: ChartConfig) {
  const generated = generateVegaSpec(data, config, columns, [])
  const spec = generated.$schema?.includes('vega-lite') ? compile(generated as any).spec : generated
  const view = new View(parse(spec as any), { renderer: 'none' }).initialize()
  try {
    await view.runAsync()
    const svg = await view.toSVG()
    expect(svg).toContain('<svg')
    expect(svg).not.toMatch(/(?:NaN|Infinity)/)
    return svg
  } finally {
    view.finalize()
  }
}

describe('default configs through the real Vega runtime', () => {
  it('compiles and parses automatically selected geographic defaults', () => {
    for (const geographicColumns of [
      new Map<string, ResultColumn>([
        ['lat', { name: 'lat', type: ColumnType.FLOAT, traits: ['latitude'] }],
        ['lng', { name: 'lng', type: ColumnType.FLOAT, traits: ['longitude'] }],
      ]),
      new Map<string, ResultColumn>([
        ['state', { name: 'state', type: ColumnType.STRING, traits: ['us_state'] }],
      ]),
    ]) {
      const rows = [{ lat: 40, lng: -74, state: 'NY' }]
      const config = determineDefaultConfig(rows, geographicColumns) as ChartConfig
      expect(config.chartType).toBe('geo-map')
      const spec = generateVegaSpec(rows, config, geographicColumns, [])
      // Parse without fetching the renderer's external map/tile assets.
      expect(() => parse(compile(spec as any).spec)).not.toThrow()
    }
  })

  it.each<DefaultableChartType>([
    'bar',
    'barh',
    'line',
    'area',
    'point',
    'heatmap',
    'headline',
    'donut',
    'boxplot',
    'beeswarm',
  ])('renders %s without stale bindings from another chart', async (type) => {
    const config = determineDefaultConfig(data, columns, type) as ChartConfig
    await render(data, columns, config)
  })

  it('renders the cheapest-supplier shape as individual points', async () => {
    const columns = new Map<string, ResultColumn>([
      ['balance', { name: 'balance', type: ColumnType.FLOAT, purpose: 'property' }],
      ['supplier', { name: 'supplier', type: ColumnType.STRING }],
      ['part_id', { name: 'part_id', type: ColumnType.INTEGER, purpose: 'key' }],
      ['manufacturer', { name: 'manufacturer', type: ColumnType.STRING }],
      ['supplier_id', { name: 'supplier_id', type: ColumnType.INTEGER, purpose: 'key' }],
      ['cost', { name: 'cost', type: ColumnType.FLOAT, purpose: 'metric' }],
    ])
    const data = Array.from({ length: 120 }, (_, i) => ({
      balance: 1000 + (i % 30) * 37,
      supplier: `S${i % 30}`,
      part_id: i,
      manufacturer: `M${i % 5}`,
      supplier_id: i % 30,
      cost: (i * 7) % 1000,
    }))
    const config = determineDefaultConfig(data, columns) as ChartConfig
    expect(config).toMatchObject({
      chartType: 'point',
      xField: 'balance',
      yField: 'cost',
      colorField: 'manufacturer',
    })
    const svg = await render(data, columns, config)
    expect((svg.match(/role="graphics-symbol"/g) ?? []).length).toBeGreaterThanOrEqual(data.length)
  })
})
