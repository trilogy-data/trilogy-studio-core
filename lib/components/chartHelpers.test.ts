import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ChromaChartHelpers } from './chartHelpers'
import { type ResultColumn, type ChartConfig, ColumnType } from '../editors/results'

describe('ChromaChartHelpers', () => {
  let chartHelpers: ChromaChartHelpers
  let testColumns: Map<string, ResultColumn>

  beforeEach(() => {
    chartHelpers = new ChromaChartHelpers({
      onDimensionClick: () => {},
      onPointClick: () => {},
      onBackgroundClick: () => {},
      onDrilldownClick: () => {},
    })

    // Set up test columns
    testColumns = new Map<string, ResultColumn>()
    testColumns.set('category', {
      name: 'category',
      type: ColumnType.STRING,
      traits: [],
    })
    testColumns.set('revenue', {
      name: 'revenue',
      type: ColumnType.FLOAT,
      traits: [],
    })
    testColumns.set('date', {
      name: 'date',
      type: ColumnType.DATE,
      traits: [],
    })
  })

  describe('validateConfigFields', () => {
    it('should validate config with showTitle: true as valid', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: true,
        hideLegend: false,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      expect(isValid).toBe(true)
    })

    it('should validate config with showTitle: false as valid (falsiness bug test)', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: false, // This is the critical test case
        hideLegend: false,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      // This should be true - showTitle: false is a valid config
      expect(isValid).toBe(true)
    })

    it('should validate config with hideLegend: true as valid', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: false,
        hideLegend: true,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      expect(isValid).toBe(true)
    })

    it('should validate config with both boolean fields false as valid', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: false,
        hideLegend: false,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      // Both false is still a valid config
      expect(isValid).toBe(true)
    })

    it('should invalidate config when field references non-existent column', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'nonexistent',
        yField: 'revenue',
        showTitle: true,
        hideLegend: false,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      expect(isValid).toBe(false)
      // The invalid field should be cleared
      expect(config.xField).toBe('')
    })

    it('should return false when no fields are set at all', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: '',
        yField: '',
        colorField: '',
        // No boolean fields set either
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      // Config with no fields set should be invalid
      expect(isValid).toBe(false)
    })

    it('should validate config with only showTitle set', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: '',
        yField: '',
        showTitle: true,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      // Having showTitle set should count as a valid config
      expect(isValid).toBe(true)
    })

    it('should validate config with only hideLegend set', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: '',
        yField: '',
        hideLegend: true,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      // Having hideLegend set should count as a valid config
      expect(isValid).toBe(true)
    })

    it('should handle undefined boolean fields gracefully', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        // showTitle and hideLegend are undefined
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      // Should still be valid because xField and yField are set
      expect(isValid).toBe(true)
    })

    it('should clear invalid fields but preserve boolean settings', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'nonexistent',
        yField: 'revenue',
        showTitle: false,
        hideLegend: true,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      expect(isValid).toBe(false)
      expect(config.xField).toBe('') // Invalid field cleared
      expect(config.showTitle).toBe(false) // Boolean setting preserved
      expect(config.hideLegend).toBe(true) // Boolean setting preserved
    })
  })

  describe('validateConfigFields edge cases', () => {
    it('should handle empty column map', () => {
      const emptyColumns = new Map<string, ResultColumn>()
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: false,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, emptyColumns)
      // Should invalidate because fields reference non-existent columns
      expect(isValid).toBe(false)
    })

    it('should validate with optional fields empty', () => {
      const config: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        colorField: '', // Optional field empty
        sizeField: '', // Optional field empty
        showTitle: false,
        hideLegend: false,
      }

      const isValid = chartHelpers.validateConfigFields(config as ChartConfig, testColumns)
      expect(isValid).toBe(true)
    })
  })

  describe('handlePointClick', () => {
    it('does not include implicit hex helper fields in cross-filter selections', () => {
      const onDimensionClick = vi.fn()
      chartHelpers = new ChromaChartHelpers({
        onDimensionClick,
        onPointClick: () => {},
        onBackgroundClick: () => {},
        onDrilldownClick: () => {},
      })

      testColumns.set('tree_category', {
        name: 'tree_category',
        type: ColumnType.STRING,
        address: 'local.tree_category',
        traits: [],
      })
      testColumns.set('cat_color', {
        name: 'cat_color',
        type: ColumnType.STRING,
        address: 'local.cat_color',
        traits: ['hex'],
      })

      const config: ChartConfig = {
        chartType: 'donut',
        xField: 'tree_count',
        yField: 'tree_category',
        colorField: 'tree_category',
        showTitle: false,
      }

      chartHelpers.handlePointClick(
        { shiftKey: false, ctrlKey: false } as MouseEvent,
        {
          datum: {
            tree_category: 'broadleaf',
            cat_color: '#A7E3B2',
            tree_count: 42,
          },
        },
        config,
        testColumns,
      )

      expect(onDimensionClick).toHaveBeenCalledTimes(1)
      expect(onDimensionClick).toHaveBeenCalledWith({
        filters: { 'local.tree_category': { op: 'eq', value: 'broadleaf' } },
        chart: { tree_category: 'broadleaf' },
        append: false,
      })
    })

    it('prunes property fields whose keys are already in the filter set', () => {
      const onDimensionClick = vi.fn()
      chartHelpers = new ChromaChartHelpers({
        onDimensionClick,
        onPointClick: () => {},
        onBackgroundClick: () => {},
        onDrilldownClick: () => {},
      })

      // region_id is a key; region_name is a property with keys=[region_id address]
      testColumns.set('region_id', {
        name: 'region_id',
        type: ColumnType.INTEGER,
        address: 'order.customer.nation.region.id',
        traits: [],
        purpose: 'key',
        keys: [],
      })
      testColumns.set('region_name', {
        name: 'region_name',
        type: ColumnType.STRING,
        address: 'order.customer.nation.region.name',
        traits: [],
        keys: ['order.customer.nation.region.id'],
      })

      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region_name',
        yField: 'revenue',
        colorField: 'region_id',
        showTitle: false,
      }

      chartHelpers.handlePointClick(
        { shiftKey: false, ctrlKey: false } as MouseEvent,
        {
          datum: {
            region_id: 0,
            region_name: 'AFRICA',
            revenue: 60969908,
          },
        },
        config,
        testColumns,
      )

      expect(onDimensionClick).toHaveBeenCalledTimes(1)
      const call = onDimensionClick.mock.calls[0][0]
      // region_name should be pruned because region_id (its key) is present
      expect(call.filters).not.toHaveProperty('order.customer.nation.region.name')
      expect(call.filters).toHaveProperty('order.customer.nation.region.id')
      expect(call.filters['order.customer.nation.region.id']).toEqual({ op: 'eq', value: 0 })
    })

    it('keeps property fields when their key is not in the filter set', () => {
      const onDimensionClick = vi.fn()
      chartHelpers = new ChromaChartHelpers({
        onDimensionClick,
        onPointClick: () => {},
        onBackgroundClick: () => {},
        onDrilldownClick: () => {},
      })

      // region_name has a key but region_id is NOT in the eligible/clicked columns
      testColumns.set('region_name', {
        name: 'region_name',
        type: ColumnType.STRING,
        address: 'order.customer.nation.region.name',
        traits: [],
        keys: ['order.customer.nation.region.id'],
      })

      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'region_name',
        yField: 'revenue',
        showTitle: false,
      }

      chartHelpers.handlePointClick(
        { shiftKey: false, ctrlKey: false } as MouseEvent,
        { datum: { region_name: 'AFRICA', revenue: 60969908 } },
        config,
        testColumns,
      )

      expect(onDimensionClick).toHaveBeenCalledTimes(1)
      const call = onDimensionClick.mock.calls[0][0]
      // region_name must NOT be pruned — its key is absent from filters
      expect(call.filters).toHaveProperty('order.customer.nation.region.name')
    })
  })
})
