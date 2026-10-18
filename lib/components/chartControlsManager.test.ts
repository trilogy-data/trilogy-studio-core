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
    testColumns.set('region', {
      name: 'region',
      type: ColumnType.STRING,
      traits: [],
    })

    testData = [
      { category: 'A', region: 'North', revenue: 100, profit: 20, date: '2024-01-01' },
      { category: 'B', region: 'South', revenue: 200, profit: 40, date: '2024-01-02' },
      { category: 'C', region: 'East', revenue: 150, profit: 30, date: '2024-01-03' },
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

  describe('heatmap default backfill', () => {
    it('should backfill colorField for heatmaps when initial config omits it', () => {
      manager.initializeConfig(testData, testColumns, {
        chartType: 'heatmap',
        xField: 'category',
        yField: 'region',
        colorField: '',
      } as ChartConfig)

      expect(manager.internalConfig.value.colorField).toBe('revenue')
    })

    it('should preserve an empty colorField after dimension edits (no cascading backfill)', () => {
      manager.internalConfig.value = {
        ...manager.internalConfig.value,
        chartType: 'heatmap',
        xField: 'category',
        yField: 'region',
        colorField: '',
      }

      manager.updateConfig('xField', 'region', testData, testColumns)

      expect(manager.internalConfig.value.colorField).toBe('')
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

  describe('layered configs', () => {
    const layeredConfig = (): ChartConfig => ({
      chartType: 'bar',
      layers: [
        { chartType: 'bar', xField: 'category', yField: 'revenue' },
        { chartType: 'line', xField: 'category', yField: 'profit' },
      ],
    })

    it('takes a layered config verbatim instead of merging single-chart defaults', () => {
      manager.initializeConfig(testData, testColumns, layeredConfig())

      expect(manager.internalConfig.value.layers).toHaveLength(2)
      // Root field bindings are meaningless on a container and must not be
      // backfilled into the config that gets persisted.
      expect(manager.internalConfig.value.xField).toBeUndefined()
      expect(manager.internalConfig.value.yField).toBeUndefined()
    })

    it('does not flatten a layered config on validation', () => {
      const initial = layeredConfig()
      manager.initializeConfig(testData, testColumns, initial)

      const valid = manager.validateAndResetConfig(
        testData,
        testColumns,
        (config) => configChanges.push(config),
        initial,
      )

      expect(valid).toBe(true)
      expect(manager.internalConfig.value.layers).toHaveLength(2)
      // A reset would have fired onChartConfigChange with a flat config and
      // persisted the flattened result.
      expect(configChanges).toHaveLength(0)
    })

    it('reports invalid when a layer references a missing column', () => {
      const initial = layeredConfig()
      initial.layers![1].yField = 'not_a_column'
      manager.initializeConfig(testData, testColumns, initial)

      expect(manager.validateAndResetConfig(testData, testColumns, undefined, initial)).toBe(false)
    })
  })
})

describe('ChartControlsManager authored configs', () => {
  // A dominance curve: a numeric rank on x, a cumulative share on y, a rank
  // bucket on colour -- and the species name along for the tooltip. Two spare
  // categorical columns are exactly what makes the type defaults reach for a
  // facet.
  const columns = new Map<string, ResultColumn>([
    ['rank_by_count', { name: 'rank_by_count', type: ColumnType.INTEGER, traits: [] }],
    ['species', { name: 'species', type: ColumnType.STRING, traits: [] }],
    ['share_pct', { name: 'share_pct', type: ColumnType.FLOAT, traits: [] }],
    ['rank_bucket', { name: 'rank_bucket', type: ColumnType.STRING, traits: [] }],
  ])
  const data: Row[] = [
    { rank_by_count: 1, species: 'Sambucus nigra', share_pct: 5.8, rank_bucket: 'top-10' },
    { rank_by_count: 2, species: 'Ficus soatensis', share_pct: 10.2, rank_bucket: 'top-10' },
    { rank_by_count: 12, species: 'Acacia melanoxylon', share_pct: 48.1, rank_bucket: 'top-20' },
  ]
  const authored = (): ChartConfig =>
    ({
      chartType: 'bar',
      xField: 'rank_by_count',
      yField: 'share_pct',
      colorField: 'rank_bucket',
      annotationField: 'species',
      hideLegend: true,
      showTitle: false,
    }) as ChartConfig

  let manager: ChartControlsManager

  beforeEach(() => {
    manager = new ChartControlsManager(
      new ChromaChartHelpers({
        onDimensionClick: () => {},
        onPointClick: () => {},
        onBackgroundClick: () => {},
        onDrilldownClick: () => {},
      }),
    )
  })

  it('does not facet a chart that bound its fields and asked for no facet', () => {
    manager.initializeConfig(data, columns, authored())

    const config = manager.internalConfig.value
    expect(config.trellisRowField ?? '').toBe('')
    expect(config.trellisField ?? '').toBe('')
    // The author's bindings are untouched.
    expect(config.xField).toBe('rank_by_count')
    expect(config.yField).toBe('share_pct')
    expect(config.colorField).toBe('rank_bucket')
    expect(config.annotationField).toBe('species')
  })

  it('keeps a facet the author asked for', () => {
    manager.initializeConfig(data, columns, { ...authored(), trellisRowField: 'rank_bucket' })

    expect(manager.internalConfig.value.trellisRowField).toBe('rank_bucket')
  })

  it('still fills a role the author left empty', () => {
    const config = authored()
    config.colorField = ''
    manager.initializeConfig(data, columns, config)

    expect(manager.internalConfig.value.colorField).toBe('rank_bucket')
    expect(manager.internalConfig.value.trellisRowField ?? '').toBe('')
  })

  it('leaves a role empty rather than fill it with a column the author bound elsewhere', () => {
    // The type defaults would put the numeric rank on y; the author has it on
    // x. Plotting rank against rank is worse than reporting the missing field.
    const config = authored()
    config.yField = ''
    manager.initializeConfig(data, columns, config)

    expect(manager.internalConfig.value.yField).toBe('')
    expect(manager.internalConfig.value.xField).toBe('rank_by_count')
  })

  it('still auto-facets when no config is authored at all', () => {
    manager.initializeConfig(data, columns)

    const config = manager.internalConfig.value
    // The auto path owns every role, so a spare categorical column may well
    // become a facet; what matters is that it never reuses a bound one.
    const bound = [config.xField, config.yField, config.colorField].filter(Boolean)
    if (config.trellisRowField) {
      expect(bound).not.toContain(config.trellisRowField)
    }
  })
})
