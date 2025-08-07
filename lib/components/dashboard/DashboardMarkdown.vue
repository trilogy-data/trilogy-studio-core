<template>
  <div ref="chartContainer" class="chart-placeholder no-drag" :class="{ 'chart-placeholder-edit-mode': editMode }">
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>

    <MarkdownRenderer v-else-if="ready" :markdown="markdown" :results="results" :loading="loading" />

    <div v-if="loading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>

    <div v-if="!loading && editMode" class="chart-actions">
      <button
        v-if="onRefresh"
        @click="handleLocalRefresh"
        class="chart-refresh-button"
        title="Refresh this markdown"
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
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { Results } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingView from '../LoadingView.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { type GridItemDataResponse } from '../../dashboards/base'
import { type AnalyticsStoreType } from '../../stores/analyticsStore'

export default defineComponent({
  name: 'DynamicMarkdownChart',
  components: {
    ErrorMessage,
    LoadingView,
    MarkdownRenderer,
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
      default: () => ({ type: 'MARKDOWN', content: { markdown: '', query: '' } }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => void>,
      required: true,
      default: () => ({ type: 'MARKDOWN', content: { markdown: '', query: '' } }),
    },
    getDashboardQueryExecutor: {
      type: Function as PropType<() => DashboardQueryExecutor>,
      required: true,
    },
  },
  setup(props) {
    const loading = ref(false)
    const error = ref<string | null>(null)
    const startTime = ref<number | null>(null)
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

    const contentData = computed(() => {
      const itemData = props.getItemData(props.itemId, props.dashboardId)
      return itemData.structured_content || { markdown: '', query: '' }
    })

    const markdown = computed(() => {
      return contentData.value.markdown || ''
    })

    const query = computed(() => {
      return contentData.value.query || ''
    })

    const results = computed((): Results | null => {
      return props.getItemData(props.itemId, props.dashboardId).results || null
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
      if (!query.value) {
        // If no query, just render the markdown as-is
        return
      }

      const dashboardQueryExecutor = props.getDashboardQueryExecutor()
      if (!dashboardQueryExecutor) {
        throw new Error('Dashboard query executor not found!')
      }

      startTime.value = Date.now()
      loading.value = true
      error.value = null

      try {
        if (analyticsStore) {
          analyticsStore.log('dashboard-markdown-execution', 'MARKDOWN', true)
        }

        // Cancel any existing query for this markdown component
        if (currentQueryId.value) {
          dashboardQueryExecutor.cancelQuery(currentQueryId.value)
        }

        // Execute query through the dashboard query executor
        let queryId = await dashboardQueryExecutor.runSingle(props.itemId)

        await dashboardQueryExecutor.waitForQuery(queryId)
        loading.value = false

      } catch (err) {
        if (err instanceof Error) {
          error.value = err.message
        } else {
          // @ts-ignore
          error.value = err.toString()
        }
        console.error('Error setting up query:', err)
        loading.value = false
        startTime.value = null
        currentQueryId.value = null
      }
    }

    // Handle individual component refresh button click
    const handleLocalRefresh = () => {
      console.log('local refresh click')
      if (onRefresh.value) {
        onRefresh.value(props.itemId)
      } else {
        executeQuery()
      }
    }

    // Global dashboard refresh handler
    const handleDashboardRefresh = () => {
      console.log(`Markdown ${props.itemId} received dashboard refresh event`)
      executeQuery()
    }

    // Targeted chart refresh handler
    const handleChartRefresh = (event: CustomEvent) => {
      // Only refresh this component if it's the target or no specific target
      if (!event.detail || !event.detail.itemId || event.detail.itemId === props.itemId) {
        console.log(`Markdown ${props.itemId} received targeted refresh event`)
        executeQuery()
      }
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
      markdown,
      onRefresh,
      handleLocalRefresh,
      startTime,
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