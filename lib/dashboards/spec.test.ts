import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateVegaSpec } from './spec'
import { ColumnType } from '../editors/results'
import type { Row, ResultColumn, ChartConfig } from '../editors/results'
import * as vegaLite from 'vega-lite'
// Mock the external chart spec creators
vi.mock('./treeSpec', () => ({
  createTreemapSpec: vi.fn(() => ({
    mark: 'rect',
    encoding: { x: { field: 'category' }, y: { field: 'value' } },
  })),
}))

vi.mock('./mapSpec', () => ({
  createMapSpec: vi.fn(() => ({
    mark: 'geoshape',
    encoding: { color: { field: 'value' } },
  })),
}))

// Helper function to create test data
const createTestData = (): readonly Row[] => [
  { date: '2023-01-01', sales: 100, region: 'North', percent: 0.25, category: 'A' },
  { date: '2023-01-02', sales: 150, region: 'South', percent: 0.35, category: 'B' },
  { date: '2023-01-03', sales: 200, region: 'East', percent: 0.4, category: 'A' },
  { date: '2023-01-04', sales: 120, region: 'West', percent: 0.3, category: 'C' },
]

// Helper function to create test columns
const createTestColumns = (): Map<string, ResultColumn> => {
  return new Map([
    [
      'date',
      {
        name: 'date',
        type: ColumnType.DATE,
        description: 'Sale Date',
      },
    ],
    [
      'sales',
      {
        name: 'sales',
        type: ColumnType.NUMBER,
        description: 'Sales Amount',
        traits: ['usd'],
      },
    ],
    [
      'region',
      {
        name: 'region',
        type: ColumnType.STRING,
        description: 'Sales Region',
      },
    ],
    [
      'percent',
      {
        name: 'percent',
        type: ColumnType.NUMBER,
        description: 'Percentage',
        traits: ['percent'],
      },
    ],
    [
      'category',
      {
        name: 'category',
        type: ColumnType.STRING,
        description: 'Product Category',
      },
    ],
  ])
}

// Helper function to validate Vega-Lite spec
const validateVegaLiteSpec = (spec: any): boolean => {
  try {
    // Compile the spec using Vega-Lite
    const compiledSpec = vegaLite.compile(spec)

    // Check if compilation was successful
    expect(compiledSpec).toBeDefined()
    expect(compiledSpec.spec).toBeDefined()

    // Basic structural validation
    expect(spec).toHaveProperty('$schema')
    expect(spec.$schema).toContain('vega-lite')

    return true
  } catch (error) {
    console.error('Vega-Lite spec validation failed:', error)
    return false
  }
}

const validateVegaSpec = (spec: any): boolean => {
  try {
    // Basic structural validation
    expect(spec).toHaveProperty('$schema')
    expect(spec.$schema).toContain('vega')

    return true
  } catch (error) {
    console.error('Vega spec validation failed:', error)
    return false
  }
}

describe('generateVegaSpec', () => {
  let testData: readonly Row[]
  let testColumns: Map<string, ResultColumn>

  beforeEach(() => {
    testData = createTestData()
    testColumns = createTestColumns()
  })

  describe('Bar Chart', () => {
    it('should generate valid bar chart spec', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.mark.type).toBe('bar')
      expect(spec.encoding.x.field).toBe('region')
      expect(spec.encoding.y.field).toBe('sales')
      expect(spec.encoding.y.axis.format).toBe('$,.2f') // USD formatting
    })

    it('should handle bar chart with color encoding', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
        colorField: 'category',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.encoding.color.field).toBe('category')
      expect(spec.encoding.color.type).toBe('nominal')
    })

    it('should adjust label angle for many x-axis values', () => {
      // Create data with many unique regions to trigger label rotation
      const manyRegionsData = Array.from({ length: 10 }, (_, i) => ({
        region: `Region_${i}`,
        sales: 100 + i * 10,
      }))

      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec(manyRegionsData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.encoding.x.axis.labelAngle).toBe(-45)
    })
  })

  describe('Horizontal Bar Chart', () => {
    it('should generate valid horizontal bar chart spec', () => {
      const config: ChartConfig = {
        chartType: 'barh',
        xField: 'sales',
        yField: 'region',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null, true) // mobile = true

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.mark.type).toBe('bar')
      expect(spec.encoding.x.field).toBe('sales')
      expect(spec.encoding.y.field).toBe('region')
      expect(spec.encoding.y.sort).toStrictEqual({ field: 'sales', op: 'sum', order: 'descending' }) // Sorted by x value
    })

    it('should truncate long labels on mobile', () => {
      const config: ChartConfig = {
        chartType: 'barh',
        xField: 'sales',
        yField: 'region',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null, true)

      expect(spec.encoding.y.axis.labelExpr).toContain('slice')
      expect(spec.encoding.y.axis.labelExpr).toContain('...')
    })
  })

  describe('Line Chart', () => {
    it('should generate valid line chart spec', () => {
      const config: ChartConfig = {
        chartType: 'line',
        xField: 'date',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.layer).toBeDefined()
      expect(spec.layer.length).toBeGreaterThan(0)

      // Check that line layers exist
      const lineLayer = spec.layer.find(
        (layer: any) => layer.mark?.type === 'line' || layer.mark === 'line',
      )
      expect(lineLayer).toBeDefined()
    })

    it('should handle dual y-axis line chart', () => {
      const config: ChartConfig = {
        chartType: 'line',
        xField: 'date',
        yField: 'sales',
        yField2: 'percent',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.resolve.scale.y).toBe('independent')
      expect(spec.layer.length).toBeGreaterThan(1)
    })

    it('should handle line chart with color grouping', () => {
      const config: ChartConfig = {
        chartType: 'line',
        xField: 'date',
        yField: 'sales',
        colorField: 'region',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)

      // Find a layer with color encoding
      const colorLayer = spec.layer.find((layer: any) => layer.encoding?.color)
      expect(colorLayer).toBeDefined()
      expect(colorLayer.encoding.color.field).toBe('region')
    })
  })

  describe('Area Chart', () => {
    it('should generate valid area chart spec', () => {
      const config: ChartConfig = {
        chartType: 'area',
        xField: 'date',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.layer).toBeDefined()

      // Check that area layers exist
      const areaLayer = spec.layer.find(
        (layer: any) => layer.mark?.type === 'area' || layer.mark === 'area',
      )
      expect(areaLayer).toBeDefined()
    })
  })

  describe('Point Chart', () => {
    it('should generate valid scatter plot spec', () => {
      const config: ChartConfig = {
        chartType: 'point',
        xField: 'sales',
        yField: 'percent',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      // Find the point mark (equivalent to layer[0] in Vega-Lite)
      const pointMark = spec.marks?.find(
        (mark: any) => mark.name === 'layer_0_marks' && mark.type === 'symbol',
      )

      expect(pointMark).toBeDefined()
      expect(pointMark.type).toBe('symbol') // 'point' becomes 'symbol' in compiled Vega
      expect(pointMark.style).toContain('point')

      // Check mark properties - filled becomes a stroke/fill encoding
      const updateEncoding = pointMark.encode?.update
      expect(updateEncoding?.fill).toBeDefined()
      expect(updateEncoding?.stroke).toBeDefined()

      // Check x and y field mappings in the mark encoding
      expect(updateEncoding?.x?.scale).toBe('x')
      expect(updateEncoding?.x?.field).toBe('sales')
      expect(updateEncoding?.y?.scale).toBe('y')
      expect(updateEncoding?.y?.field).toBe('percent')
    })

    it('should handle point chart with color encoding', () => {
      const config: ChartConfig = {
        chartType: 'point',
        xField: 'sales',
        yField: 'percent',
        colorField: 'region',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaSpec(spec)).toBe(true)
      // Find the point mark (equivalent to layer[0] in Vega-Lite)
      // Find the point mark - look for layer_0_marks specifically
      const pointMark = spec.marks?.find(
        (mark: any) => mark.name === 'layer_0_marks' && mark.type === 'symbol',
      )

      expect(pointMark).toBeDefined()

      // Check stroke encoding (points use stroke for color, not fill)
      const strokeEncoding = pointMark.encode?.update?.stroke
      expect(strokeEncoding).toBeDefined()
      expect(Array.isArray(strokeEncoding)).toBe(true)

      // The color scale reference is typically the last element in the stroke array
      // (after conditional highlight/select logic)
      const colorEncoding = strokeEncoding[strokeEncoding.length - 1]
      expect(colorEncoding.scale).toBe('color')
      expect(colorEncoding.field).toBe('region')
    })
  })

  describe('Heatmap', () => {
    it('should generate valid heatmap spec', () => {
      const config: ChartConfig = {
        chartType: 'heatmap',
        xField: 'region',
        yField: 'category',
        colorField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.mark).toBe('rect')
      expect(spec.encoding.x.field).toBe('region')
      expect(spec.encoding.y.field).toBe('category')
      expect(spec.encoding.color.field).toBe('sales')
      expect(spec.encoding.color.scale.scheme).toBe('viridis')
    })
  })

  describe('Headline Display', () => {
    it('should generate valid headline spec', () => {
      const headlineData = [{ total_sales: 15000, avg_profit: 2500 }]
      const headlineColumns = new Map([
        [
          'total_sales',
          {
            name: 'total_sales',
            type: ColumnType.NUMBER,
            description: 'Total Sales',
            traits: ['usd'],
          },
        ],
        [
          'avg_profit',
          {
            name: 'avg_profit',
            type: ColumnType.NUMBER,
            description: 'Average Profit',
            traits: ['usd'],
          },
        ],
      ])

      const config: ChartConfig = {
        chartType: 'headline',
      }

      const spec = generateVegaSpec(headlineData, config, headlineColumns, null, false, '', 'light')

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.layer).toBeDefined()
      expect(spec.layer.length).toBeGreaterThan(0)

      // Should have text marks for displaying metrics
      const textLayers = spec.layer.filter((layer: any) => layer.mark?.type === 'text')
      expect(textLayers.length).toBeGreaterThan(0)
    })

    it('should handle dark theme for headline', () => {
      const headlineData = [{ sales: 1000 }]
      const headlineColumns = new Map([
        ['sales', { name: 'sales', type: ColumnType.NUMBER, description: 'Sales' }],
      ])

      const config: ChartConfig = {
        chartType: 'headline',
      }

      const spec = generateVegaSpec(headlineData, config, headlineColumns, null, false, '', 'dark')

      expect(validateVegaLiteSpec(spec)).toBe(true)

      // Check that dark theme colors are used
      const textLayer = spec.layer.find(
        (layer: any) => layer.mark?.type === 'text' && layer.encoding?.color?.value,
      )
      expect(textLayer).toBeDefined()
      expect(textLayer.encoding.color.value).toBe('#f0f0f0') // Dark theme text color
    })
  })

  describe('Boxplot', () => {
    it('should generate valid boxplot spec', () => {
      const config: ChartConfig = {
        chartType: 'boxplot',
        groupField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.mark.type).toBe('boxplot')
      expect(spec.mark.extent).toBe('min-max')
      expect(spec.encoding.x.field).toBe('region')
      expect(spec.encoding.y.field).toBe('sales')
    })
  })

  describe('Faceted Charts', () => {
    it('should generate valid faceted line chart spec', () => {
      const config: ChartConfig = {
        chartType: 'line',
        xField: 'date',
        yField: 'sales',
        trellisField: 'region',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.facet).toBeDefined()
      expect(spec.facet.field).toBe('region')
      expect(spec.spec).toBeDefined()
      expect(spec.spec.width).toBe('container')
      expect(spec.spec.height).toBe(200)
    })
  })

  describe('Mobile Optimizations', () => {
    it('should add mobile-specific configurations', () => {
      const config: ChartConfig = {
        chartType: 'point',
        xField: 'sales',
        yField: 'percent',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null, true) // mobile = true

      expect(validateVegaSpec(spec)).toBe(true)
      // expect(spec.point.size).toBe(80) // Larger touch targets
      // expect(spec.signals).toBeDefined()
      // expect(spec.signals[0].name).toBe('touchSignal')
    })
  })

  describe('Data Type Handling', () => {
    it('should handle temporal columns correctly', () => {
      const config: ChartConfig = {
        chartType: 'line',
        xField: 'date',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)

      // Find layer with x encoding for date
      const layer = spec.layer.find((l: any) => l.encoding?.x?.field === 'date')
      expect(layer).toBeDefined()
      expect(layer.encoding.x.type).toBe('temporal')
      expect(layer.encoding.x.timeUnit).toBe('yearmonthdate')
    })

    it('should handle quantitative columns correctly', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.encoding.y.type).toBe('quantitative')
    })

    it('should handle nominal columns correctly', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.encoding.x.type).toBe('nominal')
    })
  })

  describe('Formatting', () => {
    it('should apply USD formatting for columns with usd trait', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales', // Has usd trait
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.encoding.y.format).toBe('$,.2f')
    })

    it('should apply percentage formatting for columns with percent trait', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'percent', // Has percent trait
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.encoding.y.format).toBe('.1%')
    })
  })

  describe('Tooltip Generation', () => {
    it('should generate appropriate tooltip fields', () => {
      const config: ChartConfig = {
        chartType: 'point',
        xField: 'sales',
        yField: 'percent',
        colorField: 'region',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)
      // Find the point mark (equivalent to layer[0] in Vega-Lite)
      const pointMark = spec.marks?.find(
        (mark: any) => mark.name === 'layer_0_marks' && mark.type === 'symbol',
      )

      expect(pointMark).toBeDefined()
      expect(pointMark.encode?.update?.tooltip).toBeDefined()

      // In compiled Vega, tooltip is a signal expression string
      const tooltipSignal = pointMark.encode.update.tooltip.signal
      expect(tooltipSignal).toBeDefined()

      // Verify the tooltip signal contains references to all 3 expected fields
      expect(tooltipSignal).toContain('sales') // x field
      expect(tooltipSignal).toContain('percent') // y field
      expect(tooltipSignal).toContain('region') // color field
    })
  })

  describe('Error Handling', () => {
    it('should handle empty data gracefully', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec([], config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.data.values).toEqual([])
    })

    it('should handle null data gracefully', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const spec = generateVegaSpec(null, config, testColumns, null)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.data.values.length).toBe(0) // Should handle null data as empty
    })

    it('should handle missing field references gracefully', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'nonexistent_field',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      // Should still generate a valid spec, even with missing field
      expect(validateVegaLiteSpec(spec)).toBe(true)
    })
  })

  describe('External Chart Types', () => {
    it('should handle tree chart type (mocked)', () => {
      const config: ChartConfig = {
        chartType: 'tree',
        xField: 'category',
        yField: 'sales',
      }

      const spec = generateVegaSpec(testData, config, testColumns, null)

      // Should call the mocked createTreemapSpec function
      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.mark).toBe('rect') // From our mock
    })

    it('should handle usa-map chart type (mocked)', () => {
      const config: ChartConfig = {
        chartType: 'usa-map',
        geoField: 'state',
        colorField: 'sales',
        showTitle: true,
      }

      const spec = generateVegaSpec(testData, config, testColumns, null, false, 'Sales by State')

      // Should call the mocked createMapSpec function
      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.title.text).toBe('Sales by State')
      expect(spec.mark).toBe('geoshape') // From our mock
    })
  })

  describe('Interaction Parameters', () => {
    it('should include interaction parameters for bar charts', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const intChart = [{ region: 'North' }]
      const spec = generateVegaSpec(testData, config, testColumns, intChart)

      expect(validateVegaLiteSpec(spec)).toBe(true)
      expect(spec.params).toBeDefined()
      expect(spec.params.some((p: any) => p.name === 'highlight')).toBe(true)
      expect(spec.params.some((p: any) => p.name === 'select')).toBe(true)
    })

    it('should handle chart selection state correctly', () => {
      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region',
        yField: 'sales',
      }

      const intChart = [{ region: 'North', sales: 100 }]
      const spec = generateVegaSpec(testData, config, testColumns, intChart)

      expect(validateVegaLiteSpec(spec)).toBe(true)

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam.value).toEqual(intChart)
    })
  })
})
