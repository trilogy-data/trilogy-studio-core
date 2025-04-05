import { type ChartConfig } from '../editors/results'
// Define the control interface
export interface ChartControl {
  id: string
  label: string
  field: keyof ChartConfig
  columnFilter: 'numeric' | 'categorical' | 'temporal' | 'all'
  allowEmpty: boolean
  visibleFor: string[] // Array of chart types where this control should be visible
}

export const Controls: ChartControl[] = [
  {
    id: 'group-by',
    label: 'Group By',
    field: 'groupField',
    columnFilter: 'categorical',
    allowEmpty: false,
    visibleFor: ['boxplot'],
  },
  {
    id: 'category-axis',
    label: 'Category Axis',
    field: 'yField',
    columnFilter: 'categorical',
    allowEmpty: false,
    visibleFor: ['barh'],
  },
  {
    id: 'value-axis',
    label: 'Value Axis',
    field: 'xField',
    columnFilter: 'numeric',
    allowEmpty: false,
    visibleFor: ['barh'],
  },
  {
    id: 'x-axis',
    label: 'X Axis',
    field: 'xField',
    columnFilter: 'all',
    allowEmpty: false,
    visibleFor: ['bar', 'line', 'point', 'area'],
  },
  {
    id: 'y-axis-numeric',
    label: 'Y Axis',
    field: 'yField',
    columnFilter: 'numeric',
    allowEmpty: false,
    visibleFor: ['bar', 'line', 'area'],
  },
  {
    id: 'y-axis-all',
    label: 'Y Axis',
    field: 'yField',
    columnFilter: 'all',
    allowEmpty: false,
    visibleFor: ['heatmap', 'point'],
  },
  {
    id: 'color-field',
    label: 'Value Field',
    field: 'colorField',
    columnFilter: 'numeric',
    allowEmpty: false,
    visibleFor: ['heatmap'],
  },
  {
    id: 'color-by',
    label: 'Color By (optional)',
    field: 'colorField',
    columnFilter: 'categorical',
    allowEmpty: true,
    visibleFor: ['bar', 'barh', 'line', 'point', 'area'],
  },
  {
    id: 'size',
    label: 'Size (optional)',
    field: 'sizeField',
    columnFilter: 'numeric',
    allowEmpty: true,
    visibleFor: ['point'],
  },
  {
    id: 'trellis-field',
    label: 'Split Chart By',
    field: 'trellisField',
    columnFilter: 'categorical',
    allowEmpty: true,
    visibleFor: ['line'],
  },
  {
    id: 'geo-field',
    label: 'State Field',
    field: 'geoField',
    visibleFor: ['usa-map'],
    allowEmpty: true,
    columnFilter: 'categorical',
  },
]

export const Charts = [
  {
    value: 'bar',
    label: 'Bar Chart',
    icon: 'mdi mdi-chart-bar',
  },
  {
    value: 'barh',
    label: 'Horizontal Bar',
    icon: 'mdi mdi-chart-timeline',
  },
  {
    value: 'line',
    label: 'Line Chart',
    icon: 'mdi mdi-chart-line',
  },
  {
    value: 'point',
    label: 'Scatter Plot',
    icon: 'mdi mdi-chart-scatter-plot',
  },
  {
    value: 'area',
    label: 'Area Chart',
    icon: 'mdi mdi-chart-areaspline',
  },
  {
    value: 'heatmap',
    label: 'Heatmap',
    icon: 'mdi mdi-sun-thermometer-outline',
  },
  {
    value: 'boxplot',
    label: 'Box Plot',
    icon: 'mdi mdi-chart-box',
  },
  {
    value: 'usa-map',
    label: 'USA Map',
    icon: 'mdi mdi-map',
  }
]
