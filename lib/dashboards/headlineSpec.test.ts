import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHeadlineSpec } from './headlineSpec'
import { type Row, type ResultColumn } from '../editors/results'

// Mock only the essential helper functions
vi.mock('./formatting', () => ({
  snakeCaseToCapitalizedWords: vi.fn((str: string) => 
    str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  )
}))

vi.mock('./helpers', () => ({
  isNumericColumn: vi.fn((column: ResultColumn) => column.type === 'number'),
  getColumnFormat: vi.fn((column: string, columns: Map<string, ResultColumn>) => {
    const col = columns.get(column)
    return col?.format || '.2f'
  })
}))

describe('createHeadlineSpec', () => {
  let mockColumns: Map<string, ResultColumn>
  let mockData: Row[]

  beforeEach(() => {
    mockColumns = new Map([
      ['revenue', { name: 'revenue', type: 'number', format: '.2s' }],
      ['profit', { name: 'profit', type: 'number', format: '.2f' }],
      ['users', { name: 'users', type: 'number', format: '.0f' }],
      ['name', { name: 'name', type: 'string' }] // Non-numeric column
    ])

    mockData = [{
      revenue: 1000000,
      profit: 250000,
      users: 15000,
      name: 'Q4 2024'
    }]
  })

  describe('basic functionality', () => {
    it('should create a valid vega-lite spec', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      expect(spec).toHaveProperty('$schema', 'https://vega.github.io/schema/vega-lite/v6.json')
      expect(spec).toHaveProperty('description', 'A simple headline metric display')
      expect(spec).toHaveProperty('width', 'container')
      expect(spec).toHaveProperty('height', 'container')
      expect(spec).toHaveProperty('data.values', mockData[0])
      expect(spec).toHaveProperty('layer')
    })

    it('should only include numeric columns', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      // Should have 6 layers (2 per numeric column: value + label)
      expect(spec.layer).toHaveLength(6)
      
      // Check that all layers are for numeric columns
      const textFields = spec.layer
        .filter(layer => layer.encoding?.text?.field)
        .map(layer => layer.encoding.text.field)
      
      expect(textFields).toEqual(['revenue', 'profit', 'users'])
    })

    it('should handle empty data', () => {
      const spec = createHeadlineSpec(null, mockColumns, 'light')
      
      expect(spec.data.values).toEqual([])
      expect(spec.layer).toHaveLength(6) // Still creates layers for columns
    })

    it('should handle empty columns', () => {
      const emptyColumns = new Map<string, ResultColumn>()
      const spec = createHeadlineSpec(mockData, emptyColumns, 'light')
      
      expect(spec.layer).toHaveLength(0)
    })
  })

  describe('desktop layout (isMobile: false)', () => {
    it('should distribute elements horizontally', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light', false)
      
      // Check that dx is used for horizontal positioning
      const layersWithDx = spec.layer.filter(layer => layer.mark.dx)
      expect(layersWithDx.length).toBeGreaterThan(0)
      
      // Check that dy is fixed (not expression-based)
      const layersWithFixedDy = spec.layer.filter(layer => 
        typeof layer.mark.dy === 'number'
      )
      expect(layersWithFixedDy).toHaveLength(6)
    })

    it('should use width-based font sizing for desktop', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light', false)
      
      const fontSizeExpressions = spec.layer.map(layer => layer.mark.fontSize?.expr).filter(Boolean)
      
      fontSizeExpressions.forEach(expr => {
        expect(expr).toContain('width')
        expect(expr).not.toContain('height')
      })
    })

    it('should center single metric horizontally', () => {
      const singleColumn = new Map([['revenue', { name: 'revenue', type: 'number' }]])
      const spec = createHeadlineSpec(mockData, singleColumn, 'light', false)
      
      // Single metric should have dx: 0 (centered)
      spec.layer.forEach(layer => {
        if (layer.mark.dx) {
          expect(layer.mark.dx.expr).toContain('(0 / 100)')
        }
      })
    })
  })

  describe('mobile layout (isMobile: true)', () => {
    it('should distribute elements vertically', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light', true)
      
      // Check that dy uses height-based expressions
      const layersWithDyExpr = spec.layer.filter(layer => 
        layer.mark.dy && typeof layer.mark.dy === 'object' && layer.mark.dy.expr
      )
      expect(layersWithDyExpr.length).toBeGreaterThan(0)
      
      // Check that dx is 0 (no horizontal offset)
      const layersWithZeroDx = spec.layer.filter(layer => layer.mark.dx === 0)
      expect(layersWithZeroDx).toHaveLength(6)
    })

    it('should use height-based font sizing for mobile', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light', true)
      
      const fontSizeExpressions = spec.layer.map(layer => layer.mark.fontSize?.expr).filter(Boolean)
      
      fontSizeExpressions.forEach(expr => {
        expect(expr).toContain('height')
        expect(expr).not.toContain('width')
      })
    })

    it('should center single metric vertically', () => {
      const singleColumn = new Map([['revenue', { name: 'revenue', type: 'number' }]])
      const spec = createHeadlineSpec(mockData, singleColumn, 'light', true)
      
      // Single metric should have yOffset: 0 (centered)
      spec.layer.forEach(layer => {
        if (layer.mark.dy && typeof layer.mark.dy === 'object') {
          expect(layer.mark.dy.expr).toContain('(0 / 100)')
        }
      })
    })

    it('should use smaller font sizes for mobile', () => {
      const mobileSpec = createHeadlineSpec(mockData, mockColumns, 'light', true)
      const desktopSpec = createHeadlineSpec(mockData, mockColumns, 'light', false)
      
      // Mobile should have smaller max font sizes
      const mobileFontExpr = mobileSpec.layer[0].mark.fontSize?.expr || ''
      const desktopFontExpr = desktopSpec.layer[0].mark.fontSize?.expr || ''
      
      expect(mobileFontExpr).toContain('min(24')
      expect(desktopFontExpr).toContain('min(30')
    })
  })

  describe('theming', () => {
    it('should apply light theme colors', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      const valueColors = spec.layer
        .filter((_, index) => index % 2 === 0) // Value layers (even indices)
        .map(layer => layer.encoding.color.value)
      
      const labelColors = spec.layer
        .filter((_, index) => index % 2 === 1) // Label layers (odd indices)
        .map(layer => layer.encoding.color.value)
      
      valueColors.forEach(color => expect(color).toBe('#262626'))
      labelColors.forEach(color => expect(color).toBe('#595959'))
    })

    it('should apply dark theme colors', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'dark')
      
      const valueColors = spec.layer
        .filter((_, index) => index % 2 === 0) // Value layers (even indices)
        .map(layer => layer.encoding.color.value)
      
      const labelColors = spec.layer
        .filter((_, index) => index % 2 === 1) // Label layers (odd indices)
        .map(layer => layer.encoding.color.value)
      
      valueColors.forEach(color => expect(color).toBe('#f0f0f0'))
      labelColors.forEach(color => expect(color).toBe('#d1d1d1'))
    })
  })

  describe('text formatting', () => {
    it('should format numeric values with column format', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      const valueLayer = spec.layer.find(layer => 
        layer.encoding?.text?.field === 'revenue'
      )
      
      expect(valueLayer?.encoding.text.format).toBe('.2s')
    })

    it('should format labels with capitalized words', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      const labelLayers = spec.layer.filter(layer => 
        layer.encoding?.text?.value && typeof layer.encoding.text.value === 'string'
      )
      
      expect(labelLayers).toHaveLength(3)
      expect(labelLayers.map(l => l.encoding.text.value)).toEqual([
        'Revenue',
        'Profit', 
        'Users'
      ])
    })
  })

  describe('responsive font scaling', () => {
    it('should scale font size based on number of metrics', () => {
      const twoColumns = new Map([
        ['revenue', { name: 'revenue', type: 'number' }],
        ['profit', { name: 'profit', type: 'number' }]
      ])
      
      const eightColumns = new Map([
        ['revenue', { name: 'revenue', type: 'number' }],
        ['profit', { name: 'profit', type: 'number' }],
        ['users', { name: 'users', type: 'number' }],
        ['orders', { name: 'orders', type: 'number' }],
        ['revenue2', { name: 'revenue2', type: 'number' }],
        ['profit2', { name: 'profit2', type: 'number' }],
        ['users2', { name: 'users2', type: 'number' }],
        ['orders2', { name: 'orders2', type: 'number' }]
      ])
      
      const twoMetricSpec = createHeadlineSpec(mockData, twoColumns, 'light')
      const eightMetricSpec = createHeadlineSpec(mockData, eightColumns, 'light')
      
      // More metrics should result in different divisors in font size calculation
      const twoMetricFontExpr = twoMetricSpec.layer[0].mark.fontSize?.expr || ''
      const fourMetricFontExpr = eightMetricSpec.layer[0].mark.fontSize?.expr || ''
      
      expect(twoMetricFontExpr).toContain('/8)') // Math.max(8, 2 * 2)
      expect(fourMetricFontExpr).toContain('/16)') // Math.max(8, 4 * 2)
    })
  })

  describe('layer structure', () => {
    it('should create value and label layers for each metric', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      // Should have pairs of layers: value + label for each numeric column
      expect(spec.layer).toHaveLength(6) // 3 numeric columns * 2 layers each
      
      // Check alternating pattern: value, label, value, label, etc.
      for (let i = 0; i < spec.layer.length; i += 2) {
        const valueLayer = spec.layer[i]
        const labelLayer = spec.layer[i + 1]
        
        // Value layer should have field-based text encoding
        expect(valueLayer.encoding.text).toHaveProperty('field')
        expect(valueLayer.mark.fontWeight).toBe('bold')
        
        // Label layer should have value-based text encoding
        expect(labelLayer.encoding.text).toHaveProperty('value')
        expect(labelLayer.mark.fontWeight).toBe('normal')
      }
    })

    it('should maintain consistent text alignment', () => {
      const spec = createHeadlineSpec(mockData, mockColumns, 'light')
      
      spec.layer.forEach(layer => {
        expect(layer.mark.align).toBe('center')
      })
    })
  })
})