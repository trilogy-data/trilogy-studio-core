<!-- QueryHistory.vue -->
<template>
  <div class="query-history">
    <div class="query-history-header">
      <h3>Query History for {{ connectionName }}</h3>
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
          <code-block class="query-history-item-query" :content="item.query" language="sql" />
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
import useQueryHistory from '../stores/connectionHistoryStore'
import CodeBlock from './CodeBlock.vue'

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

// Computed properties to access store state
const history = computed(() => historyStore.value.history)
const isLoading = computed(() => historyStore.value.isLoading)
const error = computed(() => historyStore.value.error)

// Toggle expanded state for a history item
const toggleExpand = (id: number): void => {
  expandedItems.value[id] = !expandedItems.value[id]
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
  font-size: 14px;
  color: var(--text-color);
  background-color: var(--bg-color);
  border-radius: 6px;
  border: 1px solid var(--border);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.query-history-header {
  padding: 8px 16px;
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.query-history-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.query-history-actions {
  display: flex;
  gap: 8px;
}

.query-history-actions button {
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s ease;
}

.query-history-actions button:hover {
  background-color: var(--bg-color);
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
  color: #444;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.query-history-item-meta {
  font-size: 12px;
  color: #666;
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

.query-history-item-query {
  font-family: monospace;
  border-radius: 4px;
  padding: 12px;
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
  color: #666;
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
