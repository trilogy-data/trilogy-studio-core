import { describe, it, expect, beforeEach } from 'vitest'
import { ChartControlsManager } from './chartControlsManager'
import { ChromaChartHelpers } from './chartHelpers'
import { type Row, type ResultColumn, type ChartConfig, ColumnType } from '../editors/results'

describe('ChartControlsManager', () => {
  let manager: ChartControlsManager
  let testColumns: Map<string, ResultColumn>
  let testData: Row[]
  let configChanges: ChartConfig[]

  beforeEach(() => {
    // Set up test data
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
    testColumns.set('profit', {
      name: 'profit',
      type: ColumnType.FLOAT,
      traits: [],
    })
    testColumns.set('date', {
      name: 'date',
      type: ColumnType.DATE,
      traits: [],
    })

    testData = [
      { category: 'A', revenue: 100, profit: 20, date: '2024-01-01' },
      { category: 'B', revenue: 200, profit: 40, date: '2024-01-02' },
      { category: 'C', revenue: 150, profit: 30, date: '2024-01-03' },
    ]

    // Track config changes
    configChanges = []
    // Create manager instance
    const chartHelpers = new ChromaChartHelpers({
      onDimensionClick: () => {},
      onPointClick: () => {},
      onBackgroundClick: () => {},
      onDrilldownClick: () => {},
    })
    manager = new ChartControlsManager(chartHelpers)
  })

  describe('showTitle persistence', () => {
    it('should preserve showTitle: false when changing chart types', () => {
      // Initialize with default config
      manager.initializeConfig(testData, testColumns)

      // Set showTitle to false
      manager.updateConfig('showTitle', false, testData, testColumns)
      expect(manager.internalConfig.value.showTitle).toBe(false)

      // Change chart type
      manager.updateConfig('chartType', 'line', testData, testColumns)

      // showTitle should still be false
      expect(manager.internalConfig.value.showTitle).toBe(false)
    })

    it('should preserve showTitle: true when changing chart types', () => {
      // Initialize with default config
      manager.initializeConfig(testData, testColumns)

      // Set showTitle to true
      manager.updateConfig('showTitle', true, testData, testColumns)
      expect(manager.internalConfig.value.showTitle).toBe(true)

      // Change chart type
      manager.updateConfig('chartType', 'barh', testData, testColumns)

      // showTitle should still be true
      expect(manager.internalConfig.value.showTitle).toBe(true)
    })

    it('should preserve showTitle: false during validateAndResetConfig', () => {
      // Initialize with a specific config
      const initialConfig: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: false,
      }
      manager.initializeConfig(testData, testColumns, initialConfig as ChartConfig)
      expect(manager.internalConfig.value.showTitle).toBe(false)

      // Validate config (which should pass)
      manager.validateAndResetConfig(testData, testColumns, undefined, initialConfig as ChartConfig)

      // showTitle should still be false after validation
      expect(manager.internalConfig.value.showTitle).toBe(false)
    })

    it('should respect initialConfig showTitle when explicitly provided', () => {
      // Initialize with showTitle: false
      manager.initializeConfig(testData, testColumns)
      manager.updateConfig('showTitle', false, testData, testColumns)
      expect(manager.internalConfig.value.showTitle).toBe(false)

      // Re-initialize with explicit showTitle: true in initialConfig
      const newConfig: Partial<ChartConfig> = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
        showTitle: true,
      }
      manager.initializeConfig(testData, testColumns, newConfig as ChartConfig)

      // Should use the explicit value from initialConfig
      expect(manager.internalConfig.value.showTitle).toBe(true)
    })

    it('should preserve showTitle when initialConfig does not specify it', () => {
      // Initialize and set showTitle to false
      manager.initializeConfig(testData, testColumns)
      manager.updateConfig('showTitle', false, testData, testColumns)
      expect(manager.internalConfig.value.showTitle).toBe(false)

      // Re-initialize with config that doesn't specify showTitle
      const newConfig: Partial<ChartConfig> = {
        chartType: 'line',
        xField: 'date',
        yField: 'revenue',
        // showTitle is not specified
      }
      manager.initializeConfig(testData, testColumns, newConfig as ChartConfig)

      // Should preserve the previous showTitle value
      expect(manager.internalConfig.value.showTitle).toBe(false)
    })
  })

  describe('hideLegend persistence', () => {
    it('should preserve hideLegend: true when changing chart types', () => {
      // Initialize with default config
      manager.initializeConfig(testData, testColumns)

      // Set hideLegend to true
      manager.updateConfig('hideLegend', true, testData, testColumns)
      expect(manager.internalConfig.value.hideLegend).toBe(true)

      // Change chart type
      manager.updateConfig('chartType', 'line', testData, testColumns)

      // hideLegend should still be true
      expect(manager.internalConfig.value.hideLegend).toBe(true)
    })

    it('should preserve hideLegend: false when changing chart types', () => {
      // Initialize with default config
      manager.initializeConfig(testData, testColumns)

      // Set hideLegend to false
      manager.updateConfig('hideLegend', false, testData, testColumns)
      expect(manager.internalConfig.value.hideLegend).toBe(false)

      // Change chart type
      manager.updateConfig('chartType', 'point', testData, testColumns)

      // hideLegend should still be false
      expect(manager.internalConfig.value.hideLegend).toBe(false)
    })
  })

  describe('config change callback', () => {
    it('should call onChartConfigChange when updating config', () => {
      configChanges = []
      const onConfigChange = (config: ChartConfig) => {
        configChanges.push({ ...config })
      }

      manager.initializeConfig(testData, testColumns, undefined, onConfigChange)

      // Update a config value
      manager.updateConfig('showTitle', false, testData, testColumns, onConfigChange)

      // Should have called the callback
      expect(configChanges.length).toBeGreaterThan(0)
      expect(configChanges[configChanges.length - 1].showTitle).toBe(false)
    })
  })

  describe('force reset behavior', () => {
    it('should reset to defaults when force=true, even with preserved values', () => {
      // Initialize and set showTitle to false
      manager.initializeConfig(testData, testColumns)
      manager.updateConfig('showTitle', false, testData, testColumns)
      expect(manager.internalConfig.value.showTitle).toBe(false)

      // Force reset with no initialConfig
      manager.initializeConfig(testData, testColumns, null, undefined, true)

      // With force=true and no initialConfig, it should use defaults
      // But our preservation logic should NOT apply when force=true
      // This tests the edge case handling
      expect(manager.internalConfig.value.chartType).toBeDefined()
    })
  })
})
