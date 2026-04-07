import { type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import {
  getFormatHint,
  createFieldEncoding,
  createInteractionEncodings,
  getSortOrder,
  hasDiscreteTimeTrait,
} from './helpers'
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
  // For discrete time y-fields (year, month, etc.), strip temporal formatting from tooltip
  // entries so Vega-Lite doesn't interpret the raw integer as a timestamp (epoch bug).
  const yField = config.yField || ''
  if (hasDiscreteTimeTrait(yField, columns)) {
    tooltipFields = tooltipFields.map((f: any) => {
      if (f.field === yField) {
        const { timeUnit, format, ...rest } = f
        return { ...rest, type: 'ordinal' }
      }
      return f
    })
  }

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
      y: (() => {
        const yField = config.yField || ''
        const enc: any = {
          ...createFieldEncoding(yField, columns),
          ...getSortOrder(yField, columns, config.xField),
          axis: {
            labelExpr: isMobile
              ? "datum.label.length > 13 ? slice(datum.label, 0, 10) + '...' : datum.label"
              : 'datum.label',
          },
        }
        if (hasDiscreteTimeTrait(yField, columns)) {
          enc.type = 'ordinal'
          delete enc.timeUnit
          delete enc.format
        }
        return enc
      })(),
      x: createFieldEncoding(
        config.xField || '',
        columns,
        {
          axis: { ...getFormatHint(config.xField, columns) },
        },
        false,
        {
          scale: config.scaleX,
          zero: false,
        },
      ),
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      order: {
        field: config.xField,
        type: 'quantitative',
        sort: 'descending',
      },
      ...encoding,
    },
  }
}
