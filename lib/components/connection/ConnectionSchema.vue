<template>
  <div class="schema-display">
    <div class="schema-display-body">
      <div class="header">
        <div class="breadcrumb">
          <span>{{ connectionName }}</span>
          <span class="separator">/</span>
          <span class="db-name" @click="navigateToDatabase">{{ schema.database }}</span>
          <span class="separator">/</span>
          <span class="schema-name">{{ schema.name }}</span>
        </div>
        <!-- <button 
        class="refresh-button" 
        @click="refreshSchema" 
        :disabled="isRefreshing"
      >
        <span v-if="isRefreshing">Refreshing...</span>
        <span v-else>Refresh</span>
      </button> -->
      </div>

      <div class="schema-details">
        <div class="metadata-card">
          <h3>Schema Information</h3>
          <div class="metadata-content">
            <div class="metadata-item">
              <span class="metadata-label">Schema Name:</span>
              <span class="metadata-value">{{ schema.name }}</span>
            </div>
            <div class="metadata-item" v-if="schema.description">
              <span class="metadata-label">Description:</span>
              <span class="metadata-value">{{ schema.description }}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Tables:</span>
              <span class="metadata-value">{{ schema.tables.length }}</span>
            </div>
          </div>
        </div>

        <div class="tables-container">
          <h3>Tables</h3>
          <div class="search-bar">
            <input
              type="text"
              v-model="searchQuery"
              placeholder="Search tables..."
              class="search-input"
            />
          </div>

          <div class="tables-grid">
            <div
              v-for="table in filteredTables"
              :key="table.name"
              class="table-card"
              @click="selectTable(table.name)"
            >
              <div class="table-header">
                <span class="table-name">{{ table.name }}</span>
                <span class="table-type-badge" :class="table.assetType">
                  {{ table.assetType }}
                </span>
              </div>
              <div class="table-details">
                <span v-if="table.columns.length > 0" class="column-count"
                  >{{ table.columns.length }} columns</span
                >
                <span class="table-description" v-if="table.description">
                  {{ table.description }}
                </span>
              </div>
              <div class="table-columns" v-if="table.columns.length > 0">
                <div
                  v-for="(column, _) in getPreviewColumns(table)"
                  :key="`${table.name}-${column.name}`"
                  class="column-preview"
                >
                  <span class="column-name">{{ column.name }}</span>
                  <span class="column-type">{{ column.type }}</span>
                </div>
                <div v-if="table.columns.length > 3" class="more-columns">
                  +{{ table.columns.length - 3 }} more columns
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schema-display {
  width: 100%;
  height: 100%;
  background: var(--query-window-bg);
}

.schema-display-body {
  padding: 18px 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  font-size: var(--page-title-font-size);
  font-weight: 600;
  line-height: 1.15;
  flex-wrap: wrap;
}

.separator {
  margin: 0 0.5rem;
  color: var(--text-muted);
}

.db-name {
  color: var(--text-primary);
  cursor: pointer;
}

.db-name:hover {
  text-decoration: underline;
}

.schema-name {
  color: var(--text-primary);
  font-weight: 600;
}

.refresh-button {
  background-color: var(--button-bg);
  color: var(--button-text);
  border: none;
  border-radius: var(--border-radius);
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.refresh-button:hover:not(:disabled) {
  background-color: var(--button-hover-bg);
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.schema-details {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.metadata-card {
  background-color: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: none;
}

.metadata-card h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: var(--section-title-font-size);
  font-weight: 600;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 8px;
}

.metadata-content {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.metadata-item {
  display: flex;
  flex-direction: column;
}

.metadata-label {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.metadata-value {
  font-weight: 500;
}

.tables-container {
  background-color: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: none;
}

.tables-container h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: var(--section-title-font-size);
  font-weight: 600;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 8px;
}

.search-bar {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--button-border);
  border-radius: 10px;
  font-size: 13px;
  background-color: var(--button-bg-color);
  color: var(--text-color);
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: rgba(var(--special-text-rgb), 0.45);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb), 0.1);
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.table-card {
  background-color: transparent;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-card:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.025);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.18);
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-name {
  font-weight: 600;
  font-size: 0.9375rem;
}

.table-type-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: uppercase;
  font-weight: 600;
  border: 1px solid transparent;
}

.table-type-badge.table {
  background-color: rgba(var(--special-text-rgb), 0.08);
  color: var(--special-text);
  border-color: rgba(var(--special-text-rgb), 0.14);
}

.table-type-badge.view {
  background-color: rgba(16, 185, 129, 0.08);
  color: #0f9f6e;
  border-color: rgba(16, 185, 129, 0.14);
}

.table-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.table-columns {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-top: 1px solid var(--border-color);
  padding-top: 0.5rem;
}

.column-preview {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.column-name {
  font-weight: 500;
}

.column-type {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.more-columns {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: 0.25rem;
}
</style>

<script lang="ts">
import { defineComponent, type PropType, ref, computed } from 'vue'
import type { Schema, Table, Column } from '../../connections'

export default defineComponent({
  name: 'ConnectionSchemas',
  props: {
    schema: {
      type: Object as PropType<Schema>,
      required: true,
    },
    connectionName: {
      type: String,
      required: true,
    },
  },
  emits: ['table-selected', 'database-selected', 'refresh-schema'],
  setup(props, { emit }) {
    const isRefreshing = ref(false)
    const searchQuery = ref('')

    const filteredTables = computed(() => {
      if (!searchQuery.value) {
        return props.schema.tables
      }

      const query = searchQuery.value.toLowerCase()
      return props.schema.tables.filter(
        (table) =>
          table.name.toLowerCase().includes(query) ||
          (table.description && table.description.toLowerCase().includes(query)),
      )
    })

    const refreshSchema = async () => {
      isRefreshing.value = true
      try {
        emit('refresh-schema', props.schema.database, props.schema.name)
      } finally {
        isRefreshing.value = false
      }
    }

    const selectTable = (tableName: string) => {
      emit('table-selected', props.schema.database, props.schema.name, tableName)
    }

    const navigateToDatabase = () => {
      emit('database-selected', props.schema.database)
    }

    const getPreviewColumns = (table: Table): Column[] => {
      // Return first 3 columns for preview
      return table.columns.slice(0, 3)
    }

    return {
      isRefreshing,
      searchQuery,
      filteredTables,
      refreshSchema,
      selectTable,
      navigateToDatabase,
      getPreviewColumns,
    }
  },
})
</script>
