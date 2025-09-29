import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { createPointChartSpec, addLabelTransformToTextMarks } from './pointSpec'
import { type ResultColumn, type Row, type ChartConfig, ColumnType } from '../editors/results'
import { createFieldEncoding, createColorEncoding, createSizeEncoding } from './helpers'
import { lightDefaultColor, darkDefaultColor } from './constants'

// Mock the helper functions
vi.mock('./helpers', () => ({
  createFieldEncoding: vi.fn(),
  createColorEncoding: vi.fn(),
  createSizeEncoding: vi.fn(),
}))

vi.mock('./constants', () => ({
  lightDefaultColor: '#1f77b4',
  darkDefaultColor: '#aec7e8',
}))

describe('createPointChartSpec', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockConfig: ChartConfig
  let mockTooltipFields: any[]
  let mockIntChart: { [key: string]: string | number | Array<any> }[]
  let mockData: readonly Row[]
  let currentTheme: string
  let isMobile: boolean

  beforeEach((): void => {
    mockColumns = new Map<string, ResultColumn>([
      [
        'xValue',
        {
          name: 'xValue',
          type: ColumnType.NUMBER,
          description: 'X Axis Value',
        } as ResultColumn,
      ],
      [
        'yValue',
        {
          name: 'yValue',
          type: ColumnType.NUMBER,
          description: 'Y Axis Value',
        } as ResultColumn,
      ],
      [
        'category',
        {
          name: 'category',
          type: ColumnType.STRING,
          description: 'Category',
        } as ResultColumn,
      ],
      [
        'size',
        {
          name: 'size',
          type: ColumnType.NUMBER,
          description: 'Size Value',
        } as ResultColumn,
      ],
      [
        'annotation',
        {
          name: 'annotation',
          type: ColumnType.STRING,
          description: 'Annotation Text',
        } as ResultColumn,
      ],
    ])

    mockConfig = {
      chartType: 'point',
      xField: 'xValue',
      yField: 'yValue',
      colorField: 'category',
      sizeField: undefined,
      annotationField: undefined,
      scaleX: 'linear',
      scaleY: 'linear',
      hideLegend: false,
    } as ChartConfig

    mockTooltipFields = [
      { field: 'xValue', type: 'quantitative' },
      { field: 'yValue', type: 'quantitative' },
      { field: 'category', type: 'nominal' },
    ]

    mockIntChart = []
    mockData = []
    currentTheme = 'light'
    isMobile = false

    // Reset mocks
    vi.clearAllMocks()

    // Setup default mock returns
    ;(createFieldEncoding as Mock).mockReturnValue({
      field: 'test',
      type: 'quantitative',
      title: 'Test Field',
    })
    ;(createColorEncoding as Mock).mockReturnValue({
      field: 'category',
      type: 'nominal',
      title: 'Category',
    })
    ;(createSizeEncoding as Mock).mockReturnValue({
      field: 'size',
      type: 'quantitative',
      title: 'Size Value',
    })
  })

  describe('basic functionality', (): void => {
    it('should create a valid point chart spec with required fields', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec).toHaveProperty('layer')
      expect(spec).toHaveProperty('encoding')
      expect(spec.layer).toBeInstanceOf(Array)
      expect(spec.layer.length).toBeGreaterThan(0)
    })

    it('should create point mark type in base layer', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer[0].mark.type).toBe('point')
    })

    it('should include required encoding fields', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.encoding).toHaveProperty('x')
      expect(spec.encoding).toHaveProperty('y')
    })
  })

  describe('parameter configuration', (): void => {
    it('should include highlight, select, and brush parameters', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer[0].params).toHaveLength(3)
      expect(spec.layer[0].params[0].name).toBe('highlight')
      expect(spec.layer[0].params[1].name).toBe('select')
      expect(spec.layer[0].params[2].name).toBe('brush')
    })

    it('should configure highlight parameter correctly', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      const highlightParam = spec.layer[0].params.find((p: any) => p.name === 'highlight')
      expect(highlightParam).toBeDefined()
      expect(highlightParam!.select.type).toBe('point')
      expect(highlightParam!.select.on).toBe('mouseover')
      expect(highlightParam!.select.clear).toBe('mouseout')
    })

    it('should configure select parameter correctly', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      const selectParam = spec.layer[0].params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.select.type).toBe('point')
      expect(selectParam!.select.on).toBe('click,touchend')
      expect(selectParam!.value).toEqual(mockIntChart)
    })

    it('should set select parameter value from intChart', (): void => {
      const intChartWithData: { [key: string]: string | number | Array<any> }[] = [
        { xField: 'xValue', yField: 'yValue' },
      ]
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        intChartWithData,
        currentTheme,
        isMobile,
        mockData,
      )

      const selectParam = spec.layer[0].params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toEqual(intChartWithData)
    })

    it('should configure brush parameter with empty intChart', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        [],
        currentTheme,
        isMobile,
        mockData,
      )

      const brushParam = spec.layer[0].params.find((p: any) => p.name === 'brush')
      expect(brushParam).toBeDefined()
      expect(brushParam!.select.type).toBe('interval')
      expect(brushParam!.value).toBeUndefined()
    })

    it('should configure brush parameter with intChart data', (): void => {
      const intChartWithData: { [key: string]: string | number | Array<any> }[] = [
        { xValue: 10, yValue: 20 },
      ]
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        intChartWithData,
        currentTheme,
        isMobile,
        mockData,
      )

      const brushParam = spec.layer[0].params.find((p: any) => p.name === 'brush')
      expect(brushParam).toBeDefined()
      expect(brushParam!.value).toEqual({
        x: 10,
        y: 20,
      })
    })
  })

  describe('mark configuration', (): void => {
    it('should set filled to false when no sizeField', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer[0].mark.filled).toBe(false)
    })

    it('should set filled to true when sizeField is present', (): void => {
      const configWithSize = { ...mockConfig, sizeField: 'size' }
      const spec = createPointChartSpec(
        configWithSize,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer[0].mark.filled).toBe(true)
    })

    it('should use light theme color', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        'light',
        isMobile,
        mockData,
      )

      expect(spec.layer[0].mark.color).toBe(lightDefaultColor)
    })

    it('should use dark theme color', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        'dark',
        isMobile,
        mockData,
      )

      expect(spec.layer[0].mark.color).toBe(darkDefaultColor)
    })
  })

  describe('encoding configuration', (): void => {
    describe('helper function integration', (): void => {
      it('should call createFieldEncoding for x-axis with correct parameters', (): void => {
        createPointChartSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('xValue', mockColumns, {}, true, {
          scale: 'linear',
          zero: false,
        })
      })

      it('should call createFieldEncoding for y-axis with correct parameters', (): void => {
        createPointChartSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('yValue', mockColumns, {}, true, {
          scale: 'linear',
          zero: false,
        })
      })

      it('should call createColorEncoding with correct parameters', (): void => {
        createPointChartSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(createColorEncoding).toHaveBeenCalledWith(
          mockConfig,
          'category',
          mockColumns,
          isMobile,
          currentTheme,
          mockConfig.hideLegend,
          mockData,
        )
      })

      it('should call createSizeEncoding with correct parameters', (): void => {
        createPointChartSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(createSizeEncoding).toHaveBeenCalledWith(
          undefined,
          mockColumns,
          isMobile,
          mockConfig.hideLegend,
        )
      })

      it('should handle missing yField', (): void => {
        const configWithoutY = { ...mockConfig, yField: undefined }
        createPointChartSpec(
          configWithoutY,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('', mockColumns, {}, true, {
          scale: 'linear',
          zero: false,
        })
      })

      it('should pass scale parameters correctly', (): void => {
        const configWithScales = {
          ...mockConfig,
          scaleX: 'log',
          scaleY: 'sqrt',
        } as ChartConfig

        createPointChartSpec(
          configWithScales,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(createFieldEncoding).toHaveBeenCalledWith('xValue', mockColumns, {}, true, {
          scale: 'log',
          zero: false,
        })
        expect(createFieldEncoding).toHaveBeenCalledWith('yValue', mockColumns, {}, true, {
          scale: 'sqrt',
          zero: false,
        })
      })
    })

    describe('tooltip encoding', (): void => {
      it('should pass through tooltip fields', (): void => {
        const spec = createPointChartSpec(
          mockConfig,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(spec.layer[0].encoding.tooltip).toEqual(mockTooltipFields)
      })

      it('should handle empty tooltip fields', (): void => {
        const spec = createPointChartSpec(
          mockConfig,
          mockColumns,
          [],
          mockIntChart,
          currentTheme,
          isMobile,
          mockData,
        )

        expect(spec.layer[0].encoding.tooltip).toEqual([])
      })
    })
  })

  describe('annotation layer', (): void => {
    it('should not add annotation layer when annotationField is undefined', (): void => {
      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer).toHaveLength(1)
    })

    it('should add annotation layer when annotationField is defined and column exists', (): void => {
      const configWithAnnotation = { ...mockConfig, annotationField: 'annotation' }
      const spec = createPointChartSpec(
        configWithAnnotation,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer).toHaveLength(2)
      expect(spec.layer[1].mark.type).toBe('text')
    })

    it('should configure text mark correctly for annotations', (): void => {
      const configWithAnnotation = { ...mockConfig, annotationField: 'annotation' }
      const spec = createPointChartSpec(
        configWithAnnotation,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      const textLayer = spec.layer[1]
      expect(textLayer.mark.align).toBe('left')
      expect(textLayer.mark.baseline).toBe('middle')
      expect(textLayer.mark.dx).toBe(5)
      expect(textLayer.mark.fontSize).toBe(8)
    })

    it('should use light theme color for annotation text', (): void => {
      const configWithAnnotation = { ...mockConfig, annotationField: 'annotation' }
      const spec = createPointChartSpec(
        configWithAnnotation,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        'light',
        isMobile,
        mockData,
      )

      const textLayer = spec.layer[1]
      expect(textLayer.encoding.color.value).toBe('#333333')
    })

    it('should use dark theme color for annotation text', (): void => {
      const configWithAnnotation = { ...mockConfig, annotationField: 'annotation' }
      const spec = createPointChartSpec(
        configWithAnnotation,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        'dark',
        isMobile,
        mockData,
      )

      const textLayer = spec.layer[1]
      expect(textLayer.encoding.color.value).toBe('#dddddd')
    })

    it('should encode text field correctly', (): void => {
      const configWithAnnotation = { ...mockConfig, annotationField: 'annotation' }
      const spec = createPointChartSpec(
        configWithAnnotation,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      const textLayer = spec.layer[1]
      expect(textLayer.encoding.text.field).toBe('annotation')
      expect(textLayer.encoding.text.type).toBe('nominal')
    })

    it('should not add annotation layer when column does not exist', (): void => {
      const configWithInvalidAnnotation = { ...mockConfig, annotationField: 'nonexistent' }
      const spec = createPointChartSpec(
        configWithInvalidAnnotation,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(spec.layer).toHaveLength(1)
    })
  })

  describe('theme and mobile parameters', (): void => {
    it('should pass theme parameter to createColorEncoding', (): void => {
      const darkTheme = 'dark'
      createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        darkTheme,
        isMobile,
        mockData,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'category',
        mockColumns,
        isMobile,
        darkTheme,
        mockConfig.hideLegend,
        mockData,
      )
    })

    it('should pass mobile parameter to helper functions', (): void => {
      const mobileTrue = true
      createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        mobileTrue,
        mockData,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'category',
        mockColumns,
        mobileTrue,
        currentTheme,
        mockConfig.hideLegend,
        mockData,
      )
      expect(createSizeEncoding).toHaveBeenCalledWith(
        undefined,
        mockColumns,
        mobileTrue,
        mockConfig.hideLegend,
      )
    })
  })

  describe('data parameter', (): void => {
    it('should pass data parameter to createColorEncoding', (): void => {
      const testData: readonly Row[] = [
        { xValue: 1, yValue: 2, category: 'A' },
        { xValue: 3, yValue: 4, category: 'B' },
      ]

      createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        testData,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'category',
        mockColumns,
        isMobile,
        currentTheme,
        mockConfig.hideLegend,
        testData,
      )
    })

    it('should handle empty data array', (): void => {
      createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        [],
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'category',
        mockColumns,
        isMobile,
        currentTheme,
        mockConfig.hideLegend,
        [],
      )
    })
  })

  describe('hideLegend parameter', (): void => {
    it('should pass hideLegend parameter to encoding functions', (): void => {
      const configWithHiddenLegend = { ...mockConfig, hideLegend: true }
      createPointChartSpec(
        configWithHiddenLegend,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        configWithHiddenLegend,
        'category',
        mockColumns,
        isMobile,
        currentTheme,
        true,
        mockData,
      )
      expect(createSizeEncoding).toHaveBeenCalledWith(undefined, mockColumns, isMobile, true)
    })

    it('should handle undefined hideLegend', (): void => {
      const configWithoutHideLegend = { ...mockConfig, hideLegend: undefined }
      createPointChartSpec(
        configWithoutHideLegend,
        mockColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(createColorEncoding).toHaveBeenCalledWith(
        configWithoutHideLegend,
        'category',
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
      createPointChartSpec(
        mockConfig,
        emptyColumns,
        mockTooltipFields,
        mockIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      expect(createFieldEncoding).toHaveBeenCalledWith('xValue', emptyColumns, {}, true, {
        scale: 'linear',
        zero: false,
      })
      expect(createColorEncoding).toHaveBeenCalledWith(
        mockConfig,
        'category',
        emptyColumns,
        isMobile,
        currentTheme,
        mockConfig.hideLegend,
        mockData,
      )
    })

    it('should handle large intChart array', (): void => {
      const largeIntChart: { [key: string]: string | number | Array<any> }[] = Array.from(
        { length: 100 },
        (_, i) => ({
          xField: `x${i}`,
          yField: `y${i}`,
        }),
      )

      const spec = createPointChartSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        largeIntChart,
        currentTheme,
        isMobile,
        mockData,
      )

      const selectParam = spec.layer[0].params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toHaveLength(100)
    })
  })
})

describe('addLabelTransformToTextMarks', (): void => {
  describe('basic functionality', (): void => {
    it('should return spec unchanged when no marks exist', (): void => {
      const spec = { data: { values: [] } }
      const result = addLabelTransformToTextMarks(spec)

      expect(result).toEqual(spec)
    })

    it('should not mutate the original spec', (): void => {
      const spec = {
        marks: [{ type: 'text', encoding: {} }],
      }
      const originalSpec = JSON.parse(JSON.stringify(spec))
      addLabelTransformToTextMarks(spec)

      expect(spec).toEqual(originalSpec)
    })
  })

  describe('label transform addition', (): void => {
    it('should add default label transform to text marks', (): void => {
      const spec = {
        marks: [{ type: 'text', encoding: {} }],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toBeDefined()
      expect(result.marks![0].transform).toHaveLength(1)
      expect(result.marks![0].transform![0].type).toBe('label')
    })

    it('should add custom label transform when provided', (): void => {
      const customTransform = {
        type: 'label',
        anchor: ['top'],
        offset: [5],
        size: { signal: '[width, height]' },
      }
      const spec = {
        marks: [{ type: 'text', encoding: {} }],
      }
      const result = addLabelTransformToTextMarks(spec, customTransform)

      expect(result.marks![0].transform![0]).toEqual(customTransform)
    })

    it('should use default label transform properties', (): void => {
      const spec = {
        marks: [{ type: 'text', encoding: {} }],
      }
      const result = addLabelTransformToTextMarks(spec)

      const transform = result.marks![0].transform![0]
      expect(transform.type).toBe('label')
      expect(transform.anchor).toEqual(['right', 'left', 'top', 'bottom'])
      expect(transform.offset).toEqual([1])
      expect(transform.size).toEqual({ signal: '[width + 60, height]' })
    })

    it('should not add label transform if one already exists', (): void => {
      const existingTransform = {
        type: 'label',
        anchor: ['top'],
        offset: [10],
      }
      const spec = {
        marks: [
          {
            type: 'text',
            transform: [existingTransform],
            encoding: {},
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toHaveLength(1)
      expect(result.marks![0].transform![0]).toEqual(existingTransform)
    })

    it('should preserve existing non-label transforms', (): void => {
      const existingTransform = {
        type: 'filter',
        expr: 'datum.value > 0',
      }
      const spec = {
        marks: [
          {
            type: 'text',
            transform: [existingTransform],
            encoding: {},
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toHaveLength(2)
      expect(result.marks![0].transform![0]).toEqual(existingTransform)
      expect(result.marks![0].transform![1].type).toBe('label')
    })
  })

  describe('mark type filtering', (): void => {
    it('should only process text marks', (): void => {
      const spec = {
        marks: [
          { type: 'point', encoding: {} },
          { type: 'text', encoding: {} },
          { type: 'rect', encoding: {} },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toBeUndefined()
      expect(result.marks![1].transform).toBeDefined()
      expect(result.marks![2].transform).toBeUndefined()
    })

    it('should handle multiple text marks', (): void => {
      const spec = {
        marks: [
          { type: 'text', encoding: {} },
          { type: 'text', encoding: {} },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toBeDefined()
      expect(result.marks![1].transform).toBeDefined()
    })

    it('should preserve non-text mark properties', (): void => {
      const spec = {
        marks: [
          {
            type: 'point',
            name: 'points',
            encoding: { x: { field: 'x' } },
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0]).toEqual(spec.marks[0])
    })
  })

  describe('edge cases', (): void => {
    it('should handle empty marks array', (): void => {
      const spec = { marks: [] }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks).toEqual([])
    })

    it('should handle text mark with no existing transform property', (): void => {
      const spec = {
        marks: [{ type: 'text', encoding: {} }],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toBeDefined()
      expect(result.marks![0].transform).toHaveLength(1)
    })

    it('should handle text mark with empty transform array', (): void => {
      const spec = {
        marks: [
          {
            type: 'text',
            transform: [],
            encoding: {},
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toHaveLength(1)
      expect(result.marks![0].transform![0].type).toBe('label')
    })

    it('should handle complex nested spec structure', (): void => {
      const spec = {
        data: { values: [] },
        marks: [
          {
            type: 'text',
            name: 'labels',
            from: { data: 'table' },
            encode: {},
            transform: [{ type: 'filter', expr: 'true' }],
          },
        ],
        signals: [],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toHaveLength(2)
      expect(result.marks![0].name).toBe('labels')
      expect(result.marks![0].from).toEqual({ data: 'table' })
    })

    it('should handle marks with additional properties', (): void => {
      const spec = {
        marks: [
          {
            type: 'text',
            name: 'custom',
            role: 'annotation',
            zindex: 1,
            encoding: {},
            custom_prop: 'value',
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].name).toBe('custom')
      expect(result.marks![0].role).toBe('annotation')
      expect(result.marks![0].zindex).toBe(1)
      expect((result.marks![0] as any).custom_prop).toBe('value')
      expect(result.marks![0].transform).toBeDefined()
    })
  })

  describe('transform array handling', (): void => {
    it('should clone existing transform array', (): void => {
      const originalTransform = { type: 'filter', expr: 'datum.x > 0' }
      const spec = {
        marks: [
          {
            type: 'text',
            transform: [originalTransform],
            encoding: {},
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      // Verify the original transform array wasn't mutated
      expect(spec.marks[0].transform).toHaveLength(1)
      expect(result.marks![0].transform).toHaveLength(2)
    })

    it('should handle multiple existing transforms', (): void => {
      const spec = {
        marks: [
          {
            type: 'text',
            transform: [
              { type: 'filter', expr: 'datum.x > 0' },
              { type: 'formula', as: 'calculated', expr: 'datum.x * 2' },
            ],
            encoding: {},
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toHaveLength(3)
      expect(result.marks![0].transform![0].type).toBe('filter')
      expect(result.marks![0].transform![1].type).toBe('formula')
      expect(result.marks![0].transform![2].type).toBe('label')
    })

    it('should append label transform to end of transform array', (): void => {
      const spec = {
        marks: [
          {
            type: 'text',
            transform: [
              { type: 'filter', expr: 'true' },
              { type: 'formula', as: 'value', expr: 'datum.x' },
            ],
            encoding: {},
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      const transforms = result.marks![0].transform!
      expect(transforms[transforms.length - 1].type).toBe('label')
    })
  })

  describe('mixed mark types', (): void => {
    it('should handle spec with various mark types', (): void => {
      const spec = {
        marks: [
          { type: 'rect', encoding: {} },
          { type: 'text', encoding: {} },
          { type: 'line', encoding: {} },
          { type: 'text', encoding: {} },
          { type: 'point', encoding: {} },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].transform).toBeUndefined()
      expect(result.marks![1].transform).toBeDefined()
      expect(result.marks![2].transform).toBeUndefined()
      expect(result.marks![3].transform).toBeDefined()
      expect(result.marks![4].transform).toBeUndefined()
    })

    it('should preserve order of marks', (): void => {
      const spec = {
        marks: [
          { type: 'point', name: 'first' },
          { type: 'text', name: 'second' },
          { type: 'rect', name: 'third' },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].name).toBe('first')
      expect(result.marks![1].name).toBe('second')
      expect(result.marks![2].name).toBe('third')
    })
  })

  describe('deep cloning', (): void => {
    it('should deep clone the spec', (): void => {
      const spec = {
        marks: [
          {
            type: 'text',
            encoding: {
              x: { field: 'x', type: 'quantitative' },
              y: { field: 'y', type: 'quantitative' },
            },
          },
        ],
        config: {
          mark: { color: 'blue' },
        },
      }
      const result = addLabelTransformToTextMarks(spec)

      // Modify the result
      result.config!.mark!.color = 'red'

      // Original should be unchanged
      expect((spec.config as any).mark.color).toBe('blue')
    })

    it('should handle nested objects in marks', (): void => {
      const spec = {
        marks: [
          {
            type: 'text',
            encoding: {
              text: {
                field: 'label',
                type: 'nominal',
              },
              color: {
                field: 'category',
                type: 'nominal',
                scale: {
                  domain: ['A', 'B'],
                  range: ['red', 'blue'],
                },
              },
            },
          },
        ],
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.marks![0].encoding).toEqual(spec.marks[0].encoding)
      expect(result.marks![0].transform).toBeDefined()
    })
  })

  describe('return value validation', (): void => {
    it('should return a valid VegaSpec structure', (): void => {
      const spec = {
        marks: [{ type: 'text', encoding: {} }],
        data: { values: [] },
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result).toHaveProperty('marks')
      expect(result).toHaveProperty('data')
      expect(Array.isArray(result.marks)).toBe(true)
    })

    it('should maintain spec structure with no text marks', (): void => {
      const spec = {
        marks: [
          { type: 'point', encoding: {} },
          { type: 'line', encoding: {} },
        ],
        width: 400,
        height: 300,
      }
      const result = addLabelTransformToTextMarks(spec)

      expect(result.width).toBe(400)
      expect(result.height).toBe(300)
      expect(result.marks).toHaveLength(2)
    })
  })
})
