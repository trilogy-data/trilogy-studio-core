import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { createHeatmapSpec } from './heatmapSpec'
import { type ResultColumn, type Row, type ChartConfig, ColumnType } from '../editors/results'
import { createFieldEncoding, createColorEncoding } from './helpers'

// Mock the helper functions
vi.mock('./helpers', () => ({
  createFieldEncoding: vi.fn(),
  createColorEncoding: vi.fn(),
}))

describe('createHeatmapSpec', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockConfig: ChartConfig
  let mockTooltipFields: any[]
  let mockIntChart: Array<Partial<ChartConfig>>
  let mockData: readonly Row[] | null
  let currentTheme: '' | 'light' | 'dark'
  let isMobile: boolean

  beforeEach((): void => {
    mockColumns = new Map<string, ResultColumn>([
      [
        'category',
        {
          name: 'category',
          type: ColumnType.STRING,
          description: 'Product Category',
        } as ResultColumn,
      ],
      [
        'region',
        {
          name: 'region',
          type: ColumnType.STRING,
          description: 'Sales Region',
        } as ResultColumn,
      ],
      [
        'sales',
        {
          name: 'sales',
          type: ColumnType.NUMBER,
          format: '.2s',
          description: 'Total Sales',
          traits: ['usd'],
        } as ResultColumn,
      ],
    ])

    mockConfig = {
      chartType: 'heatmap',
      xField: 'category',
      yField: 'region',
      colorField: 'sales',
      hideLegend: false,
    } as ChartConfig

    mockTooltipFields = [
      { field: 'category', type: 'nominal' },
      { field: 'region', type: 'nominal' },
      { field: 'sales', type: 'quantitative' },
    ]

    mockIntChart = []
    mockData = null
    currentTheme = 'light'
    isMobile = false

    // Reset mocks
    vi.clearAllMocks()

    // Setup default mock returns
    ;(createFieldEncoding as Mock).mockReturnValue({
      field: 'test',
      type: 'nominal',
      title: 'Test Field',
    })
    ;(createColorEncoding as Mock).mockReturnValue({
      field: 'sales',
      type: 'quantitative',
      title: 'Total Sales',
      scale: { scheme: 'viridis' },
    })
  })

  describe('basic functionality', (): void => {
    it('should create a valid heatmap spec with required fields', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(spec).toHaveProperty('params')
      expect(spec).toHaveProperty('mark')
      expect(spec).toHaveProperty('encoding')
      expect(spec.mark).toBe('rect')
    })

    it('should create heatmap with rect mark type', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(spec.mark).toBe('rect')
    })

    it('should include required encoding fields', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(spec.encoding).toHaveProperty('x')
      expect(spec.encoding).toHaveProperty('y')
      expect(spec.encoding).toHaveProperty('color')
      expect(spec.encoding).toHaveProperty('tooltip')
    })
  })

  describe('parameter configuration', (): void => {
    it('should include highlight and select parameters', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(spec.params).toHaveLength(2)
      expect(spec.params[0].name).toBe('highlight')
      expect(spec.params[1].name).toBe('select')
    })

    it('should configure highlight parameter correctly', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      const highlightParam = spec.params.find((p: any) => p.name === 'highlight')
      expect(highlightParam).toBeDefined()
      expect(highlightParam!.select.type).toBe('point')
      expect(highlightParam!.select.on).toBe('mouseover')
      expect(highlightParam!.select.clear).toBe('mouseout')
    })

    it('should configure select parameter correctly', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.select.type).toBe('point')
      expect(selectParam!.select.on).toBe('click,touchend')
      expect(selectParam!.nearest).toBe(true)
    })

    it('should set select parameter value from intChart', (): void => {
      const intChartWithData: Array<Partial<ChartConfig>> = [
        { xField: 'category', yField: 'region' },
      ]
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        intChartWithData,
      )

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toEqual(intChartWithData)
    })

    it('should handle empty intChart', (): void => {
      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        [],
      )

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toEqual([])
    })
  })

  describe('encoding configuration', (): void => {
    describe('helper function integration', (): void => {
      it('should call createFieldEncoding for x-axis with correct parameters', (): void => {
        createHeatmapSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('category', mockColumns)
      })

      it('should call createFieldEncoding for y-axis with correct parameters', (): void => {
        createHeatmapSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('region', mockColumns)
      })

      it('should call createColorEncoding with correct parameters', (): void => {
        createHeatmapSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(createColorEncoding).toHaveBeenCalledWith(
          mockConfig,
          'sales',
          mockColumns,
          isMobile,
          currentTheme,
          mockConfig.hideLegend,
          mockData,
        )
      })

      it('should handle missing xField', (): void => {
        const configWithoutX = { ...mockConfig, xField: undefined }
        createHeatmapSpec(
          configWithoutX,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('', mockColumns)
      })

      it('should handle missing yField', (): void => {
        const configWithoutY = { ...mockConfig, yField: undefined }
        createHeatmapSpec(
          configWithoutY,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('', mockColumns)
      })

      it('should handle missing colorField', (): void => {
        const configWithoutColor = { ...mockConfig, colorField: undefined }
        createHeatmapSpec(
          configWithoutColor,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(createColorEncoding).toHaveBeenCalledWith(
          configWithoutColor,
          '',
          mockColumns,
          isMobile,
          currentTheme,
          configWithoutColor.hideLegend,
          mockData,
        )
      })
    })

    describe('tooltip encoding', (): void => {
      it('should pass through tooltip fields', (): void => {
        const spec = createHeatmapSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(spec.encoding.tooltip).toEqual(mockTooltipFields)
      })

      it('should handle empty tooltip fields', (): void => {
        const spec = createHeatmapSpec(
          mockConfig,
          mockColumns,
          [],
          currentTheme,
          isMobile,
          mockData,
          mockIntChart,
        )

        expect(spec.encoding.tooltip).toEqual([])
      })
    })
  })

  describe('theme and mobile parameters', (): void => {
    it('should pass theme parameter to createColorEncoding', (): void => {
      const darkTheme = 'dark' as const
      createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        darkTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'sales',
        mockColumns,
        isMobile,
        darkTheme,
        mockConfig.hideLegend,
        mockData,
      )
    })

    it('should pass mobile parameter to createColorEncoding', (): void => {
      const mobileTrue = true
      createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        mobileTrue,
        mockData,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'sales',
        mockColumns,
        mobileTrue,
        currentTheme,
        mockConfig.hideLegend,
        mockData,
      )
    })

    it('should handle empty theme', (): void => {
      const emptyTheme = '' as const
      createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        emptyTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'sales',
        mockColumns,
        isMobile,
        emptyTheme,
        mockConfig.hideLegend,
        mockData,
      )
    })
  })

  describe('data parameter', (): void => {
    it('should pass data parameter to createColorEncoding', (): void => {
      const testData: readonly Row[] = [
        { category: 'A', region: 'North', sales: 100 },
        { category: 'B', region: 'South', sales: 200 },
      ]

      createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        testData,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'sales',
        mockColumns,
        isMobile,
        currentTheme,
        mockConfig.hideLegend,
        testData,
      )
    })

    it('should handle null data', (): void => {
      createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        null,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'sales',
        mockColumns,
        isMobile,
        currentTheme,
        mockConfig.hideLegend,
        null,
      )
    })
  })

  describe('hideLegend parameter', (): void => {
    it('should pass hideLegend parameter to createColorEncoding', (): void => {
      const configWithHiddenLegend = { ...mockConfig, hideLegend: true }
      createHeatmapSpec(
        configWithHiddenLegend,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        configWithHiddenLegend,
        'sales',
        mockColumns,
        isMobile,
        currentTheme,
        true,
        mockData,
      )
    })

    it('should handle undefined hideLegend', (): void => {
      const configWithoutHideLegend = { ...mockConfig, hideLegend: undefined }
      createHeatmapSpec(
        configWithoutHideLegend,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        configWithoutHideLegend,
        'sales',
        mockColumns,
        isMobile,
        currentTheme,
        undefined,
        mockData,
      )
    })
  })

  describe('edge cases', (): void => {
    it('should handle empty columns map', (): void => {
      const emptyColumns = new Map<string, ResultColumn>()
      createHeatmapSpec(
        mockConfig,
        emptyColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        mockIntChart,
      )

      expect(createFieldEncoding).toHaveBeenCalledWith('category', emptyColumns)
      expect(createFieldEncoding).toHaveBeenCalledWith('region', emptyColumns)
      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'sales',
        emptyColumns,
        isMobile,
        currentTheme,
        mockConfig.hideLegend,
        mockData,
      )
    })

    it('should handle large intChart array', (): void => {
      const largeIntChart: Array<Partial<ChartConfig>> = Array.from({ length: 100 }, (_, i) => ({
        xField: `category${i}`,
        yField: `region${i}`,
      }))

      const spec = createHeatmapSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        currentTheme,
        isMobile,
        mockData,
        largeIntChart,
      )

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toHaveLength(100)
    })
  })
})
