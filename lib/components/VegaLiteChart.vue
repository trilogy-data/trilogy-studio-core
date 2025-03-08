<template>
  <div class="vega-lite-chart">
    <div v-if="showControls" class="chart-controls mb-4">
      <div class="control-group">
        <label for="group-by">Chart Type</label>
        <div class="chart-type-icons">
          <button
            v-for="type in charts"
            :key="type.value"
            @click="internalConfig.chartType = type.value"
            class="chart-icon"
            :class="{ selected: internalConfig.chartType === type.value }"
          >
            <div class="icon-container">
              <Tooltip :content="type.label" position="bottom">
                <i :class="type.icon" class="icon"></i>
              </Tooltip>
            </div>
          </button>
        </div>
      </div>

      <div class="control-group" v-if="['boxplot', 'heatmap'].includes(internalConfig.chartType)">
        <label for="group-by">Group By</label>
        <select id="group-by" v-model="internalConfig.groupField" class="form-select">
          <option
            v-for="column in filteredColumns('categorical')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div class="control-group" v-if="internalConfig.chartType === 'barh'">
        <label for="y-axis">Category Axis</label>
        <select id="y-axis" v-model="internalConfig.yField" class="form-select">
          <option
            v-for="column in filteredColumns('categorical')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div class="control-group" v-if="internalConfig.chartType === 'barh'">
        <label for="x-axis">Value Axis</label>
        <select id="x-axis" v-model="internalConfig.xField" class="form-select">
          <option
            v-for="column in filteredColumns('numeric')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div
        class="control-group"
        v-if="!['barh', 'heatmap', 'boxplot'].includes(internalConfig.chartType)"
      >
        <label for="x-axis">X Axis</label>
        <select id="x-axis" v-model="internalConfig.xField" class="form-select">
          <option
            v-for="column in filteredColumns(internalConfig.chartType === 'line' ? 'all' : 'all')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div
        class="control-group"
        v-if="!['barh', 'heatmap', 'boxplot'].includes(internalConfig.chartType)"
      >
        <label for="y-axis">Y Axis</label>
        <select id="y-axis" v-model="internalConfig.yField" class="form-select">
          <option
            v-for="column in filteredColumns('numeric')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div class="control-group" v-if="internalConfig.chartType === 'heatmap'">
        <label for="color-field">Value Field</label>
        <select id="color-field" v-model="internalConfig.colorField" class="form-select">
          <option
            v-for="column in filteredColumns('numeric')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div class="control-group" v-if="!['heatmap', 'boxplot'].includes(internalConfig.chartType)">
        <label for="color-by">Color By (optional)</label>
        <select id="color-by" v-model="internalConfig.colorField" class="form-select">
          <option value="">None</option>
          <option
            v-for="column in filteredColumns('categorical')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>

      <div class="control-group" v-if="internalConfig.chartType === 'line' && hasTrellisOption">
        <label for="trellisField">Split Chart By</label>
        <select id="trellisField" v-model="internalConfig.trellisField" class="form-select">
          <option value="">None</option>
          <option
            v-for="column in filteredColumns('categorical')"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
          </option>
        </select>
      </div>
    </div>

    <div ref="vegaContainer" class="vega-container"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, onMounted, computed } from 'vue'
import type { PropType } from 'vue'
import vegaEmbed from 'vega-embed'
import { ColumnType } from '../editors/results'
import type { ResultColumn, Row, ChartConfig } from '../editors/results'
import Tooltip from './Tooltip.vue'

export default defineComponent({
  name: 'VegaLiteChart',
  components: { Tooltip },
  data: () => ({
    charts: [
      {
        value: 'bar',
        label: 'Bar Chart',
        icon: 'mdi mdi-chart-bar',
      },
      {
        value: 'barh',
        label: 'Horizontal Bar',
        icon: 'mdi mdi-chart-timeline',
      },
      {
        value: 'line',
        label: 'Line Chart',
        icon: 'mdi mdi-chart-line',
      },
      {
        value: 'point',
        label: 'Scatter Plot',
        icon: 'mdi mdi-chart-scatter-plot',
      },
      {
        value: 'area',
        label: 'Area Chart',
        icon: 'mdi mdi-chart-areaspline',
      },
      {
        value: 'heatmap',
        label: 'Heatmap',
        icon: 'mdi mdi-sun-thermometer-outline',
      },
      {
        value: 'boxplot',
        label: 'Box Plot',
        icon: 'mdi mdi-chart-box',
      },
    ],
  }),
  props: {
    data: {
      type: Array as PropType<Readonly<Row[]>>,
      required: true,
    },
    columns: {
      type: Object as PropType<Map<string, ResultColumn>>,
      required: true,
    },
    config: {
      type: Object as PropType<ChartConfig>,
      default: null,
    },
    showControls: {
      type: Boolean,
      default: true,
    },
  },

  setup(props) {
    const vegaContainer = ref<HTMLElement | null>(null)

    // Flag to determine if we should show the trellis option
    const hasTrellisOption = computed(() => {
      return props.data && props.data.length > 0 && Object.keys(props.columns).length > 2
    })

    // Internal configuration that merges provided config with defaults
    const internalConfig = ref<ChartConfig>({
      chartType: 'bar',
      xField: '',
      yField: '',
      yAggregation: 'sum',
      colorField: '',
      groupField: '',
      trellisField: '',
    })

    // Filter columns by type for UI controls
    const filteredColumns = (filter: 'numeric' | 'categorical' | 'temporal' | 'all') => {
      const result: ResultColumn[] = []

      props.columns.forEach((column, _) => {
        if (filter === 'all') {
          result.push(column)
        } else if (filter === 'numeric' && isNumericColumn(column)) {
          result.push(column)
        } else if (filter === 'categorical' && isCategoricalColumn(column)) {
          result.push(column)
        } else if (filter === 'temporal' && isTemporalColumn(column)) {
          result.push(column)
        }
      })

      return result
    }

    // Helper functions to identify column types
    const isNumericColumn = (column: ResultColumn): boolean => {
      return [
        ColumnType.NUMBER,
        ColumnType.INTEGER,
        ColumnType.FLOAT,
        ColumnType.MONEY,
        ColumnType.PERCENT,
      ].includes(column.type)
    }

    const isTemporalColumn = (column: ResultColumn): boolean => {
      return [ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIME, ColumnType.TIMESTAMP].includes(
        column.type,
      )
    }

    const isCategoricalColumn = (column: ResultColumn): boolean => {
      return [
        ColumnType.STRING,
        ColumnType.BOOLEAN,
        ColumnType.URL,
        ColumnType.EMAIL,
        ColumnType.PHONE,
      ].includes(column.type)
    }

    // Determine reasonable defaults based on column types
    const initializeConfig = () => {
      if (props.config) {
        // Use external config if provided
        internalConfig.value = { ...internalConfig.value, ...props.config }
      } else {
        // Auto select chart type and fields based on data types
        const configDefaults = determineDefaultConfig()

        internalConfig.value = { ...internalConfig.value, ...configDefaults }
      }
    }

    // Determine default configuration based on column types
    const determineDefaultConfig = (): Partial<ChartConfig> => {
      const defaults: Partial<ChartConfig> = {}

      const numericColumns = filteredColumns('numeric')
      const categoricalColumns = filteredColumns('categorical')
      const temporalColumns = filteredColumns('temporal')

      if (numericColumns.length === 0) {
        console.log('No numeric columns found')
        return defaults
      }

      // Select appropriate chart type based on available column types
      if (temporalColumns.length > 0 && numericColumns.length > 0) {
        // Time series data - use line chart
        defaults.chartType = 'line'
        defaults.xField = temporalColumns[0].name
        defaults.yField = numericColumns[0].name

        // If we have a categorical column, use it for color
        if (categoricalColumns.length > 0) {
          defaults.colorField = categoricalColumns[0].name
        }
      } else if (categoricalColumns.length > 0 && numericColumns.length > 0) {
        // Categorical vs numeric - check category count for bar orientation
        const firstCatField = categoricalColumns[0].name
        const uniqueCategories = new Set()

        for (let i = 0; i < Math.min(props.data.length, 50); i++) {
          if (props.data[i] && props.data[i][firstCatField] !== undefined) {
            uniqueCategories.add(props.data[i][firstCatField])
          }
        }

        if (uniqueCategories.size > 7) {
          // Many categories - use horizontal bar
          defaults.chartType = 'barh'
          defaults.yField = firstCatField
          defaults.xField = numericColumns[0].name
        } else {
          // Few categories - use vertical bar
          defaults.chartType = 'bar'
          defaults.xField = firstCatField
          defaults.yField = numericColumns[0].name
        }

        // If we have a second categorical column, use it for color
        if (categoricalColumns.length > 1) {
          defaults.colorField = categoricalColumns[1].name
        }
      } else if (numericColumns.length >= 2) {
        // Multiple numeric columns - use scatter plot
        defaults.chartType = 'point'
        defaults.xField = numericColumns[0].name
        defaults.yField = numericColumns[1].name

        // If we have a categorical column, use it for color
        if (categoricalColumns.length > 0) {
          defaults.colorField = categoricalColumns[0].name
        }
      } else if (categoricalColumns.length >= 2 && numericColumns.length > 0) {
        // Two categorical dimensions and a numeric - use heatmap
        defaults.chartType = 'heatmap'
        defaults.xField = categoricalColumns[0].name
        defaults.yField = categoricalColumns[1].name
        defaults.colorField = numericColumns[0].name
      }

      return defaults
    }

    // Helper to get field type for Vega-Lite
    const getVegaFieldType = (fieldName: string): string => {
      if (!fieldName || !props.columns.get(fieldName)) return 'nominal'

      const column = props.columns.get(fieldName)
      if (!column) return 'nominal'
      if (isTemporalColumn(column)) {
        return 'temporal'
      } else if (isNumericColumn(column)) {
        return 'quantitative'
      } else {
        return 'nominal'
      }
    }

    // Format hint based on column type
    const getFormatHint = (fieldName: string): any => {
      if (!fieldName || !props.columns.get(fieldName)) return {}

      const column = props.columns.get(fieldName)
      if (!column) return {}

      switch (column.type) {
        case ColumnType.MONEY:
          return { format: '$,.2f' }
        case ColumnType.PERCENT:
          return { format: '.1%' }
        case ColumnType.DATE:
          return { timeUnit: 'yearmonthdate' }
        case ColumnType.TIME:
          return { timeUnit: 'hoursminutesseconds' }
        case ColumnType.DATETIME:
          return { timeUnit: 'yearmonthdate-hours' }
        default:
          return {}
      }
    }

    // Generate tooltip fields with proper formatting
    const generateTooltipFields = (
      _: string,
      xField: string,
      yField: string,
      colorField?: string,
    ): any[] => {
      const fields: any[] = []

      if (xField && props.columns.get(xField)) {
        fields.push({
          field: xField,
          type: getVegaFieldType(xField),
          title: props.columns.get(xField)?.description || xField,
          ...getFormatHint(xField),
        })
      }

      if (yField && props.columns.get(yField)) {
        fields.push({
          field: yField,
          type: getVegaFieldType(yField),
          title: props.columns.get(yField)?.description || yField,
          ...getFormatHint(yField),
        })
      }

      if (colorField && props.columns.get(colorField)) {
        fields.push({
          field: colorField,
          type: getVegaFieldType(colorField),
          title: props.columns.get(colorField)?.description || colorField,
          ...getFormatHint(colorField),
        })
      }

      return fields
    }

    // Generate Vega-Lite spec based on current configuration
    const generateVegaSpec = () => {
      if (!props.data || props.data.length === 0) return null

      const config = internalConfig.value
      let spec: any = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: { values: props.data },
        width: 'container',
        height: 300,
      }

      // Basic encoding object that we'll modify based on chart type
      let encoding: any = {}

      // Add color encoding if specified (and not for special chart types)
      if (config.colorField && !['heatmap'].includes(config.chartType)) {
        const fieldType = getVegaFieldType(config.colorField)
        encoding.color = {
          field: config.colorField,
          type: fieldType,
          title: props.columns.get(config.colorField)?.description || config.colorField,
          scale: fieldType === 'quantitative' ? { scheme: 'viridis' } : { scheme: 'category10' },
          ...getFormatHint(config.colorField),
        }
      }

      // Handle trellis (facet) layout if specified
      if (config.trellisField && config.chartType === 'line') {
        spec.facet = {
          field: config.trellisField,
          type: getVegaFieldType(config.trellisField),
          title: props.columns.get(config.trellisField)?.description || config.trellisField,
        }
        spec.spec = { width: 'container', height: 200 }
      }

      const tooltipFields = generateTooltipFields(
        config.chartType,
        config.xField || '',
        config.yField || '',
        config.colorField,
      )

      // Build encodings for specific chart types
      switch (config.chartType) {
        case 'bar':
          const barSpec = {
            mark: 'bar',
            encoding: {
              x: {
                field: config.xField,
                type: getVegaFieldType(config.xField || ''),
                title: props.columns.get(config.xField || '')?.description || config.xField,
                axis: { labelAngle: -45 },
                ...getFormatHint(config.xField || ''),
              },
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                ...getFormatHint(config.yField || ''),
              },
              tooltip: tooltipFields,
              ...encoding,
            },
          }

          if (config.trellisField) {
            spec.spec = barSpec
          } else {
            spec = { ...spec, ...barSpec }
          }

          break

        case 'barh':
          const barHSpec = {
            mark: 'bar',
            encoding: {
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                sort: '-x',
                ...getFormatHint(config.yField || ''),
              },
              x: {
                field: config.xField,
                type: getVegaFieldType(config.xField || ''),
                title: props.columns.get(config.xField || '')?.description || config.xField,
                ...getFormatHint(config.xField || ''),
              },
              tooltip: tooltipFields,
              ...encoding,
            },
          }

          if (config.trellisField) {
            spec.spec = barHSpec
          } else {
            spec = { ...spec, ...barHSpec }
          }
          break

        case 'line':
          const lineSpec = {
            mark: { type: 'line', point: true },
            encoding: {
              x: {
                field: config.xField,
                type: getVegaFieldType(config.xField || ''),
                title: props.columns.get(config.xField || '')?.description || config.xField,
                ...getFormatHint(config.xField || ''),
              },
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                ...getFormatHint(config.yField || ''),
              },
              tooltip: tooltipFields,
              ...encoding,
            },
          }

          if (config.trellisField) {
            spec.spec = lineSpec
          } else {
            spec = { ...spec, ...lineSpec }
          }
          break

        case 'point':
          const pointSpec = {
            mark: { type: 'point', filled: true },
            encoding: {
              x: {
                field: config.xField,
                type: getVegaFieldType(config.xField || ''),
                title: props.columns.get(config.xField || '')?.description || config.xField,
                ...getFormatHint(config.xField || ''),
              },
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                ...getFormatHint(config.yField || ''),
              },
              tooltip: tooltipFields,
              ...encoding,
            },
          }

          if (config.trellisField) {
            spec.spec = pointSpec
          } else {
            spec = { ...spec, ...pointSpec }
          }
          break

        case 'area':
          const areaSpec = {
            mark: { type: 'area', line: true, point: true },
            encoding: {
              x: {
                field: config.xField,
                type: getVegaFieldType(config.xField || ''),
                title: props.columns.get(config.xField || '')?.description || config.xField,
                ...getFormatHint(config.xField || ''),
              },
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                ...getFormatHint(config.yField || ''),
              },
              tooltip: tooltipFields,
              ...encoding,
            },
          }

          if (config.trellisField) {
            spec.spec = areaSpec
          } else {
            spec = { ...spec, ...areaSpec }
          }
          break

        case 'heatmap':
          const heatmapSpec = {
            mark: 'rect',
            encoding: {
              x: {
                field: config.xField,
                type: getVegaFieldType(config.xField || ''),
                title: props.columns.get(config.xField || '')?.description || config.xField,
                ...getFormatHint(config.xField || ''),
              },
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                ...getFormatHint(config.yField || ''),
              },
              color: {
                field: config.colorField,
                type: getVegaFieldType(config.colorField || ''),
                title: props.columns.get(config.colorField || '')?.description || config.colorField,
                scale: { scheme: 'viridis' },
                ...getFormatHint(config.colorField || ''),
              },
              tooltip: tooltipFields,
            },
          }

          if (config.trellisField) {
            spec.spec = heatmapSpec
          } else {
            spec = { ...spec, ...heatmapSpec }
          }
          break

        case 'boxplot':
          const boxplotSpec = {
            mark: { type: 'boxplot', extent: 'min-max' },
            encoding: {
              x: {
                field: config.groupField,
                type: getVegaFieldType(config.groupField || ''),
                title: props.columns.get(config.groupField || '')?.description || config.groupField,
                ...getFormatHint(config.groupField || ''),
              },
              y: {
                field: config.yField,
                type: getVegaFieldType(config.yField || ''),
                title: props.columns.get(config.yField || '')?.description || config.yField,
                ...getFormatHint(config.yField || ''),
              },
              tooltip: tooltipFields,
              ...encoding,
            },
          }

          if (config.trellisField) {
            spec.spec = boxplotSpec
          } else {
            spec = { ...spec, ...boxplotSpec }
          }
          break
      }

      return spec
    }

    // Render the chart
    const renderChart = async () => {
      if (!vegaContainer.value) return

      const spec = generateVegaSpec()
      if (!spec) return

      try {
        await vegaEmbed(vegaContainer.value, spec, {
          actions: true,
          renderer: 'canvas', // Use canvas renderer for better performance with large datasets
        })
      } catch (error) {
        console.error('Error rendering Vega chart:', error)
      }
    }

    // Initialize on mount
    onMounted(() => {
      initializeConfig()
      renderChart()
    })

    // Watch for changes in data, columns or config
    watch(() => props.data, renderChart, { deep: true })
    watch(
      () => props.columns,
      () => {
        initializeConfig()
        renderChart()
      },
      { deep: true },
    )
    watch(
      () => props.config,
      () => {
        if (props.config) {
          internalConfig.value = { ...internalConfig.value, ...props.config }
          renderChart()
        }
      },
      { deep: true },
    )

    // Watch for internal config changes
    watch(internalConfig, renderChart, { deep: true })

    return {
      vegaContainer,
      internalConfig,
      renderChart,
      filteredColumns,
      hasTrellisOption,
    }
  },
})
</script>

<style scoped>
.icon {
  font-size: 1.2rem;
}

.chart-type-icons {
  padding: 0.5rem;
}
.vega-lite-chart {
  width: 100%;
  margin: 0 auto;
}

.chart-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  vertical-align: middle;
  font-size: var(--font-size);
  padding-bottom: .5rem;
  padding-left: .5rem;
  padding-right: .5rem;
}

.control-group {
  display: flex;
  flex-direction: column;
  min-width: 150px;
  font-size: var(--font-size);
}

.form-select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-top: 0.25rem;
}

.vega-container {
  width: 100%;
  height: 100%;
}
</style>
