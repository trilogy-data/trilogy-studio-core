<template>
  <div class="vega-lite-chart no-drag" :class="{ 'overflow-hidden': !showingControls }">
    <!-- Controls moved to right side, middle aligned, vertically stacked -->
    <div class="controls-toggle" v-if="showControls">
      <button
        @click="downloadChart"
        class="control-btn"
        data-testid="download-chart-btn"
        title="Download chart as PNG"
      >
        <i class="mdi mdi-download-outline icon"></i>
      </button>
      <button
        @click="refreshChart"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Refresh chart"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
      <button
        @click="toggleControls"
        class="control-btn"
        :class="{ active: showingControls }"
        data-testid="toggle-chart-controls-btn"
        :title="showingControls ? 'View Chart' : 'Edit Chart'"
      >
        <i
          :class="showingControls ? 'mdi mdi-eye-outline' : 'mdi mdi-cog-outline'"
          class="icon"
        ></i>
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
                v-if="['hideLegend', 'showTitle'].includes(control.field)"
                type="checkbox"
                :id="control.id"
                :checked="internalConfig[control.field] as boolean"
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
import type { ResultColumn, Row, ChartConfig } from '../editors/results'
import Tooltip from './Tooltip.vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { Controls, Charts, type ChartControl } from '../dashboards/constants'
import {
  determineDefaultConfig,
  filteredColumns,
  determineEligibleChartTypes,
} from '../dashboards/helpers'
import { generateVegaSpec } from '../dashboards/spec'
import { debounce } from '../utility/debounce'
import { ChromaChartHelpers, type ChartEventHandlers } from './chartHelpers'

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
    const vegaView = ref<View | null>(null)
    const hasLoaded = ref<boolean>(false)
    let removeEventListener: (() => void) | null = null

    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }

    // Create a computed property for the current theme
    const currentTheme = computed(() => settingsStore.settings.theme)
    const vegaContainer = ref<HTMLElement | null>(null)

    // Controls panel state
    const showingControls = ref(false)

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
      annotationField: '',
      hideLegend: false,
      showDebug: false,
      showTitle: false,
    })

    // Create chart helpers instance with event handlers
    const eventHandlers: ChartEventHandlers = {
      onDimensionClick: (data) => emit('dimension-click', data),
      onPointClick: (data) => emit('point-click', data),
      onBackgroundClick: () => emit('background-click'),
    }
    const chartHelpers = new ChromaChartHelpers(eventHandlers)

    // Create debounced brush handler
    const debouncedBrushHandler = debounce((name: string, item: any) => {
      chartHelpers.handleBrush(name, item, internalConfig.value, props.columns)
    }, 500)

    // Initialize on mount
    onMounted(() => {
      lastSpec.value = null
      initializeConfig()
      renderChart()
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
        if (props.onChartConfigChange) {
          props.onChartConfigChange({ ...internalConfig.value })
        }
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
      await chartHelpers.downloadChart(vegaView.value, emit)
    }

    // Refresh chart - emits refresh-click event
    const refreshChart = () => {
      emit('refresh-click')
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

    // Render the chart
    const renderChart = async (force: boolean = false) => {
      if (!vegaContainer.value || showingControls.value) return

      const spec = generateVegaSpecInternal()
      if (!spec) return

      const currentSpecString = JSON.stringify(spec)

      if (hasLoaded.value && lastSpec.value === currentSpecString && !force) {
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
          hasLoaded.value = true

          if (removeEventListener) {
            removeEventListener() // Clean up previous listener if it exists
          }
          // Setup event listeners using the helper
          removeEventListener = chartHelpers.setupEventListeners(
            result.view,
            internalConfig.value,
            props.columns,
            isMobile.value,
            debouncedBrushHandler,
          )
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

        // Update all config fields
        Object.assign(internalConfig.value, configDefaults)
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

    watch(
      () => [props.columns, props.data],
      () => {
        // Validate configuration fields using helper
        const wasValid = chartHelpers.validateConfigFields(internalConfig.value, props.columns)

        if (!wasValid) {
          initializeConfig(true) // force column reset on column change
        }

        renderChart()
      },
      { deep: true },
    )

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
      showingControls,
      updateConfig,
      toggleControls,
      toggleDebugMode,
      downloadChart,
      refreshChart,
      charts: eligible,
    }
  },

  computed: {
    // Computed property to get controls visible for the current chart type
    visibleControls(): ChartControl[] {
      return Controls.filter((control) => {
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
  top: 50%;
  right: 0px;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  /* gap: 4px; */
}

.viz {
  /* flex: 1; */
  width: 100%;
  /* height: 100%; */
  position: relative;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--button-font-size);
  transition: background-color 0.2s;
  /* border-radius: 4px; */
}

.control-btn:hover {
  background-color: var(--button-mouseover);
}

.control-btn:disabled {
  background-color: var(--border-light);
  color: var(--text-color-muted);
  cursor: not-allowed;
}

.control-btn:disabled:hover {
  background-color: var(--border-light);
}

.control-btn.active {
  background-color: var(--special-text);
  color: white;
}

.chart-content-area {
  flex: 1;
  width: calc(100% - 28px);
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

  .control-btn {
    width: 32px;
    height: 32px;
    margin-top: 5px;
    margin-bottom: 5px;
  }
}
</style>
