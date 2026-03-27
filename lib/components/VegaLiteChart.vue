<template>
  <div
    class="vega-lite-chart no-drag"
    :class="{ 'overflow-hidden': !controlsManager.showingControls.value }"
    @mouseenter="controlsManager.onChartMouseEnter"
    @mouseleave="controlsManager.onChartMouseLeave"
  >
    <div
      class="chart-workspace"
      :class="{ 'with-bottom-controls': isShortContainer && showControls }"
    >
      <div ref="chartContentArea" class="chart-content-area">
        <div class="vega-swap-container" v-show="!controlsManager.showingControls.value">
          <div
            ref="vegaContainer1"
            class="vega-container"
            :class="{
              'vega-active': renderManager.activeContainer.value === 1,
              'vega-transitioning':
                renderManager.transitioning.value && renderManager.activeContainer.value === 1,
            }"
            data-testid="vega-chart-container-1"
          ></div>
          <div
            ref="vegaContainer2"
            class="vega-container"
            :class="{
              'vega-active': renderManager.activeContainer.value === 2,
              'vega-transitioning':
                renderManager.transitioning.value && renderManager.activeContainer.value === 2,
            }"
            data-testid="vega-chart-container-2"
          ></div>
        </div>
        <ChartControlPanel
          v-if="controlsManager.showingControls.value"
          :config="controlsManager.internalConfig.value"
          :charts="charts"
          :filtered-columns="filteredColumnsInternal"
          @update-config="updateConfig"
          @open-vega-editor="openInVegaEditor"
        />
      </div>

      <div
        class="controls-toggle"
        :class="{
          'bottom-controls': isShortContainer,
          'controls-visible':
            controlsManager.controlsVisible.value || controlsManager.showingControls.value,
        }"
        v-if="showControls"
      >
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
          v-if="$props.drilldownActive"
          @click="revertDrilldown"
          class="control-btn"
          data-testid="refresh-chart-btn"
          title="Clear Drilldown"
        >
          <i class="mdi mdi-undo icon"></i>
        </button>
        <button
          @click="controlsManager.toggleControls"
          class="control-btn"
          :class="{ active: controlsManager.showingControls.value }"
          data-testid="toggle-chart-controls-btn"
          :title="controlsManager.showingControls.value ? 'View Chart' : 'Edit Chart'"
        >
          <i
            :class="
              controlsManager.showingControls.value ? 'mdi mdi-eye-outline' : 'mdi mdi-cog-outline'
            "
            class="icon"
          ></i>
        </button>
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
  nextTick,
} from 'vue'
import type { PropType } from 'vue'
import type { ResultColumn, Row, ChartConfig } from '../editors/results'
import Tooltip from './Tooltip.vue'
import ChartControlPanel from './ChartControlPanel.vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { useResolvedThemeMode } from '../embed/config'
import { Charts } from '../dashboards/constants'
import { filteredColumns, determineEligibleChartTypes } from '../dashboards/helpers'
import { generateVegaSpec } from '../dashboards/spec'
import { debounce } from '../utility/debounce'
import { ChromaChartHelpers, type ChartEventHandlers } from './chartHelpers'
import { ChartRenderManager } from './chartRenderManager'
import { ChartControlsManager } from './chartControlsManager'
import { ChartOperationsManager } from './chartOperationsManager'
import { safeJsonStringify } from '../utility/jsonSerialization'

export default defineComponent({
  name: 'VegaLiteChart',
  components: { Tooltip, ChartControlPanel },
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
    drilldownActive: {
      type: Boolean,
      default: false,
    },
  },

  setup(props, { emit }) {
    const settingsStore = inject<UserSettingsStoreType | null>('userSettingsStore', null)
    const isMobile = inject<Ref<boolean>>('isMobile', ref(false))

    // Create a computed property for the current theme
    const currentTheme = useResolvedThemeMode(settingsStore)

    // Computed property to determine if container is too short for side controls
    const isShortContainer = computed(() => {
      return props.containerHeight && props.containerHeight < 150
    })

    // Container refs
    const vegaContainer1 = ref<HTMLElement | null>(null)
    const vegaContainer2 = ref<HTMLElement | null>(null)
    const chartContentArea = ref<HTMLElement | null>(null)

    // Resize observer for live chart area sizing
    let resizeObserver: ResizeObserver | null = null
    let hasMounted = false
    let updatePending = false

    // Internal dimensions tracked from the rendered chart area
    const internalWidth = ref<number | null>(null)
    const internalHeight = ref<number | null>(null)

    // Create chart helpers instance with event handlers
    const eventHandlers: ChartEventHandlers = {
      onDimensionClick: (data) => emit('dimension-click', data),
      onPointClick: (data) => emit('point-click', data),
      onBackgroundClick: () => emit('background-click'),
      onDrilldownClick: (data) => emit('drilldown-click', data),
    }
    const chartHelpers = new ChromaChartHelpers(eventHandlers)

    // Create manager instances
    const renderManager = new ChartRenderManager(chartHelpers)
    const controlsManager = new ChartControlsManager(chartHelpers)
    const operationsManager = new ChartOperationsManager(chartHelpers)

    // Create debounced brush handler
    const debouncedBrushHandler = debounce((name: string, item: any) => {
      chartHelpers.handleBrush(name, item, controlsManager.internalConfig.value, props.columns)
    }, 500)

    // Create debounced resize handler for live chart resizing
    const debouncedResizeHandler = debounce(() => {
      renderChart(true)
    }, 300)

    // Generate Vega-Lite spec based on current configuration
    const generateVegaSpecInternal = () => {
      const effectiveHeight =
        chartContentArea.value?.clientHeight ?? internalHeight.value ?? props.containerHeight
      const effectiveWidth =
        chartContentArea.value?.clientWidth ?? internalWidth.value ?? props.containerWidth

      return generateVegaSpec(
        props.data,
        controlsManager.internalConfig.value,
        props.columns,
        props.chartSelection,
        isMobile.value,
        props.chartTitle,
        currentTheme.value,
        effectiveHeight,
        effectiveWidth,
      )
    }

    // Main render function wrapper
    const renderChart = (force: boolean = false) => {
      if (controlsManager.showingControls.value) return

      const spec = generateVegaSpecInternal()
      return renderManager.renderChart(
        vegaContainer1.value,
        vegaContainer2.value,
        spec,
        controlsManager.internalConfig.value,
        props.columns,
        currentTheme.value,
        isMobile.value,
        debouncedBrushHandler,
        props.chartTitle,
        force,
      )
    }

    // Setup resize observer for the chart content area
    const setupResizeObserver = () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }

      if (!chartContentArea.value) {
        return
      }

      internalWidth.value = Math.round(chartContentArea.value.clientWidth)
      internalHeight.value = Math.round(chartContentArea.value.clientHeight)

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = Math.round(entry.contentRect.width)
          const height = Math.round(entry.contentRect.height)
          const widthChanged = width !== internalWidth.value
          const heightChanged = height !== internalHeight.value

          if (!widthChanged && !heightChanged) {
            continue
          }

          internalWidth.value = width
          internalHeight.value = height

          if (hasMounted && !controlsManager.showingControls.value) {
            debouncedResizeHandler()
          }
        }
      })

      resizeObserver.observe(chartContentArea.value)
    }

    // Cleanup resize observer
    const cleanupResizeObserver = () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
        console.log('Resize observer cleaned up')
      }

      // Clear internal dimensions
      internalWidth.value = null
      internalHeight.value = null
    }

    // Wrapper functions for operations
    const downloadChart = async () => {
      const activeView = renderManager.getActiveView()
      await operationsManager.downloadChart(activeView, emit)
    }

    const refreshChart = () => {
      operationsManager.refreshChart(emit)
    }

    const revertDrilldown = () => {
      emit('revert-drilldown')
    }

    const openInVegaEditor = () => {
      const spec = generateVegaSpecInternal()
      operationsManager.openInVegaEditor(spec)
    }

    const updateConfig = (field: keyof ChartConfig, value: string | boolean | number) => {
      controlsManager.updateConfig(
        field,
        value,
        props.data,
        props.columns,
        props.onChartConfigChange,
      )
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

    // Initialize on mount
    onMounted(() => {
      controlsManager.initializeConfig(
        props.data,
        props.columns,
        props.initialConfig,
        props.onChartConfigChange,
      )
      hasMounted = true

      // Set up resize observer after initial render
      nextTick(() => {
        setupResizeObserver()
        renderChart()
      })
    })

    // Watch for chart type changes to setup/cleanup resize observer
    watch(
      () => controlsManager.internalConfig.value.chartType,
      (newChartType, oldChartType) => {
        if (!hasMounted) {
          return
        }
        if (newChartType !== oldChartType) {
          cleanupResizeObserver()
          nextTick(() => {
            setupResizeObserver()
          })
        }
      },
    )

    // Watch for chart selection changes
    watch(
      () => [props.chartSelection],
      (newValues, oldValues) => {
        if (!hasMounted || updatePending) return
        const [newSelection] = newValues
        const oldSelection = oldValues ? oldValues[0] : undefined
        if (safeJsonStringify(newSelection) === safeJsonStringify(oldSelection)) return
        renderChart(true)
      },
    )
    // Watch for data/column changes
    watch(
      () => [props.columns, props.data, props.containerHeight, props.containerWidth],
      (newValues, oldValues) => {
        if (!hasMounted) {
          return
        }
        if (updatePending) {
          return
        }
        // check they are actually different
        if (oldValues && safeJsonStringify(newValues) === safeJsonStringify(oldValues)) {
          return
        }
        updatePending = true
        nextTick(() => {
          updatePending = false
          controlsManager.validateAndResetConfig(
            props.data,
            props.columns,
            props.onChartConfigChange,
            props.initialConfig,
          )
          // if containerheight/containerwidth changed,
          // force = True
          const containerHeightChanged = oldValues && props.containerHeight !== oldValues[2]
          const containerWidthChanged = oldValues && props.containerWidth !== oldValues[3]
          renderChart(containerHeightChanged || containerWidthChanged)
        })
      },
      { deep: true, immediate: true },
    )

    // Watch for controls toggle to trigger re-render
    watch(
      () => controlsManager.showingControls.value,
      (showing) => {
        if (!hasMounted) {
          return
        }
        nextTick(() => {
          setupResizeObserver()
          if (!showing) {
            renderChart(true)
          }
        })
      },
    )

    const eligible = computed(() => {
      return Charts.filter((x) =>
        determineEligibleChartTypes(props.data, props.columns).includes(x.value),
      )
    })

    // Cleanup on unmount
    onUnmounted(() => {
      cleanupResizeObserver()
      renderManager.cleanup()
    })

    return {
      vegaContainer1,
      vegaContainer2,
      chartContentArea,
      renderManager,
      controlsManager,
      renderChart,
      filteredColumnsInternal,
      updateConfig,
      openInVegaEditor,
      downloadChart,
      refreshChart,
      charts: eligible,
      isShortContainer,
      revertDrilldown,
    }
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
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.controls-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.2s ease-in-out,
    visibility 0.2s ease-in-out,
    transform 0.2s ease-in-out;
  transition-delay: 0s;
  transform: translateY(-4px);
}

.controls-toggle.controls-visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition-delay: var(--hover-drawer-delay);
  transform: translateY(0);
}

.controls-toggle.bottom-controls {
  flex-direction: row;
  top: auto;
  right: auto;
  bottom: 8px;
  left: 50%;
  padding: 6px 8px;
  border: 1px solid var(--trilogy-embed-overlay-border, var(--overlay-border, rgba(148, 163, 184, 0.14)));
  background: var(
    --trilogy-embed-floating-surface,
    var(--floating-surface, rgba(255, 255, 255, 0.9))
  );
  backdrop-filter: blur(8px);
  transform: translate(-50%, 6px);
}

.controls-toggle.bottom-controls.controls-visible {
  transform: translate(-50%, 0);
}

.viz {
  width: 100%;
  position: relative;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--trilogy-embed-overlay-border, var(--overlay-border, rgba(148, 163, 184, 0.14)));
  background-color: var(
    --trilogy-embed-floating-surface-strong,
    var(--floating-surface-strong, rgba(255, 255, 255, 0.97))
  );
  color: var(--trilogy-embed-floating-text, var(--floating-text, var(--text-color, #1f2937)));
  cursor: pointer;
  font-size: var(--button-font-size);
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s,
    box-shadow 0.2s;
  backdrop-filter: blur(4px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
}

.control-btn:hover {
  background-color: var(
    --trilogy-embed-floating-surface,
    var(--floating-surface, rgba(255, 255, 255, 0.9))
  );
  border-color: rgba(var(--trilogy-embed-special-text-rgb, var(--special-text-rgb, 37, 99, 235)), 0.28);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
}

.control-btn:disabled {
  background-color: var(--trilogy-embed-border-light, var(--border-light, #e1e6ed));
  color: var(--trilogy-embed-text-muted, var(--text-color-muted, #64748b));
  cursor: not-allowed;
}

.control-btn:disabled:hover {
  background-color: var(--trilogy-embed-border-light, var(--border-light, #e1e6ed));
}

.control-btn.active {
  background-color: var(--trilogy-embed-special-text, var(--special-text, #2563eb));
  color: white;
}

.chart-content-area {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chart-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  position: relative;
}

.chart-workspace.with-bottom-controls {
  flex-direction: column;
}

/* Hot-swap container styles */
.vega-swap-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.vega-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  /* transition: opacity 0.1s ease-in-out; */
  pointer-events: none;
}

.vega-container.vega-active {
  opacity: 1;
  pointer-events: auto;
}

.vega-container.vega-transitioning {
  opacity: 1;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .control-btn {
    width: 32px;
    height: 32px;
  }

  .controls-toggle {
    flex-direction: row;
    top: auto;
    right: auto;
    bottom: 8px;
    left: 50%;
    transform: translate(-50%, 6px);
  }

  .controls-toggle.controls-visible {
    transform: translate(-50%, 0);
  }

  .chart-workspace {
    flex-direction: column;
  }
}
</style>
