import { type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { getFormatHint , createFieldEncoding, createInteractionEncodings } from './helpers'
import { lightDefaultColor, darkDefaultColor } from './constants'

export const createBarHChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
) => {
  return {
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
      y: {
        ...createFieldEncoding(config.yField || '', columns),
        sort: '-x',
        axis: {
          labelExpr: isMobile
            ? "datum.label.length > 13 ? slice(datum.label, 0, 10) + '...' : datum.label"
            : 'datum.label',
        },
      },
      x: createFieldEncoding(config.xField || '', columns, {
        axis: { ...getFormatHint (config.xField, columns) },
      }),
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      ...encoding,
    },
  }
}
