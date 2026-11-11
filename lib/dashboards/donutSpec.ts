import { type ResultColumn, type Row } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { createFieldEncoding, createInteractionEncodings } from './helpers'
import { chartTextColor, type ChartTheme } from './chartTheme'

/**
 * A legend `labelExpr` that appends each category's share of the total, e.g.
 * `Native  62.4%`. The shares are computed here and inlined as a lookup keyed
 * by the legend label, because a legend label expression only sees its own
 * label, never the data. Returns undefined when there is nothing to total.
 */
export const donutShareLabelExpr = (
  data: readonly Row[] | null | undefined,
  categoryField: string,
  valueField: string,
): string | undefined => {
  if (!data || !categoryField || !valueField) return undefined
  const sums = new Map<string, number>()
  let total = 0
  for (const row of data) {
    const value = Number(row?.[valueField])
    if (!Number.isFinite(value)) continue
    const key = String(row[categoryField] ?? '')
    sums.set(key, (sums.get(key) ?? 0) + value)
    total += value
  }
  if (!(total > 0)) return undefined
  const shares: Record<string, string> = {}
  for (const [key, sum] of sums) {
    shares[key] = `${((sum / total) * 100).toFixed(1)}%`
  }
  const lookup = JSON.stringify(shares)
  return `datum.label + (${lookup}[datum.label] ? '  ' + ${lookup}[datum.label] : '')`
}

export const createDonutChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
  chartTheme: ChartTheme = {},
  data: readonly Row[] | null = null,
) => {
  const labelMode = config.donutLabels ?? 'arc'
  let donutLayer: any = {
    params: [
      {
        name: 'highlight',
        select: {
          type: 'point',
          on: 'mouseover',
          clear: 'mouseout',
        },
      },
      {
        name: 'select',
        select: {
          type: 'point',
          on: 'click,touchend',
        },
        value: intChart,
        nearest: true,
      },
    ],
    mark: {
      type: 'arc',
      innerRadius: 50, // Creates the donut hole
      outerRadius: 120, // Optional: control outer radius
      // stroke: 'white', // Optional: add white border between slices
      strokeWidth: 2,
    },
    encoding: {
      theta: {
        type: 'quantitative',
        field: config.xField,
      },
      color: {
        ...createFieldEncoding(config.yField || '', columns, {
          legend: {
            title: config.yField || 'Category',
            orient: 'right',
          },
        }),
        type: 'nominal',
      },
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      order: {
        field: config.xField,
        sort: 'descending',
      },
      ...encoding,
    },
  }
  let labelLayer = {
    transform: [
      {
        window: [{ op: 'sum', field: config.xField, as: 'total' }],
      },
      {
        calculate: `datum.${config.xField} / datum.total`,
        as: 'angle_pct',
      },
      {
        filter: 'datum.angle_pct > 0.05',
      },
    ],
    mark: {
      type: 'text',
      radius: 85,
      color: chartTextColor(currentTheme, chartTheme, { light: 'black', dark: 'white' }),
      fontSize: 10,
    },
    encoding: {
      theta: {
        field: config.xField,
        type: 'quantitative',
        stack: true,
      },
      text: createFieldEncoding(config.yField || '', columns, {}, false),
      order: { field: config.xField, sort: 'descending' },
    },
  }

  if (labelMode === 'arc') {
    return {
      layer: [donutLayer, labelLayer],
    }
  }

  if (labelMode === 'legend') {
    // The caller's colour encoding replaces this builder's. When it names no
    // field (no `colorField`) the slices would be one colour with nothing for
    // a legend to list, so fall back to the category the donut is drawn by.
    if (!donutLayer.encoding.color?.field) {
      const legendHidden = donutLayer.encoding.color?.legend === null
      donutLayer.encoding.color = {
        ...createFieldEncoding(config.yField || '', columns, {}),
        type: 'nominal',
        legend: legendHidden ? null : { title: null, orient: 'right' },
      }
    }
    const color = donutLayer.encoding.color
    if (color.legend !== null) {
      const labelExpr = donutShareLabelExpr(data, color.field, config.xField || '')
      // `values` caps the legend at the first few categories; a legend standing
      // in for the labels has to list every slice. Labels now carry a share, so
      // give them room before Vega truncates.
      const { values: _values, ...legend } = color.legend || {}
      color.legend = {
        ...legend,
        labelLimit: 260,
        ...(labelExpr ? { labelExpr } : {}),
      }
    }
  }

  return {
    layer: [donutLayer],
  }
}
