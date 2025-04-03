<!-- DashboardHeader.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useConnectionStore } from '../stores'
import { useModelConfigStore } from '../stores'
import { useFilterDebounce } from '../utility/debounce'
import DashboardImportSelector from './DashboardImportSelector.vue'
import { type Import } from '../stores/resolver'
const props = defineProps({
  dashboard: Object,
  editMode: Boolean,
  selectedConnection: {
    type: String,
    required: true,
  },
})

const emit = defineEmits([
  'connection-change',
  'filter-change',
  'import-change',
  'add-item',
  'clear-items',
  'toggle-edit-mode',
  'refresh', // Added refresh emit
])

const connectionStore = useConnectionStore()
const modelStore = useModelConfigStore()

// Use the extracted filter debounce composable
const { filterInput, onFilterInput } = useFilterDebounce(
  props.dashboard?.filter || '',
  (value: string) => emit('filter-change', value),
)

const modelName = connectionStore.connections[props.selectedConnection].model
let availableImports: Import[] = []

if (modelName) {
  availableImports = modelStore.models[modelName].sources.map((source) => ({
    name: source.alias,
    alias: source.alias,
  }))
}

// Get active imports from dashboard
const activeImports = computed(() => props.dashboard?.imports || [])

// Handle imports change
function handleImportsChange(newImports: Import[]) {
  emit('import-change', newImports)
}

// Handle refresh click
function handleRefresh() {
  emit('refresh')
}
</script>

<template>
  <div class="dashboard-controls">
    <div class="dashboard-left-controls">
      <div class="connection-selector">
        <label for="connection">Connection</label>
        <select
          id="connection"
          @change="$emit('connection-change', $event)"
          :value="selectedConnection"
        >
          <option
            v-for="conn in Object.values(connectionStore.connections).filter((conn) => conn.model)"
            :key="conn.name"
            :value="conn.name"
          >
            {{ conn.name }}
          </option>
        </select>
      </div>

      <DashboardImportSelector
        :available-imports="availableImports"
        :active-imports="activeImports"
        @update:imports="handleImportsChange"
      />

      <div class="filter-container">
        <label for="filter">Where</label>
        <input
          id="filter"
          type="text"
          v-model="filterInput"
          @input="onFilterInput"
          placeholder="Enter filter criteria..."
        />
      </div>


    </div>

    <div class="grid-actions">
      <button @click="$emit('add-item')" class="add-button" v-if="editMode">Add Item</button>
      <button @click="$emit('clear-items')" class="clear-button" v-if="editMode">Clear All</button>
      <button @click="$emit('toggle-edit-mode')" class="toggle-mode-button">
        {{ editMode ? 'View Mode' : 'Edit Mode' }}
      </button>
      <button @click="handleRefresh" class="refresh-button" title="Refresh data">
        <span class="refresh-icon">⟳</span>
        Refresh
      </button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-controls {
  display: flex;
  justify-content: space-between;
  padding: 15px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
}

.dashboard-left-controls {
  display: flex;
  gap: 20px;
  align-items: center;
  flex: 1;
}

.connection-selector {
  display: flex;
  align-items: center;
}

.connection-selector label {
  margin-right: 10px;
  font-weight: bold;
  color: var(--text-color);
}

.connection-selector select {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  min-width: 200px;
  font-size: var(--font-size);
}

.filter-container {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 500px;
}

.filter-container label {
  margin-right: 10px;
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
}

.filter-container input {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  width: 100%;
  font-size: var(--font-size);
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border-light);
  background-color: var(--special-text);
  color: var(--text-color);
  cursor: pointer;
  font-weight: 500;
  font-size: var(--button-font-size);
  color: white !important;
}

.refresh-icon {
  font-size: 16px;
  font-weight: bold;
}

.refresh-button:hover {
  background-color: var(--button-hover-bg, #e0e0e0);
}

.grid-actions {
  display: flex;
  gap: 10px;
}

.grid-actions button {
  padding: 8px 16px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  font-weight: 500;
  color: var(--text-color);
  font-size: var(--button-font-size);
}

.add-button {
  background-color: var(--special-text) !important;
  color: white !important;
}

.clear-button {
  background-color: var(--delete-color) !important;
  color: white !important;
}

.toggle-mode-button {
  background-color: var(--button-bg) !important;
  color: var(--text-color) !important;
}
</style>
