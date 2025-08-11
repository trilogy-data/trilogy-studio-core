import { type ChartConfig } from '../editors/results'
// Define the control interface
export interface ChartControl {
  id: string
  label: string
  field: keyof ChartConfig
  columnFilter: 'numeric' | 'categorical' | 'temporal' | 'longitude' | 'latitude' | 'all'
  allowEmpty: boolean
  visibleFor: string[] // Array of chart types where this control should be visible
  filterGroup: 'axes' | 'appearance'
}

export const Controls: ChartControl[] = [
  {
    id: 'group-by',
    label: 'Group By',
    field: 'groupField',
    columnFilter: 'categorical',
    allowEmpty: false,
    visibleFor: ['boxplot'],
    filterGroup: 'axes',
  },
  {
    id: 'category-axis',
    label: 'Category Axis',
    field: 'yField',
    columnFilter: 'categorical',
    allowEmpty: false,
    visibleFor: ['barh', 'donut'],
    filterGroup: 'axes',
  },
  {
    id: 'value-axis',
    label: 'Value Axis',
    field: 'xField',
    columnFilter: 'numeric',
    allowEmpty: false,
    visibleFor: ['barh', 'donut'],
    filterGroup: 'axes',
  },
  // {
  //   id: 'value-axis',
  //   label: 'Value',
  //   field: 'xField',
  //   columnFilter: 'numeric',
  //   allowEmpty: false,
  //   visibleFor: ['headline'],
  //   filterGroup: 'axes',
  // },
  {
    id: 'x-axis',
    label: 'X Axis',
    field: 'xField',
    columnFilter: 'all',
    allowEmpty: false,
    visibleFor: ['bar', 'line', 'point', 'area', 'heatmap'],
    filterGroup: 'axes',
  },
  {
    id: 'y-axis-numeric',
    label: 'Y Axis',
    field: 'yField',
    columnFilter: 'numeric',
    allowEmpty: false,
    visibleFor: ['bar', 'line', 'area'],
    filterGroup: 'axes',
  },
  {
    id: 'y-axis-numeric-two',
    label: 'Secondary Y Axis',
    field: 'yField2',
    columnFilter: 'numeric',
    allowEmpty: true,
    visibleFor: ['line', 'area'],
    filterGroup: 'axes',
  },
  {
    id: 'y-axis-all',
    label: 'Y Axis',
    field: 'yField',
    columnFilter: 'all',
    allowEmpty: false,
    visibleFor: ['heatmap', 'point'],
    filterGroup: 'axes',
  },
  {
    id: 'color-field',
    label: 'Color Scale',
    field: 'colorField',
    columnFilter: 'all',
    allowEmpty: true,
    visibleFor: ['heatmap', 'usa-map'],
    filterGroup: 'appearance',
  },
  {
    id: 'color-by',
    label: 'Color By (optional)',
    field: 'colorField',
    columnFilter: 'all',
    allowEmpty: true,
    visibleFor: ['bar', 'barh', 'point', 'donut'],
    filterGroup: 'appearance',
  },
  {
    id: 'annotation',
    label: 'Annotation (optional)',
    field: 'annotationField',
    columnFilter: 'all',
    allowEmpty: true,
    visibleFor: ['usa-map'],
    filterGroup: 'appearance',
  },
  {
    id: 'hide-legend',
    label: 'Hide Legend',
    field: 'hideLegend',
    columnFilter: 'all',
    allowEmpty: true,
    visibleFor: ['usa-map', 'bar', 'barh', 'line', 'point', 'area'],
    filterGroup: 'appearance',
  },
  {
    id: 'show-title',
    label: 'Show Title',
    field: 'showTitle',
    columnFilter: 'all',
    allowEmpty: true,
    visibleFor: ['usa-map', 'bar', 'barh', 'line', 'point', 'area'],
    filterGroup: 'appearance',
  },
  {
    id: 'color-by',
    label: 'Color By (optional)',
    field: 'colorField',
    columnFilter: 'categorical',
    allowEmpty: true,
    visibleFor: ['line', 'area'],
    filterGroup: 'appearance',
  },
  {
    id: 'size',
    label: 'Size (optional)',
    field: 'sizeField',
    columnFilter: 'numeric',
    allowEmpty: true,
    visibleFor: ['point', 'usa-map', 'tree'],
    filterGroup: 'appearance',
  },
  {
    id: 'trellis-field',
    label: 'Split Chart By',
    field: 'trellisField',
    columnFilter: 'categorical',
    allowEmpty: true,
    visibleFor: ['line'],
    filterGroup: 'appearance',
  },
  {
    id: 'geo-field',
    label: 'Geo Field',
    field: 'geoField',
    visibleFor: ['usa-map'],
    allowEmpty: true,
    columnFilter: 'categorical',
    filterGroup: 'axes',
  },
  {
    id: 'latitude',
    label: 'Latitude',
    field: 'yField',
    visibleFor: ['usa-map'],
    allowEmpty: true,
    columnFilter: 'latitude',
    filterGroup: 'axes',
  },
  {
    id: 'longitude',
    label: 'Longtitude',
    field: 'xField',
    visibleFor: ['usa-map'],
    allowEmpty: true,
    columnFilter: 'longitude',
    filterGroup: 'axes',
  },
  {
    id: 'tree',
    label: 'Split Field',
    field: 'xField',
    visibleFor: ['tree'],
    allowEmpty: false,
    columnFilter: 'categorical',
    filterGroup: 'axes',
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
    label: 'Map',
    icon: 'mdi mdi-map',
  },
  {
    value: 'headline',
    label: 'Headline',
    icon: 'mdi mdi-numeric-1-box-outline',
  },
  {
    value: 'tree',
    label: 'Tree',
    icon: 'mdi mdi-tree',
  },
  {
    value: 'donut',
    label: 'Donut',
    icon: 'mdi mdi-chart-donut',
  },
]

export const lightDefaultColor = '#1f77b4'
export const darkDefaultColor = '#9467bd'
