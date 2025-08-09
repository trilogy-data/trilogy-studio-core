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
  const imports = Object.values(editorStore.editors).filter(
    (editor) => editor.connection === props.selectedConnection,
  )

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
          class="share-button generic-button"
          data-testid="share-dashboard-button"
        >
          Export
        </button>
        <button
          @click="$emit('toggle-edit-mode')"
          class="toggle-mode-button generic-button"
          data-testid="toggle-edit-mode-button"
          :disabled="editsLocked"
        >
          {{ editMode ? 'View Mode' : 'Edit' }}
        </button>
        <button
          @click="handleRefresh"
          class="refresh-button generic-button"
          data-testid="refresh-button"
        >
          ⟳ Refresh
        </button>
      </div>
    </div>

    <div class="controls-row top-row" v-if="editMode">
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
        <DashboardImportSelector
          :available-imports="availableImports"
          :active-imports="activeImports"
          @update:imports="handleImportsChange"
        />
      </div>

      <div class="grid-actions">
        <button
          @click="$emit('add-item')"
          class="add-button generic-button"
          v-if="editMode"
          data-testid="add-item-button"
        >
          Add Item
        </button>
        <button
          @click="$emit('clear-items')"
          class="clear-button generic-button"
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
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
}

.connection-selector select {
  padding: 8px;
  border: 1px solid var(--border);
  color: var(--sidebar-selector-font);
  font-size: var(--font-size);
  background-color: var(--bg-color);
}

.filter-row {
  justify-content: space-between;
  align-items: center;
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

.refresh-button {
  border: 1px solid var(--special-text) !important;
  color: var(--special-text) !important;
  background-color: transparent !important;
}

.clear-button {
  background-color: var(--delete-color) !important;
  color: white !important;
}

.share-button {
  background-color: transparent !important;
}

.toggle-mode-button {
  background-color: transparent !important;
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
    justify-content: space-between;
    width: 100%;
  }

  .grid-actions button {
    padding: 3px 4px;
    font-size: calc(var(--button-font-size) - 1px);
    text-align: center;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
  }

  .mobile-hidden {
    display: none;
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

  .grid-actions {
    gap: 4px;
  }

  .grid-actions button {
    min-width: 0;
    font-size: calc(var(--button-font-size) - 2px);
    padding: 6px 4px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* Extra small screen size handling */
@media (max-width: 360px) {
  .grid-actions button {
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
