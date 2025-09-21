import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import { createHeadlineSpec } from './headlineSpec'
import { type Row, type ResultColumn, type ChartConfig } from '../editors/results'

// Type the mocked functions properly
interface MockedFormatting {
  snakeCaseToCapitalizedWords: MockedFunction<(str: string) => string>
}

// Mock the essential helper functions
vi.mock(
  './formatting',
  (): MockedFormatting => ({
    snakeCaseToCapitalizedWords: vi.fn((str: string): string =>
      str.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
    ),
  }),
)

// Type for the theme parameter
type Theme = 'light' | 'dark'

describe('createHeadlineSpec', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockData: Row[]
  let mockConfig: ChartConfig
  let mockIntChart: { [key: string]: string | number | Array<any> }[]

  beforeEach((): void => {
    mockColumns = new Map<string, ResultColumn>([
      ['revenue', { name: 'revenue', type: 'number', format: '.2s' } as ResultColumn],
      ['profit', { name: 'profit', type: 'number', format: '.2f' } as ResultColumn],
      ['users', { name: 'users', type: 'number', format: '.0f' } as ResultColumn],
      ['name', { name: 'name', type: 'string' } as ResultColumn],
    ])

    mockData = [
      {
        revenue: 1000000,
        profit: 250000,
        users: 15000,
        name: 'Q4 2024',
      } as Row,
    ]

    mockConfig = {
      hideLegend: false,
    } as ChartConfig

    mockIntChart = []
  })

  describe('basic functionality', (): void => {
    it('should create a valid vega-lite spec', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      expect(spec).toHaveProperty('$schema', 'https://vega.github.io/schema/vega-lite/v6.json')
      expect(spec).toHaveProperty('description', 'A simple headline metric display')
      expect(spec).toHaveProperty('width', 'container')
      expect(spec).toHaveProperty('height', 'container')
      expect(spec).toHaveProperty('data.values', mockData)
      expect(spec).toHaveProperty('layer')
    })

    it('should include all columns with data', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Should have 8 layers (2 per column: value + label) for 4 columns
      expect(spec.layer).toHaveLength(8)

      // Check that layers include filters for the data
      const layersWithFilters = spec.layer.filter((layer: any) => layer.transform?.[0]?.filter)
      expect(layersWithFilters.length).toBeGreaterThan(0)
    })

    it('should handle empty data', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        null,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      expect(spec.data.values).toEqual([])
      expect(spec.layer).toHaveLength(4) // Creates label layers only when no data
    })

    it('should handle empty columns', (): void => {
      const emptyColumns = new Map<string, ResultColumn>()
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        emptyColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      expect(spec.layer).toHaveLength(0)
    })

    it('should respect hideLegend config', (): void => {
      const configWithHiddenLegend = { ...mockConfig, hideLegend: true }
      const spec = createHeadlineSpec(
        configWithHiddenLegend,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // When hideLegend is true, should only have value layers (no label layers)
      expect(spec.layer).toHaveLength(4) // Only value layers, no labels
    })
  })

  describe('desktop layout (isMobile: false)', (): void => {
    it('should distribute elements horizontally', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Check that dx is used for horizontal positioning
      const layersWithDx = spec.layer.filter(
        (layer: any) => layer.mark.dx && typeof layer.mark.dx === 'object',
      )
      expect(layersWithDx.length).toBeGreaterThan(0)

      // Check that dy is fixed (not expression-based) for desktop
      const layersWithFixedDy = spec.layer.filter(
        (layer: any) => typeof layer.mark.dy === 'number' || layer.mark.dy === 0,
      )
      expect(layersWithFixedDy.length).toBeGreaterThan(0)
    })

    it('should use width-based font sizing for desktop', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      const fontSizeExpressions: (string | undefined)[] = spec.layer
        .map((layer: any) => layer.mark.fontSize?.expr)
        .filter(Boolean)

      fontSizeExpressions.forEach((expr: string | undefined): void => {
        expect(expr).toContain('width')
        expect(expr).not.toContain('height')
      })
    })

    it('should center single metric horizontally', (): void => {
      const singleColumn = new Map<string, ResultColumn>([
        ['revenue', { name: 'revenue', type: 'number' } as ResultColumn],
      ])
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        singleColumn,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Single metric should have centered positioning
      const layersWithDx = spec.layer.filter(
        (layer: any) => layer.mark.dx && typeof layer.mark.dx === 'object',
      )
      layersWithDx.forEach((layer: any): void => {
        expect(layer.mark.dx.expr).toContain('(0 / 100)')
      })
    })
  })

  describe('mobile layout (isMobile: true)', (): void => {
    it('should distribute elements vertically', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        true,
        mockIntChart,
      )

      // Check that dy uses height-based expressions
      const layersWithDyExpr = spec.layer.filter(
        (layer: any) =>
          layer.mark.dy && typeof layer.mark.dy === 'object' && 'expr' in layer.mark.dy,
      )
      expect(layersWithDyExpr.length).toBeGreaterThan(0)

      // Check that dx is 0 (no horizontal offset)
      const layersWithZeroDx = spec.layer.filter((layer: any) => layer.mark.dx === 0)
      expect(layersWithZeroDx.length).toBeGreaterThan(0)
    })

    it('should use height-based font sizing for mobile', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        true,
        mockIntChart,
      )

      const fontSizeExpressions: (string | undefined)[] = spec.layer
        .map((layer: any) => layer.mark.fontSize?.expr)
        .filter(Boolean)

      fontSizeExpressions.forEach((expr: string | undefined): void => {
        expect(expr).toContain('height')
        expect(expr).not.toContain('width')
      })
    })

    it('should center single metric vertically', (): void => {
      const singleColumn = new Map<string, ResultColumn>([
        ['revenue', { name: 'revenue', type: 'number' } as ResultColumn],
      ])
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        singleColumn,
        'light' as Theme,
        true,
        mockIntChart,
      )

      // Single metric should have centered positioning
      const layersWithDy = spec.layer.filter(
        (layer: any) => layer.mark.dy && typeof layer.mark.dy === 'object',
      )
      layersWithDy.forEach((layer: any): void => {
        expect(layer.mark.dy.expr).toContain('(0 / 100)')
      })
    })

    it('should use smaller font sizes for mobile', (): void => {
      const mobileSpec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        true,
        mockIntChart,
      )
      const desktopSpec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Mobile should have smaller max font sizes
      const mobileFontExpr: string = (mobileSpec.layer[0] as any).mark.fontSize?.expr || ''
      const desktopFontExpr: string = (desktopSpec.layer[0] as any).mark.fontSize?.expr || ''

      expect(mobileFontExpr).toContain('min(32')
      expect(desktopFontExpr).toContain('min(40')
    })
  })

  describe('theming', (): void => {
    it('should apply light theme colors', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      const valueColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 0) // Value layers (even indices)
        .filter((layer: any) => layer.encoding?.color?.value) // Only layers with direct color values
        .map((layer: any) => layer.encoding.color!.value)

      const labelColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 1) // Label layers (odd indices)
        .map((layer: any) => layer.encoding.color!.value)

      valueColors.forEach((color: string): void => expect(color).toBe('#262626'))
      labelColors.forEach((color: string): void => expect(color).toBe('#595959'))
    })

    it('should apply dark theme colors', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'dark' as Theme,
        false,
        mockIntChart,
      )

      const valueColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 0) // Value layers (even indices)
        .filter((layer: any) => layer.encoding?.color?.value) // Only layers with direct color values
        .map((layer: any) => layer.encoding.color!.value)

      const labelColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 1) // Label layers (odd indices)
        .map((layer: any) => layer.encoding.color!.value)

      valueColors.forEach((color: string): void => expect(color).toBe('#f0f0f0'))
      labelColors.forEach((color: string): void => expect(color).toBe('#d1d1d1'))
    })
  })

  describe('text formatting', (): void => {
    it('should format labels with capitalized words', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      const labelLayers = spec.layer.filter(
        (layer: any) =>
          layer.encoding?.text?.value && typeof layer.encoding.text.value === 'string',
      )

      expect(labelLayers).toHaveLength(4)
      expect(labelLayers.map((l: any) => l.encoding.text!.value)).toEqual([
        'Revenue',
        'Profit',
        'Users',
        'Name',
      ])
    })
  })

  describe('responsive font scaling', (): void => {
    it('should scale font size based on number of metrics and data rows', (): void => {
      const twoColumns = new Map<string, ResultColumn>([
        ['revenue', { name: 'revenue', type: 'number' } as ResultColumn],
        ['profit', { name: 'profit', type: 'number' } as ResultColumn],
      ])

      const multiRowData = [
        { revenue: 1000000, profit: 250000 } as Row,
        { revenue: 2000000, profit: 500000 } as Row,
      ]

      const smallSpec = createHeadlineSpec(
        mockConfig,
        mockData,
        twoColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )
      const largeSpec = createHeadlineSpec(
        mockConfig,
        multiRowData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Different sizes should result in different divisors in font size calculation
      const smallFontExpr: string = (smallSpec.layer[0] as any).mark.fontSize?.expr || ''
      const largeFontExpr: string = (largeSpec.layer[0] as any).mark.fontSize?.expr || ''

      // Font size should be based on total number of elements (columns * rows)
      expect(smallFontExpr).toBeDefined()
      expect(largeFontExpr).toBeDefined()
      expect(smallFontExpr).not.toEqual(largeFontExpr)
    })
  })

  describe('layer structure', (): void => {
    it('should create value and label layers for each metric when labels are enabled', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Should have pairs of layers: value + label for each column
      expect(spec.layer).toHaveLength(8) // 4 columns * 2 layers each

      // Check that we have both value and label layers
      const valueLayers = spec.layer.filter((layer: any) => layer.encoding?.text?.field)
      const labelLayers = spec.layer.filter((layer: any) => layer.encoding?.text?.value)

      expect(valueLayers).toHaveLength(4)
      expect(labelLayers).toHaveLength(4)
    })

    it('should maintain consistent text alignment', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      spec.layer.forEach((layer: any): void => {
        expect(layer.mark.align).toBe('center')
      })
    })

    it('should include proper transform filters for data filtering', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      const layersWithTransforms = spec.layer.filter((layer: any) => layer.transform?.[0]?.filter)
      expect(layersWithTransforms.length).toBeGreaterThan(0)

      // Each transform should filter based on the data value
      layersWithTransforms.forEach((layer: any): void => {
        expect(layer.transform[0].filter).toContain('datum.')
        expect(layer.transform[0].filter).toContain('===')
      })
    })

    it('should include interaction parameters for highlighting', (): void => {
      const spec = createHeadlineSpec(
        mockConfig,
        mockData,
        mockColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      const layersWithParams = spec.layer.filter((layer: any) => layer.params)
      expect(layersWithParams.length).toBeGreaterThan(0)

      layersWithParams.forEach((layer: any): void => {
        expect(layer.params).toHaveLength(2)
        expect(layer.params[0]).toHaveProperty('name')
        expect(layer.params[0].name).toContain('highlight_')
        expect(layer.params[1]).toHaveProperty('name')
        expect(layer.params[1].name).toContain('select_')
      })
    })
  })

  describe('image column handling', (): void => {
    it('should handle image columns differently', (): void => {
      const imageColumns = new Map<string, ResultColumn>([
        ['image', { name: 'image', type: 'string', traits: ['url_image'] } as ResultColumn],
      ])

      const imageData = [{ image: 'https://example.com/image.jpg' } as Row]

      const spec = createHeadlineSpec(
        mockConfig,
        imageData,
        imageColumns,
        'light' as Theme,
        false,
        mockIntChart,
      )

      // Should have image mark type for image columns
      const imageLayers = spec.layer.filter((layer: any) => layer.mark.type === 'image')
      expect(imageLayers.length).toBeGreaterThan(0)

      // Image layers should have url encoding instead of text
      imageLayers.forEach((layer: any): void => {
        expect(layer.encoding).toHaveProperty('url')
        expect(layer.encoding).not.toHaveProperty('text')
      })
    })
  })
})
