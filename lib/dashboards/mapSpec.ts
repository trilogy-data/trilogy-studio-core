import type { Row, ResultColumn, ChartConfig } from '../editors/results'
import { lookupCountry } from './countryLookup'
import { snakeCaseToCapitalizedWords } from './formatting'
import { getColumnHasTrait, getFormatHint, createColorEncoding } from './helpers'
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
      sequence: { start: 0, stop: 20, as: 'a' },
      name: 'tile_list_cba3076ebb77',
    },
    mark: {
      type: 'image',
      clip: true,
      height: { expr: 'tile_size + 1' },
      width: { expr: 'tile_size + 1' },
    },
    encoding: {
      url: { field: 'url', type: 'nominal' },
      x: { field: 'x', scale: null, type: 'quantitative' },
      y: { field: 'y', scale: null, type: 'quantitative' },
    },
    transform: [
      { calculate: 'sequence(0, 20)', as: 'b' },
      { flatten: ['b'] },
      {
        calculate:
          "'https://a.basemaps.cartocdn.com/light_all/' + zoom_ceil + '/' + ((datum.a + dii_floor + max_one_side_tiles_count) % max_one_side_tiles_count) + '/' + (datum.b + djj_floor) + '.png'",
        as: 'url',
      },
      { calculate: 'datum.a * tile_size + dx + (tile_size / 2)', as: 'x' },
      { calculate: 'datum.b * tile_size + dy + (tile_size / 2)', as: 'y' },
      {
        filter: 'datum.x < (width + tile_size / 2) && datum.y < (height + tile_size / 2)',
      },
      {
        filter:
          '((datum.a + dii_floor + max_one_side_tiles_count) % max_one_side_tiles_count) >= 0 && (datum.b + djj_floor) >= 0 && ((datum.a + dii_floor + max_one_side_tiles_count) % max_one_side_tiles_count) <= (max_one_side_tiles_count - 1) && (datum.b + djj_floor) <= (max_one_side_tiles_count - 1)',
      },
    ],
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
  ...getFormatHint(field, columns),
})

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

function isDataMostlyInUS<T>(rows: readonly T[], latField: keyof T, longField: keyof T): boolean {
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

// Constants for US total geographic span (approximate)
const US_TOTAL_LON_SPAN = 57.83 // Approx -124.78 to -66.95
const US_TOTAL_LAT_SPAN = 24.6 // Approx 24.74 to 49.34

// Thresholds for deciding if data is "sufficiently scattered" for albersUsa
// These percentages are heuristic and might need tuning based on desired behavior.
// E.g., if data spans more than 30% of US longitude AND 30% of US latitude, use albersUsa.
const ALBERS_LON_SPREAD_THRESHOLD_PERCENT = 0.2
const ALBERS_LAT_SPREAD_THRESHOLD_PERCENT = 0.1

const ALBERS_MIN_LON_SPAN_DEG = US_TOTAL_LON_SPAN * ALBERS_LON_SPREAD_THRESHOLD_PERCENT
const ALBERS_MIN_LAT_SPAN_DEG = US_TOTAL_LAT_SPAN * ALBERS_LAT_SPREAD_THRESHOLD_PERCENT

/**
 * Determines if the geographic spread of data points is wide enough to warrant albersUsa projection.
 * This is meant to distinguish between data spread across multiple states/regions vs. clustered in one area.
 */
function isDataSufficientlySpreadForAlbers<T>(
  rows: readonly T[],
  lonField: keyof T,
  latField: keyof T,
): boolean {
  if (!rows.length) return false

  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const row of rows) {
    const lon = Number(row[lonField])
    const lat = Number(row[latField])

    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const dataLonSpan = maxLon - minLon
  const dataLatSpan = maxLat - minLat

  // Check if both longitude and latitude spans exceed their respective thresholds
  return dataLonSpan >= ALBERS_MIN_LON_SPAN_DEG && dataLatSpan >= ALBERS_MIN_LAT_SPAN_DEG
}

/**
 * Creates a US scatter plot map specification
 */
const createUSScatterMapSpec = (
  config: ChartConfig,
  columns: Map<string, ResultColumn>,
  isMobile: boolean,
  intChart: Array<Partial<ChartConfig>>,
  currentTheme: string = 'light',
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

  if (config.colorField) {
    tooltipFields.push(createTooltipField(config.colorField, 'nominal', columns))
  }

  if (config.annotationField) {
    tooltipFields.push(createTooltipField(config.annotationField, 'nominal', columns))
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
                scale: { type: 'sqrt' },
              }
            : undefined,
          color: config.colorField
            ? createColorEncoding(
                config,
                config.colorField,
                columns,
                isMobile,
                currentTheme,
                config.hideLegend,
              )
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
  currentTheme: string = 'light',
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

  if (config.colorField) {
    tooltipFields.push(createTooltipField(config.colorField, 'nominal', columns))
  }

  if (config.annotationField) {
    tooltipFields.push(createTooltipField(config.annotationField, 'nominal', columns))
  }

  if (data.length === 0) {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 'container',
      layer: [createWorldBaseLayer()],
    }
  }
  const { scaleFactor } = computeMercatorProjectionFactors(data, config.xField, config.yField)
  if (!(config.xField && config.yField)) {
    throw new Error('Both xField and yField must be provided for scatter map')
  }
  let lons: number[] = []
  let lats: number[] = []
  if (config.xField) {
    // @ts-ignore
    lons = data.map((d) => d[config.xField]).filter((x) => x !== null && x !== undefined)
  }
  if (config.yField) {
    // @ts-ignore
    lats = data.map((d) => d[config.yField]).filter((x) => x !== null && x !== undefined)
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
    // https://github.com/vega/vega-lite/issues/5758
    // use OSM tiles as background for world map
    // these parameters are used to determine which to fetch
    params: [
      { name: 'base_tile_size', value: 256 },
      { name: 'pr_scale', expr: "geoScale('projection')" },
      {
        name: 'zoom_level',
        expr: 'log((2 * PI * pr_scale) / base_tile_size) / log(2)',
      },
      { name: 'zoom_ceil', expr: 'ceil(zoom_level)' },
      { name: 'max_one_side_tiles_count', expr: 'pow(2, zoom_ceil)' },
      {
        name: 'tile_size',
        expr: 'base_tile_size * pow(2, zoom_level - zoom_ceil)',
      },
      { name: 'base_point', expr: "invert('projection', [0, 0])" },
      {
        name: 'dii',
        expr: '(base_point[0] + 180) / 360 * max_one_side_tiles_count',
      },
      { name: 'dii_floor', expr: 'floor(dii)' },
      { name: 'dx', expr: '(dii_floor - dii) * tile_size' },
      {
        name: 'djj',
        expr: '(1 - log(tan(base_point[1] * PI / 180) + 1 / cos(base_point[1] * PI / 180)) / PI) / 2 * max_one_side_tiles_count',
      },
      { name: 'djj_floor', expr: 'floor(djj)' },
      { name: 'dy', expr: 'round((djj_floor - djj) * tile_size)' },
    ],
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
                scale: { type: 'sqrt' },
                legend: {
                  orient: isMobile ? 'bottom' : 'right',
                },
              }
            : undefined,
          color: config.colorField
            ? createColorEncoding(
                config,
                config.colorField,
                columns,
                isMobile,
                currentTheme,
                config.hideLegend,
              )
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
  isMobile: boolean = false,
  currentTheme: string = 'light',
) => {
  const dataFields = [config.colorField, config.sizeField, config.geoField].filter(Boolean)
  let colorConfig = {}
  if (config.colorField) {
    colorConfig = createColorEncoding(
      config,
      config.colorField,
      columns,
      isMobile,
      currentTheme,
      config.hideLegend,
    )
  } else {
    colorConfig = { value: 'steelblue' }
  }
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
          color: { ...colorConfig },
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
  currentTheme: string = 'light',
) => {
  if (!data || data.length === 0) {
    // TODO: return blank map schema
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 'container',
      layer: [createWorldBaseLayer()],
    }
  }

  // Handle scatter plot case
  if (config.xField && config.yField) {
    //@ts-ignore
    if (
      isDataMostlyInUS(data, config.yField, config.xField) &&
      isDataSufficientlySpreadForAlbers(data, config.yField, config.xField)
    ) {
      return createUSScatterMapSpec(config, columns, isMobile, intChart, currentTheme)
    }
    return createWorldScatterMapSpec(config, columns, isMobile, intChart, data, currentTheme)
  }

  // Handle choropleth case
  if (config.geoField && getColumnHasTrait(config.geoField, columns, 'us_state_short')) {
    return createUSChoroplethMapSpec(config, data, columns, intChart, isMobile, currentTheme)
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
    let colorEncoding = {}
    if (config.colorField) {
      colorEncoding = createColorEncoding(
        config,
        config.colorField,
        columns,
        isMobile,
        currentTheme,
        config.hideLegend,
      )
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
              ...colorEncoding,
            },
            opacity: { condition: { param: 'select', value: 1 }, value: 0.3 },
            tooltip: [
              {
                field: config.geoField,
                type: 'nominal',
                title: snakeCaseToCapitalizedWords(config.geoField),
                ...getFormatHint(config.geoField, columns),
              },
              {
                field: config.colorField,
                type: 'quantitative',
                title: snakeCaseToCapitalizedWords(config.colorField),
                ...getFormatHint(config.colorField, columns),
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
