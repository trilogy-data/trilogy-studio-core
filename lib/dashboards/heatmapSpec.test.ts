import { describe, it, expect, beforeEach } from 'vitest'
import { createHeatmapSpec } from './heatmapSpec'
import { type ResultColumn, type ChartConfig, ColumnType } from '../editors/results'

describe('createHeatmapSpec', (): void => {
  let mockColumns: Map<string, ResultColumn>
  let mockConfig: ChartConfig
  let mockTooltipFields: any[]
  let mockIntChart: Array<Partial<ChartConfig>>

  beforeEach((): void => {
    mockColumns = new Map<string, ResultColumn>([
      [
        'category',
        {
          name: 'category',
          type: ColumnType.STRING,
          description: 'Product Category',
        } as ResultColumn,
      ],
      [
        'region',
        {
          name: 'region',
          type: ColumnType.STRING,
          description: 'Sales Region',
        } as ResultColumn,
      ],
      [
        'sales',
        {
          name: 'sales',
          type: ColumnType.NUMBER,
          format: '.2s',
          description: 'Total Sales',
          traits: ['usd'],
        } as ResultColumn,
      ],
      [
        'profit_margin',
        {
          name: 'profit_margin',
          type: ColumnType.FLOAT,
          description: 'Profit Margin',
          traits: ['percent'],
        } as ResultColumn,
      ],
      [
        'year',
        {
          name: 'year',
          type: ColumnType.INTEGER,
          description: 'Year',
          traits: ['year'],
        } as ResultColumn,
      ],
    ])

    mockConfig = {
      chartType: 'heatmap',
      xField: 'category',
      yField: 'region',
      colorField: 'sales',
    } as ChartConfig

    mockTooltipFields = [
      { field: 'category', type: 'nominal' },
      { field: 'region', type: 'nominal' },
      { field: 'sales', type: 'quantitative' },
    ]

    mockIntChart = []
  })

  describe('basic functionality', (): void => {
    it('should create a valid heatmap spec with required fields', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec).toHaveProperty('params')
      expect(spec).toHaveProperty('mark')
      expect(spec).toHaveProperty('encoding')
      expect(spec.mark).toBe('rect')
    })

    it('should create heatmap with rect mark type', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.mark).toBe('rect')
    })

    it('should include required encoding fields', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding).toHaveProperty('x')
      expect(spec.encoding).toHaveProperty('y')
      expect(spec.encoding).toHaveProperty('color')
      expect(spec.encoding).toHaveProperty('tooltip')
    })
  })

  describe('parameter configuration', (): void => {
    it('should include highlight and select parameters', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.params).toHaveLength(2)
      expect(spec.params[0].name).toBe('highlight')
      expect(spec.params[1].name).toBe('select')
    })

    it('should configure highlight parameter correctly', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      const highlightParam = spec.params.find((p: any) => p.name === 'highlight')
      expect(highlightParam).toBeDefined()
      expect(highlightParam!.select.type).toBe('point')
      expect(highlightParam!.select.on).toBe('mouseover')
      expect(highlightParam!.select.clear).toBe('mouseout')
    })

    it('should configure select parameter correctly', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.select.type).toBe('point')
      expect(selectParam!.select.on).toBe('click,touchend')
      expect(selectParam!.nearest).toBe(true)
    })

    it('should set select parameter value from intChart', (): void => {
      const intChartWithData: Array<Partial<ChartConfig>> = [
        { xField: 'category', yField: 'region' },
      ]
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, intChartWithData)

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toEqual(intChartWithData)
    })

    it('should handle empty intChart', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, [])

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toEqual([])
    })
  })

  describe('encoding configuration', (): void => {
    describe('x-axis encoding', (): void => {
      it('should create x-axis encoding from xField', (): void => {
        const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.x.field).toBe('category')
        expect(spec.encoding.x.type).toBe('nominal')
        expect(spec.encoding.x.title).toBe('Product Category')
      })

      it('should handle missing xField gracefully', (): void => {
        const configWithoutX = { ...mockConfig, xField: undefined }
        const spec = createHeatmapSpec(configWithoutX, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.x).toEqual({})
      })

      it('should handle xField not in columns', (): void => {
        const configWithInvalidX = { ...mockConfig, xField: 'nonexistent' }
        const spec = createHeatmapSpec(
          configWithInvalidX,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
        )

        expect(spec.encoding.x.field).toBe('nonexistent')
        expect(spec.encoding.x.type).toBe('nominal')
        expect(spec.encoding.x.title).toBe('Nonexistent')
      })
    })

    describe('y-axis encoding', (): void => {
      it('should create y-axis encoding from yField', (): void => {
        const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.y.field).toBe('region')
        expect(spec.encoding.y.type).toBe('nominal')
        expect(spec.encoding.y.title).toBe('Sales Region')
      })

      it('should handle missing yField gracefully', (): void => {
        const configWithoutY = { ...mockConfig, yField: undefined }
        const spec = createHeatmapSpec(configWithoutY, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.y).toEqual({})
      })

      it('should handle yField not in columns', (): void => {
        const configWithInvalidY = { ...mockConfig, yField: 'nonexistent' }
        const spec = createHeatmapSpec(
          configWithInvalidY,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
        )

        expect(spec.encoding.y.field).toBe('nonexistent')
        expect(spec.encoding.y.type).toBe('nominal')
        expect(spec.encoding.y.title).toBe('Nonexistent')
      })
    })

    describe('color encoding', (): void => {
      it('should create color encoding with viridis scale for numeric field', (): void => {
        const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.color.field).toBe('sales')
        expect(spec.encoding.color.type).toBe('quantitative')
        expect(spec.encoding.color.title).toBe('Total Sales')
        expect(spec.encoding.color.scale.scheme).toBe('viridis')
      })

      it('should apply formatting hints for USD fields', (): void => {
        const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.color.format).toBe('$,.2f')
      })

      it('should apply formatting hints for percentage fields', (): void => {
        const configWithPercent = { ...mockConfig, colorField: 'profit_margin' }
        const spec = createHeatmapSpec(
          configWithPercent,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
        )

        expect(spec.encoding.color.format).toBe('.1%')
      })

      it('should handle categorical color field', (): void => {
        const configWithCategorical = { ...mockConfig, colorField: 'category' }
        const spec = createHeatmapSpec(
          configWithCategorical,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
        )

        expect(spec.encoding.color.field).toBe('category')
        expect(spec.encoding.color.type).toBe('nominal')
        expect(spec.encoding.color.scale.scheme).toBe('viridis')
      })

      it('should handle temporal color field with year formatting', (): void => {
        const configWithYear = { ...mockConfig, colorField: 'year' }
        const spec = createHeatmapSpec(configWithYear, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.color.field).toBe('year')
        expect(spec.encoding.color.type).toBe('temporal')
        expect(spec.encoding.color.format).toBe('%Y')
        expect(spec.encoding.color.timeUnit).toBe('year')
        expect(spec.encoding.color.labelAngle).toBe(-45)
      })

      it('should handle missing colorField', (): void => {
        const configWithoutColor = { ...mockConfig, colorField: undefined }
        const spec = createHeatmapSpec(
          configWithoutColor,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
        )

        expect(spec.encoding.color.field).toBeUndefined()
        expect(spec.encoding.color.type).toBe('nominal')
        expect(spec.encoding.color.title).toBe('')
        expect(spec.encoding.color.scale.scheme).toBe('viridis')
      })

      it('should handle colorField not in columns', (): void => {
        const configWithInvalidColor = { ...mockConfig, colorField: 'nonexistent' }
        const spec = createHeatmapSpec(
          configWithInvalidColor,
          mockColumns,
          mockTooltipFields,
          mockIntChart,
        )

        expect(spec.encoding.color.field).toBe('nonexistent')
        expect(spec.encoding.color.type).toBe('nominal')
        expect(spec.encoding.color.title).toBe('Nonexistent')
      })
    })

    describe('tooltip encoding', (): void => {
      it('should pass through tooltip fields', (): void => {
        const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

        expect(spec.encoding.tooltip).toEqual(mockTooltipFields)
      })

      it('should handle empty tooltip fields', (): void => {
        const spec = createHeatmapSpec(mockConfig, mockColumns, [], mockIntChart)

        expect(spec.encoding.tooltip).toEqual([])
      })
    })
  })

  describe('field type detection', (): void => {
    beforeEach((): void => {
      mockColumns = new Map<string, ResultColumn>([
        [
          'date_field',
          {
            name: 'date_field',
            type: ColumnType.DATE,
            description: 'Date Field',
          } as ResultColumn,
        ],
        [
          'datetime_field',
          {
            name: 'datetime_field',
            type: ColumnType.DATETIME,
            description: 'DateTime Field',
          } as ResultColumn,
        ],
        [
          'time_field',
          {
            name: 'time_field',
            type: ColumnType.TIME,
            description: 'Time Field',
          } as ResultColumn,
        ],
        [
          'timestamp_field',
          {
            name: 'timestamp_field',
            type: ColumnType.TIMESTAMP,
            description: 'Timestamp Field',
          } as ResultColumn,
        ],
        [
          'integer_field',
          {
            name: 'integer_field',
            type: ColumnType.INTEGER,
            description: 'Integer Field',
          } as ResultColumn,
        ],
        [
          'float_field',
          {
            name: 'float_field',
            type: ColumnType.FLOAT,
            description: 'Float Field',
          } as ResultColumn,
        ],
        [
          'number_field',
          {
            name: 'number_field',
            type: ColumnType.NUMBER,
            description: 'Number Field',
          } as ResultColumn,
        ],
        [
          'string_field',
          {
            name: 'string_field',
            type: ColumnType.STRING,
            description: 'String Field',
          } as ResultColumn,
        ],
        [
          'boolean_field',
          {
            name: 'boolean_field',
            type: ColumnType.BOOLEAN,
            description: 'Boolean Field',
          } as ResultColumn,
        ],
      ])
    })

    it('should correctly identify temporal field types', (): void => {
      const dateConfig = { ...mockConfig, xField: 'date_field' }
      const spec = createHeatmapSpec(dateConfig, mockColumns, mockTooltipFields, mockIntChart)
      expect(spec.encoding.x.type).toBe('temporal')

      const datetimeConfig = { ...mockConfig, xField: 'datetime_field' }
      const spec2 = createHeatmapSpec(datetimeConfig, mockColumns, mockTooltipFields, mockIntChart)
      expect(spec2.encoding.x.type).toBe('temporal')
    })

    it('should correctly identify quantitative field types', (): void => {
      const intConfig = { ...mockConfig, colorField: 'integer_field' }
      const spec = createHeatmapSpec(intConfig, mockColumns, mockTooltipFields, mockIntChart)
      expect(spec.encoding.color.type).toBe('quantitative')

      const floatConfig = { ...mockConfig, colorField: 'float_field' }
      const spec2 = createHeatmapSpec(floatConfig, mockColumns, mockTooltipFields, mockIntChart)
      expect(spec2.encoding.color.type).toBe('quantitative')
    })

    it('should correctly identify nominal field types', (): void => {
      const stringConfig = { ...mockConfig, xField: 'string_field' }
      const spec = createHeatmapSpec(stringConfig, mockColumns, mockTooltipFields, mockIntChart)
      expect(spec.encoding.x.type).toBe('nominal')

      const boolConfig = { ...mockConfig, yField: 'boolean_field' }
      const spec2 = createHeatmapSpec(boolConfig, mockColumns, mockTooltipFields, mockIntChart)
      expect(spec2.encoding.y.type).toBe('nominal')
    })
  })

  describe('column traits handling', (): void => {
    beforeEach((): void => {
      mockColumns = new Map<string, ResultColumn>([
        [
          'usd_field',
          {
            name: 'usd_field',
            type: ColumnType.NUMBER,
            description: 'USD Field',
            traits: ['usd'],
          } as ResultColumn,
        ],
        [
          'percent_field',
          {
            name: 'percent_field',
            type: ColumnType.FLOAT,
            description: 'Percent Field',
            traits: ['percent'],
          } as ResultColumn,
        ],
        [
          'year_field',
          {
            name: 'year_field',
            type: ColumnType.INTEGER,
            description: 'Year Field',
            traits: ['year'],
          } as ResultColumn,
        ],
        [
          'day_of_week_field',
          {
            name: 'day_of_week_field',
            type: ColumnType.STRING,
            description: 'Day Of Week Field',
            traits: ['day_of_week_name'],
          } as ResultColumn,
        ],
      ])
    })

    it('should apply USD formatting', (): void => {
      const config = { ...mockConfig, colorField: 'usd_field' }
      const spec = createHeatmapSpec(config, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.color.format).toBe('$,.2f')
    })

    it('should apply percentage formatting', (): void => {
      const config = { ...mockConfig, colorField: 'percent_field' }
      const spec = createHeatmapSpec(config, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.color.format).toBe('.1%')
    })

    it('should apply year formatting and sorting', (): void => {
      const config = { ...mockConfig, xField: 'year_field' }
      const spec = createHeatmapSpec(config, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x.format).toBe('%Y')
      expect(spec.encoding.x.timeUnit).toBe('year')
      expect(spec.encoding.x.labelAngle).toBe(-45)
    })

    it('should apply day of week sorting', (): void => {
      const config = { ...mockConfig, xField: 'day_of_week_field' }
      const spec = createHeatmapSpec(config, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x.sort).toEqual([
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ])
    })
  })

  describe('title formatting', (): void => {
    it('should convert snake_case to Capitalized Words', (): void => {
      mockColumns.set('snake_case_field', {
        name: 'snake_case_field',
        type: ColumnType.STRING,
        description: undefined,
      } as ResultColumn)

      const config = { ...mockConfig, xField: 'snake_case_field' }
      const spec = createHeatmapSpec(config, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x.title).toBe('Snake Case Field')
    })

    it('should use description when available', (): void => {
      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x.title).toBe('Product Category')
      expect(spec.encoding.y.title).toBe('Sales Region')
      expect(spec.encoding.color.title).toBe('Total Sales')
    })

    it('should fallback to field name when description is missing', (): void => {
      mockColumns.set('field_without_desc', {
        name: 'field_without_desc',
        type: ColumnType.STRING,
        description: undefined,
      } as ResultColumn)

      const config = { ...mockConfig, xField: 'field_without_desc' }
      const spec = createHeatmapSpec(config, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x.title).toBe('Field Without Desc')
    })
  })

  describe('edge cases', (): void => {
    it('should handle empty columns map', (): void => {
      const emptyColumns = new Map<string, ResultColumn>()
      const spec = createHeatmapSpec(mockConfig, emptyColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x.type).toBe('nominal')
      expect(spec.encoding.y.type).toBe('nominal')
      expect(spec.encoding.color.type).toBe('nominal')
    })

    it('should handle null/undefined config fields', (): void => {
      const nullConfig = {
        chartType: 'heatmap',
        xField: null,
        yField: null,
        colorField: null,
      } as any

      const spec = createHeatmapSpec(nullConfig, mockColumns, mockTooltipFields, mockIntChart)

      expect(spec.encoding.x).toEqual({})
      expect(spec.encoding.y).toEqual({})
      expect(spec.encoding.color.field).toBeNull()
    })

    it('should handle large intChart array', (): void => {
      const largeIntChart: Array<Partial<ChartConfig>> = Array.from({ length: 100 }, (_, i) => ({
        xField: `category${i}`,
        yField: `region${i}`,
      }))

      const spec = createHeatmapSpec(mockConfig, mockColumns, mockTooltipFields, largeIntChart)

      const selectParam = spec.params.find((p: any) => p.name === 'select')
      expect(selectParam).toBeDefined()
      expect(selectParam!.value).toHaveLength(100)
    })
  })
})
