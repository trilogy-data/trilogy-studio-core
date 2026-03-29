import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import {
  getFormatHint,
  createFieldEncoding,
  createInteractionEncodings,
  getSortOrder,
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
      x: {
        ...createFieldEncoding(config.xField || '', columns, { axis: { labelAngle } }),
        ...getSortOrder(config.xField || '', columns, config.yField),
      },
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
      x: {
        ...createFieldEncoding(config.xField || '', columns, { axis: { labelAngle } }),
        ...getSortOrder(config.xField || '', columns, config.yField),
      },
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
