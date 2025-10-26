<!-- QueryHistory.vue -->
<template>
  <div class="query-history">
    <div class="section-header">
      Query History for {{ connectionName }}
      <span v-if="history.length > 0" class="query-count">({{ history.length }})</span>
      <div class="query-history-actions">
        <button @click="refreshHistory" class="refresh-btn" title="Refresh history">Refresh</button>
        <button @click="clearHistory" class="clear-btn" title="Clear history">Clear</button>
      </div>
    </div>

    <div v-if="isLoading" class="query-history-loading">Loading history...</div>

    <div v-else-if="error" class="query-history-error">
      <p>Error: {{ error }}</p>
      <button @click="refreshHistory">Retry</button>
    </div>

    <div v-else-if="history.length === 0" class="query-history-empty">
      No queries have been executed yet.
    </div>

    <div v-else class="query-history-list">
      <div
        v-for="item in history"
        :key="item.id"
        class="query-history-item"
        :class="item.status === 'error' ? 'error' : 'success'"
      >
        <div class="query-history-item-header" @click="toggleExpand(item.id)">
          <div class="query-history-item-status">
            {{ item.status === 'success' ? '✓' : '✗' }}
          </div>
          <div class="query-history-item-summary">
            <div class="query-history-item-preview">
              {{ truncateQuery(item.query, 50) }}
            </div>
            <div class="query-history-item-meta">
              <span title="Execution time">{{ formatExecutionTime(item.executionTime) }}</span>
              <span title="Result size">{{ item.resultSize }} rows</span>
              <span title="Timestamp">{{ formatDate(item.timestamp) }}</span>
            </div>
          </div>
          <div class="query-history-item-expand">
            {{ expandedItems[item.id] ? '▼' : '▶' }}
          </div>
        </div>

        <div v-if="expandedItems[item.id]" class="query-history-item-details">
          <div class="query-tabs" v-if="item.generatedQuery">
            <button
              class="tab-btn"
              :class="{ active: !showGeneratedQuery[item.id] }"
              @click="toggleGeneratedQuery(item.id, false)"
            >
              Executed Query
            </button>
            <button
              class="tab-btn"
              :class="{ active: showGeneratedQuery[item.id] }"
              @click="toggleGeneratedQuery(item.id, true)"
            >
              Generated Query
            </button>
          </div>

          <code-block
            class="query-history-item-query"
            :content="
              showGeneratedQuery[item.id] && item.generatedQuery ? item.generatedQuery : item.query
            "
            language="sql"
          />

          <div class="query-history-item-details-meta">
            <div>Executed at: {{ formatDate(item.timestamp) }}</div>
            <div>Time: {{ formatExecutionTime(item.executionTime) }}</div>
            <div>Rows: {{ item.resultSize }}</div>
            <div>Columns: {{ item.resultColumns }}</div>
            <div v-if="item.status === 'error'" class="query-history-item-error">
              Error: {{ item.errorMessage }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import useQueryHistory from '../../stores/connectionHistoryStore'
import CodeBlock from '../CodeBlock.vue'

const props = defineProps({
  connectionName: {
    type: String,
    required: true,
  },
})

// Reactive reference to the current connection name
const currentConnectionName = computed(() => props.connectionName)

// Create reactive store with initial connection name
const historyStore = ref(useQueryHistory(currentConnectionName.value))

// Track expanded state for history items
const expandedItems = ref<Record<number, boolean>>({})

// Track which view of the query to show (executed or generated)
const showGeneratedQuery = ref<Record<number, boolean>>({})

// Computed properties to access store state
const history = computed(() => historyStore.value.history)
const isLoading = computed(() => historyStore.value.isLoading)
const error = computed(() => historyStore.value.error)

// Toggle expanded state for a history item
const toggleExpand = (id: number): void => {
  expandedItems.value[id] = !expandedItems.value[id]
}

// Toggle between executed query and generated query text
const toggleGeneratedQuery = (id: number, showGenerated: boolean): void => {
  // Stop event propagation to prevent toggling the expanded state
  event?.stopPropagation()
  showGeneratedQuery.value[id] = showGenerated
}

// Format date in a readable way
const formatDate = (isoString: string): string => {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(date)
}

// Format execution time in a readable way
const formatExecutionTime = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(1)} ms`
  } else {
    return `${(ms / 1000).toFixed(2)} s`
  }
}

// Truncate query for preview
const truncateQuery = (query: string, maxLength: number): string => {
  return query.length > maxLength ? `${query.substring(0, maxLength)}...` : query
}

// Method to refresh history
const refreshHistory = () => {
  historyStore.value.refreshHistory()
}

// Method to clear history
const clearHistory = () => {
  historyStore.value.clearHistory()
}

// Watch for connection name changes and update the store
watch(
  () => props.connectionName,
  (newConnectionName) => {
    // Reset expanded items when connection changes
    expandedItems.value = {}
    // Reset generated query view state
    showGeneratedQuery.value = {}

    // Create a new store instance with the new connection name
    historyStore.value = useQueryHistory(newConnectionName)

    // Load the history for the new connection
    refreshHistory()
  },
  { immediate: true },
)

// Initial load
onMounted(() => {
  refreshHistory()
})
</script>

<style scoped>
/* QueryHistory styles */
.query-history {
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Arial,
    sans-serif;
  color: var(--text-color);
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.query-count {
  color: var(--text-faint);
  font-size: 0.9em;
  font-weight: normal;
}

.query-history-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.refresh-btn {
  padding: 4px 8px;
  font-size: 14px;
}

.clear-btn {
  color: #d32f2f;
}

.query-history-list {
  overflow-y: auto;
  flex-grow: 1;
}

.query-history-empty,
.query-history-loading,
.query-history-error {
  padding: 16px;
  text-align: center;
  color: #666;
}

.query-history-error {
  color: #d32f2f;
}

.query-history-item {
  border-bottom: 1px solid var(--border);
  background-color: var(--bg-color);
}

.query-history-item.error .query-history-item-header {
  background-color: rgba(211, 47, 47, 0.05);
}

.query-history-item.success .query-history-item-header {
  background-color: rgba(76, 175, 80, 0.05);
}

.query-history-item-header {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background-color 0.2s ease;
}

.query-history-item-header:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.query-history-item-status {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.query-history-item.success .query-history-item-status {
  color: #4caf50;
}

.query-history-item.error .query-history-item-status {
  color: #d32f2f;
}

.query-history-item-summary {
  flex-grow: 1;
  overflow: hidden;
}

.query-history-item-preview {
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.query-history-item-meta {
  font-size: 12px;
  color: var(--text-faint);
  display: flex;
  gap: 12px;
}

.query-history-item-expand {
  color: #999;
  font-size: 10px;
  flex-shrink: 0;
}

.query-history-item-details {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  background-color: var(--bg-color);
}

/* Query tabs navigation */
.query-tabs {
  display: flex;
  margin-top: 12px;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: #333;
}

.tab-btn.active {
  color: #2196f3;
  border-bottom-color: #2196f3;
  font-weight: 500;
}

.query-history-item-query {
  font-family: monospace;
  border-radius: 4px;
  /* padding: 12px; */
  margin: 12px 0;
  overflow-x: auto;
  white-space: pre-wrap;
  font-size: 13px;
  max-height: 300px;
  overflow-y: auto;
}

.query-history-item-details-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-faint);
}

.query-history-item-error {
  color: #d32f2f;
  grid-column: 1 / -1;
  margin-top: 8px;
  padding: 8px;
  background-color: rgba(211, 47, 47, 0.05);
  border-radius: 4px;
}

.query-history-item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.use-query-btn {
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
}

.use-query-btn:hover {
  background-color: #1976d2;
}
</style>
