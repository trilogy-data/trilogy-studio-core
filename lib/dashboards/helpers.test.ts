import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  determineDefaultConfig,
  determineEligibleChartTypes,
  filteredColumns,
  isNumericColumn,
  isTemporalColumn,
  isCategoricalColumn,
  getColumnHasTrait,
  columHasTraitEnding,
  getGeoTraitType
} from './helpers'
import { type Row, type ResultColumn } from '../editors/results'
import { Charts } from './constants'
import { ColumnType } from '../editors/results'

describe('Chart Utils', () => {
  // Sample data for testing
  let testColumns: Map<string, ResultColumn>
  let testData: Row[]

  // Set up test data before each test
  beforeEach(() => {
    testColumns = new Map<string, ResultColumn>()
    
    // Numeric columns
    testColumns.set('revenue', {
      name: 'revenue',
      type: ColumnType.MONEY,
      traits: []
    })
    
    testColumns.set('quantity', {
      name: 'quantity',
      type: ColumnType.INTEGER,
      traits: []
    })
    
    testColumns.set('profit_margin', {
      name: 'profit_margin',
      type: ColumnType.PERCENT,
      traits: []
    })

    // Categorical columns
    testColumns.set('category', {
      name: 'category',
      type: ColumnType.STRING,
      traits: []
    })
    
    testColumns.set('region', {
      name: 'region',
      type: ColumnType.STRING,
      traits: []
    })
    
    testColumns.set('is_active', {
      name: 'is_active',
      type: ColumnType.BOOLEAN,
      traits: []
    })

    // Temporal columns
    testColumns.set('date', {
      name: 'date',
      type: ColumnType.DATE,
      traits: []
    })
    
    testColumns.set('timestamp', {
      name: 'timestamp',
      type: ColumnType.TIMESTAMP,
      traits: []
    })

    // Geographic columns
    testColumns.set('lat', {
      name: 'lat',
      type: ColumnType.FLOAT,
      traits: ['location.latitude']
    })
    
    testColumns.set('lng', {
      name: 'lng',
      type: ColumnType.FLOAT,
      traits: ['location.longitude']
    })
    
    testColumns.set('state', {
      name: 'state',
      type: ColumnType.STRING,
      traits: ['location.us_state']
    })

    // Create sample data
    testData = [
      { category: 'A', region: 'North', date: '2023-01-01', revenue: 1000, quantity: 50, lat: 40.7, lng: -74.0, state: 'NY', is_active: true },
      { category: 'B', region: 'South', date: '2023-01-02', revenue: 1500, quantity: 75, lat: 34.0, lng: -118.2, state: 'CA', is_active: false },
      { category: 'C', region: 'East', date: '2023-01-03', revenue: 1200, quantity: 60, lat: 41.8, lng: -87.6, state: 'IL', is_active: true },
      { category: 'D', region: 'West', date: '2023-01-04', revenue: 2000, quantity: 100, lat: 47.6, lng: -122.3, state: 'WA', is_active: false },
      { category: 'E', region: 'North', date: '2023-01-05', revenue: 1800, quantity: 90, lat: 39.9, lng: -75.1, state: 'PA', is_active: true },
      { category: 'F', region: 'South', date: '2023-01-06', revenue: 2200, quantity: 110, lat: 29.7, lng: -95.3, state: 'TX', is_active: false },
      { category: 'G', region: 'East', date: '2023-01-07', revenue: 1300, quantity: 65, lat: 42.3, lng: -71.0, state: 'MA', is_active: true },
      { category: 'H', region: 'West', date: '2023-01-08', revenue: 1700, quantity: 85, lat: 37.7, lng: -122.4, state: 'CA', is_active: false }
    ]
  })

  describe('Column Type Detection', () => {
    it('should correctly identify numeric columns', () => {
      expect(isNumericColumn(testColumns.get('revenue')!)).toBe(true)
      expect(isNumericColumn(testColumns.get('quantity')!)).toBe(true)
      expect(isNumericColumn(testColumns.get('profit_margin')!)).toBe(true)
      expect(isNumericColumn(testColumns.get('category')!)).toBe(false)
      
      // Latitude and longitude should not be considered regular numeric columns
      expect(isNumericColumn(testColumns.get('lat')!)).toBe(false)
      expect(isNumericColumn(testColumns.get('lng')!)).toBe(false)
    })

    it('should correctly identify categorical columns', () => {
      expect(isCategoricalColumn(testColumns.get('category')!)).toBe(true)
      expect(isCategoricalColumn(testColumns.get('region')!)).toBe(true)
      expect(isCategoricalColumn(testColumns.get('is_active')!)).toBe(true)
      expect(isCategoricalColumn(testColumns.get('revenue')!)).toBe(false)
    })

    it('should correctly identify temporal columns', () => {
      expect(isTemporalColumn(testColumns.get('date')!)).toBe(true)
      expect(isTemporalColumn(testColumns.get('timestamp')!)).toBe(true)
      expect(isTemporalColumn(testColumns.get('category')!)).toBe(false)
    })

    it('should correctly identify geographic trait columns', () => {
      expect(columHasTraitEnding(testColumns.get('lat')!, 'latitude')).toBe(true)
      expect(columHasTraitEnding(testColumns.get('lng')!, 'longitude')).toBe(true)
      expect(columHasTraitEnding(testColumns.get('state')!, 'us_state')).toBe(true)
      expect(columHasTraitEnding(testColumns.get('category')!, 'us_state')).toBe(false)
    })

    it('should correctly get geo trait type', () => {
      expect(getGeoTraitType(testColumns.get('state')!)).toBe('us_state')
      
      // Create a column with us_state_short trait
      const stateShortColumn: ResultColumn = {
        name: 'state_code',
        type: ColumnType.STRING,
        traits: ['location.us_state_short']
      }
      testColumns.set('state_code', stateShortColumn)
      expect(getGeoTraitType(stateShortColumn)).toBe('us_state_short')
      
      // Create a column with country trait
      const countryColumn: ResultColumn = {
        name: 'country',
        type: ColumnType.STRING,
        traits: ['location.country']
      }
      testColumns.set('country', countryColumn)
      expect(getGeoTraitType(countryColumn)).toBe('country')
      
      // Test unknown geo type
      expect(getGeoTraitType(testColumns.get('category')!)).toBe('unknown')
    })
  })

  describe('Column Filtering', () => {
    it('should filter numeric columns correctly', () => {
      const numericCols = filteredColumns('numeric', testColumns)
      expect(numericCols.length).toBe(3)
      expect(numericCols.map(col => col.name)).toContain('revenue')
      expect(numericCols.map(col => col.name)).toContain('quantity')
      expect(numericCols.map(col => col.name)).toContain('profit_margin')
    })

    it('should filter categorical columns correctly', () => {
      const categoricalCols = filteredColumns('categorical', testColumns)
      expect(categoricalCols.length).toBe(4)
      expect(categoricalCols.map(col => col.name)).toContain('category')
      expect(categoricalCols.map(col => col.name)).toContain('region')
      expect(categoricalCols.map(col => col.name)).toContain('is_active')
      // geographic columns should not be included in categorical filter
      expect(categoricalCols.map(col => col.name)).toContain('state')
    })

    it('should filter temporal columns correctly', () => {
      const temporalCols = filteredColumns('temporal', testColumns)
      expect(temporalCols.length).toBe(2)
      expect(temporalCols.map(col => col.name)).toContain('date')
      expect(temporalCols.map(col => col.name)).toContain('timestamp')
    })

    it('should filter geographic columns correctly', () => {
      const geoCols = filteredColumns('geographic', testColumns)
      expect(geoCols.length).toBe(1)
      expect(geoCols.map(col => col.name)).toContain('state')
    })

    it('should filter latitude columns correctly', () => {
      const latCols = filteredColumns('latitude', testColumns)
      expect(latCols.length).toBe(1)
      expect(latCols.map(col => col.name)).toContain('lat')
    })

    it('should filter longitude columns correctly', () => {
      const lngCols = filteredColumns('longitude', testColumns)
      expect(lngCols.length).toBe(1)
      expect(lngCols.map(col => col.name)).toContain('lng')
    })

    it('should return all columns when filter is set to all', () => {
      const allCols = filteredColumns('all', testColumns)
      expect(allCols.length).toBe(testColumns.size)
    })
  })

  describe('Eligible Chart Types', () => {
    it('should return empty array if no numeric columns are available', () => {
      const noNumericColumns = new Map<string, ResultColumn>()
      noNumericColumns.set('category', {
        name: 'category',
        type: ColumnType.STRING,
        traits: []
      })
      
      const eligibleCharts = determineEligibleChartTypes(testData, noNumericColumns)
      expect(eligibleCharts.length).toBe(0)
    })

    it('should include line and area charts when temporal and numeric columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('date', testColumns.get('date')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('line')
      expect(eligibleCharts).toContain('area')
    })

    it('should include bar charts when categorical and numeric columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('category', testColumns.get('category')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('bar')
      expect(eligibleCharts).toContain('barh')
    })

    it('should include point chart when multiple numeric columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      limitedColumns.set('quantity', testColumns.get('quantity')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('point')
    })

    it('should include heatmap when multiple categorical and numeric columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('category', testColumns.get('category')!)
      limitedColumns.set('region', testColumns.get('region')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('heatmap')
    })

    it('should include usa-map when geographic columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('state', testColumns.get('state')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('usa-map')
    })

    it('should include usa-map when lat/lng columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('lat', testColumns.get('lat')!)
      limitedColumns.set('lng', testColumns.get('lng')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('usa-map')
    })

    it('should include headline and boxplot when only numeric columns exist', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const eligibleCharts = determineEligibleChartTypes(testData, limitedColumns)
      expect(eligibleCharts).toContain('headline')
      expect(eligibleCharts).toContain('boxplot')
    })
  })

  describe('Default Configuration', () => {
    it('should handle empty columns gracefully', () => {
      const emptyColumns = new Map<string, ResultColumn>()
      const defaults = determineDefaultConfig(testData, emptyColumns)
      expect(defaults).toEqual({})
    })

    it('should set defaults for bar chart', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'bar')
      expect(defaults.chartType).toBe('bar')
      expect(defaults.xField).toBe('category')
      expect(defaults.yField).toBe('revenue')
      expect(defaults.colorField).toBe('region')
    })

    it('should set defaults for horizontal bar chart', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'barh')
      expect(defaults.chartType).toBe('barh')
      expect(defaults.yField).toBe('category')
      expect(defaults.xField).toBe('revenue')
      expect(defaults.colorField).toBe('region')
    })

    it('should set defaults for line chart', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'line')
      expect(defaults.chartType).toBe('line')
      expect(defaults.xField).toBe('date')
      expect(defaults.yField).toBe('revenue')
      expect(defaults.colorField).toBe('category')
    })

    it('should set defaults for area chart', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'area')
      expect(defaults.chartType).toBe('area')
      expect(defaults.xField).toBe('date')
      expect(defaults.yField).toBe('revenue')
      expect(defaults.colorField).toBe('category')
    })

    it('should set defaults for scatter plot', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'point')
      expect(defaults.chartType).toBe('point')
      expect(defaults.xField).toBe('revenue')
      expect(defaults.yField).toBe('quantity')
      expect(defaults.colorField).toBe('category')
    })

    it('should set defaults for heatmap', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'heatmap')
      expect(defaults.chartType).toBe('heatmap')
      expect(defaults.xField).toBe('category')
      expect(defaults.yField).toBe('region')
      expect(defaults.colorField).toBe('revenue')
    })

    it('should set defaults for headline chart', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'headline')
      expect(defaults.chartType).toBe('headline')
      expect(defaults.xField).toBe('revenue')
    })

    it('should set defaults for usa-map with state data', () => {
      const defaults = determineDefaultConfig(testData, testColumns, 'usa-map')
      expect(defaults.chartType).toBe('usa-map')
      expect(defaults.yField).toBe('lat')
      expect(defaults.xField).toBe('lng')
      expect(defaults.sizeField).toBe('revenue')
      expect(defaults.colorField).toBe('quantity')
      expect(defaults.geoField).toBe('state')
    })

    it('should set defaults for usa-map with only geo field', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('state', testColumns.get('state')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const defaults = determineDefaultConfig(testData, limitedColumns, 'usa-map')
      expect(defaults.chartType).toBe('usa-map')
      expect(defaults.geoField).toBe('state')
      expect(defaults.colorField).toBe('revenue')
    })

    it('should set defaults for usa-map with only lat/lng fields', () => {
      const limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('lat', testColumns.get('lat')!)
      limitedColumns.set('lng', testColumns.get('lng')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      const defaults = determineDefaultConfig(testData, limitedColumns, 'usa-map')
      expect(defaults.chartType).toBe('usa-map')
      expect(defaults.yField).toBe('lat')
      expect(defaults.xField).toBe('lng')
      expect(defaults.sizeField).toBe('revenue')
    })

    it('should auto-detect and set chartType when not specified', () => {
      // Test with temporal + numeric data
      let limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('date', testColumns.get('date')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      let defaults = determineDefaultConfig(testData, limitedColumns)
      expect(defaults.chartType).toBe('line')
      
      // Test with categorical + numeric data (few categories)
      limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('region', testColumns.get('region')!) // Only 4 unique regions
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      defaults = determineDefaultConfig(testData, limitedColumns)
      expect(defaults.chartType).toBe('bar')
      
      // Test with categorical + numeric data (many categories)
      const manyCategories = new Map<string, ResultColumn>()
      manyCategories.set('category', testColumns.get('category')!) // 8 unique categories
      manyCategories.set('revenue', testColumns.get('revenue')!)
      
      defaults = determineDefaultConfig(testData, manyCategories)
      expect(defaults.chartType).toBe('barh')
      
      // Test with multiple numeric columns
      limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      limitedColumns.set('quantity', testColumns.get('quantity')!)
      
      defaults = determineDefaultConfig(testData, limitedColumns)
      expect(defaults.chartType).toBe('point')
      
      // Test with geographic data
      limitedColumns = new Map<string, ResultColumn>()
      limitedColumns.set('lat', testColumns.get('lat')!)
      limitedColumns.set('lng', testColumns.get('lng')!)
      limitedColumns.set('revenue', testColumns.get('revenue')!)
      
      defaults = determineDefaultConfig(testData, limitedColumns)
      expect(defaults.chartType).toBe('usa-map')
    })
  })

  describe('Column Trait Detection', () => {
    it('should detect column traits correctly', () => {
      // Setup a test column with traits
      const testColumn: ResultColumn = {
        name: 'test',
        type: ColumnType.STRING,
        traits: ['location.city', 'metadata.category']
      }
      testColumns.set('test', testColumn)
      
      expect(getColumnHasTrait('test', testColumns, 'city')).toBe(true)
      expect(getColumnHasTrait('test', testColumns, 'category')).toBe(true)
      expect(getColumnHasTrait('test', testColumns, 'country')).toBe(false)
      
      // Test with non-existent column
      expect(getColumnHasTrait('non_existent', testColumns, 'city')).toBe(false)
      
      // Test with undefined fieldName
      expect(getColumnHasTrait(undefined as any, testColumns, 'city')).toBe(false)
    })
  })
})