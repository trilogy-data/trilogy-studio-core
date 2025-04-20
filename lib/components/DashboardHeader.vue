<!-- DashboardHeader.vue -->
<script setup lang="ts">
import { computed, type Ref, ref, watch } from 'vue'
import { useConnectionStore, useLLMConnectionStore, useEditorStore } from '../stores'
import { useFilterDebounce } from '../utility/debounce'
import DashboardImportSelector from './DashboardImportSelector.vue'
import Tooltip from './Tooltip.vue'
import DashboardSharePopup from './DashboardSharePopup.vue'
import FilterAutocomplete from './DashboardFilterAutocomplete.vue' // Import the new component
import { type Import, type CompletionItem } from '../stores/resolver'

const props = defineProps({
  dashboard: {
    type: Object,
    required: true,
  },
  editMode: Boolean,
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
  'toggle-edit-mode',
  'refresh',
])

const connectionStore = useConnectionStore()
const editorStore = useEditorStore()
const llmStore = useLLMConnectionStore()

const isLoading = ref(false)
const isSharePopupOpen = ref(false)
const filterInputRef = ref<HTMLInputElement | null>(props.dashboard.filter) // Reference to the filter input element

// Toggle share popup visibility
function toggleSharePopup() {
  isSharePopupOpen.value = !isSharePopupOpen.value
}

// Close share popup
function closeSharePopup() {
  isSharePopupOpen.value = false
}

const filterLLM = () => {
  isLoading.value = true
  let concepts = props.globalCompletion.map((item) => ({
    name: item.label,
    type: item.datatype,
    description: item.description,
  }))
  llmStore
    .generateFilterQuery(filterInput.value, concepts, props.validateFilter)
    .then((response) => {
      if (response && response.length > 0) {
        filterInput.value = response
        emit('filter-change', response)
      }
      isLoading.value = false
    })
    .catch(() => {
      isLoading.value = false
    })
}

// Handle keyboard shortcut for LLM generation
function handleFilterKeydown(event: KeyboardEvent) {
  // Check for Ctrl+Shift+Enter (or Command+Shift+Enter on Mac)
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    filterLLM()
  }
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
  const imports = Object.values(editorStore.editors).filter(
    (editor) => editor.connection === props.selectedConnection,
  )

  // const modelName = connectionStore.connections[props.selectedConnection].model
  // if (!modelName) {
  //   return []
  // }
  // const imports = modelStore.models[modelName].sources || []
  return imports.map((importItem) => ({
    name: importItem.name,
    alias: importItem.name,
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

// watch for dashboard change
watch(
  () => props.dashboard,
  (newDashboard) => {
    if (newDashboard) {
      filterInput.value = newDashboard.filter || ''
    }
  },
)

// Handle completion selection
function handleCompletionSelected(completion: { text: string; cursorPosition: number }) {
  filterInput.value = completion.text
  emit('filter-change', completion.text)

  // Set cursor position and focus the input
  if (filterInputRef.value) {
    filterInputRef.value.focus()
    filterInputRef.value.setSelectionRange(completion.cursorPosition, completion.cursorPosition)
  }
}
</script>

<template>
  <div class="dashboard-controls" data-testid="dashboard-controls">
    <!-- Filter row - now shown at the top on mobile -->
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
            @keydown="handleFilterKeydown"
            placeholder="Enter filter SQL clause... (Ctrl+Shift+Enter for text to SQL with configured LLM)"
            :class="{ 'filter-error': filterStatus === 'error' }"
            :disabled="isLoading"
            ref="filterInputRef"
          />

          <!-- Add the FilterAutocomplete component -->
          <FilterAutocomplete
            :input-value="filterInput"
            :completion-items="globalCompletion"
            :input-element="filterInputRef"
            v-if="filterInputRef"
            @select-completion="handleCompletionSelected"
          />

          <button
            @click="filterLLM"
            class="sparkle-button"
            data-testid="filter-llm-button"
            :disabled="isLoading"
            title="Transform text to filter if you have a configured LLM connection"
          >
            <div class="button-content">
              <i class="mdi mdi-creation" :class="{ hidden: isLoading }"></i>
              <div v-if="isLoading" class="loader-container">
                <div class="loader"></div>
              </div>
              <Tooltip
                :content="isLoading ? 'Processing...' : 'Text to filter (Ctrl+Shift+Enter)'"
                position="top"
              >
                <span class="tooltip-trigger"></span>
              </Tooltip>
            </div>
          </button>
          <div class="filter-validation-icon" v-if="filterStatus !== 'neutral'">
            <div
              v-if="filterStatus === 'error'"
              class="filter-icon error"
              data-testid="filter-error-icon"
            >
              <span class="icon-x">✕</span>
              <Tooltip :content="filterError || 'Unknown Error'" position="bottom">
                <span class="tooltip-trigger" data-testid="filter-error-tooltip-trigger"></span>
              </Tooltip>
            </div>
            <div
              v-else-if="filterStatus === 'valid'"
              class="filter-icon valid"
              data-testid="filter-valid-icon"
            >
              <Tooltip content="This is a syntactically correct filter." position="top">
                <span class="icon-check" data-testid="filter-valid-tooltip-trigger">✓</span>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
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
  /* background-color: var(--query-window-bg); */
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

.filter-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.filter-container label {
  margin-right: 10px;
  font-weight: 400;
  color: var(--text-color);
  white-space: nowrap;
  font-size: 18px;
}

.filter-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 5px;
  background-color: var(--bg-color);
}

.filter-container input {
  padding: 4px;
  border: 1px solid var(--border);
  color: var(--sidebar-selector-font);
  background-color: var(--bg-color);
  width: 100%;
  font-size: var(--font-size);
  height: 20px;
}

.sparkle-button {
  position: absolute;
  right: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  width: 30px;
  height: 30px;
  z-index: 2;
}

.button-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mdi {
  font-size: 16px;
}

.hidden {
  display: none;
}

/* Improved loader animation */
.loader-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.loader {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 2px solid var(--special-text);
  width: 16px;
  height: 16px;
  animation: loader-spin 1s linear infinite;
}

@keyframes loader-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1.5s linear infinite;
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
  /* Adjust the filter row to accommodate the toggle button */
  .filter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .filter-container {
    flex: 1;
    margin-top: 5px;
    padding-right: 10px;
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

  .sparkle-button {
    right: 30px;
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

  .sparkle-button {
    right: 25px;
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

  .sparkle-button {
    right: 20px;
  }
}
</style>
