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
    <div v-if="loading" class="loading-overlay">
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
import QueryExecutionService from '../../stores/queryExecutionService'
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
    const loading = ref(false)
    const error = ref<string | null>(null)
    const startTime = ref<number | null>(null)
    const ready = ref(false)
    const chartContainer = ref<HTMLElement | null>(null)

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
        const delay = getPositionBasedDelay()

        if (!results.value) {
          ready.value = true
          executeQuery()
        } else {
          // Cached results with delay
          loading.value = true
          setTimeout(() => {
            loading.value = false
            ready.value = true
          }, delay)
        }
      }, 0) // Use nextTick equivalent
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

    const rootContent = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).rootContent || []
    })

    // Get refresh callback from item data if available
    const onRefresh = computed(() => {
      const itemData = props.getItemData(props.itemId, props.dashboardId)
      return itemData.onRefresh || null
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')

    const onChartConfigChange = (chartConfig: ChartConfig) => {
      props.setItemData(props.itemId, props.dashboardId, { chartConfig: chartConfig })
    }
    if (!connectionStore || !queryExecutionService) {
      throw new Error('Connection store not found!')
    }

    const executeQuery = async (): Promise<any> => {
      if (!query.value) return
      const dashboardId = props.dashboardId
      const queryText = query.value
      startTime.value = Date.now()
      loading.value = true
      error.value = null

      try {
        if (analyticsStore) {
          analyticsStore.log('dashboard-chart-execution', 'CHART', true)
        }

        // Prepare query input
        let connName = connectionName.value || ''
        if (!connName) {
          return
        }
        //@ts-ignore
        const conn = connectionStore.connections[connName]
        if (!conn) {
          throw new Error(`Connection "${connName}" not found!`)
        }
        // Create query input object using the chart's query content
        const queryInput = {
          text: query.value,
          queryType: conn.query_type,
          editorType: 'trilogy',
          imports: chartImports.value,
          extraFilters: filters.value,
          extraContent: rootContent.value,
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
        if (props.dashboardId != dashboardId || query.value !== queryText) {
          console.log('Query result ignored due to dashboard or query text ID mismatch')
          return
        }
        // Update component state based on result
        if (result.success && result.results) {
          props.setItemData(props.itemId, props.dashboardId, {
            results: result.results,
          })
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
      chartContainer,
      results,
      ready,
      loading,
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
