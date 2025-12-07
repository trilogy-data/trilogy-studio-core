import { describe, it, expect, beforeEach } from 'vitest'
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
})
