<!-- DashboardHeader.vue -->
<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import { useConnectionStore, useLLMConnectionStore, useModelConfigStore } from '../stores'
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
const llmStore = useLLMConnectionStore()


const filterLLM = () =>{
  let concepts = this.editorData.completionSymbols.map((item) => ({
                name: item.label,
                type: item.datatype,
                description: item.description,
              }))
  llmStore.generateQueryCompletion(text, concepts)]
}
// Use the extracted filter debounce composable
const { filterInput, onFilterInput } = useFilterDebounce(
  props.dashboard?.filter || '',
  (value: string) => emit('filter-change', value),
)

// Compute filter validation status
const filterStatus = computed(() => {
  if ((props.filterError || '').length > 0) {
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
    <!-- Filter row - now shown at the top on mobile -->
    <div class="controls-row filter-row">
      <div class="filter-container">
        <label for="filter">Where</label>
        <div class="filter-input-wrapper">
          <input id="filter" data-testid="filter-input" type="text" v-model="filterInput" @input="onFilterInput"
            placeholder="Enter filter criteria..." :class="{ 'filter-error': filterStatus === 'error' }" />
          <div class="filter-validation-icon" v-if="filterStatus !== 'neutral'">
            <div v-if="filterStatus === 'error'" class="filter-icon error" data-testid="filter-error-icon">
              <span class="icon-x">✕</span>
              <Tooltip :content="filterError || 'Unknown Error'" position="bottom">
                <span class="tooltip-trigger" data-testid="filter-error-tooltip-trigger"></span>
              </Tooltip>
            </div>
            <div v-else-if="filterStatus === 'valid'" class="filter-icon valid" data-testid="filter-valid-icon">
              <Tooltip content="This is a syntactically correct filter." position="top">
                <span class="icon-check" data-testid="filter-valid-tooltip-trigger">✓</span>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
      <div class="grid-actions">
        <button @click="$emit('toggle-edit-mode')" class="toggle-mode-button  generic-button" data-testid="toggle-edit-mode-button">
          {{ editMode ? 'View Mode' : 'Edit' }}
        </button>
        <button @click="handleRefresh" class="add-button  generic-button" data-testid="refresh-button">
          ⟳ Refresh
        </button>
      </div>
    </div>


    <div class="controls-row top-row" v-if="editMode" >
      <div class="dashboard-left-controls">
        <div class="connection-selector">
          <label for="connection">Connection</label>
          <select id="connection" data-testid="connection-selector" @change="$emit('connection-change', $event)"
            :value="selectedConnection">
            <option v-for="conn in Object.values(connectionStore.connections).filter(
              (conn) => conn.model,
            )" :key="conn.name" :value="conn.name">
              {{ conn.name }}
            </option>
          </select>
        </div>
        <DashboardImportSelector :available-imports="availableImports" :active-imports="activeImports"
          @update:imports="handleImportsChange" />
      </div>

      <div class="grid-actions">
        <button @click="$emit('add-item')" class="add-button  generic-button" v-if="editMode" data-testid="add-item-button">
          Add Item
        </button>
        <button @click="$emit('clear-items')" class="clear-button  generic-button" v-if="editMode" data-testid="clear-items-button">
          Clear All
        </button>

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
  padding: 5px 5px;
}

.top-row {
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
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

.grid-actions button {
  border: 1px solid var(--border-light);
  cursor: pointer;
  font-weight: 500;
  color: var(--text-color);
  font-size: var(--button-font-size);
}

.grid-actions {
  display: flex;
}



.generic-button {
  width: 85px;
  height: 32px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 5px;
  font-size: 12px;
  margin-top: 5px;
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


  /* Adjust the filter row to accommodate the toggle button */
  .filter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .filter-container {
    flex: 1;
  }

  /* Hide the top row by default on mobile, it will be toggled */
  .mobile-hidden {
    display: none;
  }

  .controls-row {
    flex-wrap: wrap;
  }

  .top-row {
    flex-direction: column;
    gap: 15px;
    border-top: 1px solid var(--border-light);
    padding-top: 10px;
    margin-top: 5px;
  }

  .dashboard-left-controls {
    flex-wrap: wrap;
    gap: 15px;
  }

  .grid-actions {
    flex-wrap: nowrap;
    /* Keep buttons in one row */
    justify-content: space-between;
    width: 100%;
  }

  .grid-actions button {
    padding: 3px 4px;
    /* Reduced padding */
    font-size: calc(var(--button-font-size) - 1px);
    text-align: center;
    flex: 1;
    /* Equal width buttons */
    min-width: 0;
    /* Remove min-width to allow buttons to shrink */
    white-space: nowrap;
    /* Prevent text wrapping */
  }
}

@media (max-width: 480px) {

  .connection-selector,
  .dashboard-left-controls>div {
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
    flex-direction: row;
    /* Keep horizontal for filter on mobile */
    align-items: center;
  }

  .filter-container label {
    margin-right: 8px;
    white-space: nowrap;
  }

  .grid-actions {
    gap: 4px;
    /* Reduced gap between buttons */
  }

  .grid-actions button {
    min-width: 0;
    /* Remove min-width completely */
    font-size: calc(var(--button-font-size) - 2px);
    padding: 6px 4px;
    /* Further reduced padding */
    overflow: hidden;
    text-overflow: ellipsis;
    /* Add ellipsis for text overflow */
  }
}

/* Extra small screen size handling */
@media (max-width: 360px) {
  .grid-actions button {
    font-size: calc(var(--button-font-size) - 3px);
    /* Even smaller font */
    padding: 5px 3px;
    /* Minimal padding */
  }

  /* For the refresh button, just show the icon on very small screens */
  button[data-testid='refresh-button'] {
    padding: 5px;
    width: auto;
  }
}
</style>
