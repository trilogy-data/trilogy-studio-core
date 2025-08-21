<template>
  <div
    ref="chartContainer"
    class="chart-placeholder no-drag"
    :class="{ 'chart-placeholder-edit-mode': editMode }"
    @mouseenter="onChartMouseEnter"
    @mouseleave="onChartMouseLeave"
  >
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>

    <MarkdownRenderer
      v-else-if="ready"
      :markdown="markdown"
      :results="results"
      :loading="loading"
    />

    <div 
      v-if="!loading && editMode" 
      class="controls-toggle"
      :class="{ 'controls-visible': controlsVisible }"
    >
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Refresh text"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, computed, watch, ref, onMounted, type PropType } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { Results } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingView from '../LoadingView.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { type GridItemDataResponse } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'

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
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
      default: () => ({ type: 'MARKDOWN', content: { markdown: '', query: '' } }),
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
  setup(props) {
    const ready = ref(false)
    const chartContainer = ref<HTMLElement | null>(null)
    const currentQueryId = ref<string | null>(null)
    const controlsVisible = ref(false)

    // Mouse event handlers for hover controls
    const onChartMouseEnter = () => {
      controlsVisible.value = true
    }

    const onChartMouseLeave = () => {
      controlsVisible.value = false
    }

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

      const dashboardQueryExecutor = props.getDashboardQueryExecutor(props.dashboardId)
      if (!dashboardQueryExecutor) {
        throw new Error('Dashboard query executor not found!')
      }

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
      controlsVisible,
      onChartMouseEnter,
      onChartMouseLeave,
    }
  },
})
</script>

<style scoped>
.chart-placeholder {
  flex: 1;
  height: 100%;
  padding-top: 5px;
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
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;
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

/* Mobile responsiveness - always show controls on mobile */
@media (max-width: 768px) {
  .controls-toggle {
    opacity: 1;
    visibility: visible;
  }
  
  .control-btn {
    width: 32px;
    height: 32px;
  }
}
</style>