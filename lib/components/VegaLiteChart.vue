<template>
  <div class="vega-lite-chart no-drag">
    <!-- Toggle button always visible -->
    <div class="controls-toggle" v-if="showControls">
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
        <span>{{ showingControls ? 'View Chart' : 'Edit Chart' }}</span>
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
import type { ResultColumn, Row, ChartConfig, FieldKey } from '../editors/results'
import Tooltip from './Tooltip.vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { Controls, Charts, type ChartControl } from '../dashboards/constants'
import {
  generateVegaSpec,
  determineDefaultConfig,
  filteredColumns,
  determineEligibleChartTypes,
  getGeoTraitType,
} from '../dashboards/helpers'

import type { ScenegraphEvent } from 'vega'
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
      type: Object as PropType<ChartConfig | undefined>,
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
  },

  setup(props, { emit }) {
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    const isMobile = inject<Ref<boolean>>('isMobile', ref(false))
    const lastSpec = ref<string | null>(null)

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
      )
    }
    // @ts-ignore
    const handlePointClick = (event: ScenegraphEvent, item: any) => {
      let append = event.shiftKey
      if (item && item.datum) {
        // Special handling for USA map clicks
        // if (internalConfig.value.chartType === 'usa-map') {
        //   // For USA map, we need to handle the click on a state
        //   if (item.datum.geo && item.datum.geo.properties && item.datum.geo.properties.name) {
        //     const stateName = item.datum.geo.properties.name
        //     const geoField = internalConfig.value.geoField || ''

        //     if (geoField) {
        //       emit('dimension-click', {
        //         filters: { [geoField]: stateName },
        //         chart: { [geoField]: stateName },
        //         append,
        //       })
        //     }
        //     emit('point-click', item.datum)
        //     return
        //   }
        // }

        if (internalConfig.value.geoField && internalConfig.value.geoField) {
          let geoField = props.columns.get(internalConfig.value.geoField)
          let geoConcept = geoField?.address
          if (!geoConcept || !geoField) {
            return
          }
          let type = getGeoTraitType(geoField)
          emit('dimension-click', {
            filters: { [geoConcept]: item.datum[internalConfig.value.geoField] },
            chart: type == 'us_state_short' ? { Feature: item.datum.abbr } : { Feature: item.datum.id },
            append,
          })
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
        eligible = eligible.concat(filteredColumnsInternal('temporal').map((x) => x.name))
        if (item.datum[xFieldRaw] && eligible.includes(xFieldRaw)) {
          emit('dimension-click', {
            filters: { [xField]: item.datum[xFieldRaw] },
            chart: { [xFieldRaw]: item.datum[xFieldRaw] },
            append,
          })
        }
        // todo: figure out if we want to support both?
        else if (item.datum[yFieldRaw] && eligible.includes(yFieldRaw)) {
          emit('dimension-click', {
            filters: { [yField]: item.datum[yFieldRaw] },
            chart: { [yFieldRaw]: item.datum[yFieldRaw] },
            append,
          })
        }
        emit('point-click', item.datum)
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
          // actions:true,
          theme: currentTheme.value === 'dark' ? 'dark' : undefined,
          renderer: 'canvas', // Use canvas renderer for better performance with large datasets
        }).then((result) => {
          result.view.addEventListener('click', handlePointClick)
          removeEventListener = () => {
            result.view.removeEventListener('click', handlePointClick)
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
        const configDefaults = determineDefaultConfig(props.data, props.columns, value)
        // Normal chart type fields
        internalConfig.value.xField = configDefaults.xField
        internalConfig.value.yField = configDefaults.yField
        internalConfig.value.yAggregation = configDefaults.yAggregation
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
        if (force ) {
          console.log('force reinitialize', force)
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
  width: calc(100% - 10px);
  height: 100%;
  padding: 4px;
  background-color: var(--bg-color);
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

/* Mobile responsiveness */
@media (max-width: 768px) {
  .form-select {
    height: var(--chart-control-height);
  }
}
</style>
