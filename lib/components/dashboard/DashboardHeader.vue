<script setup lang="ts">
import { computed, type Ref, ref } from 'vue'
import { useConnectionStore, useEditorStore } from '../../stores'
import DashboardImportSelector from './DashboardImportSelector.vue'
import DashboardSharePopup from './DashboardSharePopup.vue'
import FilterInputComponent from './DashboardHeaderFilterInput.vue'
import { type CompletionItem } from '../../stores/resolver'
import { type DashboardImport } from '../../dashboards/base'
import { type Dashboard } from '../../dashboards/base'

const props = defineProps({
  dashboard: {
    type: Object as () => Dashboard,
    required: true,
  },
  editMode: Boolean,
  editsLocked: Boolean,
  selectedConnection: {
    type: String,
    required: true,
  },
  filterError: String,
  globalCompletion: {
    type: Array as () => CompletionItem[],
    default: () => [],
  },
  validateFilter: {
    type: Function,
    default: () => true,
  },
})

const emit = defineEmits([
  'connection-change',
  'filter-change',
  'import-change',
  'add-item',
  'clear-items',
  'clear-filter',
  'toggle-edit-mode',
  'refresh',
])

const connectionStore = useConnectionStore()
const editorStore = useEditorStore()

const isLoading = ref(false)
const isSharePopupOpen = ref(false)

// Toggle share popup visibility
function toggleSharePopup() {
  isSharePopupOpen.value = !isSharePopupOpen.value
}

// Close share popup
function closeSharePopup() {
  isSharePopupOpen.value = false
}

// Handle filter apply from FilterInputComponent
function handleFilterApply(newValue: string) {
  emit('filter-change', newValue)
}

const availableImports: Ref<DashboardImport[]> = computed(() => {
  const imports = Object.values(editorStore.editors)
    .filter((editor) => editor.connection === props.selectedConnection)
    .sort((a, b) => a.name.localeCompare(b.name))

  return imports.map((importItem) => ({
    id: importItem.id,
    name: importItem.name,
    alias: '',
  }))
})

// Get active imports from dashboard
const activeImports = computed(() => props.dashboard?.imports || [])

// Handle imports change
function handleImportsChange(newImports: DashboardImport[]) {
  emit('import-change', newImports)
}

// Handle refresh click
function handleRefresh() {
  emit('refresh')
}
</script>

<template>
  <div class="dashboard-controls" data-testid="dashboard-controls">
    <!-- Filter row - now showing the extracted FilterInputComponent -->
    <div class="controls-row filter-row">
      <FilterInputComponent
        :filter-value="dashboard?.filter || ''"
        :filter-error="filterError"
        :is-loading="isLoading"
        :global-completion="globalCompletion"
        :validate-filter="validateFilter"
        @filter-apply="handleFilterApply"
        @clear-filter="$emit('clear-filter', '')"
      />

      <div class="grid-actions">
        <button
          @click="toggleSharePopup"
          class="btn btn-secondary"
          data-testid="share-dashboard-button"
        >
          Export
        </button>
        <button
          @click="$emit('toggle-edit-mode')"
          class="btn btn-secondary"
          data-testid="toggle-edit-mode-button"
          :disabled="editsLocked"
        >
          {{ editMode ? 'View Mode' : 'Edit' }}
        </button>
        <button @click="handleRefresh" class="btn btn-primary" data-testid="refresh-button">
          ⟳ Refresh
        </button>
      </div>
    </div>

    <div class="controls-row top-row" v-if="editMode">
      <div class="dashboard-left-controls">
        <div class="connection-selector">
          <div class="select-wrapper">
            <i class="mdi mdi-database-outline select-icon"></i>
            <select
              id="connection"
              data-testid="connection-selector"
              @change="$emit('connection-change', $event)"
              :value="selectedConnection"
            >
              <option
                v-for="conn in Object.values(connectionStore.connections).filter(
                  (conn) => conn.model,
                )"
                :key="conn.name"
                :value="conn.name"
              >
                {{ conn.name }}
              </option>
            </select>
          </div>
        </div>
        <DashboardImportSelector
          :available-imports="availableImports"
          :active-imports="activeImports"
          @update:imports="handleImportsChange"
        />
      </div>

      <div class="grid-actions">
        <button
          @click="$emit('add-item')"
          class="btn btn-success"
          v-if="editMode"
          data-testid="add-item-button"
        >
          Add Item
        </button>
        <button
          @click="$emit('clear-items')"
          class="btn btn-danger"
          v-if="editMode"
          data-testid="clear-items-button"
        >
          Clear All
        </button>
      </div>
    </div>
    <DashboardSharePopup
      :dashboard="dashboard"
      :is-open="isSharePopupOpen"
      @close="closeSharePopup"
    />
  </div>
</template>

<style scoped>
.dashboard-controls {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
}

.controls-row {
  display: flex;
  padding: 5px 10px;
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
  color: var(--text-color);
  font-size: 20px;
  white-space: nowrap;
}

.select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.select-icon {
  position: absolute;
  left: 10px;
  color: var(--text-color);
  font-size: 18px;
  pointer-events: none;
  z-index: 1;
}

.select-wrapper select:focus {
  border-color: var(--special-text); /* Keep same border as unfocused */
  box-shadow: none;
}

.select-wrapper select {
  padding: 8px 12px 8px 36px;
  border: 1px solid var(--border);
  color: var(--sidebar-selector-font);
  font-size: var(--font-size);
  background-color: var(--bg-color);
  appearance: none;
  cursor: pointer;
  min-width: 150px;
  outline: none;
  border-radius: 0; /* Remove rounded corners */
  -webkit-appearance: none;
  -moz-appearance: none;
}

/* Add dropdown arrow */
.select-wrapper::after {
  content: '▼';
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: var(--text-color);
  pointer-events: none;
}

.filter-row {
  justify-content: space-between;
  align-items: center;
}

.grid-actions {
  display: flex;
  gap: 5px;
  padding-left: 10px;
}

/* Unified button styles */
.btn {
  width: 85px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: 5px;
  border: 1px solid var(--border-light);
  font-weight: 250;
  color: var(--text-color);
  font-size: var(--button-font-size);
  background-color: transparent;
  transition: all 0.2s ease;
  text-align: center;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn:disabled:hover {
  transform: none;
  box-shadow: none;
}

/* Button variants */
.btn-primary {
  border-color: var(--special-text);
  color: var(--special-text);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--special-text);
  color: white;
}

.btn-secondary {
  border-color: var(--border-light);
  color: var(--text-color);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--text-color);
  color: var(--bg-color);
  border-color: var(--text-color);
}

.btn-success {
  border-color: var(--special-text);
  color: var(--special-text);
}

.btn-success:hover:not(:disabled) {
  background-color: var(--special-text);
  color: white;
}

.btn-danger {
  border-color: var(--delete-color);
  color: var(--delete-color);
}

.btn-danger:hover:not(:disabled) {
  background-color: var(--delete-color);
  color: white;
}

/* Media queries for responsiveness */
@media (max-width: 900px) {
  .dashboard-left-controls {
    gap: 10px;
  }

  .select-wrapper select {
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
    border-top: 1px solid var(--border-light);
    padding-top: 10px;
    margin-top: 5px;
  }

  .dashboard-left-controls {
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 15px;
  }

  .connection-selector {
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    max-width: 300px;
    gap: 8px;
  }

  .connection-selector label {
    margin-right: 0;
    margin-bottom: 0;
  }

  .select-wrapper {
    width: 100%;
  }

  .select-wrapper select {
    width: 100%;
    text-align: center;
    padding-left: 36px;
  }

  .grid-actions {
    flex-wrap: nowrap;
    justify-content: center;
    width: 100%;
    gap: 8px;
  }

  .btn {
    padding: 3px 4px;
    font-size: calc(var(--button-font-size) - 1px);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
  }

  .mobile-hidden {
    display: none;
  }
}

@media (max-width: 768px) {
  .dashboard-left-controls {
    align-items: center;
  }

  .connection-selector {
    max-width: 100%;
  }

  .select-wrapper select {
    min-width: unset;
  }

  .grid-actions {
    gap: 4px;
    max-width: 100%;
    padding-left: 0px;
  }

  .btn {
    min-width: 0;
    font-size: calc(var(--button-font-size) - 2px);
    padding: 6px 4px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* Extra small screen size handling */
@media (max-width: 360px) {
  .connection-selector {
    max-width: 100%;
  }

  .btn {
    font-size: calc(var(--button-font-size) - 3px);
    padding: 5px 3px;
  }

  /* For the refresh button, just show the icon on very small screens */
  button[data-testid='refresh-button'] {
    padding: 5px;
    width: auto;
  }
}
</style>
