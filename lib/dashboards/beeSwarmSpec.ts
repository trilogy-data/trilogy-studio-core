import { type ResultColumn } from '../editors/results'
import { type ChartConfig } from '../editors/results'

const baseDataName = 'base'

const createSelectionTest = (selectedValues: { [key: string]: string | number | Array<any> }[]) => {
  if (!selectedValues || selectedValues.length === 0) {
    return 'true' // Changed from "false" to "true"
  }

  const tests = selectedValues.map((selection) => {
    const conditions = Object.entries(selection).map(([field, value]) => {
      if (Array.isArray(value)) {
        return `indexof(${JSON.stringify(value)}, datum.${field}) >= 0`
      }
      return `datum.${field} === ${JSON.stringify(value)}`
    })
    return conditions.length > 0 ? `(${conditions.join(' && ')})` : 'false'
  })

  return tests.join(' || ')
}

export const createBeeSwarmSpec = (
  config: ChartConfig,
  //@ts-ignore
  columns: Map<string, ResultColumn>,
  //@ts-ignore
  tooltipFields: any[],
  //@ts-ignore
  encoding: any,
  //@ts-ignore
  isMobile: boolean,
  selectedValues: { [key: string]: string | number | Array<any> }[],
  currentTheme: string = 'light',
  currentData: readonly Record<string, any>[],
  containerHeight: number,
  containerWidth: number,
) => {
  // Calculate scaling factor based on number of data points
  const dataCount = currentData.length
  const scalingFactor = dataCount > 100 ? Math.pow(0.25, Math.floor(Math.log10(dataCount) - 2)) : 1

  // Prepare scales array with conditional orientation based on isMobile
  const scales: any[] = [
    {
      name: isMobile ? 'yscale' : 'xscale',
      type: 'band',
      domain: {
        data: baseDataName,
        field: config.xField,
        sort: true,
      },
      range: isMobile ? 'height' : 'width',
    },
    {
      name: 'color',
      type: 'ordinal',
      domain: { data: baseDataName, field: config.colorField },
      range: { scheme: currentTheme === 'light' ? 'category20c' : 'plasma' },
    },
  ]

  // Add size scale if sizeField is provided
  if (config.sizeField) {
    // Calculate min/max from actual data
    //@ts-ignore
    const sizeValues = currentData.map((d) => d[config.sizeField]).filter((v) => v != null)
    const minSize = Math.min(...sizeValues)
    const maxSize = Math.max(...sizeValues)

    // Scale proportionally with reasonable visual bounds
    const minRadius = 3 * scalingFactor // minimum dot radius in pixels (scaled)
    const maxRadius = 20 * scalingFactor // maximum dot radius in pixels (scaled)

    const minArea = Math.max(minRadius * minRadius * Math.PI, 1)
    const maxArea = Math.max(maxRadius * maxRadius * Math.PI, 3)

    scales.push({
      name: 'size',
      type: 'linear',
      domain: [minSize, maxSize], // Use actual data min/max
      range: [minArea, maxArea],
      zero: false,
    })
  }

  // Determine size encoding and collide radius (scaled)
  const baseSize = 100 * scalingFactor * scalingFactor // Square the scaling for area
  const sizeEncoding = config.sizeField
    ? { scale: 'size', field: config.sizeField }
    : { value: baseSize }

  const baseCollideRadius = 5 * scalingFactor
  const collideRadius = config.sizeField ? { expr: 'sqrt(datum.size) / 2' } : baseCollideRadius

  // Build tooltip fields dynamically
  const tooltipFieldsList = [config.xField, config.annotationField]
  if (config.colorField) {
    tooltipFieldsList.push(config.colorField)
  }
  if (config.sizeField) {
    tooltipFieldsList.push(config.sizeField)
  }

  const tooltipSignal = tooltipFieldsList.map((field) => `'${field}': datum.${field}`).join(', ')

  const selectionTest = createSelectionTest(selectedValues)

  let spec = {
    $schema: 'https://vega.github.io/schema/vega/v6.json',
    width: containerWidth,
    height: containerHeight,
    padding: 5,
    data: [
      {
        name: baseDataName,
        values: currentData,
      },
    ],
    signals: [
      {
        name: 'highlight',
        value: {},
        on: [
          { events: '@nodes:mouseover', update: 'datum' },
          { events: '@nodes:mouseout', update: '{}' },
        ],
      },
      {
        name: 'select',
        value: selectedValues || [],
      },
    ],
    scales: scales,
    axes: [
      {
        orient: isMobile ? 'left' : 'bottom',
        scale: isMobile ? 'yscale' : 'xscale',
      },
    ],
    marks: [
      {
        name: 'nodes',
        type: 'symbol',
        from: { data: baseDataName },
        encode: {
          enter: {
            fill: { scale: 'color', field: config.colorField },
            ...(isMobile
              ? {
                  yfocus: { scale: 'yscale', field: config.xField, band: 0.5 },
                  xfocus: { value: containerWidth / 2 },
                }
              : {
                  xfocus: { scale: 'xscale', field: config.xField, band: 0.5 },
                  yfocus: { value: containerHeight / 2 },
                }),
            tooltip: { signal: `{${tooltipSignal}}` },
          },
          update: {
            size: sizeEncoding,
            fillOpacity: [
              {
                test: selectionTest,
                value: 1,
              },
              {
                value: 0.3,
              },
            ],
            stroke: { value: 'white' },
            strokeWidth: [
              {
                value: 0,
              },
            ],
            zindex: { value: 0 },
          },
          hover: {
            stroke: { value: 'blue' },
            strokeWidth: { value: 1 },
            zindex: { value: 1 },
          },
        },
        transform: [
          {
            type: 'force',
            iterations: Math.max(400 * scalingFactor, 100),
            static: true,
            forces: [
              { force: 'collide', iterations: 1, radius: collideRadius },
              ...(isMobile
                ? [
                    { force: 'y', y: 'yfocus', strength: 0.2 },
                    { force: 'x', x: 'xfocus', strength: 0.1 },
                  ]
                : [
                    { force: 'x', x: 'xfocus', strength: 0.2 },
                    { force: 'y', y: 'yfocus', strength: 0.1 },
                  ]),
            ],
          },
        ],
      },
    ],
  }
  return spec
}
