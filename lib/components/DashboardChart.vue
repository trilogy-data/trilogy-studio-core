<template>
  <div class="chart-placeholder no-drag" :class="{ 'chart-placeholder-edit-mode': editMode }">
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>
    <VegaLiteChart
      v-else-if="results"
      :id="`${itemId}-${dashboardId}`"
      :columns="results.headers"
      :data="results.data"
      :showControls="editMode"
      :initialConfig="chartConfig || undefined"
      :containerHeight="chartHeight"
      :container-width="chartWidth"
      :onChartConfigChange="onChartConfigChange"
      :chartSelection
      @dimension-click="handleDimensionClick"
      @background-click="handleBackgroundClick"
    />

    <!-- Loading overlay positioned absolutely over the entire component -->
    <div v-if="loading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>
    <div v-if="!loading" class="chart-actions">
      <button
        v-if="onRefresh"
        @click="handleLocalRefresh"
        class="chart-refresh-button"
        title="Refresh this chart"
      >
        <span class="refresh-icon">⟳</span>
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
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { Results, ChartConfig } from '../editors/results'
import QueryExecutionService from '../stores/queryExecutionService'
import ErrorMessage from './ErrorMessage.vue'
import VegaLiteChart from './VegaLiteChart.vue'
import LoadingView from './LoadingView.vue'
import { type GridItemData, type DimensionClick } from '../dashboards/base'
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
      type: Function as PropType<(itemId: string, dashboardId: string) => GridItemData>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
  },
  setup(props, { emit }) {
    const results = ref<Results | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    const startTime = ref<number | null>(null)
    // Set up event listeners when the component is mounted
    onMounted(() => {
      window.addEventListener('dashboard-refresh', handleDashboardRefresh)
      window.addEventListener('chart-refresh', handleChartRefresh as EventListener)
    })
    const query = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).content
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

    const chartImports = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).imports || []
    })

    const chartParameters = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).parameters || []
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

    const connectionName = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).connectionName || []
    })

    // Get refresh callback from item data if available
    const onRefresh = computed(() => {
      const itemData = props.getItemData(props.itemId, props.dashboardId)
      return itemData.onRefresh || null
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')

    const onChartConfigChange = (chartConfig: ChartConfig) => {
      props.setItemData(props.itemId, props.dashboardId, { chartConfig: chartConfig })
    }
    if (!connectionStore || !queryExecutionService) {
      throw new Error('Connection store not found!')
    }

    const executeQuery = async (): Promise<any> => {
      if (!query.value) return
      startTime.value = Date.now()
      loading.value = true
      error.value = null

      try {
        // Analytics tracking (optional, include if needed)
        try {
          // @ts-ignore
          window.goatcounter.count({
            path: 'dashboard-chart-execution',
            title: 'CHART',
            event: true,
          })
        } catch (err) {
          console.log(err)
        }

        // Prepare query input
        let connName = connectionName.value || ''
        if (!connName) {
          return
        }
        //@ts-ignore
        const conn = connectionStore.connections[connName]

        // Create query input object using the chart's query content
        const queryInput = {
          text: query.value,
          queryType: conn.query_type,
          editorType: 'trilogy',
          imports: chartImports.value,
          extraFilters: filters.value,
          parameters: chartParameters.value,
        }

        // Get the query execution service from the provider

        if (!queryExecutionService) {
          throw new Error('Query execution service not found!')
        }

        // Execute query
        const { resultPromise } = await queryExecutionService.executeQuery(
          //@ts-ignore
          connName,
          queryInput,
          // Progress callback for connection issues
          () => {},
          (message) => {
            if (message.error) {
              error.value = message.message
            }
          },
        )

        // Handle result
        const result = await resultPromise

        // Update component state based on result
        if (result.success && result.results) {
          results.value = result.results
          error.value = null
        } else if (result.error) {
          error.value = result.error
        }
      } catch (err) {
        if (err instanceof Error) {
          error.value = err.message
        } else {
          error.value = 'Unknown error occurred'
        }
        console.error('Error running query:', err)
      } finally {
        loading.value = false
        startTime.value = null
      }
    }

    // Handle individual chart refresh button click
    const handleLocalRefresh = () => {
      console.log('local refresh click')
      if (onRefresh.value) {
        onRefresh.value(props.itemId)
      }
      executeQuery()
    }

    // Global dashboard refresh handler
    const handleDashboardRefresh = () => {
      console.log(`Chart ${props.itemId} received dashboard refresh event`)
      executeQuery()
    }

    // Targeted chart refresh handler
    const handleChartRefresh = (event: CustomEvent) => {
      console.log('chartRefreshEvent')
      // Only refresh this chart if it's the target or no specific target
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
      window.removeEventListener('dashboard-refresh', handleDashboardRefresh)
      window.removeEventListener('chart-refresh', handleChartRefresh as EventListener)
    })

    // Initial query execution
    console.log('Initial query execution')
    executeQuery()

    // Watch for changes that should trigger a refresh
    // watch([query, filters, chartImports], () => {
    //   executeQuery()
    // })

    watch([query, chartImports], () => {
      executeQuery()
    })
    watch([filters], (newVal, oldVal) => {
      // Check if arrays have the same content
      const contentChanged = JSON.stringify(newVal) !== JSON.stringify(oldVal)

      if (contentChanged) {
        executeQuery()
      }
    })

    return {
      results,
      loading,
      error,
      query,
      chartHeight,
      chartWidth,
      chartConfig,
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
  background-color: rgba(255, 255, 255, 0.7);
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
