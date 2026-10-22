import { describe, expect, it } from 'vitest'
import { ColumnType, type ChartConfig, type ResultColumn, type Row } from '../editors/results'
import {
  type DefaultableChartType,
  determineDefaultConfig,
  determineEligibleChartTypes,
} from './helpers'
import { type ChartAuditRule, auditChartConfig, formatChartAuditIssues } from './chartAudit'

const column = (
  name: string,
  type: ColumnType,
  extra: Partial<ResultColumn> = {},
): [string, ResultColumn] => [name, { name, type, traits: [], ...extra }]

const generate = (
  rows: number,
  columns: Map<string, ResultColumn>,
  value: (name: string, i: number) => unknown,
): Row[] => {
  const data: Row[] = []
  for (let i = 0; i < rows; i++) {
    const row: Record<string, unknown> = {}
    for (const name of columns.keys()) row[name] = value(name, i)
    data.push(row)
  }
  return data
}

const auditDefault = (data: Row[], columns: Map<string, ResultColumn>) => {
  const config = determineDefaultConfig(data, columns) as ChartConfig
  return { config, issues: auditChartConfig(data, columns, config) }
}

describe('default chart for the TPC-H cheapest-supplier listing', () => {
  // import part; WHERE region = 'EUROPE' SELECT supplier.account_balance, supplier.name,
  // part.id, manufacturer, supplier.id, address, phone, comment, min(supply_cost) by part.id
  const columns = new Map<string, ResultColumn>([
    column('part_supplier_account_balance', ColumnType.FLOAT, {
      purpose: 'property',
      traits: ['usd'],
    }),
    column('part_supplier_name', ColumnType.STRING, { purpose: 'property' }),
    column('part_id', ColumnType.INTEGER, { purpose: 'key' }),
    column('part_manufacturer', ColumnType.STRING, { purpose: 'property' }),
    column('part_supplier_id', ColumnType.INTEGER, { purpose: 'key' }),
    column('part_supplier_address', ColumnType.STRING, { purpose: 'property' }),
    column('part_supplier_phone', ColumnType.STRING, { purpose: 'property' }),
    column('part_supplier_comment', ColumnType.STRING, { purpose: 'property' }),
    column('min_part_cost', ColumnType.FLOAT, { purpose: 'metric', traits: ['usd'] }),
  ])
  const data = generate(1196, columns, (name, i) => {
    const supplier = 7 + ((i * 13) % 90)
    switch (name) {
      case 'part_supplier_account_balance':
        return 1000 + ((supplier * 37) % 9000)
      case 'part_supplier_name':
        return `Supplier#${supplier}`
      case 'part_id':
        return i + 1
      case 'part_manufacturer':
        return `Manufacturer#${(i % 5) + 1}`
      case 'part_supplier_id':
        return supplier
      case 'min_part_cost':
        return (i * 7) % 1000
      default:
        return `${name} ${i}`
    }
  })

  it('plots the two numeric columns against each other, coloured by manufacturer', () => {
    const { config, issues } = auditDefault(data, columns)
    expect(issues).toEqual([])
    expect(config).toMatchObject({
      chartType: 'point',
      xField: 'part_supplier_account_balance',
      yField: 'min_part_cost',
      colorField: 'part_manufacturer',
    })
    expect(config.trellisField).toBeUndefined()
    expect(config.trellisRowField).toBeUndefined()
  })

  it('keeps ids and free text off the legend and facets when a bar is forced', () => {
    const config = determineDefaultConfig(data, columns, 'bar') as ChartConfig
    expect(config.xField).toBe('part_manufacturer')
    expect(config.colorField).toBe('min_part_cost')
    expect(config.trellisField).toBeUndefined()
    expect(config.trellisRowField).toBeUndefined()
    expect(auditChartConfig(data, columns, config).map((issue) => issue.rule)).toEqual([
      'detail-aggregation',
    ])
  })
})

describe('cardinality-aware defaults', () => {
  it('still draws a bar when the discrete columns account for every row', () => {
    const columns = new Map([
      column('region', ColumnType.STRING),
      column('product', ColumnType.STRING),
      column('revenue', ColumnType.FLOAT),
      column('units', ColumnType.INTEGER),
    ])
    const data = generate(32, columns, (name, i) =>
      name === 'region' ? `R${i % 4}` : name === 'product' ? `P${Math.floor(i / 4)}` : i * 3,
    )
    const { config, issues } = auditDefault(data, columns)
    expect(issues).toEqual([])
    expect(config).toMatchObject({ chartType: 'bar', xField: 'region', colorField: 'product' })
  })

  it('prefers a scatter over a bar that would fold hundreds of rows per mark', () => {
    const columns = new Map([
      column('order_id', ColumnType.INTEGER, { purpose: 'key' }),
      column('region', ColumnType.STRING),
      column('revenue', ColumnType.FLOAT),
      column('units', ColumnType.INTEGER),
    ])
    const data = generate(800, columns, (name, i) =>
      name === 'order_id' ? i : name === 'region' ? `R${i % 4}` : i * 3,
    )
    const { config, issues } = auditDefault(data, columns)
    expect(issues).toEqual([])
    expect(config).toMatchObject({ chartType: 'point', colorField: 'region' })
  })

  it('ranks by the narrowest column when nothing fits the axis and only one value exists', () => {
    const columns = new Map([
      column('customer', ColumnType.STRING),
      column('email', ColumnType.STRING),
      column('balance', ColumnType.FLOAT),
    ])
    const data = generate(300, columns, (name, i) =>
      name === 'customer' ? `C${i % 120}` : name === 'email' ? `e${i}` : i,
    )
    const { config, issues } = auditDefault(data, columns)
    expect(issues).toEqual([])
    expect(config).toMatchObject({ chartType: 'barh', yField: 'customer', xField: 'balance' })
    expect(config.colorField).toBeUndefined()
  })

  it('skips a wide column for the axis in favour of a later narrow one', () => {
    const columns = new Map([
      column('customer', ColumnType.STRING),
      column('nation', ColumnType.STRING),
      column('balance', ColumnType.FLOAT),
    ])
    const data = generate(500, columns, (name, i) =>
      name === 'customer' ? `C${i}` : name === 'nation' ? `N${i % 25}` : i,
    )
    const { config, issues } = auditDefault(data, columns)
    expect(issues).toEqual([])
    expect(config).toMatchObject({ chartType: 'barh', yField: 'nation' })
  })

  it('caps the colour legend on a line chart', () => {
    const columns = new Map([
      column('day', ColumnType.DATE),
      column('store', ColumnType.STRING),
      column('sales', ColumnType.FLOAT),
    ])
    const data = generate(400, columns, (name, i) =>
      name === 'day' ? `2024-01-${(i % 28) + 1}` : name === 'store' ? `S${i % 40}` : i,
    )
    const { config, issues } = auditDefault(data, columns)
    expect(issues).toEqual([])
    expect(config.chartType).toBe('line')
    expect(config.colorField).toBeUndefined()
  })

  it('holds a two-way trellis to the panel budget', () => {
    const columns = new Map([
      column('category', ColumnType.STRING),
      column('region', ColumnType.STRING),
      column('segment', ColumnType.STRING),
      column('tier', ColumnType.STRING),
      column('revenue', ColumnType.FLOAT),
    ])
    const data = generate(400, columns, (name, i) => {
      switch (name) {
        case 'category':
          return `C${i % 8}`
        case 'region':
          return `R${i % 4}`
        case 'segment':
          return `S${i % 10}`
        case 'tier':
          return `T${i % 5}`
        default:
          return i
      }
    })
    const config = determineDefaultConfig(data, columns, 'bar') as ChartConfig
    expect(config).toMatchObject({
      xField: 'category',
      colorField: 'region',
      trellisRowField: 'segment',
    })
    expect(config.trellisField).toBeUndefined()
    expect(auditChartConfig(data, columns, config)).toEqual([])
  })
})

describe('auditChartConfig', () => {
  const columns = new Map([
    column('id', ColumnType.INTEGER, { purpose: 'key' }),
    column('region', ColumnType.STRING),
    column('swatch', ColumnType.STRING, { traits: ['hex'] }),
    column('revenue', ColumnType.FLOAT),
    column('units', ColumnType.INTEGER),
  ])
  const data = generate(300, columns, (name, i) =>
    name === 'id' ? i : name === 'region' ? `R${i % 4}` : name === 'swatch' ? '#fff' : i,
  )
  const rules = (config: Partial<ChartConfig>): ChartAuditRule[] =>
    auditChartConfig(data, columns, config as ChartConfig).map((issue) => issue.rule)

  it('flags an id on the legend when a narrower column was available', () => {
    expect(
      rules({ chartType: 'bar', xField: 'region', yField: 'revenue', colorField: 'id' }),
    ).toEqual(['over-capacity'])
  })

  it('allows a wide required axis when nothing narrower is unbound', () => {
    expect(
      rules({ chartType: 'bar', xField: 'id', yField: 'revenue', colorField: 'region' }),
    ).toEqual([])
  })

  it('never lets a hex column be drawn', () => {
    expect(
      rules({ chartType: 'bar', xField: 'region', yField: 'revenue', colorField: 'swatch' }),
    ).toContain('never-bound')
  })

  it('flags a bar that folds rows a scatter could have kept', () => {
    expect(rules({ chartType: 'bar', xField: 'region', yField: 'revenue' })).toEqual([
      'detail-aggregation',
    ])
  })

  it('wants a numeric value axis', () => {
    expect(rules({ chartType: 'barh', yField: 'region', xField: 'id' })).toEqual(['role-type'])
  })

  it('rejects a one-row scatter and a headline over hundreds of rows', () => {
    expect(
      auditChartConfig(data.slice(0, 1), columns, {
        chartType: 'point',
        xField: 'revenue',
        yField: 'units',
      }).map((i) => i.rule),
    ).toEqual(['volume'])
    expect(rules({ chartType: 'headline', xField: 'revenue' })).toEqual(['volume'])
  })
})

interface CategoricalShape {
  name: string
  cardinality: number
  type?: ColumnType
  purpose?: string
}

const CATEGORICAL_SHAPES: CategoricalShape[] = [
  { name: 'tiny', cardinality: 3 },
  { name: 'small', cardinality: 9 },
  { name: 'mid', cardinality: 30 },
  { name: 'wide', cardinality: 200 },
  { name: 'unique', cardinality: Infinity },
  { name: 'key', cardinality: 5, type: ColumnType.INTEGER, purpose: 'key' },
]

const subsets = <T>(items: T[], maxSize: number): T[][] => {
  const out: T[][] = [[]]
  for (const item of items) {
    const next = out.filter((s) => s.length < maxSize).map((s) => [...s, item])
    out.push(...next)
  }
  return out
}

interface Shape {
  rows: number
  categorical: CategoricalShape[]
  numeric: number
  temporal: boolean
  geo: 'none' | 'state' | 'latlng'
}

const buildShape = (shape: Shape): { columns: Map<string, ResultColumn>; data: Row[] } => {
  const columns = new Map<string, ResultColumn>()
  for (const cat of shape.categorical) {
    columns.set(cat.name, {
      name: cat.name,
      type: cat.type ?? ColumnType.STRING,
      purpose: cat.purpose,
      traits: [],
    })
  }
  if (shape.temporal) columns.set('day', { name: 'day', type: ColumnType.DATE, traits: [] })
  if (shape.geo === 'state') {
    columns.set('state', { name: 'state', type: ColumnType.STRING, traits: ['location.us_state'] })
  }
  if (shape.geo === 'latlng') {
    columns.set('lat', { name: 'lat', type: ColumnType.FLOAT, traits: ['location.latitude'] })
    columns.set('lng', { name: 'lng', type: ColumnType.FLOAT, traits: ['location.longitude'] })
  }
  for (let n = 0; n < shape.numeric; n++) {
    columns.set(`metric_${n}`, { name: `metric_${n}`, type: ColumnType.FLOAT, traits: [] })
  }
  const byName = new Map(shape.categorical.map((cat) => [cat.name, cat]))
  const data = generate(shape.rows, columns, (name, i) => {
    const cat = byName.get(name)
    if (cat) {
      const bucket = Number.isFinite(cat.cardinality) ? i % cat.cardinality : i
      return cat.type === ColumnType.INTEGER ? bucket : `${name}_${bucket}`
    }
    if (name === 'day') return `2024-01-${(i % 28) + 1}`
    if (name === 'state') return `S${i % 50}`
    if (name === 'lat') return 30 + (i % 20)
    if (name === 'lng') return -120 + (i % 40)
    return ((i * 7919) % 1000) / 10
  })
  return { columns, data }
}

const describeShape = (shape: Shape): string =>
  `rows=${shape.rows} categorical=[${shape.categorical.map((c) => c.name).join(',')}] numeric=${shape.numeric} temporal=${shape.temporal} geo=${shape.geo}`

const SHAPES: Shape[] = []
for (const rows of [1, 8, 60, 400, 1500]) {
  for (const categorical of subsets(CATEGORICAL_SHAPES, 3)) {
    for (const numeric of [0, 1, 2, 3]) {
      for (const temporal of [false, true]) {
        for (const geo of ['none', 'state', 'latlng'] as const) {
          SHAPES.push({ rows, categorical, numeric, temporal, geo })
        }
      }
    }
  }
}

const FORCEABLE: DefaultableChartType[] = [
  'line',
  'bar',
  'barh',
  'point',
  'geo-map',
  'area',
  'heatmap',
  'headline',
  'donut',
]

/** Rules a user's explicit chart type is still held to; volume is their call. */
const FORCED_RULES: ChartAuditRule[] = [
  'over-capacity',
  'trellis-cells',
  'never-bound',
  'role-type',
]

describe('determineDefaultConfig across result shapes', () => {
  it(`picks an auditable default for every one of ${SHAPES.length} shapes`, () => {
    const failures: string[] = []
    for (const shape of SHAPES) {
      const { columns, data } = buildShape(shape)
      const config = determineDefaultConfig(data, columns) as ChartConfig
      if (!config.chartType) continue
      const issues = auditChartConfig(data, columns, config)
      if (issues.length > 0) {
        failures.push(
          `${describeShape(shape)} -> ${JSON.stringify(config)}\n${formatChartAuditIssues(issues)}`,
        )
      }
    }
    expect(failures.slice(0, 20)).toEqual([])
    expect(failures.length).toBe(0)
  })

  it('fills every eligible forced chart type with columns that fit their roles', () => {
    const failures: string[] = []
    for (const shape of SHAPES) {
      if (shape.rows !== 8 && shape.rows !== 400) continue
      const { columns, data } = buildShape(shape)
      const eligible = determineEligibleChartTypes(data, columns)
      for (const chartType of FORCEABLE) {
        if (!eligible.includes(chartType)) continue
        const config = determineDefaultConfig(data, columns, chartType) as ChartConfig
        const issues = auditChartConfig(data, columns, config).filter((issue) =>
          FORCED_RULES.includes(issue.rule),
        )
        if (issues.length > 0) {
          failures.push(
            `${describeShape(shape)} as ${chartType} -> ${JSON.stringify(config)}\n${formatChartAuditIssues(issues)}`,
          )
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([])
    expect(failures.length).toBe(0)
  })
})
