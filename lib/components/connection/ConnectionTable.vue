<template>
  <div class="table-viewer">
    <div class="table-header">
      <div class="table-title-row">
        <div class="table-title-block">
          <h2 class="table-title">
            <span class="text-faint" v-if="table.database">{{ table.database }}.</span
            ><span class="text-faint" v-if="table.schema && table.schema !== table.database"
              >{{ table.schema }}.</span
            >{{ table.name }}
          </h2>
          <span
            class="table-type-badge"
            :class="[table.assetType === AssetType.TABLE ? 'table-badge' : 'view-badge']"
          >
            {{ table.assetType === AssetType.TABLE ? 'Table' : 'View' }}
          </span>
        </div>
        <div class="data-toolbar">
          <button class="refresh-button" @click="loadSampleData">
            <i class="mdi mdi-refresh"></i>
            Refresh
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
                    <i
                      v-if="column.primary"
                      class="mdi mdi-key-variant key-icon"
                      title="Primary Key"
                    ></i>
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
          <span><i class="mdi mdi-alert-circle-outline"></i> {{ error }}</span>
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

    const resultContainerRef = ref<HTMLElement | null>(null)
    const tabsRef = ref<HTMLElement | null>(null)
    const containerHeight = ref(500)

    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    const getTableKey = (table: Table) => {
      return `${table.database || ''}.${table.schema || ''}.${table.name}`
    }

    const filteredColumns = computed(() => {
      if (!searchTerm.value) return props.table.columns

      const term = searchTerm.value.toLowerCase()
      return props.table.columns.filter(
        (column) =>
          column.name.toLowerCase().includes(term) || column.type.toLowerCase().includes(term),
      )
    })

    const currentSampleData = computed(() => {
      const tableKey = getTableKey(props.table)
      return sampleData.value[tableKey] || new Results(new Map(), [])
    })

    const needsSampleData = computed(() => {
      const tableKey = getTableKey(props.table)
      const hasData = sampleData.value[tableKey]?.data?.length > 0
      const hasColumns = props.table.columns.length > 0
      return !hasData || !hasColumns
    })

    const calculateAvailableHeight = () => {
      if (!resultContainerRef.value) return

      const viewportHeight = window.innerHeight
      const containerTop = resultContainerRef.value.getBoundingClientRect().top
      const bottomBuffer = 36
      const availableHeight = Math.max(280, viewportHeight - containerTop - bottomBuffer)

      if (Math.abs(availableHeight - containerHeight.value) > 10) {
        containerHeight.value = availableHeight
      }
    }

    let resizeTimeout: number | null = null
    const handleWindowResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = window.setTimeout(() => {
        if (activeTab.value === 'data') {
          calculateAvailableHeight()
        }
      }, 150)
    }

    const setupWindowListener = () => {
      window.addEventListener('resize', handleWindowResize)
    }

    const cleanupWindowListener = () => {
      window.removeEventListener('resize', handleWindowResize)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
        resizeTimeout = null
      }
    }

    const loadSampleData = async (forceRefresh = false) => {
      const tableKey = getTableKey(props.table)

      if (
        !forceRefresh &&
        sampleData.value[tableKey]?.data?.length > 0 &&
        props.table.columns.length > 0
      ) {
        return
      }

      isLoading.value = true
      error.value = null

      try {
        if (!connectionStore) {
          throw new Error('Connection store not found')
        }

        const conn = connectionStore.connectionByName(props.connectionName)
        if (!conn) throw new Error(`Connection "${props.connectionName}" not found`)

        await conn.refreshColumns(props.table.database, props.table.schema, props.table.name)

        const result = await conn.getTableSample(
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

    watch(
      () => props.table,
      async (newTable, oldTable) => {
        const newTableKey = getTableKey(newTable)
        const oldTableKey = oldTable ? getTableKey(oldTable) : null

        if (newTableKey !== oldTableKey) {
          searchTerm.value = ''

          if (needsSampleData.value) {
            await loadSampleData()
          }

          if (activeTab.value === 'data') {
            await nextTick()
            calculateAvailableHeight()
          }
        }
      },
      { immediate: false },
    )

    watch(activeTab, async (newTab) => {
      if (newTab === 'data') {
        await nextTick()
        calculateAvailableHeight()
      }
    })

    onMounted(async () => {
      setupWindowListener()

      if (needsSampleData.value) {
        await loadSampleData()
      }

      if (activeTab.value === 'data') {
        await nextTick()
        calculateAvailableHeight()
      }
    })

    onUnmounted(() => {
      cleanupWindowListener()
    })

    const connectionInfo = computed(() => {
      if (!connectionStore) return null
      return connectionStore.connectionByName(props.connectionName)
    })

    return {
      activeTab,
      searchTerm,
      filteredColumns,
      currentSampleData,
      isLoading,
      error,
      loadSampleData: () => loadSampleData(true),
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
.table-viewer {
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--query-window-bg);
  color: var(--text-color);
}

.table-header {
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--query-window-bg);
}

.table-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.table-title-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
}

.table-title {
  margin: 0;
  font-size: var(--page-title-font-size);
  font-weight: 600;
  color: var(--text-color);
  word-break: break-word;
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.15;
}

.table-type-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}

.table-badge {
  background-color: rgba(var(--special-text-rgb), 0.08);
  color: var(--special-text);
  border-color: rgba(var(--special-text-rgb), 0.14);
}

.view-badge {
  background-color: rgba(16, 185, 129, 0.08);
  color: #0f9f6e;
  border-color: rgba(16, 185, 129, 0.14);
}

.data-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.table-description {
  margin: 8px 0 0;
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1.5;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  background: var(--query-window-bg);
  min-height: 34px;
  padding: 0 16px;
}

.tab-button {
  padding: 0 14px;
  height: 100%;
  border: none;
  background: transparent;
  font-weight: 500;
  color: var(--text-faint);
  cursor: pointer;
  transition: all 0.16s ease;
  font-size: 13px;
  line-height: 1;
  border-bottom: 2px solid transparent;
  border-radius: 0;
}

.tab-button:hover {
  color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.03);
}

.tab-button.active {
  color: var(--special-text);
  border-bottom: 2px solid var(--special-text);
}

.tab-content {
  flex: 1;
  min-height: 0;
}

.table-structure,
.table-data {
  height: 100%;
}

.structure-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 6px 16px 8px;
}

.search-container {
  position: relative;
  width: min(100%, 330px);
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--button-border);
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--button-bg-color);
  color: var(--text-color);
  box-sizing: border-box;
}

.search-input:focus {
  border-color: rgba(var(--special-text-rgb), 0.45);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb), 0.1);
}

.column-count {
  font-size: 12px;
  color: var(--text-faint);
  white-space: nowrap;
}

.structure-table-container {
  overflow-x: auto;
  padding: 0 16px 16px;
}

.structure-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  white-space: nowrap;
}

.structure-table th {
  text-align: left;
  padding: 8px 16px;
  background: var(--query-window-bg);
  color: var(--text-faint);
  font-weight: 600;
  border-top: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  position: sticky;
  top: 0;
}

.structure-table td {
  padding: 11px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  color: var(--text-color);
}

.structure-table tr:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.025);
}

.column-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.key-icon {
  font-size: 12px;
  color: #c57c0a;
}

.constraint-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.constraint-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 999px;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.constraint-badge.primary {
  background-color: rgba(var(--special-text-rgb), 0.08);
  color: var(--special-text);
  border-color: rgba(var(--special-text-rgb), 0.14);
}

.constraint-badge.unique {
  background-color: rgba(16, 185, 129, 0.08);
  color: #0f9f6e;
  border-color: rgba(16, 185, 129, 0.14);
}

.constraint-badge.not-null {
  background-color: rgba(100, 116, 139, 0.08);
  color: #475569;
  border-color: rgba(100, 116, 139, 0.14);
}

.constraint-badge.auto-inc {
  background-color: rgba(245, 158, 11, 0.08);
  color: #c57c0a;
  border-color: rgba(245, 158, 11, 0.14);
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--button-border);
  border-radius: 10px;
  font-size: 12px;
  color: var(--text-faint);
  cursor: pointer;
  transition: all 0.16s ease;
}

.refresh-button:hover {
  background: var(--button-mouseover);
  color: var(--text-color);
}

.refresh-button i {
  font-size: 14px;
}

.result-container-wrapper {
  width: 100%;
  display: flex;
  height: 100%;
  overflow: auto;
  padding: 0 16px 16px;
  box-sizing: border-box;
}

.result-container {
  width: 100%;
  height: 100%;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  color: var(--text-faint);
  font-size: 13px;
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
  padding: 40px 24px;
  color: var(--text-faint);
  font-size: 13px;
}

.error-message {
  color: #ef4444;
}

.error-message i {
  margin-right: 6px;
}
</style>
