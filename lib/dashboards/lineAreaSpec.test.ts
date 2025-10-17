import { describe, it, expect, beforeEach } from 'vitest'
import { createLineChartSpec, createAreaChartSpec } from './lineAreaSpec'
import { type Row, type ResultColumn, type ChartConfig } from '../editors/results'

// Type for the theme parameter
type Theme = 'light' | 'dark'

describe('Line and Area Chart Specs', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockData: Row[]
  let mockConfig: ChartConfig
  let mockTooltipFields: any[]
  let mockEncoding: any
  let mockIntChart: { [key: string]: string | number | Array<any> }[]

  beforeEach((): void => {
    mockColumns = new Map<string, ResultColumn>([
      ['date', { name: 'date', type: 'date' } as ResultColumn],
      ['revenue', { name: 'revenue', type: 'number', format: '.2s' } as ResultColumn],
      ['profit', { name: 'profit', type: 'number', format: '.2f' } as ResultColumn],
      ['category', { name: 'category', type: 'string' } as ResultColumn],
    ])

    mockData = [
      { date: '2024-01-01', revenue: 1000000, profit: 250000, category: 'A' } as Row,
      { date: '2024-02-01', revenue: 1200000, profit: 300000, category: 'B' } as Row,
      { date: '2024-03-01', revenue: 1100000, profit: 275000, category: 'A' } as Row,
    ]

    mockConfig = {
      chartType: 'line',
      xField: 'date',
      yField: 'revenue',
      colorField: undefined,
      yField2: undefined,
    } as ChartConfig

    mockTooltipFields = [
      { field: 'date', type: 'temporal' },
      { field: 'revenue', type: 'quantitative' },
    ]

    mockEncoding = {}
    mockIntChart = []
  })

  describe('createLineChartSpec', (): void => {
    describe('basic functionality', (): void => {
      it('should create a valid line chart spec with single y-axis', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        expect(spec).toHaveProperty('layer')
        expect(spec.data).toBeUndefined()
        expect(spec.layer).toHaveLength(2) // base + filtered layers
      })

      it('should create layers with correct mark types for line chart', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const layers = spec.layer as any[]

        // Base layer (unfiltered)
        expect(layers[0].mark.type).toBe('line')
        expect(layers[0].mark.color).toBe('lightgray')

        // Filtered layer
        expect(layers[1].mark.type).toBe('line')
        expect(layers[1].mark.color).toBe('steelblue') // light theme
      })

      it('should handle dual y-axis configuration', (): void => {
        const dualAxisConfig = {
          ...mockConfig,
          yField2: 'profit',
        }

        const spec = createLineChartSpec(
          dualAxisConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        // Should have nested layers for dual y-axis
        expect(spec.layer).toHaveLength(2)
        expect(spec.layer[0]).toHaveProperty('layer')
        expect(spec.layer[1]).toHaveProperty('layer')

        // Each nested layer should have 2 sub-layers (base + filtered)
        expect((spec.layer[0] as any).layer).toHaveLength(2)
        expect((spec.layer[1] as any).layer).toHaveLength(2)
      })

      it('should apply dark theme colors', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'dark' as Theme,
          false,
        )

        const layers = spec.layer as any[]

        // Filtered layer should use dark theme color
        expect(layers[1].mark.color).toBe('#4FC3F7')
      })
    })

    describe('interactive parameters', (): void => {
      it('should add interaction parameters to base layer', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const baseLayer = spec.layer[0] as any

        expect(baseLayer.params).toHaveLength(3)
        expect(baseLayer.params[0].name).toBe('highlight')
        expect(baseLayer.params[1].name).toBe('select')
        expect(baseLayer.params[2].name).toBe('brush')
      })

      it('should configure brush parameter correctly', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const baseLayer = spec.layer[0] as any
        const brushParam = baseLayer.params.find((p: any) => p.name === 'brush')

        expect(brushParam.select.type).toBe('interval')
        expect(brushParam.select.encodings).toEqual(['x'])
        expect(brushParam.value).toEqual([])
      })

      it('should not add parameters to filtered layer', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const filteredLayer = spec.layer[1] as any

        expect(filteredLayer.params).toEqual([])
      })

      it('should apply brush filter to filtered layer', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const filteredLayer = spec.layer[1] as any

        expect(filteredLayer.transform).toEqual([
          { filter: { param: 'brush' } },
          { filter: `datum.${mockConfig.yField} != null` },
        ])
      })
    })

    describe('color field handling', (): void => {
      it('should handle color field in base layer', (): void => {
        const configWithColor = {
          ...mockConfig,
          colorField: 'category',
        }

        const spec = createLineChartSpec(
          configWithColor,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const baseLayer = spec.layer[0] as any

        expect(baseLayer.encoding.detail).toEqual({
          field: 'category',
          color: 'lightgray',
        })
      })

      it('should handle color field in filtered layer', (): void => {
        const configWithColor = {
          ...mockConfig,
          colorField: 'category',
        }

        const spec = createLineChartSpec(
          configWithColor,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const filteredLayer = spec.layer[1] as any

        expect(filteredLayer.encoding.color).toEqual({
          field: 'category',
          legend: {
            direction: 'vertical',
            orient: 'right',
            titleFontSize: 12,
            titleOrient: 'top',
            tickCount: 15,
            values: ['A', 'B'],
          },
          type: 'nominal',
          scale: { scheme: 'category20c' },
          title: 'Category',
          condition: [
            {
              empty: false,
              param: 'highlight',
              value: '#FF7F7F',
            },
            {
              empty: false,
              param: 'select',
              value: '#FF7F7F',
            },
          ],
        })
      })
    })

    describe('secondary y-axis', (): void => {
      it('should create secondary layer with dashed line', (): void => {
        const dualAxisConfig = {
          ...mockConfig,
          yField2: 'profit',
        }

        const spec = createLineChartSpec(
          dualAxisConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        // Check secondary layer structure
        const secondaryLayerGroup = spec.layer[1] as any
        const secondaryBaseLayer = secondaryLayerGroup.layer[0]
        const secondaryFilteredLayer = secondaryLayerGroup.layer[1]

        expect(secondaryBaseLayer.mark.type).toBe('line')
        expect(secondaryBaseLayer.mark.strokeDash).toEqual([4, 2])
        expect(secondaryFilteredLayer.mark.color).toBe('orange')
      })

      it('should add highlight parameter to secondary base layer', (): void => {
        const dualAxisConfig = {
          ...mockConfig,
          yField2: 'profit',
        }

        const spec = createLineChartSpec(
          dualAxisConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const secondaryLayerGroup = spec.layer[1] as any
        const secondaryBaseLayer = secondaryLayerGroup.layer[0]

        expect(secondaryBaseLayer.params).toHaveLength(1)
        expect(secondaryBaseLayer.params[0].name).toBe('highlight2')
      })
    })

    describe('data handling', (): void => {
      it('should handle null data', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          null,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        expect(spec.layer).toHaveLength(2)

        const layers = spec.layer as any[]
        layers.forEach((layer: any) => {
          expect(layer.data.values).toBeNull()
        })
      })

      it('should pass through tooltip fields and encoding', (): void => {
        const spec = createLineChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        const layers = spec.layer as any[]
        layers.forEach((layer: any) => {
          expect(layer.encoding.tooltip).toBe(mockTooltipFields)
        })
      })
    })
  })

  describe('createAreaChartSpec', (): void => {
    beforeEach((): void => {
      mockConfig.chartType = 'area'
    })

    describe('basic functionality', (): void => {
      it('should create a valid area chart spec', (): void => {
        const spec = createAreaChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          false,
          mockIntChart,
          'light' as Theme,
        )

        expect(spec).toHaveProperty('layer')
        expect(spec.data).toBeUndefined()
        expect(spec.layer).toHaveLength(2) // base + filtered layers
      })

      it('should create layers with correct mark types for area chart', (): void => {
        const spec = createAreaChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          false,
          mockIntChart,
          'light' as Theme,
        )

        const layers = spec.layer as any[]

        // Base layer
        expect(layers[0].mark.type).toBe('area')
        expect(layers[0].mark.line.color).toBe('darkgray')

        // Filtered layer
        expect(layers[1].mark.type).toBe('area')
        expect(layers[1].mark.line).toBe(true)
      })

      it('should handle mobile parameter correctly', (): void => {
        const spec = createAreaChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          true, // isMobile
          mockIntChart,
          'light' as Theme,
        )

        expect(spec.layer).toHaveLength(2)
      })

      it('should match line chart structure for dual y-axis', (): void => {
        const dualAxisConfig = {
          ...mockConfig,
          yField2: 'profit',
        }

        const areaSpec = createAreaChartSpec(
          dualAxisConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          false,
          mockIntChart,
          'light' as Theme,
        )

        const lineSpec = createLineChartSpec(
          dualAxisConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          mockIntChart,
          'light' as Theme,
          false,
        )

        // Should have same structure as line chart for dual y-axis
        expect(areaSpec.layer).toHaveLength(2)
        expect(areaSpec.layer[0]).toHaveProperty('layer')
        expect(areaSpec.layer[1]).toHaveProperty('layer')

        expect(lineSpec.layer).toHaveLength(2)
        expect(lineSpec.layer[0]).toHaveProperty('layer')
        expect(lineSpec.layer[1]).toHaveProperty('layer')
      })
    })

    describe('parameter order consistency', (): void => {
      it('should handle different parameter order compared to line chart', (): void => {
        // Area chart has isMobile before intChart, line chart has it after
        const spec = createAreaChartSpec(
          mockConfig,
          mockData,
          mockColumns,
          mockTooltipFields,
          mockEncoding,
          false, // isMobile
          [], // intChart
          'dark' as Theme,
        )

        const layers = spec.layer as any[]
        expect(layers[1].mark.color).toBe('#4FC3F7') // dark theme color
      })
    })
  })

  describe('intChart parameter handling', (): void => {
    it('should handle intChart with x field values', (): void => {
      const intChartWithX = [{ date: '2024-02-01' }]

      const spec = createLineChartSpec(
        mockConfig,
        mockData,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        intChartWithX,
        'light' as Theme,
        false,
      )

      const baseLayer = spec.layer[0] as any
      const brushParam = baseLayer.params.find((p: any) => p.name === 'brush')

      expect(brushParam.value).toEqual([{ x: '2024-02-01' }])
    })

    it('should handle intChart with non-x field values', (): void => {
      const intChartWithoutX = [{ revenue: 1000000 }]

      const spec = createLineChartSpec(
        mockConfig,
        mockData,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        intChartWithoutX,
        'light' as Theme,
        false,
      )

      const baseLayer = spec.layer[0] as any
      const selectParam = baseLayer.params.find((p: any) => p.name === 'select')

      expect(selectParam.value).toEqual(intChartWithoutX)
    })

    it('should handle empty intChart', (): void => {
      const spec = createLineChartSpec(
        mockConfig,
        mockData,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        [],
        'light' as Theme,
        false,
      )

      const baseLayer = spec.layer[0] as any
      const brushParam = baseLayer.params.find((p: any) => p.name === 'brush')
      const selectParam = baseLayer.params.find((p: any) => p.name === 'select')

      expect(brushParam.value).toEqual([])
      expect(selectParam.value).toEqual([])
    })
  })
})
