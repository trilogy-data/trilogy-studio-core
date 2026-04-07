import { describe, it, expect } from 'vitest'
import { createBarHChartSpec } from './barHChartSpec'
import { type ResultColumn, type ChartConfig, ColumnType } from '../editors/results'

describe('createBarHChartSpec', () => {
  describe('discrete time tooltip fix', () => {
    it('should strip timeUnit and format from tooltip fields for year y-field', () => {
      const columns = new Map<string, ResultColumn>([
        ['date_year', { name: 'date_year', type: ColumnType.INTEGER, traits: ['year'] }],
        ['id_count', { name: 'id_count', type: ColumnType.INTEGER }],
      ])

      const config: ChartConfig = {
        chartType: 'barh',
        xField: 'id_count',
        yField: 'date_year',
      } as ChartConfig

      const tooltipFields = [
        { field: 'date_year', type: 'temporal', timeUnit: 'year', format: '%Y' },
        { field: 'id_count', type: 'quantitative' },
      ]

      const spec = createBarHChartSpec(config, columns, tooltipFields, {}, false, [], 'light')

      // The y-field tooltip should have timeUnit/format stripped and type set to ordinal
      const yTooltip = spec.encoding.tooltip.find((f: any) => f.field === 'date_year')
      expect(yTooltip.timeUnit).toBeUndefined()
      expect(yTooltip.format).toBeUndefined()
      expect(yTooltip.type).toBe('ordinal')

      // Other tooltip fields should be unaffected
      const xTooltip = spec.encoding.tooltip.find((f: any) => f.field === 'id_count')
      expect(xTooltip.type).toBe('quantitative')
    })

    it('should not modify tooltip fields when y-field has no discrete time trait', () => {
      const columns = new Map<string, ResultColumn>([
        ['category', { name: 'category', type: ColumnType.STRING }],
        ['revenue', { name: 'revenue', type: ColumnType.NUMBER }],
      ])

      const config: ChartConfig = {
        chartType: 'barh',
        xField: 'revenue',
        yField: 'category',
      } as ChartConfig

      const tooltipFields = [
        { field: 'category', type: 'nominal' },
        { field: 'revenue', type: 'quantitative' },
      ]

      const spec = createBarHChartSpec(config, columns, tooltipFields, {}, false, [], 'light')

      expect(spec.encoding.tooltip).toEqual(tooltipFields)
    })
  })
})
