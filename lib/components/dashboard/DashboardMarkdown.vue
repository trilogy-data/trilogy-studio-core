<template>
  <div class="chart-placeholder no-drag" :class="{ 'chart-placeholder-edit-mode': editMode }">
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>

    <div class="markdown-content">
      <div class="rendered-markdown" v-html="renderedMarkdown"></div>
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
import QueryExecutionService from '../../stores/queryExecutionService'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingView from '../LoadingView.vue'
import { type GridItemDataResponse } from '../../dashboards/base'
import { type AnalyticsStoreType } from '../../stores/analyticsStore'
import { renderMarkdown } from '../../utility/markdownRenderer'

export default defineComponent({
  name: 'DynamicMarkdownChart',
  components: {
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
  },
  setup(props) {
    const loading = ref(false)
    const error = ref<string | null>(null)
    const startTime = ref<number | null>(null)

    // Set up event listeners when the component is mounted
    onMounted(() => {
      window.addEventListener('dashboard-refresh', handleDashboardRefresh)
      window.addEventListener('chart-refresh', handleChartRefresh as EventListener)
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

    const connectionName = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).connectionName || []
    })

    const onRefresh = computed(() => {
      const itemData = props.getItemData(props.itemId, props.dashboardId)
      return itemData.onRefresh || null
    })

    const rootContent = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).rootContent || []
    })

    // Render markdown with query results and loading state
    const renderedMarkdown = computed(() => {
      return renderMarkdown(markdown.value, results.value, loading.value)
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')

    if (!connectionStore || !queryExecutionService) {
      throw new Error('Connection store not found!')
    }

    const executeQuery = async (): Promise<any> => {
      if (!query.value) {
        // If no query, just render the markdown as-is
        return
      }

      startTime.value = Date.now()
      loading.value = true
      error.value = null

      try {
        if (analyticsStore) {
          analyticsStore.log('dashboard-markdown-execution', 'MARKDOWN', true)
        }

        // Prepare query input
        let connName = connectionName.value || ''
        if (!connName) {
          error.value = 'No connection specified'
          return
        }

        //@ts-ignore
        const conn = connectionStore.connections[connName]

        // Create query input object
        const queryInput = {
          text: query.value,
          queryType: conn.query_type,
          editorType: 'trilogy',
          imports: chartImports.value,
          extraFilters: filters.value,
          parameters: chartParameters.value,
          extraContent: rootContent.value,
        }

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
          props.setItemData(props.itemId, props.dashboardId, {
            results: result.results as Results,
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

    // Handle individual component refresh button click
    const handleLocalRefresh = () => {
      console.log('local refresh click')
      if (onRefresh.value) {
        onRefresh.value(props.itemId)
      }
      executeQuery()
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
      window.removeEventListener('dashboard-refresh', handleDashboardRefresh)
      window.removeEventListener('chart-refresh', handleChartRefresh as EventListener)
    })

    // Initial query execution
    executeQuery()

    // Watch for changes and re-execute query
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
      markdown,
      renderedMarkdown,
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

/* Markdown Component Styles */
.markdown-content {
  height: 100%;
  padding: 10px 15px;
  overflow-y: auto;
  flex: 1;
}

.rendered-markdown {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: var(--text-color, #333);
}

.rendered-markdown h1 {
  font-size: 1.8em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  border-bottom: 2px solid var(--border-light, #eee);
  padding-bottom: 0.25em;
  font-weight: 600;
}

.rendered-markdown h2 {
  font-size: 1.5em;
  margin-top: 0.75em;
  margin-bottom: 0.5em;
  font-weight: 600;
  color: var(--heading-color, #2c3e50);
}

.rendered-markdown h3 {
  font-size: 1.2em;
  margin-top: 0.5em;
  margin-bottom: 0.25em;
  font-weight: 600;
  color: var(--heading-color, #34495e);
}

.rendered-markdown p {
  margin-top: 0.25em;
  margin-bottom: 0.75em;
}

.rendered-markdown ul {
  margin-top: 0.5em;
  margin-bottom: 0.75em;
  padding-left: 2em;
}

.rendered-markdown li {
  margin-bottom: 0.25em;
}

.rendered-markdown a {
  color: var(--link-color, #2196f3);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.rendered-markdown a:hover {
  border-bottom-color: var(--link-color, #2196f3);
}

.rendered-markdown strong {
  font-weight: 600;
  color: var(--strong-color, #2c3e50);
}

.rendered-markdown em {
  font-style: italic;
  color: var(--em-color, #7f8c8d);
}

/* Style for templated values */
.rendered-markdown .data-value {
  background-color: var(--highlight-bg, #f8f9fa);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

/* Global styles for loading pills (since they're injected via v-html) */
:global(.loading-pill) {
  display: inline-block;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 4px;
  filter: blur(0.5px);
  vertical-align: baseline;
}
</style>
