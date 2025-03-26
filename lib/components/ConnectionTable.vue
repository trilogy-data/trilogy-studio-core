// TableViewer.vue
<template>
  <div class="table-viewer">
    <div class="table-header">
      <div class="table-title">
        <h2>{{ table.name }}</h2>
        <span class="table-type-badge" :class="[table.assetType === AssetType.TABLE ? 'table-badge' : 'view-badge']">
          {{ table.assetType === AssetType.TABLE ? 'Table' : 'View' }}
        </span>
      </div>
      <p v-if="table.description" class="table-description">{{ table.description }}</p>
    </div>

    <div class="tabs">
      <button class="tab-button" :class="{ active: activeTab === 'structure' }" @click="activeTab = 'structure'">
        Structure
      </button>
      <button class="tab-button" :class="{ active: activeTab === 'data' }" @click="loadSampleData">
        Sample Data
      </button>
    </div>

    <div v-if="activeTab === 'structure'" class="table-structure">
      <div class="structure-header">
        <div class="search-container">
          <input type="text" v-model="searchTerm" placeholder="Search columns..." class="search-input" />
        </div>
        <div class="column-count">
          {{ filteredColumns.length }} column{{ filteredColumns.length !== 1 ? 's' : '' }}
        </div>
      </div>

      <div class="structure-table-container">
        <table class="structure-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Constraints</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="column in filteredColumns" :key="column.name">
              <td>
                <div class="column-name">
                  {{ column.name }}
                  <span v-if="column.primary" class="key-icon" title="Primary Key">🔑</span>
                </div>
              </td>
              <td>{{ column.type }}</td>
              <td>
                <div class="constraint-badges">
                  <span v-if="column.primary" class="constraint-badge primary">PK</span>
                  <span v-if="column.unique" class="constraint-badge unique">UQ</span>
                  <span v-if="!column.nullable" class="constraint-badge not-null">NN</span>
                  <span v-if="column.autoincrement" class="constraint-badge auto-inc">AI</span>
                </div>
              </td>
              <td>{{ column.default !== null ? column.default : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="activeTab === 'data'" class="table-data">
      <div class="data-toolbar">
        <button class="refresh-button" @click="loadSampleData">
          <span class="refresh-icon">⟳</span> Refresh
        </button>
        <div class="row-count" v-if="sampleData.length">
          Showing {{ sampleData.length }} row{{ selectedSampleData?.data?.length !== 1 ? 's' : '' }}
        </div>
      </div>

      <div v-if="isLoading" class="loading-spinner">
        <div class="spinner"></div>
        <span>Loading sample data...</span>
      </div>

      <div v-else-if="error" class="error-message">
        <span>⚠️ {{ error }}</span>
      </div>

      <div v-else-if="selectedSampleData?.data.length === 0" class="empty-state">
        <p>No data available</p>
      </div>

      <DataTable v-else :results="selectedSampleData.data" :headers="selectedSampleData.headers" />

    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue'
import { Table, AssetType } from '../connections'
import { Results } from '../editors/results'
import { inject } from 'vue'
import DataTable from './DataTable.vue'
import type { ConnectionStoreType } from '../stores/connectionStore'

export default defineComponent({
  name: 'TableViewer',
  components: {
    DataTable,
  },
  props: {
    table: {
      type: Object as () => Table,
      required: true,
    },
    database: {
      type: String,
      required: true,
    },
    connectionName: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const activeTab = ref('structure')
    const searchTerm = ref('')
    const sampleData = ref<Record<string, Results>>({})
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    // Inject the connection store
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    const filteredColumns = computed(() => {
      if (!searchTerm.value) return props.table.columns

      const term = searchTerm.value.toLowerCase()
      return props.table.columns.filter(
        (column) =>
          column.name.toLowerCase().includes(term) || column.type.toLowerCase().includes(term),
      )
    })

    const loadSampleData = async () => {
      activeTab.value = 'data'
      if (sampleData.value[props.table.name]?.data?.length > 0) return

      isLoading.value = true
      error.value = null

      try {
        // This assumes your connection store has a method to execute queries
        // Adjust according to your actual implementation
        if (!connectionStore) {
          throw new Error('Connection store not found')
        }

        const result = await connectionStore.connections[props.connectionName].getTableSample(
          props.database,
          props.table.name,
          50,
        )

        sampleData.value[props.table.name] = result || new Results(new Map(), [])
      } catch (err) {
        console.error('Error loading sample data:', err)
        error.value = err instanceof Error ? err.message : 'Failed to load sample data'
      } finally {
        isLoading.value = false
      }
    }

    const selectedSampleData = computed(() =>
      sampleData.value[props.table.name] ? sampleData.value[props.table.name] : new Results(new Map(), []),
    )

    const getCellClass = (value: any, type: string) => {
      if (value === null) return 'null-value'

      switch (type) {
        case 'number':
        case 'integer':
        case 'float':
        case 'decimal':
          return 'number-value'
        case 'boolean':
          return 'boolean-value'
        case 'date':
        case 'datetime':
        case 'timestamp':
          return 'date-value'
        default:
          return 'text-value'
      }
    }

    const formatCellValue = (value: any, type: string) => {
      if (value === null) return 'NULL'

      switch (type) {
        case 'date':
        case 'datetime':
        case 'timestamp':
          return new Date(value).toLocaleString()
        case 'boolean':
          return value ? 'true' : 'false'
        default:
          return String(value)
      }
    }

    return {
      activeTab,
      searchTerm,
      filteredColumns,
      selectedSampleData,
      sampleData,
      isLoading,
      error,
      loadSampleData,
      getCellClass,
      formatCellValue,
      AssetType,
    }
  },
})
</script>

<style scoped>
.table-viewer {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
    'Helvetica Neue', sans-serif;
  color: #2c3e50;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  max-width: 100%;
  margin-bottom: 2rem;
}

.table-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--query-window-bg);
}

.table-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.table-title h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a202c;
}

.table-type-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.table-badge {
  background-color: #e3f2fd;
  color: #1976d2;
}

.view-badge {
  background-color: #e8f5e9;
  color: #388e3c;
}

.table-description {
  margin: 0.5rem 0 0;
  color: #64748b;
  font-size: 0.875rem;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--query-window-bg);
}

.tab-button {
  padding: 0.75rem 1.5rem;
  border: none;
  background: transparent;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  font-size: 0.875rem;
}

.tab-button:hover {
  color: #2563eb;
}

.tab-button.active {
  color: #2563eb;
}

.tab-button.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #2563eb;
}

.structure-header,
.data-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.search-container {
  position: relative;
  width: 300px;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.column-count,
.row-count {
  font-size: 0.875rem;
  color: #64748b;
}

.structure-table-container,
.data-table-container {
  overflow-x: auto;
  padding: 0 1.5rem 1.5rem;
}

.structure-table,
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  white-space: nowrap;
}

.structure-table th,
.data-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background: var(--query-window-bg);
  color: #475569;
  font-weight: 600;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
}

.structure-table td,
.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  color: #1e293b;
}

.structure-table tr:hover,
.data-table tr:hover {
  background-color: var(--query-window-bg);
}

.column-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.key-icon {
  font-size: 0.9rem;
}

.key-icon.small {
  font-size: 0.75rem;
}

.constraint-badges {
  display: flex;
  gap: 0.25rem;
}

.constraint-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  text-transform: uppercase;
}

.constraint-badge.primary {
  background-color: var(--query-window-bg);
  color: #1976d2;
}

.constraint-badge.unique {
  background-color: var(--query-window-bg);
  color: #388e3c;
}

.constraint-badge.not-null {
  background-color: #ede7f6;
  color: #5e35b1;
}

.constraint-badge.auto-inc {
  background-color: #fff3e0;
  color: #f57c00;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--query-window-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-button:hover {
  background: var(--query-window-bg);
}

.refresh-icon {
  font-size: 1rem;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #64748b;
  font-size: 0.875rem;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--border);
  border-top: 3px solid #2563eb;
  border-radius: 50%;
  margin-bottom: 1rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.error-message,
.empty-state {
  display: flex;
  justify-content: center;
  padding: 3rem;
  color: #64748b;
  font-size: 0.875rem;
}

.error-message {
  color: #ef4444;
}

.cell-content {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.null-value {
  color: #94a3b8;
  font-style: italic;
}

.number-value {
  color: #0284c7;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.boolean-value {
  color: #8b5cf6;
  font-weight: 500;
}

.date-value {
  color: #059669;
}
</style>
