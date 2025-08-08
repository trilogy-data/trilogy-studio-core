<template>
  <div ref="chartContainer" class="chart-placeholder no-drag" :class="{ 'chart-placeholder-edit-mode': editMode }">
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>
    <data-table
      v-else-if="ready && results"
      :id="`${itemId}-${dashboardId}`"
      :headers="results.headers"
      :results="results.data"
      :containerHeight="chartHeight"
      :prettyPrint="true"
      :fitParent="true"
      @cell-click="handleDimensionClick"
      @background-click="handleBackgroundClick"
    />

    <!-- Loading overlay positioned absolutely over the entire component -->
    <div v-if="loading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>

    <div v-if="!loading && editMode" class="controls-toggle">
      <button @click="handleLocalRefresh" class="control-btn" data-testid="refresh-chart-btn" title="Refresh table">
        <i class="mdi mdi-refresh icon"></i>
      </button>
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
import type { Results } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import DataTable from '../DataTable.vue'
import LoadingView from '../LoadingView.vue'
import { type GridItemDataResponse, type DimensionClick } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'

export default defineComponent({
  name: 'DashboardChart',
  components: {
    DataTable,
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
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    getDashboardQueryExecutor: {
      type: Function as PropType<() => DashboardQueryExecutor>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const ready = ref(false)
    const chartContainer = ref<HTMLElement | null>(null)
    const currentQueryId = ref<string | null>(null)

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
      window.addEventListener('dashboard-refresh', handleDashboardRefresh)
      window.addEventListener('chart-refresh', handleChartRefresh as EventListener)

      // Apply position-based delay after DOM is ready
      setTimeout(() => {
        // this is to delay *rendering* the component, not query execution
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

    const query = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).content
    })

    const results = computed((): Results | null => {
      return props.getItemData(props.itemId, props.dashboardId).results || null
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

    const chartHeight = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).height || 300) - 75
    })

    const chartWidth = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).width || 300) - 100
    })

    const chartConfig = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).chartConfig || null
    })



    const filters = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).filters || []).map(
        (filter) => filter.value,
      )
    })


    // Get refresh callback from item data if available
    const onRefresh = computed(() => {
      const itemData = props.getItemData(props.itemId, props.dashboardId)
      return itemData.onRefresh || null
    })



    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')

    if (!connectionStore) {
      throw new Error('Connection store not found!')
    }

    const executeQuery = async (): Promise<any> => {
      if (!query.value) return

      const dashboardQueryExecutor = props.getDashboardQueryExecutor()
      if (!dashboardQueryExecutor) {
        throw new Error('Dashboard query executor not found!')
      }

      try {
        if (analyticsStore) {
          analyticsStore.log('dashboard-table-execution', 'TABLE', true)
        }

        // Cancel any existing query for this table component
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

    // Handle individual component refresh button click
    const handleLocalRefresh = () => {
      if (onRefresh.value) {
        onRefresh.value(props.itemId)
      } else {
        executeQuery()
      }
    }

    // Global dashboard refresh handler
    const handleDashboardRefresh = () => {
      console.log(`Chart ${props.itemId} received dashboard refresh event`)
      executeQuery()
    }

    // Targeted chart refresh handler
    const handleChartRefresh = (event: CustomEvent) => {
      // Only refresh this component if it's the target or no specific target
      if (!event.detail || !event.detail.itemId || event.detail.itemId === props.itemId) {
        console.log(`Chart ${props.itemId} received targeted refresh event`)
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

    // Remove event listeners when the component is unmounted
    onUnmounted(() => {
      // Cancel any pending query when component unmounts
      if (currentQueryId.value) {
        const dashboardQueryExecutor = props.getDashboardQueryExecutor()
        if (dashboardQueryExecutor) {
          dashboardQueryExecutor.cancelQuery(currentQueryId.value)
        }
      }

      window.removeEventListener('dashboard-refresh', handleDashboardRefresh)
      window.removeEventListener('chart-refresh', handleChartRefresh as EventListener)
    })

    // Watch for changes and re-execute query
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
      error,
      query,
      chartHeight,
      chartWidth,
      chartConfig,
      onRefresh,
      handleLocalRefresh,
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
  justify-content: flex-start;
  align-items: stretch;
  position: relative;
  overflow-y: hidden;
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
</style>