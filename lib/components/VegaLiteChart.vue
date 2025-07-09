<template>
  <div class="vega-lite-chart no-drag" :class="{ 'overflow-hidden': !showingControls }">
    <!-- Toggle button always visible -->
    <div class="controls-toggle" v-if="showControls">
      <button
        v-if="!showingControls"
        @click="downloadChart"
        class="download-btn"
        data-testid="download-chart-btn"
        title="Download chart as PNG"
      >
        <i class="mdi mdi-download-outline icon"></i>
        <!-- <span>PNG</span> -->
      </button>
      <button
        @click="toggleControls"
        class="toggle-controls-btn"
        :class="{ active: showingControls }"
        data-testid="toggle-chart-controls-btn"
      >
        <i
          :class="showingControls ? 'mdi mdi-eye-outline' : 'mdi mdi-cog-outline'"
          class="icon"
        ></i>
        <span>{{ showingControls ? 'View Chart' : 'Edit' }}</span>
      </button>
    </div>

    <!-- Content area with conditional rendering -->
    <div class="chart-content-area">
      <!-- Chart visualization area - only show when controls are hidden -->
      <div
        v-show="!showingControls"
        ref="vegaContainer"
        class="vega-container"
        data-testid="vega-chart-container"
      ></div>

      <!-- Controls panel - only show when toggled -->
      <div v-if="showingControls" class="chart-controls-panel">
        <div class="inner-padding">
          <div class="control-section">
            <div class="chart-type-icons">
              <button
                v-for="type in charts"
                :key="type.value"
                @click="updateConfig('chartType', type.value)"
                class="chart-icon"
                :class="{ selected: internalConfig.chartType === type.value }"
                :title="type.label"
                :data-testid="`chart-type-${type.value}`"
              >
                <div class="icon-container">
                  <i :class="type.icon" class="icon"></i>
                </div>
              </button>
            </div>
          </div>

          <!-- Group axes controls  -->
          <div class="control-section" v-if="visibleControls.some((c) => c.filterGroup === 'axes')">
            <label class="control-section-label">Axes</label>
            <div
              v-for="control in visibleControls.filter((c) => c.filterGroup === 'axes')"
              :key="control.id"
              class="control-group no-drag"
            >
              <label class="chart-label" :for="control.id">{{ control.label }}</label>
              <select
                :id="control.id"
                :value="internalConfig[control.field]"
                @change="updateConfig(control.field, ($event.target as HTMLInputElement).value)"
                class="form-select no-drag"
              >
                <option v-if="control.allowEmpty" value="">None</option>
                <option
                  v-for="column in filteredColumnsInternal(control.columnFilter)"
                  :key="column.name"
                  :value="column.name"
                >
                  {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
                </option>
              </select>
            </div>
          </div>

          <!-- Group appearance controls -->
          <div
            class="control-section"
            v-if="visibleControls.some((c) => c.filterGroup === 'appearance')"
          >
            <label class="control-section-label">Appearance</label>
            <div
              v-for="control in visibleControls.filter((c) => c.filterGroup === 'appearance')"
              :key="control.id"
              class="control-group no-drag"
            >
              <label class="chart-label" :for="control.id">{{ control.label }}</label>

              <input
                v-if="control.field === 'hideLegend'"
                type="checkbox"
                :id="control.id"
                :checked="internalConfig[control.field]"
                @change="
                  updateConfig(
                    control.field,
                    ($event.target as HTMLInputElement).checked ? 'true' : 'false',
                  )
                "
                data-testid="toggle-legend"
              />

              <select
                v-else
                :id="control.id"
                :value="internalConfig[control.field]"
                @change="updateConfig(control.field, ($event.target as HTMLInputElement).value)"
                class="form-select no-drag"
              >
                <option v-if="control.allowEmpty" value="">None</option>
                <option
                  v-for="column in filteredColumnsInternal(control.columnFilter)"
                  :key="column.name"
                  :value="column.name"
                >
                  {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
                </option>
              </select>
            </div>
          </div>

          <!-- Group advanced controls -->
          <div
            class="control-section"
            v-if="visibleControls.some((c) => c.id === 'trellis-field') || true"
          >
            <label class="control-section-label">Advanced</label>
            <!-- Debug mode toggle -->
            <div class="control-group no-drag">
              <label class="chart-label" for="debug-mode-toggle">Debug Mode</label>
              <div class="toggle-switch-container">
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    id="debug-mode-toggle"
                    :checked="internalConfig.showDebug"
                    @change="toggleDebugMode"
                    data-testid="debug-mode-toggle"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <!-- Existing trellis field control -->
            <div
              v-for="control in visibleControls.filter((c) => c.id === 'trellis-field')"
              :key="control.id"
              class="control-group no-drag"
            >
              <label class="chart-label" :for="control.id">{{ control.label }}</label>
              <select
                :id="control.id"
                :value="internalConfig[control.field]"
                @change="updateConfig(control.field, ($event.target as HTMLInputElement).value)"
                class="form-select no-drag"
              >
                <option v-if="control.allowEmpty" value="">None</option>
                <option
                  v-for="column in filteredColumnsInternal(control.columnFilter)"
                  :key="column.name"
                  :value="column.name"
                >
                  {{ column.name }}{{ column.description ? ` - ${column.description}` : '' }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  type Ref,
  watch,
  onMounted,
  computed,
  inject,
  onUnmounted,
} from 'vue'
import type { PropType } from 'vue'
import vegaEmbed from 'vega-embed'
import type { View } from 'vega'
import type { ResultColumn, Row, ChartConfig, FieldKey } from '../editors/results'
import { ColumnType } from '../editors/results'
import Tooltip from './Tooltip.vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { Controls, Charts, type ChartControl } from '../dashboards/constants'
import {
  determineDefaultConfig,
  filteredColumns,
  determineEligibleChartTypes,
  convertTimestampToISODate,
  isCategoricalColumn,
  isGeographicColumn,
} from '../dashboards/helpers'

import { generateVegaSpec } from '../dashboards/spec'
import { debounce } from '../utility/debounce'

import type { ScenegraphEvent, SignalValue } from 'vega'

const DATETIME_COLS = [ColumnType.DATE, ColumnType.DATETIME, ColumnType.TIMESTAMP]

export default defineComponent({
  name: 'VegaLiteChart',
  components: { Tooltip },
  props: {
    data: {
      type: Array as PropType<Readonly<Row[]>>,
      required: true,
    },
    columns: {
      type: Object as PropType<Map<string, ResultColumn>>,
      required: true,
    },
    initialConfig: {
      type: Object as PropType<ChartConfig | undefined | null>,
      default: undefined,
    },
    showControls: {
      type: Boolean,
      default: true,
    },
    containerHeight: Number,
    containerWidth: Number,
    onChartConfigChange: {
      type: Function as PropType<(config: ChartConfig) => void>,
      default: () => {},
    },
    chartSelection: {
      type: Array as PropType<Object[]>,
      default: () => {},
    },
    chartTitle: {
      type: String,
      default: '',
    },
  },

  setup(props, { emit }) {
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    const isMobile = inject<Ref<boolean>>('isMobile', ref(false))
    const lastSpec = ref<string | null>(null)
    const lastBrushClearTime = ref(0)
    const lastClickTime = ref(0)
    const pendingBackgroundClick = ref(false)
    const vegaView = ref<View | null>(null)
    const COORDINATION_TIMEOUT = 750 // ms to wait before processing a brush clear as background click

    // event hookups
    //@ts-ignore
    let removeEventListener: (() => void) | null = null
    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }

    // Create a computed property for the current theme
    const currentTheme = computed(() => settingsStore.settings.theme)
    const vegaContainer = ref<HTMLElement | null>(null)

    // Controls panel state
    const showingControls = ref(false)
    // Initialize on mount
    onMounted(() => {
      lastSpec.value = null
      initializeConfig()
      renderChart()
    })
    // Toggle controls visible/hidden
    const toggleControls = () => {
      showingControls.value = !showingControls.value
      // If switching to chart view, need to render chart after toggle
      if (!showingControls.value) {
        setTimeout(() => {
          renderChart()
        }, 100) // Short delay to allow DOM to update
      }
    }

    // Download chart as PNG
    const downloadChart = async () => {
      if (!vegaView.value || showingControls.value) {
        console.warn('Chart view not available for download')
        return
      }

      try {
        // Generate PNG image from the Vega view
        const imageUrl = await vegaView.value.toImageURL('png', 2) // 2x scale for better quality

        // Create download link
        const link = document.createElement('a')
        link.download = `chart-${Date.now()}.png`
        link.href = imageUrl

        // Trigger download
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        console.log('Chart downloaded successfully')
      } catch (error) {
        console.error('Error downloading chart:', error)
        // Optionally emit an error event or show a toast notification
        emit('download-error', error)
      }
    }

    // Toggle debug mode
    const toggleDebugMode = () => {
      internalConfig.value.showDebug = !internalConfig.value.showDebug

      // Notify parent component if the callback is provided
      if (props.onChartConfigChange) {
        props.onChartConfigChange({ ...internalConfig.value })
      }

      // Re-render chart to apply debug mode changes
      if (!showingControls.value) {
        renderChart(true)
      }
    }

    // Flag to determine if we should show the trellis option
    const hasTrellisOption = computed(() => {
      return props.data && props.data.length > 0 && Object.keys(props.columns).length > 2
    })

    // Internal configuration that merges provided config with defaults
    const internalConfig = ref<ChartConfig>({
      chartType: 'bar',
      xField: '',
      yField: '',
      yField2: '',
      colorField: '',
      sizeField: '',
      groupField: '',
      trellisField: '',
      geoField: '',
      showDebug: false,
    })

    // Determine reasonable defaults based on column types
    const initializeConfig = (force: boolean = false) => {
      if (props.initialConfig && !force) {
        // Use external config if provided
        internalConfig.value = { ...internalConfig.value, ...props.initialConfig }
      } else {
        // Auto select chart type and fields based on data types
        const configDefaults = determineDefaultConfig(props.data, props.columns)
        internalConfig.value = { ...internalConfig.value, ...configDefaults }
      }
      if (props.onChartConfigChange) {
        console.log('Chart config changed:', { ...internalConfig.value })
        props.onChartConfigChange({ ...internalConfig.value })
      }
    }

    const filteredColumnsInternal = (
      type:
        | 'numeric'
        | 'categorical'
        | 'temporal'
        | 'latitude'
        | 'longitude'
        | 'geographic'
        | 'all',
    ) => {
      return filteredColumns(type, props.columns)
    }

    // Generate Vega-Lite spec based on current configuration
    const generateVegaSpecInternal = () => {
      return generateVegaSpec(
        props.data,
        internalConfig.value,
        props.columns,
        props.chartSelection,
        isMobile.value,
        props.chartTitle,
        currentTheme.value,
      )
    }
    const handleBrush = debounce((_: string, item: SignalValue) => {
      if (item && ['line', 'area'].includes(internalConfig.value.chartType)) {
        if (!internalConfig.value.xField) {
          return
        }
        let timeField = props.columns.get(internalConfig.value.xField)
        if (!timeField) {
          return
        }
        let dateLookup = internalConfig.value.xField
        if (DATETIME_COLS.includes(timeField?.type)) {
          dateLookup = 'yearmonthdate_' + internalConfig.value.xField
        }

        const values = item[dateLookup as keyof typeof item] ?? []
        // Check if values exists and has elements in a single condition
        if (!values || !Array.isArray(values) || values.length === 0) {
          // Brush is being cleared - record the time and schedule a background click
          lastBrushClearTime.value = Date.now()
          // if the last click time was within the coordination timeout, cancel the background click
          if (Date.now() - lastClickTime.value < COORDINATION_TIMEOUT) {
            console.log('Cancelling background click due to recent point click')
            pendingBackgroundClick.value = false
            return
          }
          console.log(
            'Scheduling background click due to brush clear, elapsed since last point click:',
            Date.now() - lastClickTime.value,
          )
          emit('background-click')

          return
        }
        let start = values[0]
        let end = values[values.length - 1]
        let timeAddress = timeField?.address
        if (!timeField || !timeAddress) {
          return
        }
        if (DATETIME_COLS.includes(timeField?.type)) {
          emit('dimension-click', {
            filters: {
              [timeAddress]: [convertTimestampToISODate(start), convertTimestampToISODate(end)],
            },
            chart: { [internalConfig.value.xField]: [start, end] },
            append: false,
          })
        } else if ([ColumnType.NUMBER, ColumnType.INTEGER].includes(timeField?.type)) {
          emit('dimension-click', {
            filters: { [timeAddress]: [start, end] },
            chart: { [internalConfig.value.xField]: [start, end] },
            append: false,
          })
        }
      } else {
        emit('background-click')
      }
    }, 500)
    // @ts-ignore
    const handlePointClick = (event: ScenegraphEvent, item: any) => {
      const currentTime = Date.now()
      lastClickTime.value = currentTime
      let append = event.shiftKey
      if (item && item.datum) {
        if (internalConfig.value.geoField && internalConfig.value.geoField) {
          let geoField = props.columns.get(internalConfig.value.geoField)
          let geoConcept = geoField?.address
          if (!geoConcept || !geoField) {
            return
          }
          emit('dimension-click', {
            filters: { [geoConcept]: item.datum[internalConfig.value.geoField] },
            chart: { [internalConfig.value.geoField]: item.datum[internalConfig.value.geoField] },
            append,
          })
        } else {
          let baseFilters = {}
          let baseChart = {}
          if (internalConfig.value.colorField) {
            let colorField = props.columns.get(internalConfig.value.colorField)
            if (colorField && (isCategoricalColumn(colorField) || isGeographicColumn(colorField))) {
              let colorConcept = colorField?.address
              if (!colorConcept || !colorField) {
                return
              }
              baseFilters = { [colorConcept]: item.datum[internalConfig.value.colorField] }
              baseChart = {
                [internalConfig.value.colorField]: item.datum[internalConfig.value.colorField],
              }
            }
          }
          // Original handling for other chart types
          let xFieldRaw = internalConfig.value.xField
          let yFieldRaw = internalConfig.value.yField
          if (!xFieldRaw || !yFieldRaw) {
            return
          }
          //map the fields to the actual column names from the props.columns - the fields will be names with . replaced with _
          let xField = props.columns.get(xFieldRaw)?.address
          let yField = props.columns.get(yFieldRaw)?.address
          if (!xField || !yField) {
            return
          }
          // eligible are categorical and temporal fields
          let eligible = filteredColumnsInternal('categorical').map((x) => x.name)
          eligible = eligible.concat(filteredColumnsInternal('geographic').map((x) => x.name))
          eligible = eligible.concat(filteredColumnsInternal('latitude').map((x) => x.name))
          eligible = eligible.concat(filteredColumnsInternal('longitude').map((x) => x.name))
          if (internalConfig.value.chartType !== 'area') {
            eligible = eligible.concat(filteredColumnsInternal('temporal').map((x) => x.name))
          }

          if (item.datum[xFieldRaw] && eligible.includes(xFieldRaw)) {
            // add to baseFilters and chart
            let xFilterValue = item.datum[xFieldRaw]
            // @ts-ignore
            if (DATETIME_COLS.includes(props.columns.get(xFieldRaw)?.type)) {
              xFilterValue = convertTimestampToISODate(item.datum[xFieldRaw])
            }
            baseFilters = { ...baseFilters, [xField]: xFilterValue }
            baseChart = { ...baseChart, [xFieldRaw]: item.datum[xFieldRaw] }
          }
          // todo: figure out if we want to support both?
          else if (item.datum[yFieldRaw] && eligible.includes(yFieldRaw)) {
            // add to baseFilters and chart
            let yFilterValue = item.datum[yFieldRaw]
            // @ts-ignore
            if (DATETIME_COLS.includes(props.columns.get(yFieldRaw)?.type)) {
              yFilterValue = convertTimestampToISODate(item.datum[yFieldRaw])
            }
            baseFilters = { ...baseFilters, [yField]: yFilterValue }
            baseChart = { ...baseChart, [yFieldRaw]: item.datum[yFieldRaw] }
          }
          emit('dimension-click', {
            filters: baseFilters,
            chart: baseChart,
            append,
          })
          emit('point-click', item.datum)
        }
      } else {
        emit('background-click')
      }
    }

    // Render the chart
    const renderChart = async (force: boolean = false) => {
      if (!vegaContainer.value || showingControls.value) return

      const spec = generateVegaSpecInternal()
      if (!spec) return
      const currentSpecString = JSON.stringify(spec)

      if (lastSpec.value === currentSpecString && !force) {
        console.log('Skipping render - spec unchanged')
        return
      }
      lastSpec.value = currentSpecString
      try {
        await vegaEmbed(vegaContainer.value, spec, {
          actions: internalConfig.value.showDebug ? true : false,
          theme: currentTheme.value === 'dark' ? 'dark' : undefined,
          renderer: 'canvas', // Use canvas renderer for better performance with large datasets
        }).then((result) => {
          // Store the view reference for downloading
          vegaView.value = result.view

          if (['area', 'line'].includes(internalConfig.value.chartType)) {
            result.view.addSignalListener('brush', handleBrush)
            result.view.addEventListener('click', handlePointClick)
            removeEventListener = () => {
              result.view.removeSignalListener('brush', handleBrush)
              result.view.removeEventListener('click', handlePointClick)
            }
          } else if (isMobile.value) {
            result.view.addEventListener('touchend', handlePointClick)
            removeEventListener = () => {
              result.view.removeEventListener('touchend', handlePointClick)
            }
          } else {
            result.view.addEventListener('click', handlePointClick)

            removeEventListener = () => {
              result.view.removeEventListener('click', handlePointClick)
            }
          }
        })
      } catch (error) {
        console.error('Error rendering Vega chart:', error)
      }
    }

    const updateConfig = (field: keyof ChartConfig, value: string) => {
      // @ts-ignore
      internalConfig.value[field] = value
      if (field === 'chartType') {
        // Reset other fields when changing chart type
        const configDefaults = determineDefaultConfig(
          props.data,
          props.columns,
          value as
            | 'bar'
            | 'line'
            | 'barh'
            | 'point'
            | 'usa-map'
            | 'tree'
            | 'area'
            | 'headline'
            | 'donut'
            | 'heatmap',
        )
        // Normal chart type fields
        internalConfig.value.xField = configDefaults.xField
        internalConfig.value.yField = configDefaults.yField
        internalConfig.value.yField2 = configDefaults.yField2

        internalConfig.value.colorField = configDefaults.colorField
        internalConfig.value.sizeField = configDefaults.sizeField
        internalConfig.value.groupField = configDefaults.groupField
        internalConfig.value.trellisField = configDefaults.trellisField
        internalConfig.value.geoField = configDefaults.geoField
        internalConfig.value.showDebug = configDefaults.showDebug
      }

      // Notify parent component if the callback is provided
      if (props.onChartConfigChange) {
        props.onChartConfigChange({ ...internalConfig.value })
      }
    }

    onUnmounted(() => {
      // Clean up event listener if it exists
      if (removeEventListener) {
        removeEventListener()
        removeEventListener = null
      }
      // Clear the view reference
      vegaView.value = null
    })

    // Watch for changes in data, columns or config
    watch(
      () => [props.containerHeight, props.containerWidth],
      () => renderChart(true),
    )
    // watch(
    //   () => props.data,
    //   () => renderChart(true),
    //   { deep: true },
    // )
    watch(
      () => [props.columns, props.data],
      () => {
        // check if any internal config is no longer found
        let force = false
        // check that all if xField, yField, colorField, sizeField, groupField, trellisField are still in the columns if they are set
        for (const field of [
          'xField',
          'yField',
          'colorField',
          'sizeField',
          'groupField',
          'geoField',
          'trellisField',
        ] as FieldKey[]) {
          if (internalConfig.value[field] && !props.columns.has(internalConfig.value[field])) {
            force = true
            internalConfig.value[field] = ''
          }
        }
        if (force) {
          initializeConfig(force) // force column reset on column change
        }

        renderChart()
      },
      { deep: true },
    )
    // watch(
    //   () => props.config,
    //   () => {
    //     if (props.config) {
    //       internalConfig.value = { ...internalConfig.value, ...props.config }
    //       if (!showingControls.value) {
    //         renderChart()
    //       }
    //     }
    //   },
    //   { deep: true },
    // )
    const eligible = computed(() => {
      return Charts.filter((x) =>
        determineEligibleChartTypes(props.data, props.columns).includes(x.value),
      )
    })
    return {
      vegaContainer,
      internalConfig,
      renderChart,
      filteredColumnsInternal,
      hasTrellisOption,
      showingControls,
      updateConfig,
      toggleControls,
      toggleDebugMode,
      downloadChart,
      charts: eligible,
    }
  },
  computed: {
    // Computed property to get controls visible for the current chart type
    visibleControls(): ChartControl[] {
      return Controls.filter((control) => {
        // Special case for trellis field - only show if hasTrellisOption is true
        if (control.id === 'trellis-field' && !this.hasTrellisOption) {
          return false
        }
        return control.visibleFor.includes(this.internalConfig.chartType)
      })
    },
  },
})
</script>

<style scoped>
.overflow-hidden {
  overflow-y: hidden;
}

.vega-lite-chart {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.controls-toggle {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  display: flex;
  gap: 4px;
}

.toggle-controls-btn,
.download-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border: 1px solid var(--border-light);
  /* background-color: var(--button-bg); */
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--button-font-size);
  transition: background-color 0.2s;
}

.toggle-controls-btn:hover,
.download-btn:hover {
  background-color: var(--button-mouseover);
}

.download-btn:disabled {
  background-color: var(--border-light);
  color: var(--text-color-muted);
  cursor: not-allowed;
}

.download-btn:disabled:hover {
  background-color: var(--border-light);
}

.toggle-controls-btn.active {
  background-color: var(--special-text);
  color: white;
}

.chart-content-area {
  flex: 1;
  width: 100%;
  height: 100%;
  position: relative;
}

.vega-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chart-controls-panel {
  width: calc(100% - 10px);
  height: 100%;
  padding: 4px;
  background-color: var(--bg-color);
  overflow-y: scroll;
}

.inner-padding {
  padding: 5px;
}

.control-section {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 8px;
}

.control-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.control-section-label {
  font-weight: 600;
  font-size: var(--small-font-size);
  display: block;
  margin-bottom: 4px;
  color: var(--text-color);
}

.control-group {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-label {
  font-size: var(--small-font-size);
  margin-bottom: 0;
  white-space: nowrap;
  min-width: 80px;
  /* Give labels a consistent width */
  flex-shrink: 0;
}

.form-select {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 2px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: var(--small-font-size);
  height: var(--chart-control-height);
  flex-grow: 1;
}

.chart-type-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 6px;
}

.chart-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--chart-control-height);
  height: var(--chart-control-height);
  border: 1px solid var(--border-light);
  border-radius: 2px;
  background-color: var(--button-bg);
  cursor: pointer;
  transition: background-color 0.2s;
}

.chart-icon:hover {
  background-color: var(--button-mouseover);
}

.chart-icon.selected {
  background-color: var(--special-text);
  color: white;
}

.icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon {
  font-size: var(--icon-size);
}

/* Styles for the toggle switch */
.toggle-switch-container {
  display: flex;
  align-items: center;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border-light);
  transition: 0.4s;
  border-radius: 10px;
}

.toggle-slider:before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

input:checked + .toggle-slider {
  background-color: var(--special-text);
}

input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .form-select {
    height: var(--chart-control-height);
  }
}
</style>
