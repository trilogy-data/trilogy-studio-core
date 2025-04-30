<template>
  <div v-if="visible" class="dashboard-creator">
    <h4>Create New Dashboard</h4>
    <div class="form-group">
      <label for="dashboard-name">Name</label>
      <input id="dashboard-name" v-model="dashboardName" type="text" placeholder="My Dashboard"
        @keyup.enter="createDashboard"
        :data-testid="testTag ? `dashboard-creator-name-${testTag}` : 'dashboard-creator-name'" />
    </div>
    <div class="form-group">
      <label for="dashboard-connection">Connection</label>
      <select id="dashboard-connection" v-model="selectedConnection" :data-testid="testTag ? `dashboard-creator-connection-${testTag}` : 'dashboard-creator-connection'
        ">
        <option v-for="conn in connections" :key="conn.name" :value="conn.name">
          {{ conn.name }}
        </option>
      </select>
    </div>
    <!-- Added prompt input field based on TODO -->
    <div v-if="showPromptField" class="form-group">
      <label for="dashboard-prompt">Dashboard Prompt</label>
      <textarea 
        id="dashboard-prompt" 
        v-model="dashboardPrompt" 
        placeholder="Describe what you want to analyze..."
        rows="3"
        :data-testid="testTag ? `dashboard-creator-prompt-${testTag}` : 'dashboard-creator-prompt'"
      ></textarea>
    </div>
    <div class="form-actions">
      <button @click="createDashboard" :disabled="!dashboardName || !selectedConnection"
        :data-testid="testTag ? `dashboard-creator-submit-${testTag}` : 'dashboard-creator-submit'" class="create-btn">
        Create
      </button>
      <button @click="cancel"
        :data-testid="testTag ? `dashboard-creator-cancel-${testTag}` : 'dashboard-creator-cancel'" class="cancel-btn">
        Cancel
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import type { DashboardStoreType } from '../stores/dashboardStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import QueryExecutionService from '../stores/queryExecutionService'


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
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')

    if (!dashboardStore || !connectionStore || !llmStore) {
      throw new Error('Dashboard or connection store is not provided!')
    }

    const dashboardName = ref('')
    const selectedConnection = ref('')
    const dashboardPrompt = ref('')
    
    // Show prompt field only if there's an active default LLM connection
    const showPromptField = computed(() => {
      return llmStore.hasActiveDefaultConnection
    })

    const connections = computed(() => {
      return Object.values(connectionStore.connections).filter((conn) => conn.model)
    })

    // Set default connection when connections are available
    if (connections.value.length > 0 && !selectedConnection.value) {
      selectedConnection.value = connections.value[0].name
    }

    const createDashboard = async () => {
      if (!dashboardName.value || !selectedConnection.value) return

      try {
        // Create new dashboard
        const dashboard = dashboardStore.newDashboard(dashboardName.value, selectedConnection.value)
        dashboardStore.updateDashboardImports(dashboard.id, [{
          name: 'lineitem',
          alias: ''
        }])
        
        // Reset form
        dashboardName.value = ''

        // Close creator
        emit('close')
        
        // Select the new dashboard
        dashboardStore.setActiveDashboard(dashboard.id)
        
        // Process prompt if it's provided and LLM connection exists
        if (showPromptField.value && dashboardPrompt.value.trim()) {
          // Use the actual prompt from the form instead of hardcoded value
          const promptSpec = await dashboardStore.generatePromptSpec(dashboardPrompt.value, llmStore)
          console.log('Prompt spec generated:', promptSpec)
          
          if (promptSpec) {
            dashboardStore.populateFromPromptSpec(
              dashboard.id, 
              promptSpec, 
              llmStore, 
              queryExecutionService
            )
          }
        }
        
        emit('dashboard-selected', dashboard.id)
      } catch (error) {
        console.error('Failed to create dashboard:', error)
        // Handle error (e.g., dashboard with name already exists)
        alert(`Error creating dashboard: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const cancel = () => {
      dashboardName.value = ''
      dashboardPrompt.value = ''
      emit('close')
    }

    return {
      dashboardName,
      selectedConnection,
      dashboardPrompt,
      showPromptField,
      connections,
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