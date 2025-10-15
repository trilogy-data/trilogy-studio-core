import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { createBeeSwarmSpec } from './beeSwarmSpec'
import { type ResultColumn, type ChartConfig, ColumnType } from '../editors/results'
import { getFormatHint, createFieldEncoding, createInteractionEncodings } from './helpers'

// Mock the helper functions
vi.mock('./helpers', () => ({
  getFormatHint: vi.fn(),
  createFieldEncoding: vi.fn(),
  createInteractionEncodings: vi.fn(),
}))

describe('createBeeSwarmSpec', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockConfig: ChartConfig
  let mockTooltipFields: any[]
  let mockEncoding: any
  let mockSelectedValues: { [key: string]: string | number | Array<any> }[]
  let mockData: readonly Record<string, any>[]
  let currentTheme: string
  let isMobile: boolean
  let containerHeight: number
  let containerWidth: number

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
        'annotation',
        {
          name: 'annotation',
          type: ColumnType.STRING,
          description: 'Item Name',
        } as ResultColumn,
      ],
      [
        'color',
        {
          name: 'color',
          type: ColumnType.STRING,
          description: 'Product Color',
        } as ResultColumn,
      ],
      [
        'size',
        {
          name: 'size',
          type: ColumnType.NUMBER,
          format: '.2f',
          description: 'Item Size',
        } as ResultColumn,
      ],
    ])

    mockConfig = {
      chartType: 'beeswarm',
      xField: 'category',
      annotationField: 'annotation',
      colorField: 'color',
      sizeField: 'size',
    } as ChartConfig

    mockTooltipFields = [
      { field: 'category', type: 'nominal' },
      { field: 'annotation', type: 'nominal' },
    ]

    mockEncoding = {}
    mockSelectedValues = []
    mockData = [
      { category: 'A', annotation: 'Item 1', color: 'Red', size: 10 },
      { category: 'B', annotation: 'Item 2', color: 'Blue', size: 20 },
      { category: 'A', annotation: 'Item 3', color: 'Green', size: 15 },
    ]
    currentTheme = 'light'
    isMobile = false
    containerHeight = 400
    containerWidth = 600

    // Reset mocks
    vi.clearAllMocks()

    // Setup default mock returns
    ;(getFormatHint as Mock).mockReturnValue('.2f')
    ;(createFieldEncoding as Mock).mockReturnValue({
      field: 'test',
      type: 'nominal',
      title: 'Test Field',
    })
    ;(createInteractionEncodings as Mock).mockReturnValue({})
  })

  describe('basic functionality', (): void => {
    it('should create a valid Vega spec with required properties', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toHaveProperty('$schema')
      expect(spec).toHaveProperty('width')
      expect(spec).toHaveProperty('height')
      expect(spec).toHaveProperty('data')
      expect(spec).toHaveProperty('signals')
      expect(spec).toHaveProperty('scales')
      expect(spec).toHaveProperty('axes')
      expect(spec).toHaveProperty('marks')
    })

    it('should use correct Vega schema', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.$schema).toBe('https://vega.github.io/schema/vega/v6.json')
    })

    it('should set container dimensions', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.width).toBe(600)
      expect(spec.height).toBe(400)
    })

    it('should set padding', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.padding).toBe(5)
    })
  })

  describe('data configuration', (): void => {
    it('should include base data with provided values', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.data).toHaveLength(1)
      expect(spec.data[0].name).toBe('base')
      expect(spec.data[0].values).toEqual(mockData)
    })

    it('should handle empty data array', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        [],
        containerHeight,
        containerWidth,
      )

      expect(spec.data[0].values).toEqual([])
    })

    it('should handle large data arrays', (): void => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        category: `Cat${i % 10}`,
        annotation: `Item ${i}`,
        color: `Color${i % 5}`,
        size: i,
      }))

      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        largeData,
        containerHeight,
        containerWidth,
      )

      expect(spec.data[0].values).toHaveLength(1000)
    })
  })

  describe('signals configuration', (): void => {
    it('should include highlight and select signals', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.signals).toHaveLength(2)
      expect(spec.signals[0].name).toBe('highlight')
      expect(spec.signals[1].name).toBe('select')
    })

    it('should configure highlight signal correctly', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const highlightSignal = spec.signals.find((s: any) => s.name === 'highlight')
      expect(highlightSignal).toBeDefined()
      expect(highlightSignal!.value).toEqual({})
      expect(highlightSignal!.on).toHaveLength(2)
      expect(highlightSignal!.on[0].events).toBe('@nodes:mouseover')
      expect(highlightSignal!.on[0].update).toBe('datum')
      expect(highlightSignal!.on[1].events).toBe('@nodes:mouseout')
      expect(highlightSignal!.on[1].update).toBe('{}')
    })

    it('should configure select signal with provided values', (): void => {
      const selectedValues = [{ category: 'A' }]
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        selectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const selectSignal = spec.signals.find((s: any) => s.name === 'select')
      expect(selectSignal).toBeDefined()
      expect(selectSignal!.value).toEqual(selectedValues)
    })

    it('should handle empty selectedValues', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        [],
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const selectSignal = spec.signals.find((s: any) => s.name === 'select')
      expect(selectSignal).toBeDefined()
      expect(selectSignal!.value).toEqual([])
    })
  })

  describe('scales configuration', (): void => {
    it('should include xscale and color scales', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const scaleNames = spec.scales.map((s: any) => s.name)
      expect(scaleNames).toContain('xscale')
      expect(scaleNames).toContain('color')
    })

    it('should configure xscale as band scale', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const xscale = spec.scales.find((s: any) => s.name === 'xscale')
      expect(xscale).toBeDefined()
      expect(xscale!.type).toBe('band')
      expect(xscale!.domain.data).toBe('base')
      expect(xscale!.domain.field).toBe('category')
      expect(xscale!.domain.sort).toBe(true)
      expect(xscale!.range).toBe('width')
    })

    it('should configure color scale as ordinal', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const colorScale = spec.scales.find((s: any) => s.name === 'color')
      expect(colorScale).toBeDefined()
      expect(colorScale!.type).toBe('ordinal')
      expect(colorScale!.domain.data).toBe('base')
      expect(colorScale!.domain.field).toBe('color')
      expect(colorScale!.range.scheme).toBe('category20c')
    })

    it('should include size scale when sizeField is provided', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const sizeScale = spec.scales.find((s: any) => s.name === 'size')
      expect(sizeScale).toBeDefined()
      expect(sizeScale!.type).toBe('linear')
      expect(sizeScale!.zero).toBe(false)
    })

    it('should not include size scale when sizeField is not provided', (): void => {
      const configWithoutSize = { ...mockConfig, sizeField: undefined }
      const spec = createBeeSwarmSpec(
        configWithoutSize,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const sizeScale = spec.scales.find((s: any) => s.name === 'size')
      expect(sizeScale).toBeUndefined()
    })

    it('should calculate size scale domain from data', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const sizeScale = spec.scales.find((s: any) => s.name === 'size')
      expect(sizeScale!.domain).toEqual([10, 20])
    })

    it('should calculate size scale range with scaling factor', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const sizeScale = spec.scales.find((s: any) => s.name === 'size')
      expect(sizeScale!.range).toBeDefined()
      expect(Array.isArray(sizeScale!.range)).toBe(true)
      expect(sizeScale!.range.length).toBe(2)
    })
  })

  describe('axes configuration', (): void => {
    it('should include bottom axis', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.axes).toHaveLength(1)
      expect(spec.axes[0].orient).toBe('bottom')
      expect(spec.axes[0].scale).toBe('xscale')
    })
  })

  describe('marks configuration', (): void => {
    it('should include nodes mark', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.marks).toHaveLength(1)
      expect(spec.marks[0].name).toBe('nodes')
      expect(spec.marks[0].type).toBe('symbol')
      expect(spec.marks[0].from.data).toBe('base')
    })

    it('should configure enter encoding', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const enter = spec.marks[0].encode.enter
      expect(enter.fill.scale).toBe('color')
      expect(enter.fill.field).toBe('color')
      expect(enter.xfocus.scale).toBe('xscale')
      expect(enter.xfocus.field).toBe('category')
      expect(enter.xfocus.band).toBe(0.5)
      expect(enter.yfocus.value).toBe(50)
      expect(enter.tooltip).toBeDefined()
    })

    it('should configure update encoding with selection test', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const update = spec.marks[0].encode.update
      expect(update.fillOpacity).toBeDefined()
      expect(update.stroke).toEqual({ value: 'white' })
      expect(update.strokeWidth).toBeDefined()
      expect(update.zindex).toEqual({ value: 0 })
    })

    it('should configure hover encoding', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const hover = spec.marks[0].encode.hover
      expect(hover.stroke).toEqual({ value: 'blue' })
      expect(hover.strokeWidth).toEqual({ value: 1 })
      expect(hover.zindex).toEqual({ value: 1 })
    })

    it('should include force transform', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec.marks[0].transform).toBeDefined()
      expect(spec.marks[0].transform).toHaveLength(1)
      expect(spec.marks[0].transform[0].type).toBe('force')
      expect(spec.marks[0].transform[0].static).toBe(true)
    })

    it('should configure force transform with correct forces', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const forces = spec.marks[0].transform[0].forces
      expect(forces).toHaveLength(3)
      expect(forces[0].force).toBe('collide')
      expect(forces[1].force).toBe('x')
      expect(forces[2].force).toBe('y')
    })
  })

  describe('tooltip configuration', (): void => {
    it('should include all relevant fields in tooltip', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const tooltipSignal = spec.marks[0].encode.enter.tooltip.signal
      expect(tooltipSignal).toContain('category')
      expect(tooltipSignal).toContain('annotation')
      expect(tooltipSignal).toContain('color')
      expect(tooltipSignal).toContain('size')
    })

    it('should handle tooltip without optional fields', (): void => {
      const configWithoutOptional = {
        ...mockConfig,
        colorField: undefined,
        sizeField: undefined,
      }
      const spec = createBeeSwarmSpec(
        configWithoutOptional,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const tooltipSignal = spec.marks[0].encode.enter.tooltip.signal
      expect(tooltipSignal).toContain('category')
      expect(tooltipSignal).toContain('annotation')
    })
  })

  describe('selection handling', (): void => {
    it('should create selection test with empty selectedValues', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        [],
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const fillOpacity = spec.marks[0].encode.update.fillOpacity
      expect(fillOpacity[0].test).toBe('true')
    })

    it('should create selection test with single selection', (): void => {
      const selectedValues = [{ category: 'A' }]
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        selectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const fillOpacity = spec.marks[0].encode.update.fillOpacity
      expect(fillOpacity[0].test).toContain('datum.category')
    })

    it('should create selection test with multiple selections', (): void => {
      const selectedValues = [{ category: 'A' }, { category: 'B' }]
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        selectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const fillOpacity = spec.marks[0].encode.update.fillOpacity
      expect(fillOpacity[0].test).toContain('||')
    })

    it('should handle array values in selection', (): void => {
      const selectedValues = [{ category: ['A', 'B'] }]
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        selectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const fillOpacity = spec.marks[0].encode.update.fillOpacity
      expect(fillOpacity[0].test).toContain('indexof')
    })

    it('should apply opacity based on selection', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const fillOpacity = spec.marks[0].encode.update.fillOpacity
      expect(fillOpacity).toHaveLength(2)
      expect(fillOpacity[0].value).toBe(1)
      expect(fillOpacity[1].value).toBe(0.3)
    })
  })

  describe('scaling factor calculations', (): void => {
    it('should use scaling factor of 1 for small datasets', (): void => {
      const smallData = Array.from({ length: 50 }, (_, i) => ({
        category: `Cat${i}`,
        annotation: `Item ${i}`,
        color: 'Blue',
        size: 10,
      }))

      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        smallData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
      expect(spec.marks[0].transform[0].iterations).toBe(400)
    })

    it('should apply scaling factor for large datasets', (): void => {
      const largeData = Array.from({ length: 500 }, (_, i) => ({
        category: `Cat${i % 10}`,
        annotation: `Item ${i}`,
        color: 'Blue',
        size: 10,
      }))

      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        largeData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
      expect(spec.marks[0].transform[0].iterations).toBeLessThan(400)
    })

    it('should scale force iterations based on data count', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const iterations = spec.marks[0].transform[0].iterations
      expect(iterations).toBeGreaterThan(0)
      expect(typeof iterations).toBe('number')
    })
  })

  describe('size encoding', (): void => {
    it('should use size scale when sizeField is provided', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const sizeEncoding = spec.marks[0].encode.update.size
      expect(sizeEncoding.scale).toBe('size')
      expect(sizeEncoding.field).toBe('size')
    })

    it('should use fixed size when sizeField is not provided', (): void => {
      const configWithoutSize = { ...mockConfig, sizeField: undefined }
      const spec = createBeeSwarmSpec(
        configWithoutSize,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const sizeEncoding = spec.marks[0].encode.update.size
      expect(sizeEncoding.value).toBeDefined()
      expect(typeof sizeEncoding.value).toBe('number')
    })
  })

  describe('collide radius configuration', (): void => {
    it('should use expression for collide radius when sizeField is provided', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const collideForce = spec.marks[0].transform[0].forces.find((f: any) => f.force === 'collide')
      expect(collideForce.radius.expr).toBe('sqrt(datum.size) / 2')
    })

    it('should use fixed collide radius when sizeField is not provided', (): void => {
      const configWithoutSize = { ...mockConfig, sizeField: undefined }
      const spec = createBeeSwarmSpec(
        configWithoutSize,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const collideForce = spec.marks[0].transform[0].forces.find((f: any) => f.force === 'collide')
      expect(typeof collideForce.radius).toBe('number')
    })
  })

  describe('theme parameter', (): void => {
    it('should accept light theme', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        'light',
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should accept dark theme', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        'dark',
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should accept empty theme string', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        '',
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })
  })

  describe('mobile parameter', (): void => {
    it('should handle mobile true', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        true,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should handle mobile false', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        false,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })
  })

  describe('edge cases', (): void => {
    it('should handle empty columns map', (): void => {
      const emptyColumns = new Map<string, ResultColumn>()
      const spec = createBeeSwarmSpec(
        mockConfig,
        emptyColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should handle missing xField', (): void => {
      const configWithoutX = { ...mockConfig, xField: undefined }
      const spec = createBeeSwarmSpec(
        configWithoutX,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should handle missing annotationField', (): void => {
      const configWithoutAnnotation = { ...mockConfig, annotationField: undefined }
      const spec = createBeeSwarmSpec(
        configWithoutAnnotation,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should handle missing colorField', (): void => {
      const configWithoutColor = { ...mockConfig, colorField: undefined }
      const spec = createBeeSwarmSpec(
        configWithoutColor,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should handle null values in size field', (): void => {
      const dataWithNulls = [
        { category: 'A', annotation: 'Item 1', color: 'Red', size: null },
        { category: 'B', annotation: 'Item 2', color: 'Blue', size: 20 },
      ]

      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        dataWithNulls,
        containerHeight,
        containerWidth,
      )

      expect(spec).toBeDefined()
    })

    it('should handle very small container dimensions', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        100,
        100,
      )

      expect(spec.width).toBe(100)
      expect(spec.height).toBe(100)
    })

    it('should handle very large container dimensions', (): void => {
      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        mockSelectedValues,
        currentTheme,
        mockData,
        2000,
        2000,
      )

      expect(spec.width).toBe(2000)
      expect(spec.height).toBe(2000)
    })

    it('should handle complex multi-field selections', (): void => {
      const complexSelection = [
        { category: 'A', color: 'Red' },
        { category: 'B', color: 'Blue' },
      ]

      const spec = createBeeSwarmSpec(
        mockConfig,
        mockColumns,
        mockTooltipFields,
        mockEncoding,
        isMobile,
        complexSelection,
        currentTheme,
        mockData,
        containerHeight,
        containerWidth,
      )

      const fillOpacity = spec.marks[0].encode.update.fillOpacity
      expect(fillOpacity[0].test).toContain('&&')
    })
  })
})