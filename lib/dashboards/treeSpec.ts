import type { Row, ResultColumn, ChartConfig } from '../editors/results'
import { getColumnFormat } from './helpers'

export const createTreemapSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  tooltipFields: any[],
  encoding: any,
) => {
  // Ensure we have the necessary field for a treemap
  if (!config.xField) {
    console.warn('Treemap chart requires xField (category dimension) to be specified')
    return {}
  }

  // Set up default size field if none provided
  const sizeField = config.sizeField || config.yField

  // Base specification with treemap transformation
  const spec = {
    data: { values: data },
    transform: [
      // Group by the dimension field (xField)
      {
        type: 'aggregate',
        groupby: [config.xField],
        ...(sizeField
          ? {
              aggregate: [{ op: 'sum', field: sizeField, as: 'value' }],
            }
          : {}),
      },
      // Apply treemap layout
      {
        type: 'treemap',
        field: 'value',
        size: [{ signal: 'width' }, { signal: 'height' }],
        padding: 2,
        as: ['x0', 'y0', 'x1', 'y1', 'depth', 'children'],
      },
    ],
    layer: [
      // Main treemap rectangles
      {
        mark: {
          type: 'rect',
          stroke: 'white',
          strokeWidth: 1,
          cursor: 'pointer',
        },
        encoding: {
          x: { field: 'x0', type: 'quantitative', axis: null },
          x2: { field: 'x1' },
          y: { field: 'y0', type: 'quantitative', axis: null },
          y2: { field: 'y1' },
          tooltip: tooltipFields,
          fillOpacity: {
            condition: { param: 'select', value: 1 },
            value: 0.7,
          },
          strokeWidth: {
            condition: [
              {
                param: 'select',
                empty: false,
                value: 2,
              },
              {
                param: 'highlight',
                empty: false,
                value: 1,
              },
            ],
            value: 0.5,
          },
          ...encoding,
        },
      },
      // Labels for category names
      {
        mark: {
          type: 'text',
          baseline: 'middle',
          align: 'center',
          fontSize: 11,
          fontWeight: 'bold',
          lineBreak: true,
          width: { field: { group: 'width' } },
          strokeWidth: 0,
        },
        encoding: {
          x: { field: 'x0', type: 'quantitative' },
          x2: { field: 'x1' },
          y: { field: 'y0', type: 'quantitative' },
          y2: { field: 'y1' },
          text: { field: config.xField, type: 'nominal' },
          color: {
            condition: {
              test: "datum.value < datum['sum_value'] / 20",
              value: 'transparent',
            },
            value: 'white',
          },
        },
      },
    ],
  }

  // Add value labels if size field is specified
  if (sizeField) {
    spec.layer.push({
      // @ts-ignore
      mark: {
        type: 'text',
        baseline: 'middle',
        align: 'center',
        fontSize: 10,
        strokeWidth: 0,
      },
      encoding: {
        x: { field: 'x0', type: 'quantitative' },
        x2: { field: 'x1' },
        text: {
          field: 'value',
          type: 'quantitative',
          format: getColumnFormat(sizeField, columns) || ',d',
        },
        color: {
          condition: {
            test: "datum.value < datum['sum_value'] / 20 || (datum.x1 - datum.x0) < 40",
            value: 'transparent',
          },
          value: 'white',
        },
      },
    })
  }

  return spec
}

// const createTreeChartSpec = (
//     config: ChartConfig,
//     data: readonly Row[] | null,
//     columns: Map<string, ResultColumn>,
//     tooltipFields: any[],
//     encoding: any,
// ) => {
//     // Ensure we have the necessary fields for a tree
//     if (!config.xField || !config.yField) {
//         console.warn('Tree chart requires xField (ID) and yField (parentID) to be specified');
//         return {};
//     }

//     return {
//         data: { values: data },
//         transform: [
//             {
//                 // Transform the flat data into a hierarchical structure
//                 // xField = node ID, yField = parent ID
//                 type: 'stratify',
//                 key: config.xField,
//                 parentKey: config.yField
//             },
//             {
//                 // Apply the tree layout algorithm
//                 type: 'tree',
//                 method: 'tidy',
//                 size: [{ signal: 'height' }, { signal: 'width - 100' }],
//                 separation: true,
//                 as: ['y', 'x', 'depth', 'children']
//             }
//         ],
//         layer: [
//             // Draw the links/edges between nodes
//             {
//                 mark: {
//                     type: 'line',
//                     stroke: '#ccc',
//                     strokeWidth: 1
//                 },
//                 encoding: {
//                     x: { field: 'x', type: 'quantitative', axis: null },
//                     y: { field: 'y', type: 'quantitative', axis: null },
//                     detail: { field: 'path', type: 'nominal' },
//                     order: { field: 'depth', type: 'quantitative' }
//                 },
//                 transform: [
//                     // Create connections between parent and child nodes
//                     { type: 'treelinks' },
//                     {
//                         type: 'linkpath',
//                         orient: 'horizontal',
//                         shape: 'orthogonal'
//                     }
//                 ]
//             },
//             // Draw the nodes
//             {
//                 params: [
//                     {
//                         name: 'highlight',
//                         select: {
//                             type: 'point',
//                             on: 'mouseover',
//                             clear: 'mouseout',
//                         },
//                     },
//                     {
//                         name: 'select',
//                         select: {
//                             type: 'point',
//                             on: 'click,touchend',
//                         }
//                     }
//                 ],
//                 mark: {
//                     type: 'circle',
//                     fill: '#4C78A8',
//                     stroke: 'black',
//                     strokeWidth: 1,
//                     cursor: 'pointer'
//                 },
//                 encoding: {
//                     x: { field: 'x', type: 'quantitative', axis: null },
//                     y: { field: 'y', type: 'quantitative', axis: null },
//                     tooltip: tooltipFields,
//                     size: config.sizeField ? {
//                         field: config.sizeField,
//                         type: 'quantitative',
//                         scale: { range: [30, 300] },
//                         title: snakeCaseToCapitalizedWords(
//                             columns.get(config.sizeField)?.description || config.sizeField
//                         )
//                     } : { value: 100 },
//                     fillOpacity: {
//                         condition: { param: 'select', value: 1 },
//                         value: 0.3,
//                     },
//                     strokeWidth: {
//                         condition: [
//                             {
//                                 param: 'select',
//                                 empty: false,
//                                 value: 2,
//                             },
//                             {
//                                 param: 'highlight',
//                                 empty: false,
//                                 value: 1,
//                             },
//                         ],
//                         value: 0,
//                     },
//                     ...encoding,
//                 }
//             },
//             // Add labels to nodes if a colorField is specified
//             // In tree charts, colorField is repurposed as the label field
//             ...(config.colorField ? [{
//                 mark: {
//                     type: 'text',
//                     dx: 8,
//                     align: 'left',
//                     fontSize: 10
//                 },
//                 encoding: {
//                     x: { field: 'x', type: 'quantitative', axis: null },
//                     y: { field: 'y', type: 'quantitative', axis: null },
//                     text: {
//                         field: config.colorField,
//                         type: 'nominal',
//                         title: snakeCaseToCapitalizedWords(
//                             columns.get(config.colorField)?.description || config.colorField
//                         )
//                     }
//                 }
//             }] : [])
//         ],
//         config: {
//             view: { stroke: null }
//         }
//     };
// };
