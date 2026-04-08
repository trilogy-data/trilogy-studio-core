<script setup lang="ts">
import { computed, type PropType, type Ref, ref } from 'vue'
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
  exportImageAction: {
    type: Function as unknown as PropType<(() => Promise<void>) | null>,
    default: null,
  },
  hasLlmConnection: {
    type: Boolean,
    default: false,
  },
  chatOpen: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'connection-change',
  'filter-change',
  'import-change',
  'add-item',
  'clear-items',
  'clear-filter',
  'mode-change',
  'refresh',
  'title-update',
  'export-image',
  'toggle-chat',
  'fork-investigation',
])

const connectionStore = useConnectionStore()
const editorStore = useEditorStore()
const navigationStore = useScreenNavigation()

const isLoading = ref(false)
const isSharePopupOpen = ref(false)
const isEditingTitle = ref(false)
const editableTitle = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

function toggleSharePopup() {
  isSharePopupOpen.value = !isSharePopupOpen.value
}

function closeSharePopup() {
  isSharePopupOpen.value = false
}

function handleFilterApply(newValue: string) {
  emit('filter-change', newValue)
}

async function handleDownloadAction() {
  if (props.exportImageAction) {
    await props.exportImageAction()
    return
  }

  emit('export-image')
}

function handleModeChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('mode-change', target.value)
}

function startEditingTitle() {
  if (props.editsLocked) return

  isEditingTitle.value = true
  editableTitle.value = props.dashboard?.name || 'Untitled Dashboard'

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
    name: importItem.name.replace(/\//g, '.'),
    alias: '',
  }))
})

const activeImports = computed(() => props.dashboard?.imports || [])

function handleImportsChange(newImports: DashboardImport[]) {
  emit('import-change', newImports)
}

function handleRefresh() {
  emit('refresh')
}

const modeIcon = computed(() => {
  switch (props.dashboard?.state) {
    case 'editing':
      return 'mdi mdi-pencil-outline'
    case 'published':
      return 'mdi mdi-eye-outline'
    case 'fullscreen':
      return 'mdi mdi-fullscreen'
    default:
      return 'mdi mdi-eye-outline'
  }
})
</script>

<template>
  <div class="dashboard-controls" data-testid="dashboard-controls">
    <div
      class="controls-row title-row"
      :class="{ 'view-title-row': dashboard.state !== 'editing' }"
    >
      <div class="dashboard-title" @click="startEditingTitle">
        <span v-if="!isEditingTitle" class="editable-text">
          <span class="title-text">{{ dashboard?.name || 'Untitled Dashboard' }}</span>
          <span class="edit-indicator" data-testid="edit-dashboard-title" v-if="!editsLocked">
            <i class="mdi mdi-pencil-outline"></i>
          </span>
        </span>
        <input
          v-else
          ref="titleInput"
          data-testid="dashboard-title-input"
          v-model="editableTitle"
          @blur="finishEditingTitle"
          @keyup.enter="finishEditingTitle"
          @keyup.esc="cancelEditingTitle"
          class="title-input"
          type="text"
        />
      </div>

      <div v-if="dashboard.state === 'editing'" class="dashboard-right-controls">
        <div class="connection-selector" data-testid="connection-selector-wrapper">
          <div class="select-wrapper">
            <i class="mdi mdi-database-outline select-icon"></i>
            <select
              id="connection"
              data-testid="connection-selector"
              @change="$emit('connection-change', $event)"
              :value="selectedConnection"
              :title="selectedConnection"
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
          @explore="(e) => navigationStore.openTab('editors', null, e.id)"
        />

        <div class="grid-actions top-actions">
          <button
            @click="$emit('add-item')"
            class="btn btn-success"
            data-testid="add-item-button"
            title="Add Item"
          >
            <i class="mdi mdi-plus top-action-icon" aria-hidden="true"></i>
            <span class="top-action-label">Add</span>
          </button>
          <button
            @click="$emit('clear-items')"
            class="btn btn-danger"
            data-testid="clear-items-button"
            title="Clear All"
          >
            <i class="mdi mdi-delete-outline top-action-icon" aria-hidden="true"></i>
            <span class="top-action-label">Clear</span>
          </button>
        </div>
      </div>
    </div>

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

      <div class="grid-actions filter-actions">
        <LoadingButton
          :action="handleDownloadAction"
          :use-default-style="false"
          class="btn btn-secondary filter-action-btn"
          data-testid="download-button"
          test-id="download-button"
          title="Download dashboard image"
          aria-label="Download dashboard image"
        >
          <i class="mdi mdi-download-outline filter-action-icon" aria-hidden="true"></i>
          <span class="filter-action-label">Download</span>
        </LoadingButton>

        <button
          @click="toggleSharePopup"
          class="btn btn-secondary filter-action-btn"
          data-testid="share-dashboard-button"
          title="Export dashboard"
          aria-label="Export dashboard"
        >
          <i class="mdi mdi-export-variant filter-action-icon" aria-hidden="true"></i>
          <span class="filter-action-label">Export</span>
        </button>

        <button
          @click="handleRefresh"
          class="btn btn-primary filter-action-btn"
          data-testid="refresh-button"
          title="Refresh dashboard"
          aria-label="Refresh dashboard"
        >
          <i class="mdi mdi-refresh filter-action-icon" aria-hidden="true"></i>
          <span class="filter-action-label">Refresh</span>
        </button>

        <button
          @click="$emit('fork-investigation')"
          class="btn btn-secondary filter-action-btn"
          data-testid="fork-investigation-button"
          title="Fork as investigation"
          aria-label="Fork as investigation"
        >
          <i class="mdi mdi-source-branch filter-action-icon" aria-hidden="true"></i>
          <span class="filter-action-label">Fork</span>
        </button>

        <button
          @click="$emit('toggle-chat')"
          class="btn filter-action-btn"
          :class="chatOpen ? 'btn-primary' : 'btn-secondary'"
          :disabled="!hasLlmConnection"
          data-testid="toggle-chat-button"
          :title="hasLlmConnection ? 'Toggle AI assistant' : 'No LLM connection configured'"
          aria-label="Toggle AI assistant"
        >
          <i class="mdi mdi-creation-outline filter-action-icon" aria-hidden="true"></i>
          <span class="filter-action-label">{{ chatOpen ? 'Close AI' : 'AI' }}</span>
        </button>

        <div class="mode-selector" data-testid="mode-selector-wrapper">
          <div class="select-wrapper">
            <i :class="modeIcon + ' select-icon'"></i>
            <select
              id="viewMode"
              data-testid="mode-selector"
              @change="handleModeChange"
              :value="dashboard.state"
              :disabled="editsLocked"
              class="mode-select"
            >
              <option value="editing" data-testid="edit-mode-option">Edit</option>
              <option value="published" data-testid="view-mode-option">View</option>
              <option value="fullscreen" data-testid="fullscreen-mode-option">Fullscreen</option>
            </select>
          </div>
        </div>
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
  background: var(--query-window-bg);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.controls-row {
  display: flex;
  gap: 12px;
  padding: 8px 18px;
}

.title-row {
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 10px;
  padding-bottom: 6px;
  flex-wrap: nowrap;
}

.view-title-row {
  padding-bottom: 6px;
}

.dashboard-title {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
  color: var(--text-color);
  cursor: pointer;
}

.editable-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  font-family: var(--font-heading);
  font-size: var(--page-title-font-size);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.title-text {
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-indicator {
  display: inline-flex;
  align-items: center;
  opacity: 0;
  color: var(--dashboard-helper-text);
  font-size: 15px;
  transition: opacity 0.2s ease;
}

.dashboard-title:hover .edit-indicator {
  opacity: 1;
}

.title-input {
  width: min(100%, 420px);
  min-width: 240px;
  height: 44px;
  padding: 0 14px;
  font-family: var(--font-heading);
  font-size: calc(var(--page-title-font-size) - 2px);
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text-color);
  background: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 12px;
}

.title-input:focus {
  outline: none;
  border-color: var(--special-text);
  box-shadow: 0 0 0 2px rgba(var(--special-text-rgb, 37, 99, 235), 0.12);
}

.dashboard-right-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 1 auto;
  flex-wrap: nowrap;
  min-width: 0;
}

.connection-selector,
.mode-selector {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 0 1 auto;
}

.select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.select-icon {
  position: absolute;
  left: 12px;
  z-index: 1;
  pointer-events: none;
  color: var(--text-color);
  font-size: 18px;
}

.select-wrapper::after {
  content: '';
  position: absolute;
  right: 14px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: translateY(-60%) rotate(45deg);
  color: var(--dashboard-helper-text);
  pointer-events: none;
}

.select-wrapper select:focus {
  border-color: var(--special-text);
  box-shadow: 0 0 0 2px rgba(var(--special-text-rgb, 37, 99, 235), 0.12);
}

.select-wrapper select,
.mode-select {
  height: 44px;
  min-width: 0;
  padding: 0 40px 0 40px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: var(--ui-label-letter-spacing);
  background-color: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  appearance: none;
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.connection-selector .select-wrapper {
  width: clamp(170px, 18vw, 230px);
}

.connection-selector .select-wrapper select {
  width: 100%;
  text-overflow: ellipsis;
}

.mode-selector .select-wrapper {
  width: 150px;
}

.filter-row {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  padding-bottom: 12px;
  flex-wrap: nowrap;
}

.filter-row > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.grid-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.top-actions {
  justify-content: flex-end;
  flex-wrap: nowrap;
}

.top-actions .btn {
  min-width: 72px;
}

.top-action-icon {
  display: none;
  font-size: 16px;
  line-height: 1;
}

.top-action-label {
  display: inline;
}

@media (max-width: 1520px) {
  .top-actions .btn {
    width: 40px;
    min-width: 40px;
    padding: 0;
  }

  .top-action-icon {
    display: inline-flex;
  }

  .top-action-label {
    display: none;
  }
}

.filter-actions {
  margin-left: auto;
  justify-content: flex-end;
  flex: 0 0 auto;
  flex-wrap: nowrap;
}

.filter-action-btn {
  flex: 0 0 auto;
}

.filter-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
}

.filter-action-label {
  display: inline;
}

.btn {
  min-width: 86px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  margin-top: 0;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: var(--ui-label-letter-spacing);
  text-align: center;
  white-space: nowrap;
  background: var(--query-window-bg);
  border: 1px solid var(--border-light);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn:disabled:hover {
  background: var(--query-window-bg);
  color: inherit;
}

.btn-primary {
  border-color: var(--special-text);
  color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--special-text);
  color: white;
}

.btn-secondary {
  background: transparent;
  color: var(--text-color);
}

.btn-success {
  border-color: var(--special-text);
  background-color: var(--special-text);
  color: white;
}

.btn-success:hover:not(:disabled) {
  background-color: var(--special-text);
  color: white;
}

.btn-danger {
  border-color: var(--delete-color);
  color: var(--delete-color);
  background: transparent;
}

.btn-danger:hover:not(:disabled) {
  background-color: var(--delete-color);
  color: white;
}

@media (max-width: 1100px) {
  .title-row {
    flex-wrap: wrap;
  }

  .dashboard-right-controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .filter-actions {
    margin-left: 0;
  }

  .filter-row {
    flex-wrap: wrap;
  }
}

@media (max-width: 900px) {
  .connection-selector .select-wrapper {
    width: clamp(160px, 28vw, 240px);
  }
}

@media (max-width: 768px) {
  .controls-row {
    gap: 10px;
    padding: 8px 10px;
  }

  .title-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding-top: 10px;
  }

  .dashboard-title {
    flex-basis: auto;
  }

  .editable-text {
    font-size: 16px;
  }

  .edit-indicator {
    opacity: 1;
  }

  .title-input {
    width: 100%;
    min-width: 0;
    height: 40px;
    font-size: 16px;
  }

  .dashboard-right-controls {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .connection-selector,
  .mode-selector {
    width: 100%;
  }

  .connection-selector .select-wrapper,
  .mode-selector .select-wrapper {
    width: 100%;
  }

  .select-wrapper select,
  .mode-select {
    width: 100%;
    height: 40px;
  }

  .grid-actions {
    width: 100%;
    gap: 8px;
  }

  .top-actions,
  .filter-actions {
    justify-content: stretch;
    margin-left: 0;
  }

  .top-actions .btn {
    width: auto;
    min-width: 0;
    padding: 0 12px;
  }

  .top-action-icon {
    display: none;
  }

  .top-action-label {
    display: inline;
  }

  .btn {
    flex: 1 1 0;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
  }

  .filter-action-btn {
    flex: 0 0 auto;
  }

  .filter-row > :first-child {
    min-width: 0;
    flex-basis: 100%;
  }
}

@media (max-width: 640px) {
  .filter-actions {
    gap: 6px;
  }

  .filter-action-btn {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
  }

  .filter-action-label {
    display: none;
  }

  .mode-selector {
    flex: 1 1 auto;
  }

  .mode-selector .select-wrapper {
    width: 100%;
    min-width: 124px;
  }
}

@media (max-width: 480px) {
  .btn {
    font-size: calc(var(--button-font-size) - 1px);
    padding: 0 10px;
  }

  .filter-action-btn {
    width: 44px;
    min-width: 44px;
    padding: 0;
  }
}
</style>
