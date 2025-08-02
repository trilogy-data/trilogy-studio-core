<template>
  <div class="chart-placeholder no-drag" :class="{ 'chart-placeholder-edit-mode': editMode }">
    <ErrorMessage v-if="error && !loading" class="chart-placeholder">{{ error }}</ErrorMessage>

    <div v-else-if="!loading" class="markdown-content">
      <div class="rendered-markdown" v-html="renderedMarkdown"></div>
    </div>

    <!-- Loading overlay positioned absolutely over the entire component -->
    <div v-if="loading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>

    <div v-if="!loading && editMode" class="chart-actions">
      <button v-if="onRefresh" @click="handleLocalRefresh" class="chart-refresh-button" title="Refresh this markdown">
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
import type { Results, ChartConfig } from '../../editors/results'
import QueryExecutionService from '../../stores/queryExecutionService'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingView from '../LoadingView.vue'
import { type GridItemDataResponse, type DimensionClick } from '../../dashboards/base'
import { type AnalyticsStoreType } from '../../stores/analyticsStore'

// Helper function to safely get nested object values
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object') {
      // Handle array access like data[0]
      const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/)
      if (arrayMatch) {
        const [, arrayName, index] = arrayMatch
        return current[arrayName] ? current[arrayName][parseInt(index)] : undefined
      }
      return current[key]
    }
    return undefined
  }, obj)
}

// Helper function to evaluate fallback expressions
function evaluateFallback(expression: string, queryResults: any): string {
  try {
    // Handle fallback syntax: {expression || 'fallback'}
    const fallbackMatch = expression.match(/^(.+?)\s*\|\|\s*(.+?)$/)
    if (fallbackMatch) {
      const [, mainExpr, fallbackExpr] = fallbackMatch
      const mainValue = evaluateExpression(mainExpr.trim(), queryResults)
      
      if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
        return String(mainValue)
      } else {
        // Parse fallback - could be a string literal or another expression
        const fallback = fallbackExpr.trim()
        if ((fallback.startsWith("'") && fallback.endsWith("'")) || 
            (fallback.startsWith('"') && fallback.endsWith('"'))) {
          // String literal fallback
          return fallback.slice(1, -1)
        } else {
          // Expression fallback
          const fallbackValue = evaluateExpression(fallback, queryResults)
          return fallbackValue !== undefined ? String(fallbackValue) : fallback
        }
      }
    } else {
      // No fallback, evaluate normally
      const value = evaluateExpression(expression, queryResults)
      return value !== undefined ? String(value) : `{${expression}}`
    }
  } catch (error) {
    console.warn('Error evaluating fallback expression:', expression, error)
    return `{${expression}}`
  }
}

// Helper function to evaluate individual expressions
function evaluateExpression(expression: string, queryResults: any): any {
  if (!queryResults || !queryResults.data) {
    return undefined
  }

  // Handle data[index].field patterns
  const dataIndexMatch = expression.match(/^data\[(\d+)\]\.(\w+)$/)
  if (dataIndexMatch) {
    const [, index, field] = dataIndexMatch
    const rowIndex = parseInt(index)
    if (queryResults.data[rowIndex] && queryResults.data[rowIndex][field] !== undefined) {
      return queryResults.data[rowIndex][field]
    }
    return undefined
  }

  // Handle data.length
  if (expression === 'data.length') {
    return queryResults.data.length
  }

  // Handle simple field access (uses first row)
  if (queryResults.data.length > 0) {
    const firstRow = queryResults.data[0]
    if (firstRow && firstRow[expression] !== undefined) {
      return firstRow[expression]
    }
  }

  return undefined
}

// Enhanced markdown renderer with templating support and fallbacks
function renderMarkdown(text: string, queryResults: any = null): string {
  if (!text) return ''

  let html = text
  console.log('Rendering markdown with query results:', queryResults)
  
  // Template substitution with fallback support
  if (queryResults && queryResults.data) {
    // Replace {expression || fallback} patterns
    html = html.replace(/\{([^}]+)\}/g, (match, expression) => {
      return evaluateFallback(expression, queryResults)
    })

    // Handle loops: {{#each data}} content {{field_name}} {{/each}}
    html = html.replace(/\{\{#each data\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, template) => {
      let loopContent = ''
      queryResults.data.forEach((row: any, index: number) => {
        let itemContent = template
        // Replace field references in loop with fallback support
        itemContent = itemContent.replace(/\{\{([^}]+)\}\}/g, (fieldMatch, fieldExpr) => {
          const trimmed = fieldExpr.trim()
          
          // Handle special cases
          if (trimmed === '@index') {
            return String(index)
          }
          
          // Handle fallback syntax in loops
          const fallbackMatch = trimmed.match(/^(.+?)\s*\|\|\s*(.+?)$/)
          if (fallbackMatch) {
            const [, mainField, fallbackExpr] = fallbackMatch
            const mainValue = row[mainField.trim()]
            
            if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
              return String(mainValue)
            } else {
              const fallback = fallbackExpr.trim()
              if ((fallback.startsWith("'") && fallback.endsWith("'")) || 
                  (fallback.startsWith('"') && fallback.endsWith('"'))) {
                return fallback.slice(1, -1)
              } else {
                // Try to get fallback from row data
                return row[fallback] !== undefined ? String(row[fallback]) : fallback
              }
            }
          } else {
            // Simple field access
            return row[trimmed] !== undefined ? String(row[trimmed]) : `{{${trimmed}}}`
          }
        })
        loopContent += itemContent
      })
      return loopContent
    })

    // Handle conditional loops with limit: {{#each data limit=5}}
    html = html.replace(/\{\{#each data limit=(\d+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, limitStr, template) => {
      const limit = parseInt(limitStr)
      let loopContent = ''
      const limitedData = queryResults.data.slice(0, limit)
      limitedData.forEach((row: any, index: number) => {
        let itemContent = template
        // Apply same fallback logic as above
        itemContent = itemContent.replace(/\{\{([^}]+)\}\}/g, (fieldMatch, fieldExpr) => {
          const trimmed = fieldExpr.trim()
          
          if (trimmed === '@index') {
            return String(index)
          }
          
          const fallbackMatch = trimmed.match(/^(.+?)\s*\|\|\s*(.+?)$/)
          if (fallbackMatch) {
            const [, mainField, fallbackExpr] = fallbackMatch
            const mainValue = row[mainField.trim()]
            
            if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
              return String(mainValue)
            } else {
              const fallback = fallbackExpr.trim()
              if ((fallback.startsWith("'") && fallback.endsWith("'")) || 
                  (fallback.startsWith('"') && fallback.endsWith('"'))) {
                return fallback.slice(1, -1)
              } else {
                return row[fallback] !== undefined ? String(row[fallback]) : fallback
              }
            }
          } else {
            return row[trimmed] !== undefined ? String(row[trimmed]) : `{{${trimmed}}}`
          }
        })
        loopContent += itemContent
      })
      return loopContent
    })
  } else {
    // No query results - handle fallbacks for empty data
    html = html.replace(/\{([^}]+)\}/g, (match, expression) => {
      const fallbackMatch = expression.match(/^(.+?)\s*\|\|\s*(.+?)$/)
      if (fallbackMatch) {
        const [, , fallbackExpr] = fallbackMatch
        const fallback = fallbackExpr.trim()
        if ((fallback.startsWith("'") && fallback.endsWith("'")) || 
            (fallback.startsWith('"') && fallback.endsWith('"'))) {
          return fallback.slice(1, -1)
        }
        return fallback
      }
      return match // Keep original if no fallback and no data
    })
  }

  // Standard markdown processing
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

  // Process lists
  html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
  html = html.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')

  // Merge consecutive list items
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  // Process bold and italic
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>')

  // Process links
  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')

  // Process paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<\/p><p><\/p><p>/g, '</p><p>')
  html = html.replace(/^<p><\/p>/, '').replace(/<p><\/p>$/, '')

  return html
}

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
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
      default: () => ({ type: 'MARKDOWN', content: { markdown: '', query: '' } }),
    },
  },
  setup(props, { emit }) {
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
      return itemData.content || { markdown: '', query: '' }
    })

    const markdown = computed(() => {
      return contentData.value.markdown || ''
    })

    const query = computed(() => {
      return contentData.value.query || ''
    })

    const results = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId).results || null
    })

    const chartHeight = computed(() => {
      return (props.getItemData(props.itemId, props.dashboardId).height || 300) - 75
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

    // Render markdown with query results
    const renderedMarkdown = computed(() => {
      return renderMarkdown(markdown.value, results.value)
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
          () => { },
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
</style>