import { describe, it, expect } from 'vitest'
import { chartStatementToConfig, type ChartStatementSpec } from './chartStatement'
import { ColumnType, type ResultColumn, type Row } from './results'
import { generateVegaSpec } from '../dashboards/spec'
import { ChromaChartHelpers } from '../components/chartHelpers'

function spec(overrides: Partial<ChartStatementSpec> = {}): ChartStatementSpec {
  return {
    layers: [
      {
        chart_type: 'bar',
        generated_sql: 'select 1',
        x_fields: ['category'],
        y_fields: ['total_value'],
        field_labels: { total_value: 'Total Value' },
      },
    ],
    placements: [],
    hide_legend: false,
    show_title: false,
    ...overrides,
  }
}

describe('chartStatementToConfig', () => {
  it('maps a single layer onto a chart config', () => {
    const resolved = chartStatementToConfig(spec())

    expect(resolved?.config).toEqual({
      chartType: 'bar',
      xField: 'category',
      yField: 'total_value',
    })
    expect(resolved?.warnings).toEqual([])
  })

  it('translates trilogy role names to studio field names', () => {
    const resolved = chartStatementToConfig(
      spec({
        layers: [
          {
            chart_type: 'line',
            x_fields: ['order_date'],
            y_fields: ['revenue'],
            color_field: 'region',
            size_field: 'orders',
            group_field: 'channel',
            x_trellis_field: 'quarter',
            y_trellis_field: 'segment',
            annotation_field: 'note',
          },
        ],
        hide_legend: true,
        show_title: true,
        scale_x: 'linear',
        scale_y: 'log',
      }),
    )

    expect(resolved?.config).toEqual({
      chartType: 'line',
      xField: 'order_date',
      yField: 'revenue',
      colorField: 'region',
      sizeField: 'orders',
      groupField: 'channel',
      trellisField: 'quarter',
      trellisRowField: 'segment',
      annotationField: 'note',
      hideLegend: true,
      showTitle: true,
      scaleX: 'linear',
      scaleY: 'log',
    })
  })

  it('renders a layer that binds the geo role as a map', () => {
    // `geo` is a role, not a chart type, in Trilogy — binding it is the only
    // way to ask for a map, so it decides the studio chart type.
    const resolved = chartStatementToConfig(
      spec({
        layers: [{ chart_type: 'point', geo_field: 'state', color_field: 'revenue' }],
      }),
    )

    expect(resolved?.config.chartType).toBe('geo-map')
    expect(resolved?.config.geoField).toBe('state')
  })

  it('warns that only the first of several layers is rendered', () => {
    const resolved = chartStatementToConfig(
      spec({
        layers: [
          { chart_type: 'bar', x_fields: ['category'], y_fields: ['total'] },
          { chart_type: 'line', x_fields: ['category'], y_fields: ['average'] },
        ],
      }),
    )

    expect(resolved?.config.chartType).toBe('bar')
    expect(resolved?.warnings).toHaveLength(1)
    expect(resolved?.warnings[0]).toContain('line')
  })

  it('warns about reference lines it cannot draw', () => {
    const resolved = chartStatementToConfig(
      spec({ placements: [{ kind: 'hline', value: 5, label: 'target' }] }),
    )

    expect(resolved?.warnings[0]).toContain('hline')
  })

  it('falls back to a bar chart for an unrecognized chart type', () => {
    const resolved = chartStatementToConfig(
      spec({ layers: [{ chart_type: 'sunburst', x_fields: ['category'], y_fields: ['total'] }] }),
    )

    expect(resolved?.config.chartType).toBe('bar')
    expect(resolved?.warnings[0]).toContain('sunburst')
  })

  it('ignores an invalid scale rather than passing it through', () => {
    const resolved = chartStatementToConfig(spec({ scale_y: 'exponential' }))

    expect(resolved?.config.scaleY).toBeUndefined()
  })

  it('returns null when there is nothing to chart', () => {
    expect(chartStatementToConfig(null)).toBeNull()
    expect(chartStatementToConfig(undefined)).toBeNull()
    expect(chartStatementToConfig({ layers: [] })).toBeNull()
  })
})

describe('a chart statement config rendered by the studio chart pipeline', () => {
  const columns = new Map<string, ResultColumn>([
    ['category', { name: 'category', type: ColumnType.STRING }],
    ['total_value', { name: 'total_value', type: ColumnType.NUMBER }],
  ])
  const data: Row[] = [
    { category: 'a', total_value: 10 } as Row,
    { category: 'b', total_value: 20 } as Row,
  ]

  it('survives field validation and encodes the roles the author bound', () => {
    const resolved = chartStatementToConfig({
      layers: [
        {
          chart_type: 'bar',
          x_fields: ['category'],
          y_fields: ['total_value'],
        },
      ],
    })
    if (!resolved) throw new Error('expected a chart config')

    // A config the controls would reject gets thrown away and replaced by
    // defaults, which would silently ignore what the statement asked for.
    const helpers = new ChromaChartHelpers({
      onDimensionClick: () => {},
      onPointClick: () => {},
      onBackgroundClick: () => {},
      onDrilldownClick: () => {},
    })
    expect(helpers.validateConfigFields({ ...resolved.config }, columns)).toBe(true)

    const spec: any = generateVegaSpec(data, resolved.config, columns, null)
    expect(spec.encoding.x.field).toBe('category')
    expect(spec.encoding.y.field).toBe('total_value')
  })
})
