<template>
  <div class="orchestration-container">
    <!-- Empty state when no schedule is selected -->
    <div v-if="!activeSchedule" class="empty-state">
      <div class="empty-icon">
        <i class="mdi mdi-clock-outline"></i>
      </div>
      <h2>Orchestration</h2>
      <p>Schedule your Trilogy queries to run automatically.</p>
      <p class="hint">Select a schedule from the sidebar or create a new one to get started.</p>
    </div>

    <!-- Schedule editor -->
    <div v-else class="schedule-editor">
      <!-- Header -->
      <div class="schedule-header">
        <div class="header-left">
          <input
            v-model="editableName"
            class="schedule-name-input"
            placeholder="Schedule name"
            @blur="updateName"
            @keyup.enter="updateName"
          />
          <span class="connection-badge">
            <i class="mdi mdi-database-outline"></i>
            {{ activeSchedule.connection }}
          </span>
        </div>
        <div class="header-right">
          <label class="enable-toggle">
            <input type="checkbox" v-model="scheduleEnabled" @change="toggleEnabled" />
            <span>{{ scheduleEnabled ? 'Enabled' : 'Disabled' }}</span>
          </label>
        </div>
      </div>

      <!-- Main content area -->
      <div class="schedule-content">
        <!-- Left panel: Schedule settings -->
        <div class="settings-panel">
          <div class="panel-section">
            <h3 class="section-title">
              <i class="mdi mdi-calendar-clock"></i>
              Schedule Trigger
            </h3>
            <div class="cron-input-group">
              <label>Cron Expression</label>
              <input
                v-model="cronExpression"
                class="cron-input"
                placeholder="0 0 * * *"
                @blur="updateCron"
                @keyup.enter="updateCron"
              />
              <span class="cron-hint">{{ cronDescription }}</span>
            </div>
            <div class="preset-buttons">
              <button
                v-for="preset in cronPresets"
                :key="preset.value"
                @click="setCronPreset(preset.value)"
                class="preset-btn"
                :class="{ active: cronExpression === preset.value }"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <div class="panel-section">
            <h3 class="section-title">
              <i class="mdi mdi-variable"></i>
              Variables
              <button class="add-btn" @click="showAddVariable = true" title="Add variable">
                <i class="mdi mdi-plus"></i>
              </button>
            </h3>
            <div v-if="activeSchedule.variables.length === 0" class="empty-variables">
              No variables defined. Variables can be used as parameters in your queries.
            </div>
            <div v-else class="variables-list">
              <div
                v-for="variable in activeSchedule.variables"
                :key="variable.name"
                class="variable-item"
              >
                <span class="variable-name">{{ variable.name }}</span>
                <span class="variable-value">{{ variable.value }}</span>
                <button
                  class="remove-btn"
                  @click="removeVariable(variable.name)"
                  title="Remove variable"
                >
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
            </div>
            <!-- Add variable form -->
            <div v-if="showAddVariable" class="add-variable-form">
              <input
                v-model="newVariableName"
                placeholder="Variable name"
                class="variable-input"
                @keyup.enter="addVariable"
              />
              <input
                v-model="newVariableValue"
                placeholder="Value"
                class="variable-input"
                @keyup.enter="addVariable"
              />
              <button class="add-variable-btn" @click="addVariable" :disabled="!newVariableName">
                Add
              </button>
              <button class="cancel-btn" @click="showAddVariable = false">Cancel</button>
            </div>
          </div>

          <div class="panel-section">
            <h3 class="section-title">
              <i class="mdi mdi-cloud-upload-outline"></i>
              Backend
            </h3>
            <div class="backend-selector">
              <label class="backend-option" :class="{ selected: selectedBackend === 'github-actions' }">
                <input
                  type="radio"
                  v-model="selectedBackend"
                  value="github-actions"
                  @change="updateBackend"
                />
                <i class="mdi mdi-github"></i>
                <div class="backend-info">
                  <span class="backend-name">GitHub Actions</span>
                  <span class="backend-desc">Run as a GitHub workflow</span>
                </div>
              </label>
              <label class="backend-option" :class="{ selected: selectedBackend === 'trilogy-cloud', disabled: true }">
                <input
                  type="radio"
                  v-model="selectedBackend"
                  value="trilogy-cloud"
                  disabled
                  @change="updateBackend"
                />
                <i class="mdi mdi-cloud"></i>
                <div class="backend-info">
                  <span class="backend-name">Trilogy Cloud</span>
                  <span class="backend-desc">Coming soon</span>
                </div>
              </label>
            </div>

            <!-- GitHub Actions config -->
            <div v-if="selectedBackend === 'github-actions'" class="backend-config">
              <div class="config-field">
                <label>Repository</label>
                <input
                  v-model="githubRepo"
                  placeholder="owner/repo"
                  class="config-input"
                  @blur="updateGitHubConfig"
                />
              </div>
              <div class="config-field">
                <label>Branch</label>
                <input
                  v-model="githubBranch"
                  placeholder="main"
                  class="config-input"
                  @blur="updateGitHubConfig"
                />
              </div>
              <div class="config-field">
                <label>Trilogy Job Folder</label>
                <input
                  v-model="trilogyJobFolder"
                  placeholder=".trilogy/jobs"
                  class="config-input"
                  @blur="updateGitHubConfig"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Right panel: Files -->
        <div class="files-panel">
          <div class="panel-section">
            <h3 class="section-title">
              <i class="mdi mdi-file-document-multiple-outline"></i>
              Files to Run
              <span class="file-count">({{ activeSchedule.files.length }})</span>
            </h3>

            <!-- File selector -->
            <div class="file-selector">
              <select v-model="selectedEditorToAdd" class="file-select">
                <option value="" disabled>Select a file to add...</option>
                <option
                  v-for="editor in availableEditors"
                  :key="editor.id"
                  :value="editor.id"
                  :disabled="isEditorInSchedule(editor.id)"
                >
                  {{ editor.name }}{{ isEditorInSchedule(editor.id) ? ' (already added)' : '' }}
                </option>
              </select>
              <button
                class="add-file-btn"
                @click="addFile"
                :disabled="!selectedEditorToAdd"
              >
                <i class="mdi mdi-plus"></i> Add
              </button>
            </div>

            <!-- Files list -->
            <div v-if="activeSchedule.files.length === 0" class="empty-files">
              <i class="mdi mdi-file-document-outline"></i>
              <p>No files selected</p>
              <p class="hint">Add files from your editors to include them in this schedule.</p>
            </div>
            <div v-else class="files-list">
              <div
                v-for="(file, index) in activeSchedule.files"
                :key="file.id"
                class="file-item"
                draggable="true"
                @dragstart="handleDragStart(index, $event)"
                @dragover.prevent
                @drop="handleDrop(index, $event)"
              >
                <span class="drag-handle">
                  <i class="mdi mdi-drag"></i>
                </span>
                <span class="file-order">{{ index + 1 }}</span>
                <i class="mdi mdi-file-document-outline file-icon"></i>
                <span class="file-name">{{ file.editorName }}</span>
                <button
                  class="remove-file-btn"
                  @click="removeFile(file.id)"
                  title="Remove file"
                >
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Preview/Deploy section -->
          <div class="panel-section deploy-section">
            <h3 class="section-title">
              <i class="mdi mdi-rocket-launch-outline"></i>
              Actions
            </h3>
            <div class="action-buttons">
              <button class="action-btn preview-btn" @click="previewWorkflow" :disabled="!canDeploy">
                <i class="mdi mdi-eye-outline"></i>
                Preview Workflow
              </button>
              <button class="action-btn deploy-btn" @click="deploySchedule" :disabled="!canDeploy">
                <i class="mdi mdi-upload-outline"></i>
                Deploy to GitHub
              </button>
            </div>
            <div v-if="!canDeploy" class="deploy-warning">
              <i class="mdi mdi-information-outline"></i>
              Configure backend settings and add files to deploy.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, inject } from 'vue'
import type { OrchestrationStoreType, Schedule } from '../stores/orchestrationStore'
import type { EditorStoreType } from '../stores/editorStore'

// Simple cron description helper
function describeCron(cron: string): string {
  const presets: Record<string, string> = {
    '0 0 * * *': 'Every day at midnight',
    '0 * * * *': 'Every hour',
    '*/15 * * * *': 'Every 15 minutes',
    '0 0 * * 0': 'Every Sunday at midnight',
    '0 0 1 * *': 'First day of every month',
    '0 9 * * 1-5': 'Weekdays at 9 AM',
  }
  return presets[cron] || 'Custom schedule'
}

export default defineComponent({
  name: 'OrchestrationView',

  props: {
    activeScheduleKey: {
      type: String,
      default: '',
    },
  },

  setup(props) {
    const orchestrationStore = inject<OrchestrationStoreType>('orchestrationStore')
    const editorStore = inject<EditorStoreType>('editorStore')

    if (!orchestrationStore || !editorStore) {
      throw new Error('Required stores not provided!')
    }

    // Local state
    const editableName = ref('')
    const cronExpression = ref('')
    const scheduleEnabled = ref(false)
    const selectedBackend = ref<string | null>(null)
    const githubRepo = ref('')
    const githubBranch = ref('main')
    const trilogyJobFolder = ref('.trilogy/jobs')
    const selectedEditorToAdd = ref('')
    const showAddVariable = ref(false)
    const newVariableName = ref('')
    const newVariableValue = ref('')
    const draggedIndex = ref<number | null>(null)

    // Cron presets
    const cronPresets = [
      { label: 'Hourly', value: '0 * * * *' },
      { label: 'Daily', value: '0 0 * * *' },
      { label: '15 min', value: '*/15 * * * *' },
      { label: 'Weekly', value: '0 0 * * 0' },
      { label: 'Monthly', value: '0 0 1 * *' },
      { label: 'Weekdays 9AM', value: '0 9 * * 1-5' },
    ]

    // Computed
    const activeSchedule = computed<Schedule | null>(() => {
      if (!props.activeScheduleKey) return null
      return orchestrationStore.schedules[props.activeScheduleKey] || null
    })

    const cronDescription = computed(() => {
      return describeCron(cronExpression.value)
    })

    const availableEditors = computed(() => {
      if (!activeSchedule.value) return []
      // Get editors that belong to the same connection
      return Object.values(editorStore.editors).filter(
        (editor) => editor.connection === activeSchedule.value?.connection
      )
    })

    const canDeploy = computed(() => {
      if (!activeSchedule.value) return false
      return (
        activeSchedule.value.files.length > 0 &&
        selectedBackend.value === 'github-actions' &&
        githubRepo.value.trim() !== ''
      )
    })

    // Watch for schedule changes
    watch(
      () => activeSchedule.value,
      (schedule) => {
        if (schedule) {
          editableName.value = schedule.name
          cronExpression.value = schedule.cronExpression
          scheduleEnabled.value = schedule.enabled
          selectedBackend.value = schedule.backend
          githubRepo.value = schedule.githubRepo || ''
          githubBranch.value = schedule.githubBranch || 'main'
          trilogyJobFolder.value = schedule.trilogyJobFolder || '.trilogy/jobs'
        }
      },
      { immediate: true }
    )

    // Methods
    const updateName = () => {
      if (activeSchedule.value && editableName.value !== activeSchedule.value.name) {
        orchestrationStore.updateSchedule(activeSchedule.value.id, { name: editableName.value })
      }
    }

    const updateCron = () => {
      if (activeSchedule.value && cronExpression.value !== activeSchedule.value.cronExpression) {
        orchestrationStore.updateSchedule(activeSchedule.value.id, {
          cronExpression: cronExpression.value,
        })
      }
    }

    const setCronPreset = (value: string) => {
      cronExpression.value = value
      updateCron()
    }

    const toggleEnabled = () => {
      if (activeSchedule.value) {
        orchestrationStore.updateSchedule(activeSchedule.value.id, {
          enabled: scheduleEnabled.value,
        })
      }
    }

    const updateBackend = () => {
      if (activeSchedule.value) {
        orchestrationStore.updateSchedule(activeSchedule.value.id, {
          backend: selectedBackend.value as any,
        })
      }
    }

    const updateGitHubConfig = () => {
      if (activeSchedule.value) {
        orchestrationStore.updateSchedule(activeSchedule.value.id, {
          githubRepo: githubRepo.value,
          githubBranch: githubBranch.value,
          trilogyJobFolder: trilogyJobFolder.value,
        })
      }
    }

    const isEditorInSchedule = (editorId: string): boolean => {
      if (!activeSchedule.value) return false
      return activeSchedule.value.files.some((f) => f.editorId === editorId)
    }

    const addFile = () => {
      if (!activeSchedule.value || !selectedEditorToAdd.value) return

      const editor = editorStore.editors[selectedEditorToAdd.value]
      if (editor) {
        orchestrationStore.addFileToSchedule(
          activeSchedule.value.id,
          editor.id,
          editor.name
        )
        selectedEditorToAdd.value = ''
      }
    }

    const removeFile = (fileId: string) => {
      if (activeSchedule.value) {
        orchestrationStore.removeFileFromSchedule(activeSchedule.value.id, fileId)
      }
    }

    const handleDragStart = (index: number, event: DragEvent) => {
      draggedIndex.value = index
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
      }
    }

    const handleDrop = (targetIndex: number, _event: DragEvent) => {
      if (draggedIndex.value === null || !activeSchedule.value) return

      const files = [...activeSchedule.value.files]
      const [draggedFile] = files.splice(draggedIndex.value, 1)
      files.splice(targetIndex, 0, draggedFile)

      orchestrationStore.reorderFiles(
        activeSchedule.value.id,
        files.map((f) => f.id)
      )
      draggedIndex.value = null
    }

    const addVariable = () => {
      if (!activeSchedule.value || !newVariableName.value) return

      orchestrationStore.addVariable(
        activeSchedule.value.id,
        newVariableName.value,
        newVariableValue.value
      )

      newVariableName.value = ''
      newVariableValue.value = ''
      showAddVariable.value = false
    }

    const removeVariable = (name: string) => {
      if (activeSchedule.value) {
        orchestrationStore.removeVariable(activeSchedule.value.id, name)
      }
    }

    const previewWorkflow = () => {
      // TODO: Generate and show preview of GitHub Actions workflow
      console.log('Preview workflow for schedule:', activeSchedule.value?.id)
    }

    const deploySchedule = () => {
      // TODO: Deploy to GitHub Actions
      console.log('Deploy schedule:', activeSchedule.value?.id)
    }

    return {
      activeSchedule,
      editableName,
      cronExpression,
      cronDescription,
      cronPresets,
      scheduleEnabled,
      selectedBackend,
      githubRepo,
      githubBranch,
      trilogyJobFolder,
      selectedEditorToAdd,
      availableEditors,
      showAddVariable,
      newVariableName,
      newVariableValue,
      canDeploy,
      updateName,
      updateCron,
      setCronPreset,
      toggleEnabled,
      updateBackend,
      updateGitHubConfig,
      isEditorInSchedule,
      addFile,
      removeFile,
      handleDragStart,
      handleDrop,
      addVariable,
      removeVariable,
      previewWorkflow,
      deploySchedule,
    }
  },
})
</script>

<style scoped>
.orchestration-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-color);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-secondary);
  text-align: center;
  padding: 40px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h2 {
  margin: 0 0 10px 0;
  color: var(--text-color);
}

.empty-state p {
  margin: 5px 0;
}

.empty-state .hint {
  font-size: 13px;
  opacity: 0.8;
}

/* Schedule editor */
.schedule-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.schedule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-color-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.schedule-name-input {
  font-size: 18px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--text-color);
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 200px;
}

.schedule-name-input:hover,
.schedule-name-input:focus {
  background-color: var(--input-bg);
  outline: none;
}

.connection-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: var(--bg-color);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.enable-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.enable-toggle input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

/* Main content */
.schedule-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-panel,
.files-panel {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-panel {
  border-right: 1px solid var(--border-color);
}

.panel-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-color);
}

.section-title .add-btn {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--primary-color);
  padding: 4px;
  border-radius: 4px;
}

.section-title .add-btn:hover {
  background-color: var(--button-mouseover);
}

/* Cron input */
.cron-input-group {
  margin-bottom: 12px;
}

.cron-input-group label {
  display: block;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.cron-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-family: monospace;
  font-size: 14px;
}

.cron-hint {
  display: block;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
}

.preset-btn:hover {
  background-color: var(--button-mouseover);
}

.preset-btn.active {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

/* Variables */
.empty-variables {
  font-size: 13px;
  color: var(--text-color-secondary);
  padding: 12px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
}

.variables-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variable-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
}

.variable-name {
  font-weight: 500;
  font-family: monospace;
}

.variable-value {
  flex: 1;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color-secondary);
  padding: 4px;
  border-radius: 4px;
}

.remove-btn:hover {
  color: var(--delete-color);
  background-color: var(--button-mouseover);
}

.add-variable-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.variable-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--text-color);
}

.add-variable-btn,
.cancel-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.add-variable-btn {
  background-color: var(--primary-color);
  color: white;
}

.add-variable-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background-color: var(--button-bg);
  color: var(--text-color);
}

/* Backend selector */
.backend-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.backend-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.backend-option:hover:not(.disabled) {
  background-color: var(--button-mouseover);
}

.backend-option.selected {
  border-color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.1);
}

.backend-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.backend-option input {
  margin: 0;
}

.backend-option i {
  font-size: 24px;
}

.backend-info {
  display: flex;
  flex-direction: column;
}

.backend-name {
  font-weight: 500;
}

.backend-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.backend-config {
  margin-top: 16px;
  padding: 16px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
}

.config-field {
  margin-bottom: 12px;
}

.config-field:last-child {
  margin-bottom: 0;
}

.config-field label {
  display: block;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.config-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--text-color);
}

/* Files panel */
.file-count {
  font-weight: normal;
  color: var(--text-color-secondary);
}

.file-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.file-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--text-color);
}

.add-file-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.add-file-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-files {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  color: var(--text-color-secondary);
  text-align: center;
}

.empty-files i {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-files p {
  margin: 4px 0;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  cursor: grab;
}

.file-item:active {
  cursor: grabbing;
}

.drag-handle {
  color: var(--text-color-secondary);
  cursor: grab;
}

.file-order {
  min-width: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.file-icon {
  color: var(--text-color-secondary);
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-file-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color-secondary);
  padding: 4px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.file-item:hover .remove-file-btn {
  opacity: 1;
}

.remove-file-btn:hover {
  color: var(--delete-color);
  background-color: var(--button-mouseover);
}

/* Deploy section */
.deploy-section {
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.preview-btn {
  background-color: var(--button-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.preview-btn:hover:not(:disabled) {
  background-color: var(--button-mouseover);
}

.deploy-btn {
  background-color: var(--primary-color);
  color: white;
}

.deploy-btn:hover:not(:disabled) {
  background-color: var(--primary-color-hover);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.deploy-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  background-color: var(--warning-bg, rgba(255, 193, 7, 0.1));
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-color-secondary);
}
</style>
