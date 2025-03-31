<template>
  <div class="vega-lite-chart no-drag">
    <!-- Toggle button always visible -->
    <div class="controls-toggle" v-if="showControls">
      <button
        @click="toggleControls"
        class="toggle-controls-btn"
        :class="{ active: showingControls }"
      >
        <i
          :class="showingControls ? 'mdi mdi-eye-outline' : 'mdi mdi-cog-outline'"
          class="icon"
        ></i>
        <span>{{ showingControls ? 'View Chart' : 'Edit Chart' }}</span>
      </button>
    </div>

    <!-- Content area with conditional rendering -->
    <div class="chart-content-area">
      <!-- Chart visualization area - only show when controls are hidden -->
      <div v-if="!showingControls" ref="vegaContainer" class="vega-container"></div>

      <!-- Controls panel - only show when toggled -->
      <div v-if="showingControls" class="chart-controls-panel">
        <div class="control-section">
          <label class="control-section-label">Chart Type</label>
          <div class="chart-type-icons">
            <button
              v-for="type in charts"
              :key="type.value"
              @click="internalConfig.chartType = type.value"
              class="chart-icon"
              :class="{ selected: internalConfig.chartType === type.value }"
              :title="type.label"
            >
              <div class="icon-container">
                <i :class="type.icon" class="icon"></i>
              </div>
            </button>
          </div>
        </div>

        <!-- Group axes controls -->
        <div
          class="control-section"
          v-if="visibleControls.some((c) => c.id.includes('axis') || c.id === 'group-by')"
        >
          <label class="control-section-label">Axes</label>
          <div
            v-for="control in visibleControls.filter(
              (c) => c.id.includes('axis') || c.id === 'group-by',
            )"
            :key="control.id"
            class="control-group no-drag"
          >
            <label class="chart-label" :for="control.id">{{ control.label }}</label>
            <select
              :id="control.id"
              v-model="internalConfig[control.field]"
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
          v-if="visibleControls.some((c) => c.id.includes('color') || c.id === 'size')"
        >
          <label class="control-section-label">Appearance</label>
          <div
            v-for="control in visibleControls.filter(
              (c) => c.id.includes('color') || c.id === 'size',
            )"
            :key="control.id"
            class="control-group no-drag"
          >
            <label class="chart-label" :for="control.id">{{ control.label }}</label>
            <select
              :id="control.id"
              v-model="internalConfig[control.field]"
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
        <div class="control-section" v-if="visibleControls.some((c) => c.id === 'trellis-field')">
          <label class="control-section-label">Advanced</label>
          <div
            v-for="control in visibleControls.filter((c) => c.id === 'trellis-field')"
            :key="control.id"
            class="control-group no-drag"
          >
            <label class="chart-label" :for="control.id">{{ control.label }}</label>
            <select
              :id="control.id"
              v-model="internalConfig[control.field]"
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
</template>

<script lang="ts">
import { defineComponent, ref, watch, onMounted, computed, inject } from 'vue'
import type { PropType } from 'vue'
import vegaEmbed from 'vega-embed'
import type { ResultColumn, Row, ChartConfig } from '../editors/results'
import Tooltip from './Tooltip.vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { Controls, Charts, type ChartControl } from '../dashboards/constants'
import { generateVegaSpec, determineDefaultConfig, filteredColumns, getDefaultSelectionConfig } from '../dashboards/helpers'
import { addChartSelectionListener } from '../dashboards/eventHelpers'
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
      type: Object as PropType<ChartConfig>,
      default: null,
    },
    showControls: {
      type: Boolean,
      default: true,
    },
    containerHeight: Number,
    onChartConfigChange: {
      type: Function as PropType<(config: ChartConfig) => void>,
      default: () => {},
    },
  },

  setup(props) {
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    const isMobile = inject<boolean>('isMobile', false)
    
    // event hookups
    let removeEventListener: (() => void) | null = null;
    const selectedItems = ref<any[]>([]);
    const handleSelectionChange = (selected: any[]) => {
      selectedItems.value = selected;
      
      // Call the provided callback if available
      // if (props.onSelectionChange && typeof props.onSelectionChange === 'function') {
      //   props.onSelectionChange(selected);
      // }
      
      // Default behavior: log the selection to console
      console.log('Selection changed:', selected);
    };
    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }

    // Create a computed property for the current theme
    const currentTheme = computed(() => settingsStore.settings.theme)
    const vegaContainer = ref<HTMLElement | null>(null)

    // Controls panel state
    const showingControls = ref(false)

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
      sizeField: '',
      groupField: '',
      trellisField: '',
    })

    // Determine reasonable defaults based on column types
    const initializeConfig = () => {
      if (props.initialConfig) {
        // Use external config if provided
        internalConfig.value = { ...internalConfig.value, ...props.initialConfig }
      } else {
        // Auto select chart type and fields based on data types
        const configDefaults = determineDefaultConfig(props.data, props.columns)
        internalConfig.value = { ...internalConfig.value, ...configDefaults }
      }

      // If config is initialized with values, show chart by default
      showingControls.value = false
    }

    const filteredColumnsInternal = (type: 'numeric' | 'categorical' | 'temporal' | 'all') => {
      return filteredColumns(type, props.columns)
    }

    // Generate Vega-Lite spec based on current configuration
    
    const generateVegaSpecInternal = () => {
      const selectionConfig = getDefaultSelectionConfig(internalConfig.value.chartType, internalConfig.value);
      return generateVegaSpec(
        props.data,
        internalConfig.value,
        isMobile,
        props.containerHeight,
        props.columns,
        selectionConfig
      )
    }

    // Render the chart
    const renderChart = async () => {
      if (!vegaContainer.value || showingControls.value) return

      const spec = generateVegaSpecInternal()
      if (!spec) return

      try {
        await vegaEmbed(vegaContainer.value, spec, {
          actions: false,
          theme: currentTheme.value === 'dark' ? 'dark' : undefined,
          renderer: 'canvas', // Use canvas renderer for better performance with large datasets
        }).then ((result) => {
          removeEventListener = addChartSelectionListener(
          result.view,
          handleSelectionChange,
        );
        })
      } 
      catch (error) {
        console.error('Error rendering Vega chart:', error)
      }
    }

    // Initialize on mount
    onMounted(() => {
      initializeConfig()
      renderChart()
    })

    // Watch for changes in data, columns or config
    watch(() => props.containerHeight, renderChart)
    watch(() => props.data, renderChart, { deep: true })
    watch(
      () => props.columns,
      () => {
        initializeConfig()
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

    // Watch for internal config changes
    watch(
      internalConfig,
      (newConfig, oldConfig) => {
        if (!newConfig) {
          return
        }
        // First, render the chart with the new configuration if we're showing the chart
        if (!showingControls.value) {
          renderChart()
        }

        // Then, if a callback was provided in props, call it with the new configuration
        if (props.onChartConfigChange && typeof props.onChartConfigChange === 'function') {
          console.log('setting new config')
          if (
            newConfig.chartType !== oldConfig.chartType ||
            newConfig.xField !== oldConfig.xField ||
            newConfig.yField !== oldConfig.yField ||
            newConfig.colorField !== oldConfig.colorField ||
            newConfig.sizeField !== oldConfig.sizeField ||
            newConfig.groupField !== oldConfig.groupField ||
            newConfig.trellisField !== oldConfig.trellisField
          ) {
            console.log('new config', newConfig, oldConfig)
            props.onChartConfigChange(newConfig)
          }
        }
      },
      { deep: true },
    )

    return {
      vegaContainer,
      internalConfig,
      renderChart,
      filteredColumnsInternal,
      hasTrellisOption,
      showingControls,
      toggleControls,
      charts: Charts,
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
}

.toggle-controls-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border: 1px solid var(--border-light);
  background-color: var(--button-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--button-font-size);
  transition: background-color 0.2s;
}

.toggle-controls-btn:hover {
  background-color: var(--button-mouseover);
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
  width: 100%;
  height: 100%;
  padding: 4px;
  background-color: var(--bg-color);
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
  min-width: 80px; /* Give labels a consistent width */
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

/* Mobile responsiveness */
@media (max-width: 768px) {
  .form-select {
    height: var(--chart-control-height);
  }
}
</style>
