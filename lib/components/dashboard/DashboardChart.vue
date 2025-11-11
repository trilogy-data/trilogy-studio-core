<template>
  <div
    ref="chartContainer"
    class="chart-placeholder no-drag"
    :class="{ 'chart-placeholder-edit-mode': editMode }"
    @mouseenter="onChartMouseEnter"
    @mouseleave="onChartMouseLeave"
  >
    <drilldown-pane
      v-if="activeDrilldown"
      :drilldown-remove="activeDrilldown.remove"
      :drilldown-filter="activeDrilldown.filter"
      @close="activeDrilldown = null"
      :symbols="symbols"
      @submit="submitDrilldown"
    />
    <ErrorMessage v-else-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>
    <VegaLiteChart
      v-else-if="results && ready && !loading"
      :id="`${itemId}-${dashboardId}`"
      :columns="results.headers"
      :data="results.data"
      :showControls="editMode"
      :initialConfig="chartConfig || undefined"
      :containerHeight="chartHeight"
      :container-width="chartWidth"
      :onChartConfigChange="onChartConfigChange"
      :chartSelection
      :chartTitle
      :drilldown-active="hasDrilldown"
      @dimension-click="handleDimensionClick"
      @background-click="handleBackgroundClick"
      @refresh-click="handleLocalRefresh"
      @drilldown-click="activateDrilldown"
      @revert-drilldown="revertDrilldown"
    />
    <div v-if="loading && showLoading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>
    <div
      v-if="!editMode || !(results && ready)"
      class="controls-toggle"
      :class="{ 'controls-visible': controlsVisible }"
    >
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Refresh table"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
      <button
        @click="revertDrilldown"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Clear Drilldown"
      >
        <i class="mdi mdi-undo icon"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
//      v-if="!loading && editMode &&
import {
  defineComponent,
  inject,
  computed,
  watch,
  ref,
  onMounted,
  onUnmounted,
  type PropType,
} from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ChartConfig } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import VegaLiteChart from '../VegaLiteChart.vue'
import LoadingView from '../LoadingView.vue'
import DrilldownPane from '../DrilldownPane.vue'
import { type GridItemDataResponse, type DimensionClick } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import { objectToSqlExpression } from '../../dashboards/conditions'
import type { CompletionItem } from '../../stores/resolver'
export interface Drilldown {
  remove: string
  filter: string
}

export default defineComponent({
  name: 'DashboardChart',
  components: {
    VegaLiteChart,
    ErrorMessage,
    LoadingView,
    DrilldownPane,
  },
  props: {
    dashboardId: {
      type: String,
      required: true,
    },
    itemId: {
      type: String,
      required: true,
    },
    getItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string) => GridItemDataResponse>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => void>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    symbols: {
      type: Array as PropType<CompletionItem[]>,
      required: true,
    },
    getDashboardQueryExecutor: {
      type: Function as PropType<(dashboardId: string) => DashboardQueryExecutor>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const ready = ref(false)
    const chartContainer = ref<HTMLElement | null>(null)
    const currentQueryId = ref<string | null>(null)
    const showLoading = ref(false)
    const loadingTimeoutId = ref<NodeJS.Timeout | null>(null)
    const activeDrilldown = ref<Drilldown | null>(null)

    const itemData = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId)
    })

    const getPositionBasedDelay = () => {
      if (!chartContainer.value) return 0

      const rect = chartContainer.value.getBoundingClientRect()
      const scrollY = window.scrollY || document.documentElement.scrollTop

      // Get absolute position from top of document
      const absoluteTop = rect.top + scrollY

      // Very minimal delays (10ms per 200px)
      const delay = Math.floor(absoluteTop / 200) * 10

      // Cap at reasonable maximum
      let finalDelay = Math.min(delay, 100)
      return finalDelay
    }

    // Set up event listeners when the component is mounted
    onMounted(() => {
      // Apply position-based delay after DOM is ready
      setTimeout(() => {
        // this is to delay *rendering* the chart, not query execution
        const delay = getPositionBasedDelay()

        if (!results.value) {
          ready.value = true
          // executeQuery()
        } else {
          // Cached results with delay
          setTimeout(() => {
            ready.value = true
          }, delay)
        }
      }, 0) // Use nextTick equivalent
    })

    // Clean up timeout on unmount
    onUnmounted(() => {
      if (loadingTimeoutId.value) {
        clearTimeout(loadingTimeoutId.value)
        loadingTimeoutId.value = null
      }
    })

    const query = computed(() => {
      return itemData.value.structured_content.query
    })

    const results = computed(() => {
      return itemData.value.results || null
    })

    const chartTitle = computed(() => {
      return itemData.value.name || ''
    })

    const chartHeight = computed(() => {
      return (itemData.value.height || 300) - 75
    })

    const chartWidth = computed(() => {
      return itemData.value.width || 300
    })

    const chartConfig = computed(() => {
      return itemData.value.chartConfig || null
    })

    const loading = computed(() => {
      return itemData.value.loading || false
    })

    const error = computed(() => {
      return itemData.value.error || null
    })

    const startTime = computed(() => {
      return itemData.value.loadStartTime || null
    })

    const chartSelection = computed(() => {
      return (itemData.value.chartFilters || []).map((filter) => filter.value)
    })

    const hasDrilldown = computed(() => {
      return itemData.value.hasDrilldown
    })

    // Get refresh callback from item data if available
    const onRefresh = computed(() => {
      return itemData.value.onRefresh || null
    })

    // Watch loading state and manage the 150ms delay
    watch(
      loading,
      (newLoading, _) => {
        // Clear any existing timeout
        if (loadingTimeoutId.value) {
          clearTimeout(loadingTimeoutId.value)
          loadingTimeoutId.value = null
        }

        if (newLoading) {
          // Start loading - set a timeout to show loading after 150ms
          loadingTimeoutId.value = setTimeout(() => {
            showLoading.value = true
            loadingTimeoutId.value = null
          }, 250)
        } else {
          // Stop loading - hide immediately
          showLoading.value = false
        }
      },
      { immediate: true },
    )

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const analyticsStore: AnalyticsStoreType | null = inject<AnalyticsStoreType | null>(
      'analyticsStore',
      null,
    )

    const onChartConfigChange = (chartConfig: ChartConfig) => {
      if (hasDrilldown.value) {
        props.setItemData(props.itemId, props.dashboardId, { drilldownChartConfig: chartConfig })
        return
      }
      props.setItemData(props.itemId, props.dashboardId, { chartConfig: chartConfig })
    }

    if (!connectionStore) {
      throw new Error('Connection store not found!')
    }

    const executeQuery = async (): Promise<any> => {
      if (!query.value) return

      const dashboardQueryExecutor = props.getDashboardQueryExecutor(props.dashboardId)
      if (!dashboardQueryExecutor) {
        throw new Error('Dashboard query executor not found!')
      }

      try {
        if (analyticsStore) {
          analyticsStore.log('dashboard-chart-execution', 'CHART', true)
        }

        // Cancel any existing query for this chart
        if (currentQueryId.value) {
          dashboardQueryExecutor.cancelQuery(currentQueryId.value)
        }

        // Execute query through the dashboard query executor
        let queryId = await dashboardQueryExecutor.runSingle(props.itemId)

        await dashboardQueryExecutor.waitForQuery(queryId)
      } catch (err) {
        console.error('Error setting up query:', err)
        currentQueryId.value = null
      }
    }

    // Handle individual chart refresh button click
    const handleLocalRefresh = () => {
      if (onRefresh.value) {
        onRefresh.value(props.itemId)
      } else {
        executeQuery()
      }
    }

    const handleDimensionClick = (dimension: DimensionClick) => {
      emit('dimension-click', {
        source: props.itemId,
        filters: dimension.filters,
        chart: dimension.chart,
        append: dimension.append,
      })
    }

    const handleBackgroundClick = () => {
      emit('background-click')
    }

    // Drilldown methods - matching ResultsContainer pattern
    const activateDrilldown = (e: any) => {
      let filters = e.filters
      // remove is keys of e.filters
      let remove = Object.keys(filters)[0]

      let filterString = objectToSqlExpression(e.filters)
      if (!remove) {
        return
      }
      activeDrilldown.value = { remove, filter: filterString }
    }

    const revertDrilldown = async () => {
      props.setItemData(props.itemId, props.dashboardId, {
        drilldown: null,
        drilldownChartConfig: null,
        loading: true,
      })
      await executeQuery()
    }

    const submitDrilldown = async (selected: string[]) => {
      let executor = props.getDashboardQueryExecutor(props.dashboardId)
      let newQuery = await executor.createDrilldownQuery(
        query.value,
        selected,
        activeDrilldown.value!.remove,
        activeDrilldown.value!.filter,
      )
      props.setItemData(props.itemId, props.dashboardId, {
        drilldown: newQuery,
        drilldownChartConfig: null,
        loading: true,
      })
      ready.value = false
      showLoading.value = true
      activeDrilldown.value = null
      await executeQuery()
        .then(() => {
          ready.value = true
        })
        .catch((error) => {
          console.error('Error executing drilldown query:', error)
          ready.value = true
        })
        .finally(() => {
          showLoading.value = false
        })
    }
    const controlsVisible = ref(false)

    // Mouse event handlers for hover controls
    const onChartMouseEnter = () => {
      controlsVisible.value = true
    }

    const onChartMouseLeave = () => {
      controlsVisible.value = false
    }

    return {
      chartContainer,
      results,
      ready,
      loading,
      showLoading,
      error,
      query,
      chartHeight,
      chartWidth,
      chartConfig,
      chartTitle,
      onChartConfigChange,
      onRefresh,
      handleLocalRefresh,
      chartSelection,
      startTime,
      handleDimensionClick,
      handleBackgroundClick,
      activeDrilldown,
      activateDrilldown,
      submitDrilldown,
      controlsVisible,
      onChartMouseEnter,
      onChartMouseLeave,
      revertDrilldown,
      hasDrilldown,
    }
  },
})
</script>

<style scoped>
.chart-placeholder {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  /* padding: 5px; */
  color: #666;
  position: relative;
  overflow-y: hidden;
  padding-top: 5px;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  vertical-align: middle;
  background-color: var(--bg-loading);
  backdrop-filter: blur(2px);
  z-index: 10;
}

.chart-query {
  font-family: monospace;
  font-size: 12px;
  margin-top: 10px;
  padding: 8px;
  background-color: var(--bg-color);
  border: 1px var(--border);
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-actions {
  position: absolute;
  bottom: 10px;
  right: 10px;
  z-index: 5;
}

.chart-refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: var(--button-bg, #f5f5f5);
  border: 1px solid var(--border-light, #ddd);
  color: var(--text-color, #333);
  cursor: pointer;
  opacity: 0.7;
  transition:
    opacity 0.2s,
    background-color 0.2s;
}

.chart-refresh-button:hover {
  opacity: 1;
  background-color: var(--button-hover-bg, #e0e0e0);
}

.refresh-icon {
  font-size: 16px;
  font-weight: bold;
}

.chart-placeholder-edit-mode {
  padding-top: 15px;
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
  transition:
    opacity 0.2s ease-in-out,
    visibility 0.2s ease-in-out;
}

.controls-toggle.controls-visible {
  opacity: 1;
  visibility: visible;
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
</style>
