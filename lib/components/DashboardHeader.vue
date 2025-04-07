<!-- DashboardHeader.vue -->
<script setup lang="ts">
import { computed, type Ref } from 'vue'
import { useConnectionStore } from '../stores'
import { useModelConfigStore } from '../stores'
import { useFilterDebounce } from '../utility/debounce'
import DashboardImportSelector from './DashboardImportSelector.vue'
import Tooltip from './Tooltip.vue' // Import the Tooltip component
import { type Import } from '../stores/resolver'

const props = defineProps({
  dashboard: Object,
  editMode: Boolean,
  selectedConnection: {
    type: String,
    required: true,
  },
  filterError: String,
})

const emit = defineEmits([
  'connection-change',
  'filter-change',
  'import-change',
  'add-item',
  'clear-items',
  'toggle-edit-mode',
  'refresh',
])

const connectionStore = useConnectionStore()
const modelStore = useModelConfigStore()

// Use the extracted filter debounce composable
const { filterInput, onFilterInput } = useFilterDebounce(
  props.dashboard?.filter || '',
  (value: string) => emit('filter-change', value),
)

// Compute filter validation status
const filterStatus = computed(() => {
  if ((props.filterError || '').length>0) {
    return 'error'
  }
  return filterInput.value ? 'valid' : 'neutral'
})

const availableImports: Ref<Import[]> = computed(() => {
  const modelName = connectionStore.connections[props.selectedConnection].model
  if (!modelName) {
    return []
  }
  const imports = modelStore.models[modelName].sources || []
  return imports.map((importItem) => ({
    name: importItem.alias,
    alias: importItem.alias,
  }))
})

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
  <div class="dashboard-controls" data-testid="dashboard-controls">
    <div class="controls-row top-row">
      <div class="dashboard-left-controls">
        <div class="connection-selector">
          <label for="connection">Connection</label>
          <select
            id="connection"
            data-testid="connection-selector"
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
      </div>

      <div class="grid-actions">
        <button @click="$emit('add-item')" class="add-button" v-if="editMode" data-testid="add-item-button">Add Item</button>
        <button @click="$emit('clear-items')" class="clear-button" v-if="editMode" data-testid="clear-items-button">Clear All</button>
        <button @click="$emit('toggle-edit-mode')" class="toggle-mode-button" data-testid="toggle-edit-mode-button">
          {{ editMode ? 'View Mode' : 'Edit Mode' }}
        </button>
        <button @click="handleRefresh" class="refresh-button" title="Refresh data" data-testid="refresh-button">
          <span class="refresh-icon">⟳</span>
          <span class="refresh-text">Refresh</span>
        </button>
      </div>
    </div>

    <div class="controls-row filter-row">
      <div class="filter-container">
        <label for="filter">Where</label>
        <div class="filter-input-wrapper">
          <input
            id="filter"
            data-testid="filter-input"
            type="text"
            v-model="filterInput"
            @input="onFilterInput"
            placeholder="Enter filter criteria..."
            :class="{ 'filter-error': filterStatus === 'error' }"
          />
          <div class="filter-validation-icon" v-if="filterStatus !== 'neutral'">
            <div v-if="filterStatus === 'error'" class="filter-icon error" data-testid="filter-error-icon">
              <span class="icon-x">✕</span>
              <Tooltip :content="filterError || 'Unknown Error'" position="bottom">
                <span class="tooltip-trigger" data-testid="filter-error-tooltip-trigger"></span>
              </Tooltip>
            </div>
            <div v-else-if="filterStatus === 'valid'" class="filter-icon valid" data-testid="filter-valid-icon">
              <Tooltip content='This is a syntactically correct filter.' position="top">
                <span class="icon-check" data-testid="filter-valid-tooltip-trigger">✓</span>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-controls {
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
}

.controls-row {
  display: flex;
  padding: 12px 15px;
}

.top-row {
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
}

.filter-row {
  padding-top: 8px;
  padding-bottom: 12px;
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
  white-space: nowrap;
}

.connection-selector select {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  min-width: 150px;
  font-size: var(--font-size);
}

.filter-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.filter-container label {
  margin-right: 10px;
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
}

.filter-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.filter-container input {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  width: 100%;
  font-size: var(--font-size);
}

.filter-error {
  border-color: #ff3b30 !important;
}

.filter-validation-icon {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
}

.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.filter-icon.error {
  color: #ff3b30;
}

.filter-icon.valid {
  color: #4cd964;
}

.icon-x {
  font-weight: bold;
  font-size: 14px;
}

.icon-check {
  font-weight: bold;
  font-size: 14px;
}

.tooltip-trigger {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: help;
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

/* Media queries for responsiveness */
@media (max-width: 900px) {
  .dashboard-left-controls {
    gap: 10px;
  }
  
  .connection-selector select {
    min-width: 120px;
  }
}

@media (max-width: 768px) {
  .controls-row {
    flex-wrap: wrap;
  }
  
  .top-row {
    flex-direction: column;
    gap: 15px;
  }
  
  .dashboard-left-controls {
    flex-wrap: wrap;
    gap: 15px;
  }
  
  .grid-actions {
    flex-wrap: wrap;
    justify-content: space-between;
  }
  
  .grid-actions button {
    flex-grow: 1;
    padding: 8px 10px;
    min-width: calc(50% - 5px);
    font-size: calc(var(--button-font-size) - 1px);
    text-align: center;
  }
  
  .refresh-button {
    padding: 8px 12px;
  }
}

@media (max-width: 480px) {
  .connection-selector,
  .dashboard-left-controls > div {
    width: 100%;
  }
  
  .connection-selector {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .connection-selector select {
    width: 100%;
    min-width: unset;
  }
  
  .filter-container {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .filter-container label {
    margin-right: 0;
  }
  
  .grid-actions {
    gap: 8px;
  }
  
  .grid-actions button {
    min-width: calc(50% - 4px);
    font-size: calc(var(--button-font-size) - 2px);
    padding: 8px 8px;
  }
}
</style>