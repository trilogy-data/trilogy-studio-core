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
}

.schema-display-body {
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.breadcrumb {
  display: flex;
  align-items: center;
  font-size: 1rem;
  font-weight: 500;
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
  gap: 1.5rem;
}

.metadata-card {
  background-color: var(--surface-card);
  border-radius: var(--border-radius);
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.metadata-card h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
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
  background-color: var(--surface-card);
  border-radius: var(--border-radius);
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tables-container h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
}

.search-bar {
  margin-bottom: 1rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-size: 0.875rem;
  background-color: var(--input-bg);
  color: var(--text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.table-card {
  background-color: var(--surface-hover);
  border-radius: var(--border-radius);
  padding: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.table-card:hover {
  background-color: var(--surface-active);
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
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 999px;
  text-transform: uppercase;
  font-weight: 500;
}

.table-type-badge.table {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.table-type-badge.view {
  background-color: rgba(var(--secondary-color-rgb), 0.1);
  color: var(--secondary-color);
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
