// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { View, parse } from 'vega'
import { compile } from 'vega-lite'
import { generateVegaSpec } from './spec'
import { ColumnType, type ResultColumn, type ChartConfig } from '../editors/results'
import { fitFacetView } from '../components/chartSizing'

const columns = new Map<string, ResultColumn>([
  ['balance', { name: 'balance', type: ColumnType.FLOAT, description: 'Supplier Account Balance' }],
  ['cost', { name: 'cost', type: ColumnType.FLOAT, description: 'Minimum Part Cost' }],
  ['manufacturer', { name: 'manufacturer', type: ColumnType.STRING }],
  ['region', { name: 'region', type: ColumnType.STRING }],
  ['day', { name: 'day', type: ColumnType.DATE }],
])
const size = (svg: string) => ({
  width: Number(svg.match(/<svg[^>]* width="([\d.]+)"/)?.[1]),
  height: Number(svg.match(/<svg[^>]* height="([\d.]+)"/)?.[1]),
})

describe('measured facet sizing', () => {
  it.each(['point', 'bar', 'barh', 'line', 'area', 'heatmap'] as const)(
    'fits %s axes and headers across pane sizes and facet counts',
    async (chartType) => {
      for (const count of [1, 3, 5]) {
        const data = Array.from({ length: 30 }, (_, i) => ({
          balance: i * 100,
          cost: i * 7,
          manufacturer: `Manufacturer#${i % count}`,
          region: `Region${i % 2}`,
          day: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
        }))
        for (const height of count === 5 ? [450, 600] : [300, 450]) {
          const config: ChartConfig = {
            chartType,
            xField:
              chartType === 'point'
                ? 'balance'
                : ['line', 'area'].includes(chartType)
                  ? 'day'
                  : 'region',
            yField: 'cost',
            trellisRowField: 'manufacturer',
            colorField: 'region',
            trellisField: count === 3 ? 'region' : undefined,
            showTitle: true,
          }
          if (chartType === 'barh') {
            config.xField = 'cost'
            config.yField = 'region'
          }
          if (chartType === 'heatmap') {
            config.yField = 'manufacturer'
            config.colorField = 'cost'
          }
          const generated = generateVegaSpec(
            data,
            config,
            columns,
            [],
            false,
            'Supplier costs by manufacturer',
            'dark',
            height,
            700,
          )
          const spec = generated.$schema?.includes('vega-lite')
            ? compile(generated as any).spec
            : generated
          const view = new View(parse(spec as any), { renderer: 'none' }).initialize()
          try {
            await view.runAsync()
            await fitFacetView(view, spec, { width: 700, height }, async () =>
              size(await view.toSVG()),
            )
            const svg = await view.toSVG()
            expect(svg).toContain('Minimum Part Cost')
            expect(size(svg).height).toBeLessThanOrEqual(height)
            expect(size(svg).width).toBeLessThanOrEqual(700)
            expect(size(svg).height).toBeGreaterThan(0)
          } finally {
            view.finalize()
          }
        }
      }
    },
    30000,
  )
})
