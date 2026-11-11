import { describe, it, expect } from 'vitest'
import { compile } from 'vega-lite'
import { parse, View } from 'vega'
import { generateVegaSpec } from './spec'
import { createBarChartSpec } from './barChartSpec'
import { createBarHChartSpec } from './barHChartSpec'
import { createDonutChartSpec, donutShareLabelExpr } from './donutSpec'
import { createHeadlineSpec } from './headlineSpec'
import { createLayerMarkSpec } from './layerSpec'
import { applyAxisTitleOverrides, getCategorySortOrder } from './helpers'
import { CHART_THEME_VARIABLES, chartMarkColor } from './chartTheme'
import { lightDefaultColor, darkDefaultColor } from './constants'
import { ColumnType, type ChartConfig, type ResultColumn, type Row } from '../editors/results'

/**
 * The options an embedding host sets on a `ChartConfig` to make a chart read
 * as part of its own page: number grouping on headlines, axis titles, category
 * order, the default mark colour and where a donut names its slices.
 */

const columns = new Map<string, ResultColumn>([
  ['dbh_class_label', { name: 'dbh_class_label', type: ColumnType.STRING }],
  ['dbh_class_order', { name: 'dbh_class_order', type: ColumnType.INTEGER }],
  ['tree_count', { name: 'tree_count', type: ColumnType.INTEGER }],
  ['pct_of_total', { name: 'pct_of_total', type: ColumnType.FLOAT, traits: ['percent'] }],
  ['spend', { name: 'spend', type: ColumnType.NUMBER, traits: ['usd'] }],
] as [string, ResultColumn][])

// Deliberately in bucket order, which is neither alphabetical nor by value.
const rows: Row[] = [
  { dbh_class_label: 'Under 6"', dbh_class_order: 1, tree_count: 300, pct_of_total: 0.3 },
  { dbh_class_label: '6–12"', dbh_class_order: 2, tree_count: 400, pct_of_total: 0.4 },
  { dbh_class_label: '12–24"', dbh_class_order: 3, tree_count: 200, pct_of_total: 0.2 },
  { dbh_class_label: 'Over 36"', dbh_class_order: 5, tree_count: 20, pct_of_total: 0.02 },
  { dbh_class_label: '24–36"', dbh_class_order: 4, tree_count: 80, pct_of_total: 0.08 },
] as Row[]

const bar: ChartConfig = { chartType: 'bar', xField: 'dbh_class_label', yField: 'tree_count' }
const barh: ChartConfig = { chartType: 'barh', xField: 'tree_count', yField: 'dbh_class_label' }

/** Run a Vega-Lite spec through Vega and read a scale's resolved domain. */
const scaleDomain = async (spec: any, scale: string): Promise<any[]> => {
  const sized = { ...spec, width: 300, height: 200 }
  const view = new View(parse(compile(sized).spec), { renderer: 'none' }).initialize()
  await view.runAsync()
  const domain = view.scale(scale).domain()
  view.finalize()
  return domain
}

/** Every string Vega draws for a spec: mark text, axis and legend labels. */
const renderedText = async (spec: any): Promise<string[]> => {
  const view = new View(parse(compile(spec).spec), { renderer: 'none' }).initialize()
  await view.runAsync()
  const texts: string[] = []
  const walk = (item: any) => {
    if (item?.marktype === 'text') {
      for (const child of item.items) texts.push(String(child.text))
    }
    for (const child of item?.items ?? []) walk(child)
  }
  walk((view.scenegraph() as any).root)
  view.finalize()
  return texts
}

const build = (config: ChartConfig, theme = {}) =>
  generateVegaSpec(rows, config, columns, null, false, '', 'light', 400, 600, null, theme)

describe('headline number format', () => {
  const textEncodings = (cols: Map<string, ResultColumn>, data: Row[]) => {
    const spec = createHeadlineSpec({ chartType: 'headline' }, data, cols, 'light', false, [])
    return (spec.layer as any[])
      .filter((layer) => layer.encoding?.text?.field)
      .map((layer) => layer.encoding.text)
  }

  it('groups thousands on a plain numeric column', () => {
    const [text] = textEncodings(new Map([['tree_count', columns.get('tree_count')!]]), [
      { tree_count: 1695266 } as Row,
    ])
    expect(text.type).toBe('quantitative')
    expect(text.format).toBe(',')
  })

  it('renders the grouped value through Vega', async () => {
    const spec = createHeadlineSpec(
      { chartType: 'headline' },
      [{ tree_count: 1695266 } as Row],
      new Map([['tree_count', columns.get('tree_count')!]]),
      'light',
      false,
      [],
    )
    const texts = await renderedText({ ...spec, width: 300, height: 100 } as any)
    expect(texts).toContain('1,695,266')
    expect(texts).not.toContain('1695266')
  })

  it('leaves percent and currency columns on their own format', () => {
    const cols = new Map([
      ['pct_of_total', columns.get('pct_of_total')!],
      ['spend', columns.get('spend')!],
    ])
    const [pct, usd] = textEncodings(cols, [{ pct_of_total: 0.42, spend: 1234.5 } as Row])
    expect(pct.format).toBe('.1%')
    expect(usd.format).toBe('$,.2f')
  })

  it('does not format a text column', () => {
    const [text] = textEncodings(new Map([['dbh_class_label', columns.get('dbh_class_label')!]]), [
      { dbh_class_label: 'Under 6"' } as Row,
    ])
    expect(text.format).toBeUndefined()
  })
})

describe('axis title options', () => {
  it('echoes the column name by default', () => {
    const spec = build(bar)
    expect(spec.encoding.x.title).toBe('Dbh Class Label')
    expect(spec.encoding.y.title).toBe('Tree Count')
  })

  it('overrides each axis title', () => {
    const spec = build({ ...bar, xAxisTitle: 'Trunk diameter', yAxisTitle: 'Trees' })
    expect(spec.encoding.x.title).toBe('Trunk diameter')
    expect(spec.encoding.y.title).toBe('Trees')
    const axes = compile({ ...spec, width: 300, height: 200 }).spec.axes ?? []
    expect(axes.map((axis: any) => axis.title).filter(Boolean)).toEqual(
      expect.arrayContaining(['Trunk diameter', 'Trees']),
    )
  })

  it('hides an axis title, and hiding wins over an override', () => {
    const spec = build({
      ...barh,
      hideYAxisTitle: true,
      yAxisTitle: 'ignored',
      hideXAxisTitle: true,
    })
    expect(spec.encoding.x.title).toBeNull()
    expect(spec.encoding.y.title).toBeNull()
    const axes = compile({ ...spec, width: 300, height: 200 }).spec.axes ?? []
    expect(axes.some((axis: any) => axis.title)).toBe(false)
  })

  it('leaves the tooltip titles alone', () => {
    const spec = build({ ...bar, hideXAxisTitle: true, yAxisTitle: 'Trees' })
    expect(spec.encoding.tooltip.map((field: any) => field.title)).toEqual([
      'Dbh Class Label',
      'Tree Count',
    ])
  })

  it('reaches nested layers, as a line chart builds them', () => {
    const spec = {
      layer: [
        { encoding: { x: { field: 'a', title: 'A' }, y: { field: 'b', title: 'B' } } },
        { encoding: { x: { field: 'a', title: 'A' }, y: { value: 3 } } },
      ],
    }
    applyAxisTitleOverrides(spec, { xAxisTitle: 'Day', hideYAxisTitle: true })
    expect(spec.layer[0].encoding.x.title).toBe('Day')
    expect(spec.layer[1].encoding.x.title).toBe('Day')
    expect(spec.layer[0].encoding.y.title).toBeNull()
    // A channel that binds no field has no axis title to set.
    expect(spec.layer[1].encoding.y).toEqual({ value: 3 })
  })

  it('titles the shared x axis once when a second series is folded in', () => {
    const spec = build({
      ...bar,
      yField2: 'pct_of_total',
      xAxisTitle: 'Trunk diameter',
      yAxisTitle: 'Trees',
    })
    const [primary, secondary] = spec.layer
    expect(primary.encoding.x.title).toBe('Trunk diameter')
    expect(secondary.encoding.x.title).toBe('Trunk diameter')
    expect(primary.encoding.y.title).toBe('Trees')
    // The secondary axis measures something else and keeps its own title.
    expect(secondary.encoding.y.title).toBe('Pct Of Total')
  })
})

describe('category sort options', () => {
  it('sorts by the measure, descending, by default', async () => {
    expect(build(bar).encoding.x.sort).toEqual({
      field: 'tree_count',
      op: 'sum',
      order: 'descending',
    })
    expect(build(barh).encoding.y.sort).toEqual({
      field: 'tree_count',
      op: 'sum',
      order: 'descending',
    })
    expect(await scaleDomain(build(bar), 'x')).toEqual([
      '6–12"',
      'Under 6"',
      '12–24"',
      '24–36"',
      'Over 36"',
    ])
  })

  it("keeps the query's row order with categorySort: 'data'", async () => {
    const inRowOrder = rows.map((row) => row.dbh_class_label)
    const vertical = build({ ...bar, categorySort: 'data' })
    expect(vertical.encoding.x.sort).toBeNull()
    expect(await scaleDomain(vertical, 'x')).toEqual(inRowOrder)

    const horizontal = build({ ...barh, categorySort: 'data' })
    expect(horizontal.encoding.y.sort).toBeNull()
    expect(await scaleDomain(horizontal, 'y')).toEqual(inRowOrder)
  })

  it('sorts by a named field', async () => {
    const expected = ['Under 6"', '6–12"', '12–24"', '24–36"', 'Over 36"']
    const vertical = build({ ...bar, categorySortField: 'dbh_class_order' })
    expect(vertical.encoding.x.sort).toEqual({
      field: 'dbh_class_order',
      op: 'min',
      order: 'ascending',
    })
    expect(await scaleDomain(vertical, 'x')).toEqual(expected)

    const horizontal = build({
      ...barh,
      categorySortField: 'dbh_class_order',
      categorySortOrder: 'descending',
    })
    expect(await scaleDomain(horizontal, 'y')).toEqual([...expected].reverse())
  })

  it('prefers a named field over data order', () => {
    expect(
      getCategorySortOrder(
        { categorySort: 'data', categorySortField: 'dbh_class_order' },
        'dbh_class_label',
        columns,
        'tree_count',
      ).sort.field,
    ).toBe('dbh_class_order')
  })

  it('applies to a bar drawn as a later layer', () => {
    const layer = createLayerMarkSpec({ ...bar, categorySort: 'data' }, columns, [], rows, {
      layerIndex: 1,
      currentTheme: 'light',
      isMobile: false,
    })
    expect(layer.encoding.x.sort).toBeNull()
  })
})

describe('default mark colour', () => {
  it('reads --trilogy-chart-mark with no chrome token behind it', () => {
    expect(CHART_THEME_VARIABLES.find((entry) => entry.slot === 'mark')?.sources).toEqual([
      '--trilogy-chart-mark',
    ])
  })

  it('falls back to the per-mode default', () => {
    expect(chartMarkColor('light', {})).toBe(lightDefaultColor)
    expect(chartMarkColor('dark', undefined)).toBe(darkDefaultColor)
    expect(createBarChartSpec(bar, columns, [], {}, rows, []).mark.color).toBe(lightDefaultColor)
    expect(createBarHChartSpec(barh, columns, [], {}, false, [], 'dark').mark.color).toBe(
      darkDefaultColor,
    )
  })

  it('colours bar, barh and point marks from the theme', () => {
    const theme = { mark: '#2f6f4f' }
    expect(build(bar, theme).mark.color).toBe('#2f6f4f')
    expect(build(barh, theme).mark.color).toBe('#2f6f4f')
    const point = build({ chartType: 'point', xField: 'tree_count', yField: 'pct_of_total' }, theme)
    expect(JSON.stringify(point)).toContain('#2f6f4f')
    expect(JSON.stringify(point)).not.toContain(lightDefaultColor)
  })

  it('colours a secondary bar layer from the theme', () => {
    const layer = createLayerMarkSpec(bar, columns, [], rows, {
      layerIndex: 1,
      currentTheme: 'light',
      chartTheme: { mark: '#2f6f4f' },
      isMobile: false,
    })
    expect(layer.mark.color).toBe('#2f6f4f')
  })
})

describe('donut label options', () => {
  const donut: ChartConfig = {
    chartType: 'donut',
    xField: 'tree_count',
    yField: 'dbh_class_label',
    colorField: 'dbh_class_label',
  }

  it('draws labels on the arcs by default', () => {
    const spec = build(donut)
    expect(spec.layer).toHaveLength(2)
    expect(spec.layer[1].mark.type).toBe('text')
    expect(spec.layer[0].encoding.color.legend.labelExpr).toBeUndefined()
  })

  it("drops the arc labels with donutLabels: 'none' and leaves the legend alone", () => {
    const spec = build({ ...donut, donutLabels: 'none' })
    expect(spec.layer).toHaveLength(1)
    expect(spec.layer[0].mark.type).toBe('arc')
    expect(spec.layer[0].encoding.color.legend).toEqual(build(donut).layer[0].encoding.color.legend)
  })

  it("moves the labels into the legend, with shares, on donutLabels: 'legend'", async () => {
    const spec = build({ ...donut, donutLabels: 'legend' })
    expect(spec.layer).toHaveLength(1)
    const legend = spec.layer[0].encoding.color.legend
    expect(legend.labelExpr).toContain('40.0%')
    // Every slice is listed, not the first few.
    expect(legend.values).toBeUndefined()

    const texts = await renderedText({ ...spec, width: 300, height: 300 })
    expect(texts).toEqual(
      expect.arrayContaining([
        'Under 6"  30.0%',
        '6–12"  40.0%',
        '12–24"  20.0%',
        '24–36"  8.0%',
        'Over 36"  2.0%',
      ]),
    )
  })

  it('colours and lists by the category when no colorField is set', () => {
    const spec = build({ ...donut, colorField: undefined, donutLabels: 'legend' })
    const color = spec.layer[0].encoding.color
    expect(color.field).toBe('dbh_class_label')
    expect(color.legend.labelExpr).toContain('40.0%')
  })

  it('still honours hideLegend', () => {
    const spec = build({ ...donut, donutLabels: 'legend', hideLegend: true })
    expect(spec.layer).toHaveLength(1)
    expect(spec.layer[0].encoding.color.legend).toBeNull()
    const noColor = build({
      ...donut,
      colorField: undefined,
      donutLabels: 'legend',
      hideLegend: true,
    })
    expect(noColor.layer[0].encoding.color.legend).toBeNull()
    expect(noColor.layer[0].encoding.color.field).toBe('dbh_class_label')
  })

  it('totals repeated categories and tolerates an empty result', () => {
    expect(donutShareLabelExpr([], 'c', 'v')).toBeUndefined()
    expect(donutShareLabelExpr(null, 'c', 'v')).toBeUndefined()
    const expr = donutShareLabelExpr(
      [
        { c: 'a', v: 1 },
        { c: 'a', v: 2 },
        { c: "it's", v: 1 },
      ] as Row[],
      'c',
      'v',
    )
    expect(expr).toContain('"a":"75.0%"')
    expect(expr).toContain('"it\'s":"25.0%"')
  })

  it('keeps the builder signature callable without data', () => {
    const spec = createDonutChartSpec({ ...donut, donutLabels: 'legend' }, columns, [], {}, [])
    expect(spec.layer).toHaveLength(1)
    expect(spec.layer[0].encoding.color.legend.labelExpr).toBeUndefined()
  })
})
