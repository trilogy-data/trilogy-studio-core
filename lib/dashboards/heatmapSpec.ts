import { type ResultColumn, type Row } from '../editors/results'
import { snakeCaseToCapitalizedWords } from './formatting'
import { getFormatHint, getVegaFieldType, createFieldEncoding, createColorEncoding } from './helpers'
import { type ChartConfig } from '../editors/results'

export const createHeatmapSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  currentTheme: '' | 'light' | 'dark',
  isMobile: boolean,
  data: readonly Row[] | null,
  intChart: Array<Partial<ChartConfig>>,
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
    mark: 'rect',
    encoding: {
      x: createFieldEncoding(config.xField || '', columns),
      y: createFieldEncoding(config.yField || '', columns),
      color: createColorEncoding(
        config,
        config.colorField || '',
        columns,
        isMobile,
        currentTheme,
        config.hideLegend,
        data
      ),
      // color: {
      //   field: config.colorField,
      //   type: getVegaFieldType(config.colorField || '', columns),
      //   title: snakeCaseToCapitalizedWords(
      //     columns.get(config.colorField || '')?.description || config.colorField,
      //   ),
      //   scale: { scheme: 'viridis' },
      //   ...getFormatHint(config.colorField || '', columns),
      // },
      tooltip: tooltipFields,
    },
  }
}
