import { describe, it, expect } from 'vitest'
import { createBarChartSpec } from './barChartSpec'
import { type Row, type ResultColumn, type ChartConfig, ColumnType } from '../editors/results'

describe('createBarChartSpec', () => {
  describe('discrete time tooltip fix', () => {
    it('should strip timeUnit and format from tooltip fields for year x-field', () => {
      const columns = new Map<string, ResultColumn>([
        ['date_year', { name: 'date_year', type: ColumnType.INTEGER, traits: ['year'] }],
        ['id_count', { name: 'id_count', type: ColumnType.INTEGER }],
      ])

      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'date_year',
        yField: 'id_count',
      } as ChartConfig

      const tooltipFields = [
        { field: 'date_year', type: 'temporal', timeUnit: 'year', format: '%Y' },
        { field: 'id_count', type: 'quantitative' },
      ]

      const data: Row[] = [
        { date_year: 1995, id_count: 100 } as Row,
        { date_year: 1996, id_count: 200 } as Row,
      ]

      const spec = createBarChartSpec(config, columns, tooltipFields, {}, data, [], 'light')
      if (!('encoding' in spec)) throw new Error('expected encoding in spec')

      // The x-field tooltip should have timeUnit/format stripped and type set to ordinal
      const xTooltip = spec.encoding.tooltip.find((f: any) => f.field === 'date_year')
      expect(xTooltip.timeUnit).toBeUndefined()
      expect(xTooltip.format).toBeUndefined()
      expect(xTooltip.type).toBe('ordinal')

      // Other tooltip fields should be unaffected
      const yTooltip = spec.encoding.tooltip.find((f: any) => f.field === 'id_count')
      expect(yTooltip.type).toBe('quantitative')
    })

    it('should not modify tooltip fields when x-field has no discrete time trait', () => {
      const columns = new Map<string, ResultColumn>([
        ['category', { name: 'category', type: ColumnType.STRING }],
        ['revenue', { name: 'revenue', type: ColumnType.NUMBER }],
      ])

      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'category',
        yField: 'revenue',
      } as ChartConfig

      const tooltipFields = [
        { field: 'category', type: 'nominal' },
        { field: 'revenue', type: 'quantitative' },
      ]

      const data: Row[] = [
        { category: 'A', revenue: 100 } as Row,
        { category: 'B', revenue: 200 } as Row,
      ]

      const spec = createBarChartSpec(config, columns, tooltipFields, {}, data, [], 'light')
      if (!('encoding' in spec)) throw new Error('expected encoding in spec')

      // Tooltip fields should remain unchanged
      expect(spec.encoding.tooltip).toEqual(tooltipFields)
    })

    it('should handle month discrete time trait in tooltip', () => {
      const columns = new Map<string, ResultColumn>([
        ['order_month', { name: 'order_month', type: ColumnType.INTEGER, traits: ['month'] }],
        ['total', { name: 'total', type: ColumnType.NUMBER }],
      ])

      const config: ChartConfig = {
        chartType: 'bar',
        xField: 'order_month',
        yField: 'total',
      } as ChartConfig

      const tooltipFields = [
        { field: 'order_month', type: 'temporal', timeUnit: 'month', format: '%B' },
        { field: 'total', type: 'quantitative' },
      ]

      const data: Row[] = [{ order_month: 1, total: 500 } as Row]

      const spec = createBarChartSpec(config, columns, tooltipFields, {}, data, [], 'light')
      if (!('encoding' in spec)) throw new Error('expected encoding in spec')

      const xTooltip = spec.encoding.tooltip.find((f: any) => f.field === 'order_month')
      expect(xTooltip.timeUnit).toBeUndefined()
      expect(xTooltip.format).toBeUndefined()
      expect(xTooltip.type).toBe('ordinal')
    })
  })
})
