<template>
  <div class="table-viewer">
    <div class="table-header">
      <div class="table-title">
        <h2>
          <span class="text-faint" v-if="table.database">{{ table.database }}.</span
          ><span class="text-faint" v-if="table.schema">{{ table.schema }}.</span>{{ table.name }}
        </h2>
        <span
          class="table-type-badge"
          :class="[table.assetType === AssetType.TABLE ? 'table-badge' : 'view-badge']"
        >
          {{ table.assetType === AssetType.TABLE ? 'Table' : 'View' }}
        </span>
        <div class="data-toolbar">
          <button class="refresh-button" @click="loadSampleData">
            <span class="refresh-icon">⟳</span> Refresh
          </button>
          <CreateEditorFromDatasourcePopup
            v-if="connectionInfo"
            :connection="connectionInfo"
            :table="table"
            mode="button"
          />
        </div>
      </div>
      <p v-if="table.description" class="table-description">{{ table.description }}</p>
    </div>

    <div class="tabs" ref="tabsRef">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'structure' }"
        @click="activeTab = 'structure'"
      >
        Structure
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'data' }"
        @click="activeTab = 'data'"
      >
        Sample Data
      </button>
    </div>

    <div class="tab-content">
      <div v-if="activeTab === 'structure'" class="table-structure">
        <div class="structure-header">
          <div class="search-container">
            <input
              type="text"
              v-model="searchTerm"
              placeholder="Search columns..."
              class="search-input"
            />
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
        <div v-if="isLoading" class="loading-spinner">
          <div class="spinner"></div>
          <span>Loading sample data...</span>
        </div>

        <div v-else-if="error" class="error-message">
          <span>⚠️ {{ error }}</span>
        </div>

        <div v-else-if="currentSampleData?.data.length === 0" class="empty-state">
          <p>No data available</p>
        </div>

        <div v-else class="result-container-wrapper" ref="resultContainerRef">
          <div class="result-container">
            <DataTable
              :results="currentSampleData.data"
              :headers="currentSampleData.headers"
              :containerHeight="containerHeight"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { Table, AssetType } from '../../connections'
import { Results } from '../../editors/results'
import { inject } from 'vue'
import DataTable from '../DataTable.vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import CreateEditorFromDatasourcePopup from '../sidebar/CreateEditorFromDatasourcePopup.vue'

export default defineComponent({
  name: 'TableViewer',
  components: {
    DataTable,
    CreateEditorFromDatasourcePopup,
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

    // Refs for measuring container height
    const resultContainerRef = ref<HTMLElement | null>(null)
    const tabsRef = ref<HTMLElement | null>(null)
    const containerHeight = ref(500) // Default height

    // Inject the connection store
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    // Generate a unique key for caching sample data
    const getTableKey = (table: Table) => {
      return `${table.database || ''}.${table.schema || ''}.${table.name}`
    }

    // Computed property for filtered columns
    const filteredColumns = computed(() => {
      if (!searchTerm.value) return props.table.columns

      const term = searchTerm.value.toLowerCase()
      return props.table.columns.filter(
        (column) =>
          column.name.toLowerCase().includes(term) || column.type.toLowerCase().includes(term),
      )
    })

    // Computed property for current table's sample data
    const currentSampleData = computed(() => {
      const tableKey = getTableKey(props.table)
      return sampleData.value[tableKey] || new Results(new Map(), [])
    })

    // Check if sample data needs to be loaded
    const needsSampleData = computed(() => {
      const tableKey = getTableKey(props.table)
      const hasData = sampleData.value[tableKey]?.data?.length > 0
      const hasColumns = props.table.columns.length > 0
      return !hasData || !hasColumns
    })

    // Function to calculate available height based on viewport and existing elements
    const calculateAvailableHeight = () => {
      if (!resultContainerRef.value) return

      const viewportHeight = window.innerHeight
      const containerTop = resultContainerRef.value.getBoundingClientRect().top

      // Reserve space for potential scrollbars, padding, and bottom margin
      const bottomBuffer = 40
      const availableHeight = Math.max(300, viewportHeight - containerTop - bottomBuffer)

      // Only update if the change is significant to avoid unnecessary re-renders
      if (Math.abs(availableHeight - containerHeight.value) > 10) {
        containerHeight.value = availableHeight
        console.log('Updated container height to', containerHeight.value)
      }
    }

    // Throttled resize handler to improve performance
    let resizeTimeout: number | null = null
    const handleWindowResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = window.setTimeout(() => {
        if (activeTab.value === 'data') {
          calculateAvailableHeight()
        }
      }, 150) // 150ms throttle
    }

    // Setup window resize listener
    const setupWindowListener = () => {
      window.addEventListener('resize', handleWindowResize)
    }

    // Clean up window resize listener
    const cleanupWindowListener = () => {
      window.removeEventListener('resize', handleWindowResize)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
        resizeTimeout = null
      }
    }

    // Load sample data for the current table
    const loadSampleData = async (forceRefresh = false) => {
      const tableKey = getTableKey(props.table)

      // Skip if data already exists and we're not forcing a refresh
      if (
        !forceRefresh &&
        sampleData.value[tableKey]?.data?.length > 0 &&
        props.table.columns.length > 0
      ) {
        console.log('Sample data already loaded for', tableKey)
        return
      }

      isLoading.value = true
      error.value = null

      try {
        if (!connectionStore) {
          throw new Error('Connection store not found')
        }

        // Refresh columns to ensure we have the latest structure
        await connectionStore.connections[props.connectionName].refreshColumns(
          props.table.database,
          props.table.schema,
          props.table.name,
        )

        // Get sample data
        const result = await connectionStore.connections[props.connectionName].getTableSample(
          props.table.database,
          props.table.schema,
          props.table.name,
          50,
        )

        sampleData.value[tableKey] = result || new Results(new Map(), [])
      } catch (err) {
        console.error('Error loading sample data for', tableKey, ':', err)
        error.value = err instanceof Error ? err.message : 'Failed to load sample data'
      } finally {
        isLoading.value = false
      }
    }

    // Watch for table changes and load data if needed
    watch(
      () => props.table,
      async (newTable, oldTable) => {
        const newTableKey = getTableKey(newTable)
        const oldTableKey = oldTable ? getTableKey(oldTable) : null

        // Only load if we're switching to a different table
        if (newTableKey !== oldTableKey) {
          console.log('Table changed from', oldTableKey, 'to', newTableKey)

          // Reset search when switching tables
          searchTerm.value = ''

          // Load sample data if needed
          if (needsSampleData.value) {
            await loadSampleData()
          }

          // Recalculate height for data tab
          if (activeTab.value === 'data') {
            await nextTick()
            calculateAvailableHeight()
          }
        }
      },
      { immediate: false },
    )

    // Watch for tab changes to recalculate height
    watch(activeTab, async (newTab) => {
      if (newTab === 'data') {
        await nextTick()
        calculateAvailableHeight()
      }
    })

    // Initial setup
    onMounted(async () => {
      // Setup window resize listener
      setupWindowListener()

      // Load sample data if needed on initial mount
      if (needsSampleData.value) {
        await loadSampleData()
      }

      // Calculate initial height if we're on the data tab
      if (activeTab.value === 'data') {
        await nextTick()
        calculateAvailableHeight()
      }
    })

    // Cleanup
    onUnmounted(() => {
      cleanupWindowListener()
    })

    const connectionInfo = computed(() => {
      if (!connectionStore) return null
      return connectionStore.connections[props.connectionName]
    })
    return {
      activeTab,
      searchTerm,
      filteredColumns,
      currentSampleData,
      isLoading,
      error,
      loadSampleData: () => loadSampleData(true), // Force refresh when called manually
      AssetType,
      resultContainerRef,
      tabsRef,
      containerHeight,
      connectionInfo,
    }
  },
})
</script>

<style scoped>
.result-container-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  overflow-y: scroll;
}

.result-container {
  max-width: 98%;
  width: 100%;
  height: 100%;
  border: 1px solid var(--border);
}

.table-data {
  height: 100%;
}

.table-viewer {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
    'Helvetica Neue', sans-serif;
  color: #2c3e50;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  max-width: 100%;
  height: 100%;
}

.table-header {
  padding: 0rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--query-window-bg);
}

.table-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.table-title h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-color);
  word-break: break-word;
  flex: 1;
  min-width: 0;
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
  padding: 5px;
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

.column-count {
  font-size: 0.875rem;
  color: #64748b;
}

.structure-table-container {
  overflow-x: auto;
  padding: 0 1.5rem 1.5rem;
}

.structure-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  white-space: nowrap;
}

.structure-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background: var(--query-window-bg);
  color: var(--text-faint);
  font-weight: 600;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
}

.structure-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-color);
}

.structure-table tr:hover {
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
</style>
