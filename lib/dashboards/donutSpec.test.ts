import { describe, expect, it } from 'vitest'
import { createDonutChartSpec } from './donutSpec'
import { ColumnType, type ChartConfig, type ResultColumn } from '../editors/results'

describe('createDonutChartSpec', () => {
  it('applies shared format hints to donut text labels', () => {
    const columns = new Map<string, ResultColumn>([
      [
        'amount',
        {
          name: 'amount',
          type: ColumnType.NUMBER,
          traits: ['usd'],
        },
      ],
      [
        'segment',
        {
          name: 'segment',
          type: ColumnType.STRING,
        },
      ],
    ])

    const config: ChartConfig = {
      chartType: 'donut',
      xField: 'amount',
      yField: 'amount',
    }

    const spec = createDonutChartSpec(config, columns, [], {}, [], 'light')
    const labelLayer = spec.layer[1]

    expect(labelLayer.encoding.text.field).toBe('amount')
    expect(labelLayer.encoding.text.type).toBe('quantitative')
    expect(labelLayer.encoding.text.format).toBe('$,.2f')
  })

  it('preserves nominal donut labels for categorical fields', () => {
    const columns = new Map<string, ResultColumn>([
      [
        'amount',
        {
          name: 'amount',
          type: ColumnType.NUMBER,
        },
      ],
      [
        'segment',
        {
          name: 'segment',
          type: ColumnType.STRING,
        },
      ],
    ])

    const config: ChartConfig = {
      chartType: 'donut',
      xField: 'amount',
      yField: 'segment',
    }

    const spec = createDonutChartSpec(config, columns, [], {}, [], 'light')
    const labelLayer = spec.layer[1]

    expect(labelLayer.encoding.text.field).toBe('segment')
    expect(labelLayer.encoding.text.type).toBe('nominal')
    expect(labelLayer.encoding.text.format).toBeUndefined()
  })
})