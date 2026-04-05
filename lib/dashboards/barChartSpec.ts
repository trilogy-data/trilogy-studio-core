import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import {
  getFormatHint,
  createFieldEncoding,
  createInteractionEncodings,
  getSortOrder,
  hasDiscreteTimeTrait,
} from './helpers'
import { lightDefaultColor, darkDefaultColor } from './constants'

export const createBarChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  data: readonly Row[] | null,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: 'light' | 'dark' | '' = 'light',
) => {
  // Determine the number of unique values in the x-field
  let xValueCount = 0
  if (data && config.xField) {
    // Create a Set to count unique values
    const uniqueValues = new Set()
    let lookup = config.xField
    data.forEach((row) => {
      if (row[lookup]) {
        uniqueValues.add(row[lookup])
      }
    })
    xValueCount = uniqueValues.size
  }

  // Set the label angle based on the count
  const labelAngle = xValueCount > 7 ? -45 : 0

  // For discrete time traits (year, month, week, etc.) used as x-axis, force ordinal type so
  // Vega-Lite allocates a proper band width for each bar instead of using a continuous scale.
  const xField = config.xField || ''
  const xIsDiscreteTime = hasDiscreteTimeTrait(xField, columns)
  const buildXEncoding = (angle: number) => {
    const enc: any = {
      ...createFieldEncoding(xField, columns, { axis: { labelAngle: angle } }),
      ...getSortOrder(xField, columns, config.yField),
    }
    if (xIsDiscreteTime) {
      enc.type = 'ordinal'
      delete enc.timeUnit
      delete enc.format
    }
    return enc
  }

  const barLayer = {
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
      type: 'bar',
      color: currentTheme === 'light' ? lightDefaultColor : darkDefaultColor,
    },
    encoding: {
      x: buildXEncoding(labelAngle),
      y: createFieldEncoding(config.yField || '', columns, {
        axis: { ...getFormatHint(config.yField, columns) },
      }),
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      order: { field: config.yField, sort: 'descending' },
      ...encoding,
    },
  }

  if (!config.yField2) {
    return barLayer
  }

  const secondaryLineLayer = {
    mark: {
      type: 'line',
      point: true,
      color: currentTheme === 'light' ? '#1D4ED8' : '#93C5FD',
      strokeWidth: 2,
    },
    encoding: {
      x: buildXEncoding(labelAngle),
      y: createFieldEncoding(config.yField2, columns, {
        axis: {
          ...getFormatHint(config.yField2, columns),
          orient: 'right',
        },
      }),
      tooltip: tooltipFields,
    },
  }

  return {
    layer: [barLayer, secondaryLineLayer],
  }
}
