<template>
    <div v-if="visible" class="dashboard-creator">
      <h4>Create New Dashboard</h4>
      <div class="form-group">
        <label for="dashboard-name">Name</label>
        <input
          id="dashboard-name"
          v-model="dashboardName"
          type="text"
          placeholder="My Dashboard"
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
      <div class="form-actions">
        <button
          @click="createDashboard"
          :disabled="!dashboardName || !selectedConnection"
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
  import { ref, computed, inject } from 'vue'
  import type { DashboardStoreType } from '../stores/dashboardStore'
  import type { ConnectionStoreType } from '../stores/connectionStore'
  
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
    setup(props: { visible: boolean; testTag: string }, { emit }: any) {
      const dashboardStore = inject<DashboardStoreType>('dashboardStore')
      const connectionStore = inject<ConnectionStoreType>('connectionStore')
  
      if (!dashboardStore || !connectionStore) {
        throw new Error('Dashboard or connection store is not provided!')
      }
  
      const dashboardName = ref('')
      const selectedConnection = ref('')
  
      const connections = computed(() => {
        return Object.values(connectionStore.connections)
      })
  
      // Set default connection when connections are available
      if (connections.value.length > 0 && !selectedConnection.value) {
        selectedConnection.value = connections.value[0].name
      }
  
      const createDashboard = () => {
        if (!dashboardName.value || !selectedConnection.value) return
  
        try {
          // Create new dashboard
          const dashboard = dashboardStore.newDashboard(dashboardName.value, selectedConnection.value)
          
          // Reset form
          dashboardName.value = ''
          
          // Close creator
          emit('close')
          
          // Select the new dashboard
          dashboardStore.setActiveDashboard(dashboard.id)
          emit('dashboard-selected', dashboard.id)
        } catch (error) {
          console.error('Failed to create dashboard:', error)
          // Handle error (e.g., dashboard with name already exists)
          alert(`Error creating dashboard: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
  
      const cancel = () => {
        dashboardName.value = ''
        emit('close')
      }
  
      return {
        dashboardName,
        selectedConnection,
        connections,
        createDashboard,
        cancel,
      }
    },
  }
  </script>
  
  <style scoped>
  .dashboard-creator {
    width: 100%;
    padding: 10px;
    margin-bottom: 10px;
    background-color: var(--sidebar-selector-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
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
  .form-group select {
    width: 100%;
    padding: 6px;
    background-color: var(--bg-color);
    border: 1px solid var(--border);
    color: var(--text-color);
    border-radius: 3px;
    font-size: 12px;
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