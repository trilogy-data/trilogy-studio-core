import type { ChartConfig, chartTypes } from '../editors/results'

// Chart types enum for tool schemas
export const CHART_TYPES = [
  'line',
  'bar',
  'barh',
  'point',
  'geo-map',
  'tree',
  'area',
  'headline',
  'donut',
  'heatmap',
  'boxplot',
  'treemap',
  'beeswarm',
] as const

// Example ChartConfig for LLM reference
export const CHART_CONFIG_EXAMPLE: ChartConfig = {
  chartType: 'bar' as chartTypes,
  xField: 'category',
  yField: 'revenue',
  yField2: 'cost',
  colorField: 'region',
  sizeField: 'quantity',
  groupField: 'year',
  trellisField: 'department',
  trellisRowField: 'quarter',
  geoField: 'state_code',
  annotationField: 'notes',
  hideLegend: false,
  showTitle: true,
  scaleX: 'linear',
  scaleY: 'linear',
  linkY2: false,
}

// Field-binding properties shared by a chart and by each of its layers.
// Spelled out once and spread into both so a layer can't drift from the parent.
const chartFieldProperties = {
  chartType: {
    type: 'string',
    enum: CHART_TYPES,
    description: 'Type of chart to render',
  },
  xField: {
    type: 'string',
    description: 'Field name for x-axis. Longitude for geo-map charts if geofield not provided.',
  },
  yField: {
    type: 'string',
    description: 'Field name for y-axis. Latitude for geo-map charts if geofield not provided.',
  },
  colorField: {
    type: 'string',
    description: 'Field for color encoding (optional)',
  },
  sizeField: {
    type: 'string',
    description: 'Field for size encoding (optional)',
  },
  annotationField: {
    type: 'string',
    description: 'Field for data point annotations/labels (optional)',
  },
} as const

// One layer of a multi-layer chart. Deliberately one level deep rather than a
// self-reference: tool input schemas handle $ref unreliably, and charts only
// ever nest one level.
const chartLayerSchema = {
  type: 'object',
  description: 'One layer of a layered chart, drawn over the same result set.',
  properties: {
    ...chartFieldProperties,
    layerLabel: {
      type: 'string',
      description:
        "Name for this layer in the chart's legend (optional; defaults to the y field name)",
    },
    yAxisOrient: {
      type: 'string',
      enum: ['left', 'right'],
      description: 'Which side to draw this layer value axis on (optional)',
    },
  },
} as const

// Example layered ChartConfig for LLM reference
export const LAYERED_CHART_CONFIG_EXAMPLE: ChartConfig = {
  chartType: 'bar' as chartTypes,
  showTitle: true,
  layers: [
    { chartType: 'bar' as chartTypes, xField: 'category', yField: 'revenue' },
    { chartType: 'line' as chartTypes, xField: 'category', yField: 'avg_revenue' },
  ],
  placements: [{ kind: 'hline', value: 1000, label: 'target' }],
}

// Shared chart config schema for tool definitions
export const chartConfigSchema = {
  type: 'object',
  description: 'Chart configuration object',
  properties: {
    chartType: {
      type: 'string',
      enum: CHART_TYPES,
      description: 'Type of chart to render',
    },
    xField: {
      type: 'string',
      description: 'Field name for x-axis. Longitude for geo-map charts if geofield not provided.',
    },
    yField: {
      type: 'string',
      description: 'Field name for y-axis. Latitude for geo-map charts if geofield not provided.',
    },
    yField2: {
      type: 'string',
      description: 'Secondary y-axis field (optional)',
    },
    colorField: {
      type: 'string',
      description: 'Field for color encoding (optional)',
    },
    sizeField: {
      type: 'string',
      description: 'Field for size encoding (optional)',
    },
    groupField: {
      type: 'string',
      description: 'Field for grouping data (optional)',
    },
    trellisField: {
      type: 'string',
      description: 'Field for small multiples/faceting columns (optional)',
    },
    trellisRowField: {
      type: 'string',
      description: 'Field for small multiples/faceting rows (optional)',
    },
    geoField: {
      type: 'string',
      description: 'Field for geographic data (optional)',
    },
    annotationField: {
      type: 'string',
      description: 'Field for data point annotations/labels (optional)',
    },
    hideLegend: {
      type: 'boolean',
      description: 'Whether to hide the legend (optional)',
    },
    showTitle: {
      type: 'boolean',
      description: 'Whether to show the chart title (optional)',
    },
    scaleX: {
      type: 'string',
      enum: ['linear', 'log', 'sqrt'],
      description: 'Scale type for x-axis (optional)',
    },
    scaleY: {
      type: 'string',
      enum: ['linear', 'log', 'sqrt'],
      description: 'Scale type for y-axis (optional)',
    },
    linkY2: {
      type: 'boolean',
      description: 'Whether to link the secondary y-axis scale to the primary y-axis (optional)',
    },
    layers: {
      type: 'array',
      items: chartLayerSchema,
      description:
        'Draw several marks over one result set, e.g. bars for a total with a line for an average. ' +
        'When set, the chart type and field bindings above are ignored and each layer supplies its own; ' +
        'the settings above (title, legend, scales) still apply to the chart as a whole. ' +
        'Only line, bar, barh, area, point, boxplot, donut and heatmap can be layers. ' +
        'Cannot be combined with trellisField/trellisRowField. ' +
        'Leave unset for an ordinary single-mark chart.',
    },
    placements: {
      type: 'array',
      description: 'Constant reference lines drawn over the chart (optional)',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['hline', 'vline'] },
          value: { type: 'number', description: 'Where on the axis to draw the line' },
          label: { type: 'string', description: 'Optional text label pinned to the line' },
        },
        required: ['kind', 'value'],
      },
    },
    linkLayerY: {
      type: 'boolean',
      description:
        'Force layers to share one y-axis (true) or get independent ones (false). ' +
        'Omit to let the chart decide from the layers value formats (optional)',
    },
  },
} as const

// Formatted chart types list for descriptions
export const CHART_TYPES_LIST = CHART_TYPES.map((t) => `'${t}'`).join(', ')

// Shared chart config guidance for tool descriptions
export const chartConfigGuidance = `Chart type is auto-detected based on data shape unless you specify a chartConfig. Only provide chartConfig if the user specifically requests a chart type or configuration; otherwise let auto-detection handle it.

[Important!] Hiding fields used only for filtering/query structure from output - such as ranks - with the "--" trilogy select syntax may be useful to get the right auto-formatting. 

[Important] To get deterministic coloring, if there is a hex field available that maps to a dimension it can be pulled in to automatically be used as the relevant color when dimension is set as colorField.
You DO NOT need to specify colorField as the hexField if it is included; it will automatically be used to populate the color range for the dimension field.
You can also add a default available Trilogy import "import std.color;" at the top of a query and cast a string case statement of hex values to ::string::hex to create mappings yourself.
Do this if the user asks for specific coloring.

Example chartConfig: ${JSON.stringify(CHART_CONFIG_EXAMPLE)}

To draw more than one mark over the same results — bars for a total with a line for an average, say — set 'layers' instead of the top-level chart type and fields. Each layer names its own chartType and fields; title, legend and scale settings stay on the parent. Add 'placements' for constant reference lines.
Example layered chartConfig: ${JSON.stringify(LAYERED_CHART_CONFIG_EXAMPLE)}

Available chartTypes: ${CHART_TYPES_LIST}`

// Shared connect_data_connection tool definition
export const connectDataConnectionTool = {
  name: 'connect_data_connection',
  description:
    'Connect or reconnect a data connection that is not currently active. Use this when a query fails because the connection is not active, or when you need to establish a connection before running queries.',
  input_schema: {
    type: 'object',
    properties: {
      connection: {
        type: 'string',
        description: 'The name of the data connection to connect',
      },
    },
    required: ['connection'],
  },
} as const
