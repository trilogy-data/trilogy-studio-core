<template>
  <div v-if="visible" class="dashboard-creator">
    <h4>Create New Dashboard</h4>
    <!-- Prompt-first when an LLM is configured: the assistant can pick the title. -->
    <div v-if="showPromptField" class="form-group">
      <label for="dashboard-prompt">Describe your dashboard</label>
      <textarea
        id="dashboard-prompt"
        v-model="dashboardPrompt"
        placeholder="Describe what you want to analyze. The assistant will build it (and pick a title if you skip the next field)..."
        rows="3"
        @keyup.ctrl.enter="createDashboard"
        :data-testid="testTag ? `dashboard-creator-prompt-${testTag}` : 'dashboard-creator-prompt'"
      ></textarea>
    </div>
    <div v-if="showPromptField" class="form-divider">
      <span>or set manually</span>
    </div>
    <div class="form-group">
      <label for="dashboard-name">
        Name
        <span v-if="showPromptField && dashboardPrompt.trim()" class="optional-label"
          >(optional)</span
        >
      </label>
      <input
        id="dashboard-name"
        v-model="dashboardName"
        type="text"
        :placeholder="namePlaceholder"
        @keyup.enter="createDashboard"
        :data-testid="testTag ? `dashboard-creator-name-${testTag}` : 'dashboard-creator-name'"
      />
    </div>
    <div class="form-group">
      <label for="dashboard-connection">Connection</label>
      <select
        id="dashboard-connection"
        v-model="selectedConnection"
        :data-testid="
          testTag ? `dashboard-creator-connection-${testTag}` : 'dashboard-creator-connection'
        "
      >
        <option v-for="conn in connections" :key="conn.name" :value="conn.name">
          {{ conn.name }}
        </option>
      </select>
    </div>
    <!-- Added imports dropdown -->
    <div v-if="selectedConnection && availableImports.length > 0" class="form-group">
      <label for="dashboard-import">Import</label>
      <select
        id="dashboard-import"
        v-model="selectedImport"
        :data-testid="testTag ? `dashboard-creator-import-${testTag}` : 'dashboard-creator-import'"
      >
        <option
          v-for="importItem in availableImports"
          :key="importItem.name"
          :value="importItem.id"
        >
          {{ importItem.name }}
        </option>
      </select>
    </div>
    <div class="form-actions">
      <button
        @click="createDashboard"
        :disabled="!canSubmit"
        :data-testid="testTag ? `dashboard-creator-submit-${testTag}` : 'dashboard-creator-submit'"
        class="create-btn"
      >
        Create
      </button>
      <button
        @click="cancel"
        :data-testid="testTag ? `dashboard-creator-cancel-${testTag}` : 'dashboard-creator-cancel'"
        class="cancel-btn"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import { type EditorStoreType } from '../../stores/editorStore'
import { type DashboardImport } from '../../dashboards/base'
import { isTrilogyType } from '../../editors/fileTypes'

export default {
  name: 'DashboardCreatorInline',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    testTag: {
      type: String,
      default: '',
    },
  },
  setup(_, { emit }) {
    const dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveDashboards = inject<CallableFunction>('saveDashboards')
    const setActiveDashboardNav = inject<(dashboard: string | null) => void>('setActiveDashboard')

    if (!dashboardStore || !connectionStore || !llmStore || !editorStore || !saveDashboards) {
      throw new Error('Dashboard or connection store is not provided!')
    }

    const dashboardName = ref('')
    const selectedConnection = ref('')
    const dashboardPrompt = ref('')
    const selectedImport = ref('')

    // Show prompt field only if there's an active default LLM connection
    const showPromptField = computed(() => {
      return llmStore.hasActiveDefaultConnection
    })

    // When a prompt is supplied, the assistant can choose the title — making it
    // optional. Otherwise we still require a name.
    const canSubmit = computed(() => {
      if (!selectedConnection.value) return false
      if (showPromptField.value && dashboardPrompt.value.trim()) return true
      return !!dashboardName.value.trim()
    })

    const namePlaceholder = computed(() => {
      if (showPromptField.value && dashboardPrompt.value.trim()) {
        return 'Leave blank to let the assistant choose'
      }
      return 'My Dashboard'
    })

    const connections = computed(() => {
      return Object.values(connectionStore.connections).filter(
        (conn) => conn.model && !conn.deleted,
      )
    })

    const availableImports: Ref<DashboardImport[]> = computed(() => {
      const imports = Object.values(editorStore.editors).filter(
        (editor) => editor.connection === selectedConnection.value && isTrilogyType(editor.type),
      )

      return imports.map((importItem) => ({
        id: importItem.id,
        name: importItem.name,
        alias: '',
      }))
    })

    // Set default import when imports are available
    computed(() => {
      if (availableImports.value.length > 0 && !selectedImport.value) {
        selectedImport.value = availableImports.value[0].id
      } else if (availableImports.value.length === 0) {
        // Reset selectedImport if no imports are available
        selectedImport.value = ''
      }
      return availableImports.value
    })
    // Set default connection when connections are available
    if (connections.value.length > 0 && !selectedConnection.value) {
      selectedConnection.value = connections.value[0].name
    }

    const createDashboard = async () => {
      if (!canSubmit.value) return

      try {
        // If the user only supplied a prompt, generate a placeholder name
        // (the agent will rename via update_dashboard_info / set_dashboard_title).
        let nameToUse = dashboardName.value.trim()
        if (!nameToUse) {
          nameToUse = `Dashboard ${new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}`
        }

        // Create new dashboard
        const dashboard = dashboardStore.newDashboard(nameToUse, selectedConnection.value)

        // Apply the selected import if one was chosen. When the user goes through
        // the agent path, they can leave this blank and let the assistant pick.
        if (selectedImport.value) {
          const importToUse = availableImports.value.find((imp) => imp.id === selectedImport.value)
          if (importToUse) {
            dashboardStore.updateDashboardImports(dashboard.id, [importToUse])
          }
        }

        // If the user supplied an AI prompt, queue it for the chat panel
        // before navigating so the Dashboard view picks it up on mount and
        // auto-opens the chat with the prompt prepopulated.
        const queuedPrompt = showPromptField.value ? dashboardPrompt.value.trim() : ''
        if (queuedPrompt) {
          dashboardStore.setPendingChatPrompt(dashboard.id, queuedPrompt)
        }

        // Reset form
        dashboardName.value = ''
        selectedImport.value = ''
        dashboardPrompt.value = ''

        saveDashboards()

        // Close creator
        emit('close')

        // Navigate to the new dashboard. Prefer the screen-navigation hook
        // (opens a tab) and fall back to the store setter for environments
        // where navigation isn't injected.
        if (setActiveDashboardNav) {
          setActiveDashboardNav(dashboard.id)
        } else {
          dashboardStore.setActiveDashboard(dashboard.id)
        }
        console.log('New dashboard created:', dashboard.id)
        emit('dashboard-created', dashboard.id)
      } catch (error) {
        console.error('Failed to create dashboard:', error)
        // Handle error (e.g., dashboard with name already exists)
        alert(`Error creating dashboard: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const cancel = () => {
      dashboardName.value = ''
      dashboardPrompt.value = ''
      selectedImport.value = ''
      emit('close')
    }

    return {
      dashboardName,
      selectedConnection,
      dashboardPrompt,
      showPromptField,
      canSubmit,
      namePlaceholder,
      connections,
      availableImports,
      selectedImport,
      createDashboard,
      cancel,
    }
  },
}
</script>

<style scoped>
.dashboard-creator {
  width: 90%;
  padding: 10px;
  margin-bottom: 10px;
  background-color: transparent;
  border: 1px solid var(--border);
}

.dashboard-creator h4 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--text-color);
}

.form-group {
  margin-bottom: 10px;
}

.form-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  font-size: 11px;
  color: var(--text-faint, var(--text-color));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-divider::before,
.form-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.optional-label {
  color: var(--text-faint, var(--text-color));
  font-weight: normal;
  font-size: 11px;
  text-transform: none;
  letter-spacing: normal;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--text-color);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 95%;
  padding: 6px;
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  color: var(--text-color);
  border-radius: 3px;
  font-size: 12px;
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-actions button {
  padding: 6px 12px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
}

.create-btn {
  background-color: var(--special-text);
  color: white;
}

.create-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.cancel-btn {
  background-color: var(--button-bg);
  color: var(--text-color);
}
</style>
