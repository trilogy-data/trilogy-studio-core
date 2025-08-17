<template>
  <div 
    class="vega-lite-chart no-drag" 
    :class="{ 'overflow-hidden': !showingControls }"
    @mouseenter="onChartMouseEnter"
    @mouseleave="onChartMouseLeave"
  >
    <!-- Controls positioned based on container height -->
    <div
      class="controls-toggle"
      :class="{ 
        'bottom-controls': isShortContainer,
        'controls-visible': controlsVisible
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
    <div
      class="chart-content-area"
      :class="{ 'with-bottom-controls': isShortContainer && showControls }"
    >
      <!-- Dual chart visualization containers for smooth hot-swapping -->
      <div class="vega-swap-container" v-show="!showingControls">
        <div
          ref="vegaContainer1"
          class="vega-container"
          :class="{
            'vega-active': activeContainer === 1,
            'vega-transitioning': transitioning && activeContainer === 1,
          }"
          data-testid="vega-chart-container-1"
        ></div>
        <div
          ref="vegaContainer2"
          class="vega-container"
          :class="{
            'vega-active': activeContainer === 2,
            'vega-transitioning': transitioning && activeContainer === 2,
          }"
          data-testid="vega-chart-container-2"
        ></div>
      </div>

      <!-- Controls panel - only show when toggled -->
      <ChartControlPanel
        v-if="showingControls"
        :config="internalConfig"
        :charts="charts"
        :filtered-columns="filteredColumnsInternal"
        @update-config="updateConfig"
        @open-vega-editor="openInVegaEditor"
      />
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
import vegaEmbed from 'vega-embed'
import type { View } from 'vega'
import type { ResultColumn, Row, ChartConfig } from '../editors/results'
import Tooltip from './Tooltip.vue'
import ChartControlPanel from './ChartControlPanel.vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { Charts } from '../dashboards/constants'
import {
  determineDefaultConfig,
  filteredColumns,
  determineEligibleChartTypes,
} from '../dashboards/helpers'
import { generateVegaSpec } from '../dashboards/spec'
import { debounce } from '../utility/debounce'
import { ChromaChartHelpers, type ChartEventHandlers } from './chartHelpers'

// Type for tracking render operations
interface RenderOperation {
  id: number
  aborted: boolean
  container: 1 | 2
}

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
  },

  setup(props, { emit }) {
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    const isMobile = inject<Ref<boolean>>('isMobile', ref(false))

    // Track last rendered spec to avoid unnecessary re-renders
    const lastSpec = ref<string | null>(null)

    // Dual container refs and state management
    const vegaContainer1 = ref<HTMLElement | null>(null)
    const vegaContainer2 = ref<HTMLElement | null>(null)
    const activeContainer = ref<1 | 2>(1)
    const transitioning = ref(false)

    // Store views for both containers
    const vegaViews = ref<Map<1 | 2, View | null>>(
      new Map([
        [1, null],
        [2, null],
      ]),
    )

    // Track event listeners for cleanup
    const eventListeners = ref<Map<1 | 2, (() => void) | null>>(
      new Map([
        [1, null],
        [2, null],
      ]),
    )

    // Render operation tracking for concurrency control
    let renderCounter = 0
    const pendingRender = ref<RenderOperation | null>(null)
    const activeRender = ref<RenderOperation | null>(null)

    const hasLoaded = ref<boolean>(false)

    // Controls visibility state
    const controlsVisible = ref(false)
    const hoverTimeout = ref<number | null>(null)

    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }

    // Create a computed property for the current theme
    const currentTheme = computed(() => settingsStore.settings.theme)

    // Controls panel state
    const showingControls = ref(false)

    // Computed property to determine if container is too short for side controls
    const isShortContainer = computed(() => {
      return props.containerHeight && props.containerHeight < 150
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
      annotationField: '',
      hideLegend: false,
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

    // Hover event handlers
    const onChartMouseEnter = () => {
      if (hoverTimeout.value) {
        clearTimeout(hoverTimeout.value)
        hoverTimeout.value = null
      }
      console.log('Chart mouse enter - showing controls')
      controlsVisible.value = true
    }

    const onChartMouseLeave = () => {
      controlsVisible.value = false
      // Add a small delay before hiding controls to prevent flickering
      hoverTimeout.value = window.setTimeout(() => {
        
        hoverTimeout.value = null
      }, 300)
    }

    // Get the currently active Vega view for operations like download
    const getActiveView = (): View | null => {
      return vegaViews.value.get(activeContainer.value) || null
    }

    // Clean up a specific container's resources
    const cleanupContainer = (container: 1 | 2) => {
      // Clean up event listener
      const listener = eventListeners.value.get(container)
      if (listener) {
        listener()
        eventListeners.value.set(container, null)
      }

      // Finalize view
      const view = vegaViews.value.get(container)
      if (view) {
        view.finalize()
        vegaViews.value.set(container, null)
      }
    }

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
      const activeView = getActiveView()
      await chartHelpers.downloadChart(activeView, emit)
    }

    // Refresh chart - emits refresh-click event
    const refreshChart = () => {
      emit('refresh-click')
    }

    // Open chart spec in Vega Editor
    const openInVegaEditor = () => {
      const spec = generateVegaSpecInternal()
      const editorUrl = 'https://vega.github.io/editor/'

      // Prepare the message to send
      const data = {
        mode: 'vega-lite',
        spec: JSON.stringify(spec),
        config: {},
        renderer: 'canvas',
        theme: 'default',
      }

      const editor = window.open(editorUrl, '_blank')

      const wait = 10_000 // total retry time in ms
      const step = 250 // retry interval in ms
      const { origin } = new URL(editorUrl)

      let count = ~~(wait / step)

      function listen(evt: MessageEvent) {
        if (evt.source === editor) {
          count = 0 // stop retries
          window.removeEventListener('message', listen, false)
        }
      }
      window.addEventListener('message', listen, false)

      // send message repeatedly until ack received or timeout
      function send() {
        if (count <= 0) {
          return
        }
        if (!editor) {
          console.error('Failed to open Vega Editor window')
          return
        }
        editor.postMessage(data, origin)
        setTimeout(send, step)
        count -= 1
      }

      setTimeout(send, step)
    }

    // Main render function with hot-swap logic
    const renderChart = async (force: boolean = false) => {
      if (showingControls.value) return

      const spec = generateVegaSpecInternal()
      if (!spec) return

      const currentSpecString = JSON.stringify(spec)

      // Skip if spec hasn't changed and not forced
      if (hasLoaded.value && lastSpec.value === currentSpecString && !force) {
        console.log('Skipping render - spec unchanged')
        return
      } else {
        console.log('Rendering new spec on chart:', props.chartTitle)
      }

      // Create new render operation
      const renderOp: RenderOperation = {
        id: ++renderCounter,
        aborted: false,
        container: activeContainer.value === 1 ? 2 : (1 as 1 | 2),
      }

      // If there's an active render, mark pending render for abort
      if (activeRender.value) {
        activeRender.value.aborted = true
      }

      // If there's a pending render, abort it
      if (pendingRender.value) {
        pendingRender.value.aborted = true
      }

      // This render is now pending
      pendingRender.value = renderOp

      // Check if this render was aborted while waiting
      if (renderOp.aborted) {
        console.log(`Render ${renderOp.id} ${props.chartTitle} aborted before starting`)
        return
      }

      // Move from pending to active
      pendingRender.value = null
      activeRender.value = renderOp

      try {
        // Get the target container
        const targetContainer =
          renderOp.container === 1 ? vegaContainer1.value : vegaContainer2.value

        if (!targetContainer) {
          console.log(`Container ${renderOp.container} not available`)
          return
        }

        // Check for abort before expensive operations
        if (renderOp.aborted) {
          console.log(`Render ${renderOp.id} aborted before vega embed`)
          return
        }

        // Render to the inactive container
        const result = await vegaEmbed(targetContainer, spec, {
          actions: false,
          theme: currentTheme.value === 'dark' ? 'dark' : undefined,
          renderer: 'canvas',
        })

        // Check for abort after async operation
        if (renderOp.aborted) {
          console.log(`Render ${renderOp.id} ${props.chartTitle} aborted after vega embed`)
          // Clean up the just-created view since we're aborting
          result.view.finalize()
          return
        }

        // Store the new view
        vegaViews.value.set(renderOp.container, result.view)

        // Clean up old event listener for this container
        const oldListener = eventListeners.value.get(renderOp.container)
        if (oldListener) {
          oldListener()
        }

        // Setup new event listeners
        const removeListener = chartHelpers.setupEventListeners(
          result.view,
          internalConfig.value,
          props.columns,
          isMobile.value,
          debouncedBrushHandler,
        )
        eventListeners.value.set(renderOp.container, removeListener)

        // Final abort check before transition
        if (renderOp.aborted) {
          console.log(`Render ${renderOp.id} aborted before transition`)
          cleanupContainer(renderOp.container)
          return
        }

        // Perform the hot-swap transition
        transitioning.value = true

        // Wait a tick for the new chart to be ready
        await nextTick()

        // Switch active container
        const previousContainer = activeContainer.value
        activeContainer.value = renderOp.container

        // Let the transition effect play out
        setTimeout(() => {
          transitioning.value = false
          // Clean up the old container after transition
          cleanupContainer(previousContainer)
        }, 300) // Match CSS transition duration

        lastSpec.value = currentSpecString
        hasLoaded.value = true

        console.log(
          `Render ${renderOp.id} completed successfully on container ${renderOp.container}`,
        )
      } catch (error) {
        console.error(`Error in render ${renderOp.id}:`, error)
      } finally {
        // Clear active render if it's this one
        if (activeRender.value?.id === renderOp.id) {
          activeRender.value = null
        }
      }
    }

    const updateConfig = (field: keyof ChartConfig, value: string | boolean | number) => {
      // @ts-ignore
      internalConfig.value[field] = value

      console.log(`Updated config field ${field} to`, value)

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

    // Cleanup on unmount
    onUnmounted(() => {
      // Clear any pending timeout
      if (hoverTimeout.value) {
        clearTimeout(hoverTimeout.value)
      }

      // Abort any pending renders
      if (pendingRender.value) {
        pendingRender.value.aborted = true
      }
      if (activeRender.value) {
        activeRender.value.aborted = true
      }

      // Clean up both containers
      cleanupContainer(1)
      cleanupContainer(2)
    })

    watch(
      () => [props.chartSelection],
      (newValues, oldValues) => {
        const [newSelection] = newValues
        const [oldSelection] = oldValues
        if (JSON.stringify(newSelection) === JSON.stringify(oldSelection)) return
        // if (internalConfig.value.chartType !== 'headline') return;
        renderChart(true)
      },
    )
    // Watch for changes in data, columns or config
    watch(
      () => [props.containerHeight, props.containerWidth],
      () => {
        renderChart(true)
      },
    )
    let updatePending = false

    watch(
      () => [props.columns, props.data],
      (newValues, oldValues) => {
        if (updatePending) return
        // check they are actually different
        if (JSON.stringify(newValues) === JSON.stringify(oldValues)) return
        updatePending = true
        nextTick(() => {
          updatePending = false

          const wasValid = chartHelpers.validateConfigFields(internalConfig.value, props.columns)
          if (!wasValid) {
            console.log('Invalid config fields detected, resetting to defaults')
            initializeConfig(true)
          }
          renderChart()
        })
      },
      { deep: true },
    )

    const eligible = computed(() => {
      return Charts.filter((x) =>
        determineEligibleChartTypes(props.data, props.columns).includes(x.value),
      )
    })

    return {
      vegaContainer1,
      vegaContainer2,
      activeContainer,
      transitioning,
      internalConfig,
      renderChart,
      filteredColumnsInternal,
      showingControls,
      updateConfig,
      toggleControls,
      openInVegaEditor,
      downloadChart,
      refreshChart,
      charts: eligible,
      isShortContainer,
      controlsVisible,
      onChartMouseEnter,
      onChartMouseLeave,
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
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;
}

.controls-toggle.controls-visible {
  opacity: 1;
  visibility: visible;
}

.controls-toggle.bottom-controls {
  position: absolute;
  top: auto;
  bottom: 0;
  right: 50%;
  transform: translateX(50%);
  flex-direction: row;
  gap: 4px;
  padding: 4px;
  background-color: rgba(var(--bg-color), 0.9);
  border-radius: 4px 4px 0 0;
  backdrop-filter: blur(4px);
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
  border: 1px solid var(--border-light);
  background-color: rgba(var(--bg-color), 0.9);
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--button-font-size);
  transition: background-color 0.2s;
  backdrop-filter: blur(4px);
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

.chart-content-area.with-bottom-controls {
  width: 100%;
  height: calc(100% - 36px);
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
    margin-top: 5px;
    margin-bottom: 5px;
  }

  /* Force bottom controls on mobile and make them always visible */
  .controls-toggle {
    position: absolute;
    top: auto;
    bottom: 0;
    right: 50%;
    transform: translateX(50%);
    flex-direction: row;
    gap: 4px;
    padding: 4px;
    background-color: rgba(var(--bg-color), 0.9);
    border-radius: 4px 4px 0 0;
    backdrop-filter: blur(4px);
    opacity: 1;
    visibility: visible;
  }

  .chart-content-area {
    width: 100%;
    height: calc(100% - 40px);
  }
}
</style>