<template>
  <div
    ref="chartContainer"
    class="chart-placeholder no-drag"
    :class="{ 'chart-placeholder-edit-mode': editMode }"
  >
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>
    <VegaLiteChart
      v-else-if="results && ready"
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
      @dimension-click="handleDimensionClick"
      @background-click="handleBackgroundClick"
      @refresh-click="handleLocalRefresh"
    />
    <div v-if="loading && showLoading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>
  </div>
</template>

<script lang="ts">
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
import { type GridItemDataResponse, type DimensionClick } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'

export default defineComponent({
  name: 'DashboardChart',
  components: {
    VegaLiteChart,
    ErrorMessage,
    LoadingView,
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
      return props.getItemData(props.itemId, props.dashboardId).content
    })

    const results = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).results || null
    })

    const chartTitle = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).name || ''
    })

    const chartHeight = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).height || 300) - 75
    })

    const chartWidth = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).width || 300) - 100
    })

    const chartConfig = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).chartConfig || null
    })

    const loading = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).loading || false
    })

    const error = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).error || null
    })

    const startTime = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).loadStartTime || null
    })

    const filters = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).filters || []).map(
        (filter) => filter.value,
      )
    })

    const chartSelection = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).chartFilters || []).map(
        (filter) => filter.value,
      )
    })

    // Get refresh callback from item data if available
    const onRefresh = computed(() => {
      const itemData = props.getItemData(props.itemId, props.dashboardId)
      return itemData.onRefresh || null
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
          }, 150)
        } else {
          // Stop loading - hide immediately
          showLoading.value = false
        }
      },
      { immediate: true },
    )

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')

    const onChartConfigChange = (chartConfig: ChartConfig) => {
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

    watch([filters], (newVal, oldVal) => {
      // Check if arrays have the same content
      const contentChanged = JSON.stringify(newVal) !== JSON.stringify(oldVal)

      if (contentChanged) {
        executeQuery()
      }
    })

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
</style>
