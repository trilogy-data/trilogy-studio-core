import { createFieldEncoding, createColorEncoding, createSizeEncoding } from './helpers'
import { type Row, type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { lightDefaultColor, darkDefaultColor } from './constants'

export const createPointChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
  isMobile: boolean = false,
  data: readonly Row[] = [],
) => {
  const color = currentTheme === 'light' ? lightDefaultColor : darkDefaultColor
  let baseLayer = {
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
      },
      {
        name: 'brush',
        select: {
          type: 'interval',
        },
        // value: intChart,
      },
    ],
    mark: {
      type: 'point',
      filled: config.sizeField ? true : false,
      color: color,
    },
    encoding: {
      color: createColorEncoding(
        config,
        config.colorField,
        columns,
        isMobile,
        currentTheme,
        config.hideLegend,
        data,
      ),
      size: createSizeEncoding(config.sizeField, columns, isMobile, config.hideLegend),
      tooltip: tooltipFields,
    },
  }
  let base = [baseLayer] as any[]
  if (config.annotationField && columns.get(config.annotationField)) {
    base.push({
      mark: {
        type: 'text',
        align: 'left',
        baseline: 'middle',
        dx: 5,
        fontSize: 8,
      },
      encoding: {
        text: { field: config.annotationField, type: 'nominal' },
        color: { value: currentTheme === 'light' ? '#333333' : '#dddddd' },
      },
    })
  }
  return {
    layer: base,
    encoding: {
      x: createFieldEncoding(config.xField || '', columns, {}, true, { scale: config.scaleX }),
      y: createFieldEncoding(config.yField || '', columns, {}, true, { scale: config.scaleY }),
    },
  }
}
