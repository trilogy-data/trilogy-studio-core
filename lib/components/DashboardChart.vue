<template>
  <div class="chart-placeholder no-drag">
    <VegaLiteChart
      v-if="results"
      :columns="results.headers"
      :data="results.data"
      :showControls="editMode"
      :initialConfig="chartConfig"
      :containerHeight="chartHeight"
      :onChartConfigChange="onChartConfigChange"
    />
    <LoadingView v-else-if="loading" text="Loading"></LoadingView>
    <ErrorMessage v-else-if="error" class="chart-placeholder">{{ error }}</ErrorMessage>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, computed, watch, ref } from 'vue'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { Results, ChartConfig } from '../editors/results'
import QueryExecutionService from '../stores/queryExecutionService'
import ErrorMessage from './ErrorMessage.vue'
import VegaLiteChart from './VegaLiteChart.vue'
import LoadingView from './LoadingView.vue'
export default defineComponent({
  name: 'DashboardChart',
  components: {
    VegaLiteChart,
    ErrorMessage,
    LoadingView,
  },
  props: {
    itemId: {
      type: String,
      required: true,
    },
    getItemData: {
      type: Function,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    setItemData: {
      type: Function,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
  },
  setup(props) {
    const results = ref<Results | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const query = computed(() => {
      return props.getItemData(props.itemId).content
    })

    const chartHeight = computed(() => {
      return (props.getItemData(props.itemId).height || 300) - 100
    })

    const chartConfig = computed(() => {
      return props.getItemData(props.itemId).chartConfig || null
    })

    const chartImports = computed(() => {
      return props.getItemData(props.itemId).imports || []
    })

    const filters = computed(() => {
      return props.getItemData(props.itemId).filters || []
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')

    const onChartConfigChange = (chartConfig: ChartConfig) => {
      props.setItemData(props.itemId, { chartConfig: chartConfig })
    }
    if (!connectionStore || !queryExecutionService) {
      throw new Error('Connection store not found!')
    }

    const executeQuery = async (isRetry: boolean = false): Promise<any> => {
      if (!query.value) return

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
        const conn = connectionStore.connections['airport-test']

        // Create query input object using the chart's query content
        const queryInput = {
          text: query.value,
          queryType: conn.query_type,
          editorType: 'trilogy',
          imports: chartImports.value,
          extraFilters: filters.value,
        }

        // Get the query execution service from the provider

        if (!queryExecutionService) {
          throw new Error('Query execution service not found!')
        }

        // Execute query
        const { resultPromise } = await queryExecutionService.executeQuery(
          'airport-test', // Using the specified connection
          queryInput,
          // Progress callback for connection issues
          () => {},
          (message) => {
            if (message.error) {
              error.value = message.text
            }
          },
        )

        // Handle result
        const result = await resultPromise

        // Special handling for connection retry
        if (!result.success && result.error === 'CONNECTION_RETRY_NEEDED' && !isRetry) {
          return executeQuery(true)
        }

        // Update component state based on result
        if (result.success && result.results) {
          results.value = result.results
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
      }
    }

    executeQuery()
    watch([query, filters, chartImports], () => {
      executeQuery()
    })
    return {
      results,
      loading,
      error,
      query,
      chartHeight,
      chartConfig,
      onChartConfigChange,
    }
  },
})
</script>

<style scoped>
.chart-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 5px;
  color: #666;
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
</style>
