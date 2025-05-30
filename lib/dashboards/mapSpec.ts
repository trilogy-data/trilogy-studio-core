import type { Row, ResultColumn, ChartConfig } from '../editors/results'
import { lookupCountry } from './countryLookup'
import { snakeCaseToCapitalizedWords } from './formatting'
import { getColumnHasTrait, getColumnFormat, isCategoricalColumn } from './helpers'
import { computeMercatorProjectionFactors } from './d3utility'

/**
 * Map of US state FIPS IDs to their two-letter abbreviations
 */
const US_STATE_MAPPINGS = [
  { id: 1, abbr: 'AL' },
  { id: 2, abbr: 'AK' },
  { id: 4, abbr: 'AZ' },
  { id: 5, abbr: 'AR' },
  { id: 6, abbr: 'CA' },
  { id: 8, abbr: 'CO' },
  { id: 9, abbr: 'CT' },
  { id: 10, abbr: 'DE' },
  { id: 11, abbr: 'DC' },
  { id: 12, abbr: 'FL' },
  { id: 13, abbr: 'GA' },
  { id: 15, abbr: 'HI' },
  { id: 16, abbr: 'ID' },
  { id: 17, abbr: 'IL' },
  { id: 18, abbr: 'IN' },
  { id: 19, abbr: 'IA' },
  { id: 20, abbr: 'KS' },
  { id: 21, abbr: 'KY' },
  { id: 22, abbr: 'LA' },
  { id: 23, abbr: 'ME' },
  { id: 24, abbr: 'MD' },
  { id: 25, abbr: 'MA' },
  { id: 26, abbr: 'MI' },
  { id: 27, abbr: 'MN' },
  { id: 28, abbr: 'MS' },
  { id: 29, abbr: 'MO' },
  { id: 30, abbr: 'MT' },
  { id: 31, abbr: 'NE' },
  { id: 32, abbr: 'NV' },
  { id: 33, abbr: 'NH' },
  { id: 34, abbr: 'NJ' },
  { id: 35, abbr: 'NM' },
  { id: 36, abbr: 'NY' },
  { id: 37, abbr: 'NC' },
  { id: 38, abbr: 'ND' },
  { id: 39, abbr: 'OH' },
  { id: 40, abbr: 'OK' },
  { id: 41, abbr: 'OR' },
  { id: 42, abbr: 'PA' },
  { id: 44, abbr: 'RI' },
  { id: 45, abbr: 'SC' },
  { id: 46, abbr: 'SD' },
  { id: 47, abbr: 'TN' },
  { id: 48, abbr: 'TX' },
  { id: 49, abbr: 'UT' },
  { id: 50, abbr: 'VT' },
  { id: 51, abbr: 'VA' },
  { id: 53, abbr: 'WA' },
  { id: 54, abbr: 'WV' },
  { id: 55, abbr: 'WI' },
  { id: 56, abbr: 'WY' },
]

const US_MAP_BASE_CONFIG = {
  url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2.2.0/data/us-10m.json',
  format: { type: 'topojson', feature: 'states' },
}

/**
 * Creates a base map layer for US visualization
 */
const createUSBaseLayer = () => ({
  data: US_MAP_BASE_CONFIG,
  mark: { type: 'geoshape', fill: '#e5e5e5', stroke: 'white' },
})

const createWorldBaseLayer = () => {
  return {
    data: {
      // https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json
      // url: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json',
      url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/world-110m.json',
      format: { type: 'topojson', feature: 'countries' },
    },
    mark: { type: 'geoshape', fill: '#e5e5e5', stroke: 'white' },
  }
}

/**
 * Creates standard tooltip configuration
 */
const createTooltipField = (field: string, type: string, columns: Map<string, ResultColumn>) => ({
  field,
  type,
  title: snakeCaseToCapitalizedWords(
    field && columns.get(field)?.description ? columns.get(field)?.description : field,
  ),
  format: getColumnFormat(field, columns),
})

/**
 * Creates standard color encoding configuration
 */
const createColorEncoding = (
  field: string,
  isMobile: boolean,
  columns: Map<string, ResultColumn>,
) => {
  let full = columns.get(field)
  if (!full) {
    throw new Error(`Column ${field} not found in provided columns map`)
  }
  let colorConfig = {
    field,
    type: 'quantitative',
    title: snakeCaseToCapitalizedWords(field),
    scale: { scheme: 'viridis' },
  }
  if (isCategoricalColumn(full)) {
    return {
      field,
      type: 'nominal',
      title: snakeCaseToCapitalizedWords(field),
      scale: { scheme: 'category20' },
    }
  }

  if (isMobile) {
    return {
      ...colorConfig,
      legend: {
        orient: 'bottom',
        direction: 'horizontal',
      },
    }
  }

  return colorConfig
}

/**
 * Creates common interaction parameters
 */
const createInteractionParams = (intChart: Array<Partial<ChartConfig>>) => [
  {
    name: 'highlight',
    select: {
      type: 'point',
      on: 'pointerover',
      clear: 'mouseout',
    },
  },
  {
    name: 'select',
    select: 'point',
    value: intChart,
  },
]

/**
 * Determines if more than 80% of data rows are within the US bounding box
 */
function isDataMostlyInUS<T>(rows: T[], latField: keyof T, longField: keyof T): boolean {
  const US_BOUNDS = {
    top: 49.3457868, // north lat
    left: -124.7844079, // west long
    right: -66.9513812, // east long
    bottom: 24.7433195, // south lat
  }

  let insideCount = 0

  for (const row of rows) {
    const lat = Number(row[latField])
    const lng = Number(row[longField])

    if (
      US_BOUNDS.bottom <= lat &&
      lat <= US_BOUNDS.top &&
      US_BOUNDS.left <= lng &&
      lng <= US_BOUNDS.right
    ) {
      insideCount++
    }
  }

  return (insideCount / rows.length) * 100 > 80
}

/**
 * Creates a US scatter plot map specification
 */
const createUSScatterMapSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
) => {
  const tooltipFields = []

  if (config.xField) {
    tooltipFields.push(createTooltipField(config.xField, 'quantitative', columns))
  }

  if (config.yField) {
    tooltipFields.push(createTooltipField(config.yField, 'quantitative', columns))
  }

  if (config.sizeField) {
    tooltipFields.push(createTooltipField(config.sizeField, 'quantitative', columns))
  }

  return {
    projection: {
      type: 'albersUsa',
    },

    layer: [
      createUSBaseLayer(),
      {
        mark: { type: 'circle', tooltip: true },
        params: createInteractionParams(intChart),
        encoding: {
          longitude: { field: config.xField, type: 'quantitative' },
          latitude: { field: config.yField, type: 'quantitative' },
          size: config.sizeField
            ? {
                field: config.sizeField,
                type: 'quantitative',
                title: snakeCaseToCapitalizedWords(config.sizeField),
                scale: { type: 'quantize', nice: true },
              }
            : undefined,
          color: config.colorField
            ? createColorEncoding(config.colorField, isMobile, columns)
            : { value: 'steelblue' },
          tooltip: tooltipFields,
        },
      },
    ],
  }
}

const createWorldScatterMapSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
  data: readonly Row[],
) => {
  const tooltipFields = []

  if (config.xField) {
    tooltipFields.push(createTooltipField(config.xField, 'quantitative', columns))
  }

  if (config.yField) {
    tooltipFields.push(createTooltipField(config.yField, 'quantitative', columns))
  }

  if (config.sizeField) {
    tooltipFields.push(createTooltipField(config.sizeField, 'quantitative', columns))
  }

  const { scaleFactor } = computeMercatorProjectionFactors(data, config.xField, config.yField)
  if (!(config.xField && config.yField)) {
    throw new Error('Both xField and yField must be provided for scatter map')
  }
  let lons: number[] = []
  let lats: number[] = []
  if (config.xField) {
    // @ts-ignore
    lons = data.map((d) => d[config.xField])
  }
  if (config.yField) {
    // @ts-ignore
    lats = data.map((d) => d[config.yField])
  }
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2

  return {
    projection: {
      type: 'mercator',
      scale: { expr: `min(width, height) * ${scaleFactor}` },
      // translate: { "expr": `[width * ${translateXFactor}, height * ${translateYFactor}]` },
      center: [centerLon, centerLat], // This is crucial for proper centering
    },

    layer: [
      createWorldBaseLayer(),
      {
        mark: { type: 'circle', tooltip: true },
        params: createInteractionParams(intChart),
        encoding: {
          longitude: { field: config.xField, type: 'quantitative' },
          latitude: { field: config.yField, type: 'quantitative' },
          size: config.sizeField
            ? {
                field: config.sizeField,
                type: 'quantitative',
                title: snakeCaseToCapitalizedWords(config.sizeField),
                scale: { type: 'quantize', nice: true },
              }
            : undefined,
          color: config.colorField
            ? createColorEncoding(config.colorField, isMobile, columns)
            : { value: 'steelblue' },
          tooltip: tooltipFields,
        },
      },
    ],
  }
}

/**
 * Creates a US choropleth map specification
 */
const createUSChoroplethMapSpec = (
  config: ChartConfig,
  data: readonly Row[] | null,
  columns: Map<string, ResultColumn>,
  intChart: Array<Partial<ChartConfig>>,
) => {
  const dataFields = [config.colorField, config.sizeField, config.geoField].filter(Boolean)

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 'container',
    height: 'container',
    projection: { type: 'albersUsa' },
    layer: [
      createUSBaseLayer(),
      {
        data: US_MAP_BASE_CONFIG,
        mark: { type: 'geoshape' },
        params: createInteractionParams(intChart),
        encoding: {
          color: {
            field: config.colorField,

            type: 'quantitative',
            scale: { type: 'quantize', nice: true, zero: true },
            legend: {
              title: snakeCaseToCapitalizedWords(config.colorField),
              format: getColumnFormat(config.colorField, columns),
              orient: 'right',
              anchor: 'middle',
            },
          },
          opacity: { condition: { param: 'select', value: 1 }, value: 0.3 },
          stroke: {
            condition: { param: 'highlight', empty: false, value: 'black' },
            value: null,
          },
          strokeWidth: {
            condition: { param: 'highlight', empty: false, value: 2 },
            value: 0.5,
          },
          tooltip: [
            { field: config.geoField, title: snakeCaseToCapitalizedWords(config.geoField) },
            createTooltipField(config.colorField || '', 'quantitative', columns),
          ],
        },
        transform: [
          {
            lookup: 'id',
            from: {
              data: { values: US_STATE_MAPPINGS },
              key: 'id',
              fields: ['abbr'],
            },
          },
          {
            lookup: 'abbr',
            from: {
              data: { values: data },
              key: config.geoField,
              fields: dataFields,
            },
          },
        ],
      },
    ],
  }
}

/**
 * Main function to create USA map specification
 */
export const createMapSpec = (
  config: ChartConfig,
  data: readonly Row[],
  columns: Map<string, ResultColumn>,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
) => {
  // Handle scatter plot case
  if (config.xField && config.yField) {
    //@ts-ignore
    if (isDataMostlyInUS(data, config.yField, config.xField)) {
      return createUSScatterMapSpec(config, columns, isMobile, intChart)
    }
    return createWorldScatterMapSpec(config, columns, isMobile, intChart, data)
  }

  // Handle choropleth case
  if (config.geoField && getColumnHasTrait(config.geoField, columns, 'us_state_short')) {
    return createUSChoroplethMapSpec(config, data, columns, intChart)
  }

  // Handle country map case
  if (config.geoField && getColumnHasTrait(config.geoField, columns, 'country')) {
    let lookupField: string = config.geoField
    //@ts-ignore
    const idLookup = (row) => {
      const lookup = lookupCountry(row[lookupField], 'name')
      if (lookup) {
        return Number(lookup['country-code'])
      } else {
        return null
      }
    }

    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 'container',
      layer: [
        {
          data: {
            url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/world-110m.json',
            format: { type: 'topojson', feature: 'countries' },
          },
          transform: [
            {
              filter: 'datum.id !== 10', // Filter out Antarctica (country code 10)
            },
          ],
          mark: { type: 'geoshape', fill: '#e0e0e0', stroke: '#bbb', strokeWidth: 0.5 },
          projection: { type: 'mercator' },
        },
        {
          data: {
            url: 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data/world-110m.json',
            format: { type: 'topojson', feature: 'countries' },
          },
          transform: [
            {
              lookup: 'id',
              from: {
                data: {
                  values: data?.map((row) => {
                    return {
                      id: idLookup(row),
                      ...row,
                    }
                  }),
                },
                key: 'id',
                fields: [config.colorField, config.sizeField, config.geoField].filter((x) => x),
              },
            },
          ],
          params: [
            {
              name: 'highlight',
              select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
            },
            {
              name: 'select',
              select: 'point',
              value: intChart,
            },
          ],
          mark: { type: 'geoshape' },
          projection: { type: 'mercator' },
          encoding: {
            color: {
              field: config.colorField,
              type: 'quantitative',
              scale: { type: 'quantize', nice: true },
              legend: {
                title: config.colorField,
                format: getColumnFormat(config.colorField, columns),
              },
            },
            opacity: { condition: { param: 'select', value: 1 }, value: 0.3 },
            tooltip: [
              {
                field: config.geoField,
                type: 'nominal',
                title: snakeCaseToCapitalizedWords(config.geoField),
                format: getColumnFormat(config.geoField, columns),
              },
              {
                field: config.colorField,
                type: 'quantitative',
                title: snakeCaseToCapitalizedWords(config.colorField),
                format: getColumnFormat(config.colorField, columns),
              },
            ],
            stroke: {
              condition: { param: 'highlight', empty: false, value: 'black' },
              value: '#666',
            },
            strokeWidth: {
              condition: { param: 'highlight', empty: false, value: 2 },
              value: 0.5,
            },
          },
        },
      ],
      config: { view: { stroke: null } },
    }
  }
  return {}
}
