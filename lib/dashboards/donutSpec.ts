import { type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'
import { createFieldEncoding, createInteractionEncodings } from './helpers'

export const createDonutChartSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
) => {
  let donutLayer = {
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
        field: config.yField,
      },
      color: {
        ...createFieldEncoding(config.xField || '', columns, {
          legend: {
            title: config.xField || 'Category',
            orient: 'right',
          },
        }),
        type: 'nominal',
      },
      ...createInteractionEncodings(),
      tooltip: tooltipFields,
      order: {
        field: config.yField,
        sort: 'descending',
      },
      ...encoding,
    },
  }
  let labelLayer = {
    transform: [
      {
        window: [{ op: 'sum', field: config.yField, as: 'total' }],
      },
      {
        calculate: `datum.${config.yField} / datum.total`,
        as: 'angle_pct',
      },
      {
        filter: 'datum.angle_pct > 0.05',
      },
    ],
    mark: {
      type: 'text',
      radius: 85,
      color: currentTheme === 'light' ? 'black' : 'white',
      fontSize: 10,
    },
    encoding: {
      theta: {
        field: config.yField,
        type: 'quantitative',
        stack: true,
      },
      text: { field: config.xField, type: 'nominal' },
      order: { field: config.yField, sort: 'descending' },
    },
  }

  return {
    layer: [donutLayer, labelLayer],
  }
}
