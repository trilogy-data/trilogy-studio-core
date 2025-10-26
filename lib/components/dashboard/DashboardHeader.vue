<script setup lang="ts">
import { computed, type Ref, ref } from 'vue'
import { useConnectionStore, useEditorStore, useScreenNavigation } from '../../stores'
import DashboardImportSelector from './DashboardImportSelector.vue'
import DashboardSharePopup from './DashboardSharePopup.vue'
import FilterInputComponent from './DashboardHeaderFilterInput.vue'
import LoadingButton from '../LoadingButton.vue'
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
  'title-update',
  'export-image',
])

const connectionStore = useConnectionStore()
const editorStore = useEditorStore()
const navigationStore = useScreenNavigation()

const isLoading = ref(false)
const isSharePopupOpen = ref(false)

// Title editing state
const isEditingTitle = ref(false)
const editableTitle = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

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

// Handle download button click with 5 second delay
async function handleDownloadAction() {
  // Emit the export-image event immediately
  emit('export-image')

  // Add a 5-second delay to simulate processing
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // The action completes successfully after the delay
  return Promise.resolve()
}

// Title editing methods
function startEditingTitle() {
  if (props.editsLocked) return

  isEditingTitle.value = true
  editableTitle.value = props.dashboard?.name || 'Untitled Dashboard'

  // Focus the input on next tick
  setTimeout(() => {
    titleInput.value?.focus()
  }, 0)
}

function finishEditingTitle() {
  isEditingTitle.value = false
  emit('title-update', editableTitle.value)
}

function cancelEditingTitle() {
  isEditingTitle.value = false
  editableTitle.value = props.dashboard?.name || 'Untitled Dashboard'
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
    <!-- Title and Edit Controls row -->
    <div class="controls-row title-row" v-if="editMode">
      <div class="dashboard-title" @click="startEditingTitle">
        <span v-if="!isEditingTitle" class="editable-text">
          {{ dashboard?.name || 'Untitled Dashboard' }}
          <span class="edit-indicator" data-testid="edit-dashboard-title" v-if="!editsLocked">
            ✎
          </span>
        </span>
        <input v-else ref="titleInput" data-testid="dashboard-title-input" v-model="editableTitle"
          @blur="finishEditingTitle" @keyup.enter="finishEditingTitle" @keyup.esc="cancelEditingTitle"
          class="title-input" type="text" />
      </div>

      <div class="dashboard-right-controls">
        <div class="connection-selector">
          <div class="select-wrapper">
            <i class="mdi mdi-database-outline select-icon"></i>
            <select id="connection" data-testid="connection-selector" @change="$emit('connection-change', $event)"
              :value="selectedConnection">
              <option v-for="conn in Object.values(connectionStore.connections).filter(
                (conn) => conn.model,
              )" :key="conn.name" :value="conn.name">
                {{ conn.name }}
              </option>
            </select>
          </div>
        </div>
        <DashboardImportSelector :available-imports="availableImports" :active-imports="activeImports"
          @update:imports="handleImportsChange" @explore="(e) => navigationStore.openTab('editors', null, e.id)" />
        <div class="grid-actions">
          <button @click="$emit('add-item')" class="btn btn-success" data-testid="add-item-button">
            Add Item
          </button>
          <button @click="$emit('clear-items')" class="btn btn-danger" data-testid="clear-items-button">
            Clear All
          </button>
        </div>
      </div>
    </div>

    <!-- Title only row for view mode -->
    <div class="controls-row title-only-row" v-else>
      <div class="dashboard-title" @click="startEditingTitle">
        <span v-if="!isEditingTitle" class="editable-text">
          {{ dashboard?.name || 'Untitled Dashboard' }}
        </span>
        <input v-else ref="titleInput" data-testid="dashboard-title-input" v-model="editableTitle"
          @blur="finishEditingTitle" @keyup.enter="finishEditingTitle" @keyup.esc="cancelEditingTitle"
          class="title-input" type="text" />
      </div>
    </div>

    <!-- Filter row - now showing the extracted FilterInputComponent -->
    <div class="controls-row filter-row">
      <FilterInputComponent :filter-value="dashboard?.filter || ''" :filter-error="filterError" :is-loading="isLoading"
        :global-completion="globalCompletion" :validate-filter="validateFilter" @filter-apply="handleFilterApply"
        @clear-filter="$emit('clear-filter', '')" />

      <div class="grid-actions">
        <!-- Replace the regular download button with LoadingButton -->
        <LoadingButton :action="handleDownloadAction" :use-default-style="false" class="btn btn-secondary"
          data-testid="download-button" test-id="download-button">
          Download
        </LoadingButton>

        <button @click="toggleSharePopup" class="btn btn-secondary" data-testid="share-dashboard-button">
          Export
        </button>
        <button @click="() => $emit('toggle-edit-mode')" class="btn btn-secondary" data-testid="toggle-edit-mode-button"
          :disabled="editsLocked">
          {{ editMode ? 'Fullscreen' : 'Edit Mode' }}
        </button>
        <button @click="handleRefresh" class="btn btn-primary" data-testid="refresh-button">
          ⟳ Refresh
        </button>
      </div>
    </div>
    <DashboardSharePopup :dashboard="dashboard" :is-open="isSharePopupOpen" @close="closeSharePopup" />
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

.title-row {
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--border-light);
}

.title-only-row {
  justify-content: flex-start;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--border-light);
}

.dashboard-title {
  font-weight: 500;
  font-size: 18px;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-color);
}

.dashboard-title:hover .edit-indicator {
  opacity: 1;
}

.dashboard-right-controls {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-shrink: 0;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-indicator {
  opacity: 0;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
  color: var(--text-color);
}

.title-input {
  background: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: 18px;
  font-weight: 500;
  width: auto;
  min-width: 250px;
  color: var(--text-color);
}

.title-input:focus {
  outline: none;
  border-color: var(--special-text);
  box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.1);
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
  border-color: var(--special-text);
  /* Keep same border as unfocused */
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
  border-radius: 0;
  /* Remove rounded corners */
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
  font-weight: 250;
  color: var(--text-color);
  font-size: var(--button-font-size);
  transition: all 0.2s ease;
  text-align: center;
  border: none;
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


.btn-success {
  border-color: var(--special-text);
  color: white;
      background-color: var(--special-text);
}

.btn-success:hover:not(:disabled) {
  background-color: var(--special-text);
  color: white;
}

.btn-danger {
  border: 1px solid var(--delete-color);
  color: var(--delete-color);
}

.btn-danger:hover:not(:disabled) {
  background-color: var(--delete-color);
  color: white;
}

/* Media queries for responsiveness */
@media (max-width: 900px) {
  .dashboard-right-controls {
    gap: 10px;
  }

  .select-wrapper select {
    min-width: 120px;
  }
}

@media (max-width: 768px) {
  .edit-indicator {
    opacity: 1;
  }
  .title-row {
    flex-direction: column;
    gap: 15px;
    align-items: stretch;
  }

  .title-only-row {
    justify-content: center;
    padding: 8px 10px;
  }

  .dashboard-title {
    font-size: 16px;
    text-align: center;
  }

  .title-input {
    font-size: 16px;
    min-width: 200px;
  }

  .dashboard-right-controls {
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 15px;
  }

  .controls-row {
    flex-wrap: wrap;
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
    gap: 4px;
  }

  .btn {
    padding: 6px 4px;
    font-size: calc(var(--button-font-size) - 1px);
    flex: 1;
    min-width: 60px;
    white-space: nowrap;
  }

  .mobile-hidden {
    display: none;
  }
}

@media (max-width: 768px) {
  .connection-selector {
    max-width: 100%;
  }

  .select-wrapper select {
    min-width: unset;
  }

  /* Default grid-actions styling for filter row */
  .grid-actions {
    gap: 5px;
    max-width: 100%;
    padding-left: 0px;
  }

  /* Default btn styling for filter row */
  .btn {
    min-width: 0;
    font-size: calc(var(--button-font-size) - 1px);
    padding: 6px 8px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Override for edit mode buttons only */
  .dashboard-right-controls .grid-actions {
    gap: 4px;
    justify-content: center;
  }

  .dashboard-right-controls .btn {
    min-width: 60px;
    font-size: calc(var(--button-font-size) - 2px);
    padding: 6px 3px;
    flex: 1;
  }
}

/* Extra small screen size handling */
@media (max-width: 360px) {
  .connection-selector {
    max-width: 100%;
  }

  .title-input {
    min-width: 150px;
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
