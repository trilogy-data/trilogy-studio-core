import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import { createHeadlineSpec } from './headlineSpec'
import { type Row, type ResultColumn } from '../editors/results'

// Type the mocked functions properly
interface MockedFormatting {
  snakeCaseToCapitalizedWords: MockedFunction<(str: string) => string>
}

interface MockedHelpers {
  isNumericColumn: MockedFunction<(column: ResultColumn) => boolean>
  getColumnFormat: MockedFunction<(column: string, columns: Map<string, ResultColumn>) => string>
}

// Mock only the essential helper functions
vi.mock(
  './formatting',
  (): MockedFormatting => ({
    snakeCaseToCapitalizedWords: vi.fn((str: string): string =>
      str.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
    ),
  }),
)

vi.mock(
  './helpers',
  (): MockedHelpers => ({
    isNumericColumn: vi.fn((column: ResultColumn): boolean => column.type === 'number'),
    //@ts-ignore
    getColumnFormat: vi.fn((column: string, columns: Map<string, ResultColumn>): string => {
      return '.2f'
    }),
  }),
)

// Type for the theme parameter
type Theme = 'light' | 'dark'

describe('createHeadlineSpec', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockData: Row[]

  beforeEach((): void => {
    mockColumns = new Map<string, ResultColumn>([
      ['revenue', { name: 'revenue', type: 'number', format: '.2s' } as ResultColumn],
      ['profit', { name: 'profit', type: 'number', format: '.2f' } as ResultColumn],
      ['users', { name: 'users', type: 'number', format: '.0f' } as ResultColumn],
      ['name', { name: 'name', type: 'string' } as ResultColumn], // Non-numeric column
    ])

    mockData = [
      {
        revenue: 1000000,
        profit: 250000,
        users: 15000,
        name: 'Q4 2024',
      } as Row,
    ]
  })

  describe('basic functionality', (): void => {
    it('should create a valid vega-lite spec', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme)

      expect(spec).toHaveProperty('$schema', 'https://vega.github.io/schema/vega-lite/v6.json')
      expect(spec).toHaveProperty('description', 'A simple headline metric display')
      expect(spec).toHaveProperty('width', 'container')
      expect(spec).toHaveProperty('height', 'container')
      expect(spec).toHaveProperty('data.values', mockData[0])
      expect(spec).toHaveProperty('layer')
    })

    it('should only include numeric columns', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme)

      // Should have 6 layers (2 per numeric column: value + label)
      expect(spec.layer).toHaveLength(6)

      // Check that all layers are for numeric columns
      const textFields: (string | undefined)[] = spec.layer
        .filter((layer: any) => layer.encoding?.text?.field)
        .map((layer: any) => layer.encoding.text!.field)

      expect(textFields).toEqual(['revenue', 'profit', 'users'])
    })

    it('should handle empty data', (): void => {
      const spec = createHeadlineSpec(null, mockColumns, 'light' as Theme)

      expect(spec.data.values).toEqual([])
      expect(spec.layer).toHaveLength(6) // Still creates layers for columns
    })

    it('should handle empty columns', (): void => {
      const emptyColumns = new Map<string, ResultColumn>()
      const spec = createHeadlineSpec(mockData, emptyColumns, 'light' as Theme)

      expect(spec.layer).toHaveLength(0)
    })
  })

  describe('desktop layout (isMobile: false)', (): void => {
    it('should distribute elements horizontally', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme, false)

      // Check that dx is used for horizontal positioning
      const layersWithDx = spec.layer.filter((layer: any) => layer.mark.dx)
      expect(layersWithDx.length).toBeGreaterThan(0)

      // Check that dy is fixed (not expression-based)
      const layersWithFixedDy = spec.layer.filter((layer: any) => typeof layer.mark.dy === 'number')
      expect(layersWithFixedDy).toHaveLength(6)
    })

    it('should use width-based font sizing for desktop', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme, false)

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
      const spec = createHeadlineSpec(mockData, singleColumn, 'light' as Theme, false)

      // Single metric should have dx: 0 (centered)
      spec.layer.forEach((layer: any): void => {
        if (layer.mark.dx && typeof layer.mark.dx === 'object') {
          expect(layer.mark.dx.expr).toContain('(0 / 100)')
        }
      })
    })
  })

  describe('mobile layout (isMobile: true)', (): void => {
    it('should distribute elements vertically', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme, true)

      // Check that dy uses height-based expressions
      const layersWithDyExpr = spec.layer.filter(
        (layer: any) =>
          layer.mark.dy && typeof layer.mark.dy === 'object' && 'expr' in layer.mark.dy,
      )
      expect(layersWithDyExpr.length).toBeGreaterThan(0)

      // Check that dx is 0 (no horizontal offset)
      const layersWithZeroDx = spec.layer.filter((layer: any) => layer.mark.dx === 0)
      expect(layersWithZeroDx).toHaveLength(6)
    })

    it('should use height-based font sizing for mobile', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme, true)

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
      const spec = createHeadlineSpec(mockData, singleColumn, 'light' as Theme, true)

      // Single metric should have yOffset: 0 (centered)
      spec.layer.forEach((layer: any): void => {
        if (layer.mark.dy && typeof layer.mark.dy === 'object') {
          expect(layer.mark.dy.expr).toContain('(0 / 100)')
        }
      })
    })

    it('should use smaller font sizes for mobile', (): void => {
      const mobileSpec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme, true)
      const desktopSpec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme, false)

      // Mobile should have smaller max font sizes
      const mobileFontExpr: string = (mobileSpec.layer[0] as any).mark.fontSize?.expr || ''
      const desktopFontExpr: string = (desktopSpec.layer[0] as any).mark.fontSize?.expr || ''

      expect(mobileFontExpr).toContain('min(24')
      expect(desktopFontExpr).toContain('min(30')
    })
  })

  describe('theming', (): void => {
    it('should apply light theme colors', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme)

      const valueColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 0) // Value layers (even indices)
        .map((layer: any) => layer.encoding.color!.value)

      const labelColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 1) // Label layers (odd indices)
        .map((layer: any) => layer.encoding.color!.value)

      valueColors.forEach((color: string): void => expect(color).toBe('#262626'))
      labelColors.forEach((color: string): void => expect(color).toBe('#595959'))
    })

    it('should apply dark theme colors', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'dark' as Theme)

      const valueColors: string[] = spec.layer
        .filter((_, index: number) => index % 2 === 0) // Value layers (even indices)
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
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme)

      const labelLayers = spec.layer.filter(
        (layer: any) =>
          layer.encoding?.text?.value && typeof layer.encoding.text.value === 'string',
      )

      expect(labelLayers).toHaveLength(3)
      expect(labelLayers.map((l: any) => l.encoding.text!.value)).toEqual([
        'Revenue',
        'Profit',
        'Users',
      ])
    })
  })

  describe('responsive font scaling', (): void => {
    it('should scale font size based on number of metrics', (): void => {
      const twoColumns = new Map<string, ResultColumn>([
        ['revenue', { name: 'revenue', type: 'number' } as ResultColumn],
        ['profit', { name: 'profit', type: 'number' } as ResultColumn],
      ])

      const eightColumns = new Map<string, ResultColumn>([
        ['revenue', { name: 'revenue', type: 'number' } as ResultColumn],
        ['profit', { name: 'profit', type: 'number' } as ResultColumn],
        ['users', { name: 'users', type: 'number' } as ResultColumn],
        ['orders', { name: 'orders', type: 'number' } as ResultColumn],
        ['revenue2', { name: 'revenue2', type: 'number' } as ResultColumn],
        ['profit2', { name: 'profit2', type: 'number' } as ResultColumn],
        ['users2', { name: 'users2', type: 'number' } as ResultColumn],
        ['orders2', { name: 'orders2', type: 'number' } as ResultColumn],
      ])

      const twoMetricSpec = createHeadlineSpec(mockData, twoColumns, 'light' as Theme)
      const eightMetricSpec = createHeadlineSpec(mockData, eightColumns, 'light' as Theme)

      // More metrics should result in different divisors in font size calculation
      const twoMetricFontExpr: string = (twoMetricSpec.layer[0] as any).mark.fontSize?.expr || ''
      const fourMetricFontExpr: string = (eightMetricSpec.layer[0] as any).mark.fontSize?.expr || ''

      expect(twoMetricFontExpr).toContain('/8)') // Math.max(8, 2 * 2)
      expect(fourMetricFontExpr).toContain('/16)') // Math.max(8, 4 * 2)
    })
  })

  describe('layer structure', (): void => {
    it('should create value and label layers for each metric', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme)

      // Should have pairs of layers: value + label for each numeric column
      expect(spec.layer).toHaveLength(6) // 3 numeric columns * 2 layers each

      // Check alternating pattern: value, label, value, label, etc.
      for (let i: number = 0; i < spec.layer.length; i += 2) {
        const valueLayer = spec.layer[i] as any
        const labelLayer = spec.layer[i + 1] as any

        // Value layer should have field-based text encoding
        expect(valueLayer.encoding.text).toHaveProperty('field')
        expect(valueLayer.mark.fontWeight).toBe('bold')

        // Label layer should have value-based text encoding
        expect(labelLayer.encoding.text).toHaveProperty('value')
        expect(labelLayer.mark.fontWeight).toBe('normal')
      }
    })

    it('should maintain consistent text alignment', (): void => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light' as Theme)

      spec.layer.forEach((layer: any): void => {
        expect(layer.mark.align).toBe('center')
      })
    })
  })
})
