import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMapSpec } from './mapSpec'
import { createBaseSpec } from './spec'
import { ColumnType } from '../editors/results'
import type { Row, ResultColumn, ChartConfig } from '../editors/results'
import * as vegaLite from 'vega-lite'

// Mock the external dependencies
vi.mock('./countryLookup', () => ({
  // @ts-ignore
  lookupCountry: vi.fn((name: string, type: string) => {
    // Mock country lookup responses
    const countryMappings: Record<string, any> = {
      'United States': { 'country-code': '840' },
      Canada: { 'country-code': '124' },
      Mexico: { 'country-code': '484' },
      Germany: { 'country-code': '276' },
      France: { 'country-code': '250' },
    }
    return countryMappings[name] || null
  }),
}))

vi.mock('./formatting', () => ({
  snakeCaseToCapitalizedWords: vi.fn((str: string) => {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }),
}))

vi.mock('./d3utility', () => ({
  // @ts-ignore
  computeMercatorProjectionFactors: vi.fn((data: any[], xField: string, yField: string) => ({
    scaleFactor: 0.5,
    translateXFactor: 0.5,
    translateYFactor: 0.5,
  })),
}))

// Helper function to create test data for US states
const createUSStateData = (): readonly Row[] => [
  { state: 'CA', population: 39538223, gdp: 3.3, latitude: 36.7783, longitude: -119.4179 },
  { state: 'TX', population: 29145505, gdp: 2.4, latitude: 31.9686, longitude: -99.9018 },
  { state: 'FL', population: 21538187, gdp: 1.0, latitude: 27.7663, longitude: -81.6868 },
  { state: 'NY', population: 20201249, gdp: 1.8, latitude: 42.1657, longitude: -74.9481 },
]

// Helper function to create test data for countries
const createCountryData = (): readonly Row[] => [
  { country: 'United States', gdp: 21.43, population: 331000000 },
  { country: 'Canada', gdp: 1.74, population: 38000000 },
  { country: 'Mexico', gdp: 1.29, population: 128000000 },
  { country: 'Germany', gdp: 3.85, population: 83000000 },
]

// Helper function to create test data for lat/long coordinates
const createUSCoordinateData = (): readonly Row[] => [
  { city: 'Los Angeles', latitude: 34.0522, longitude: -118.2437, population: 3980000 },
  { city: 'New York', latitude: 40.7128, longitude: -74.006, population: 8400000 },
  { city: 'Chicago', latitude: 41.8781, longitude: -87.6298, population: 2716000 },
  { city: 'Houston', latitude: 29.7604, longitude: -95.3698, population: 2320000 },
]

// Helper function to create test data for world coordinates
const createWorldCoordinateData = (): readonly Row[] => [
  { city: 'Tokyo', latitude: 35.6762, longitude: 139.6503, population: 37400000 },
  { city: 'London', latitude: 51.5074, longitude: -0.1278, population: 9000000 },
  { city: 'Sydney', latitude: -33.8688, longitude: 151.2093, population: 5300000 },
  { city: 'São Paulo', latitude: -23.5505, longitude: -46.6333, population: 12300000 },
]

// Helper function to create test columns for US states
const createUSStateColumns = (): Map<string, ResultColumn> => {
  return new Map([
    [
      'state',
      {
        name: 'state',
        type: ColumnType.STRING,
        description: 'US State',
        traits: ['us_state_short'],
      },
    ],
    [
      'population',
      {
        name: 'population',
        type: ColumnType.NUMBER,
        description: 'Population Count',
      },
    ],
    [
      'gdp',
      {
        name: 'gdp',
        type: ColumnType.NUMBER,
        description: 'GDP in Trillions',
        traits: ['usd'],
      },
    ],
    [
      'latitude',
      {
        name: 'latitude',
        type: ColumnType.NUMBER,
        description: 'Latitude',
      },
    ],
    [
      'longitude',
      {
        name: 'longitude',
        type: ColumnType.NUMBER,
        description: 'Longitude',
      },
    ],
  ])
}

// Helper function to create test columns for countries
const createCountryColumns = (): Map<string, ResultColumn> => {
  return new Map([
    [
      'country',
      {
        name: 'country',
        type: ColumnType.STRING,
        description: 'Country Name',
        traits: ['country'],
      },
    ],
    [
      'gdp',
      {
        name: 'gdp',
        type: ColumnType.NUMBER,
        description: 'GDP in Trillions',
        traits: ['usd'],
      },
    ],
    [
      'population',
      {
        name: 'population',
        type: ColumnType.NUMBER,
        description: 'Population Count',
      },
    ],
  ])
}

// Helper function to create test columns for coordinates
const createCoordinateColumns = (): Map<string, ResultColumn> => {
  return new Map([
    [
      'city',
      {
        name: 'city',
        type: ColumnType.STRING,
        description: 'City Name',
      },
    ],
    [
      'latitude',
      {
        name: 'latitude',
        type: ColumnType.NUMBER,
        description: 'Latitude',
      },
    ],
    [
      'longitude',
      {
        name: 'longitude',
        type: ColumnType.NUMBER,
        description: 'Longitude',
      },
    ],
    [
      'population',
      {
        name: 'population',
        type: ColumnType.NUMBER,
        description: 'Population Count',
      },
    ],
    [
      'category',
      {
        name: 'category',
        type: ColumnType.STRING,
        description: 'Category of the city',
      },
    ],
  ])
}

// Helper function to validate Vega-Lite spec
const validateVegaLiteSpec = (spec: any, data: readonly Row[]): boolean => {
  const finalSpec = { ...createBaseSpec(data), ...spec }
  try {
    // Compile the spec using Vega-Lite

    const compiledSpec = vegaLite.compile(finalSpec)

    // Check if compilation was successful
    expect(compiledSpec).toBeDefined()
    expect(compiledSpec.spec).toBeDefined()

    // Basic structural validation
    expect(finalSpec).toHaveProperty('$schema')
    expect(finalSpec.$schema).toContain('vega-lite')

    return true
  } catch (error) {
    throw new Error(`Vega-Lite spec validation failed: ${error} - ${JSON.stringify(finalSpec)}`)
    return false
  }
}

describe('createMapSpec', () => {
  let intChart: Array<Partial<ChartConfig>>

  beforeEach(() => {
    intChart = []
  })

  describe('US Choropleth Maps', () => {
    it('should generate valid US choropleth map spec', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'state',
        colorField: 'population',
      }

      const data = createUSStateData()
      const columns = createUSStateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.projection.type).toBe('albersUsa')
      expect(spec.layer).toBeDefined()
      expect(spec.layer.length).toBe(2) // Base layer + data layer

      // Check base layer
      const baseLayer = spec.layer[0]
      expect(baseLayer.data.url).toContain('us-10m.json')
      expect(baseLayer.mark.type).toBe('geoshape')
      expect(baseLayer.mark.fill).toBe('#e5e5e5')

      // Check data layer
      const dataLayer = spec.layer[1]
      expect(dataLayer.encoding.color.field).toBe('population')
      expect(dataLayer.encoding.color.type).toBe('quantitative')
      expect(dataLayer.encoding.tooltip).toBeDefined()
      expect(dataLayer.transform).toBeDefined()
      expect(dataLayer.transform.length).toBe(2) // ID lookup + data lookup
    })

    it('should include interaction parameters for choropleth maps', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'state',
        colorField: 'gdp',
      }

      const data = createUSStateData()
      const columns = createUSStateColumns()
      // @ts-ignore
      const testIntChart = [{ state: 'CA' }] as Partial<ChartConfig>[]

      const spec = createMapSpec(config, data, columns, false, testIntChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const dataLayer = spec.layer[1]
      expect(dataLayer.params).toBeDefined()
      expect(dataLayer.params.length).toBe(2)

      const highlightParam = dataLayer.params.find((p: any) => p.name === 'highlight')
      expect(highlightParam).toBeDefined()
      expect(highlightParam.select.type).toBe('point')

      const selectParam = dataLayer.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam.value).toEqual(testIntChart)
    })

    it('should apply proper formatting for USD values', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'state',
        colorField: 'gdp',
      }

      const data = createUSStateData()
      const columns = createUSStateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const dataLayer = spec.layer[1]
      expect(dataLayer.encoding.color.legend.format).toBe('$,.2f')
    })
  })

  describe('US Scatter Maps', () => {
    it('should generate valid US scatter map spec', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
        sizeField: 'population',
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.projection.type).toBe('albersUsa')
      expect(spec.layer).toBeDefined()
      expect(spec.layer.length).toBe(2) // Base layer + scatter layer

      // Check scatter layer
      const scatterLayer = spec.layer[1]
      expect(scatterLayer.mark.type).toBe('circle')
      expect(scatterLayer.encoding.longitude.field).toBe('longitude')
      expect(scatterLayer.encoding.latitude.field).toBe('latitude')
      expect(scatterLayer.encoding.size.field).toBe('population')
      expect(scatterLayer.encoding.tooltip).toBeDefined()
    })

    it('should handle scatter map with color encoding', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
        colorField: 'population',
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const scatterLayer = spec.layer[1]
      expect(scatterLayer.encoding.color.field).toBe('population')
      expect(scatterLayer.encoding.color.type).toBe('quantitative')
    })

    it('should use default color when no color field specified', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const scatterLayer = spec.layer[1]
      expect(scatterLayer.encoding.color.value).toBe('steelblue')
    })
  })

  describe('World Scatter Maps', () => {
    it('should generate valid world scatter map spec', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
        sizeField: 'population',
      }

      const data = createWorldCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.projection.type).toBe('mercator')
      expect(spec.projection.scale.expr).toContain('min(width, height)')
      expect(spec.projection.center).toBeDefined()
      expect(spec.layer).toBeDefined()
      expect(spec.layer.length).toBe(2)

      // Check world base layer
      const baseLayer = spec.layer[0]
      // expect(baseLayer.data.url).toContain('countries-50m.json')
      expect(baseLayer.mark.type).toBe('image')

      // Check scatter layer
      const scatterLayer = spec.layer[1]
      expect(scatterLayer.mark.type).toBe('circle')
      expect(scatterLayer.encoding.longitude.field).toBe('longitude')
      expect(scatterLayer.encoding.latitude.field).toBe('latitude')
    })

    it('should calculate proper projection center for world map', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
      }

      const data = createWorldCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.projection.center).toBeDefined()
      expect(Array.isArray(spec.projection.center)).toBe(true)
      expect(spec.projection.center.length).toBe(2)
    })
  })

  describe('Country Choropleth Maps', () => {
    it('should generate valid country choropleth map spec', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'country',
        colorField: 'gdp',
      }

      const data = createCountryData()
      const columns = createCountryColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.layer).toBeDefined()
      expect(spec.layer.length).toBe(2)

      // Check base layer
      const baseLayer = spec.layer[0]
      expect(baseLayer.data.url).toContain('world-110m.json')
      expect(baseLayer.mark.fill).toBe('#e0e0e0')
      expect(baseLayer.transform[0].filter).toContain('10') // Antarctica filter

      // Check data layer
      const dataLayer = spec.layer[1]
      expect(dataLayer.encoding.color.field).toBe('gdp')
      expect(dataLayer.encoding.color.type).toBe('quantitative')
      expect(dataLayer.transform[0].lookup).toBe('id')
      expect(dataLayer.transform[0].from.data.values).toBeDefined()
    })

    it('should handle country lookup transformation correctly', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'country',
        colorField: 'population',
      }

      const data = createCountryData()
      const columns = createCountryColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const dataLayer = spec.layer[1]
      const transformedData = dataLayer.transform[0].from.data.values

      // Check that country codes are properly assigned
      expect(transformedData.length).toBe(data.length)
      expect(transformedData[0]).toHaveProperty('id')
      expect(transformedData[0].id).toBe(840) // US country code
    })

    it('should include proper tooltip configuration for countries', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'country',
        colorField: 'gdp',
      }

      const data = createCountryData()
      const columns = createCountryColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const dataLayer = spec.layer[1]
      expect(dataLayer.encoding.tooltip).toBeDefined()
      expect(Array.isArray(dataLayer.encoding.tooltip)).toBe(true)
      expect(dataLayer.encoding.tooltip.length).toBe(2)

      const geoTooltip = dataLayer.encoding.tooltip.find((t: any) => t.field === 'country')
      const colorTooltip = dataLayer.encoding.tooltip.find((t: any) => t.field === 'gdp')

      expect(geoTooltip).toBeDefined()
      expect(colorTooltip).toBeDefined()
    })
  })

  describe('Mobile Optimizations', () => {
    it('should apply mobile-specific configurations for scatter maps', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
        colorField: 'population',
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, true, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const scatterLayer = spec.layer![1]
      expect(scatterLayer.encoding.color.legend.orient).toBe('bottom')
      expect(scatterLayer.encoding.color.legend.direction).toBe('horizontal')
    })

    it('should handle categorical color encoding on mobile', () => {
      const categoricalColumns = new Map([
        ['longitude', { name: 'longitude', type: ColumnType.NUMBER, description: 'Longitude' }],
        ['latitude', { name: 'latitude', type: ColumnType.NUMBER, description: 'Latitude' }],
        ['category', { name: 'category', type: ColumnType.STRING, description: 'Category' }],
      ])

      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
        colorField: 'category',
      }

      const data = createUSCoordinateData()

      const spec = createMapSpec(config, data, categoricalColumns, true, intChart)

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const scatterLayer = spec.layer![1] as any
      expect(scatterLayer.encoding.color.type).toBe('nominal')
      expect(scatterLayer.encoding.color.scale.scheme).toBe('category20c')
    })
  })

  describe('Error Handling', () => {
    it('should handle empty data gracefully', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'state',
        colorField: 'population',
      }

      const columns = createUSStateColumns()
      const data: readonly Row[] = [] // Empty data
      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

    })

    it('should handle missing required fields gracefully', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        // Missing yField for scatter map
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      expect(() => {
        createMapSpec(config, data, columns, false, intChart)
      }).toThrow(
        'Unsupported map configuration: must provide either xField and yField for scatter plot or geoField',
      )
    })

    it('should return empty object for unsupported configurations', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        // No valid field configuration
      }

      const data = createUSStateData()
      const columns = createUSStateColumns()

      expect(() => {
        createMapSpec(config, data, columns, false, intChart)
      }).toThrow(
        'Unsupported map configuration: must provide either xField and yField for scatter plot or geoField',
      )
    })
  })

  describe('Data Boundary Detection', () => {
    it('should correctly identify US data and use US projection', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.projection.type).toBe('albersUsa')
    })

    it('should correctly identify world data and use mercator projection', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
      }

      const data = createWorldCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)
      expect(spec.projection.type).toBe('mercator')
    })
  })

  describe('Tooltip Configuration', () => {
    it('should include all relevant fields in scatter map tooltips', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        xField: 'longitude',
        yField: 'latitude',
        sizeField: 'population',
        colorField: 'category',
      }

      const data = createUSCoordinateData()
      const columns = createCoordinateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const scatterLayer = spec.layer[1]
      expect(scatterLayer.encoding.tooltip).toBeDefined()
      expect(scatterLayer.encoding.tooltip.length).toBe(4) // longitude, latitude, population, category

      const fields = scatterLayer.encoding.tooltip.map((t: any) => t.field)
      expect(fields).toContain('longitude')
      expect(fields).toContain('latitude')
      expect(fields).toContain('population')
      expect(fields).toContain('category')
    })

    it('should apply proper formatting to tooltip fields', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'state',
        colorField: 'gdp',
      }

      const data = createUSStateData()
      const columns = createUSStateColumns()

      const spec = createMapSpec(config, data, columns, false, intChart) as any

      expect(validateVegaLiteSpec(spec, data)).toBe(true)

      const dataLayer = spec.layer[1]
      const tooltips = dataLayer.encoding.tooltip
      const gdpTooltip = tooltips.find((t: any) => t.field === 'gdp')

      expect(gdpTooltip).toBeDefined()
      expect(gdpTooltip.format).toBe('$,.2f')
    })
  })
})
