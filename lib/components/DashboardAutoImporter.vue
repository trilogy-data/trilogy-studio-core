<script setup lang="ts">
import { ref, inject, onMounted, computed } from 'vue'
import { type DashboardStoreType } from '../stores/dashboardStore'
import { type ConnectionStoreType } from '../stores/connectionStore'
import { DashboardModel } from '../dashboards'
import useScreenNavigation from '../stores/useScreenNavigation'
import { getDefaultValueFromHash } from '../stores/urlStore'

const emit = defineEmits<{
  importComplete: [dashboardId: string]
}>()

const dashboardStore = inject<DashboardStoreType>('dashboardStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const saveDashboards = inject<Function>('saveDashboards')
const saveAll = inject<Function>('saveAll')
const screenNavigation = useScreenNavigation()

if (!dashboardStore || !connectionStore || !saveDashboards || !saveAll) {
  throw new Error('Required stores not provided')
}

// Auto-import state
const isLoading = ref<boolean>(true)
const dashboardData = ref<any>(null)
const dashboardName = ref<string>('')
const importUrl = ref<string>('')
const connectionType = ref<string>('')
const error = ref<string | null>(null)
const importSuccess = ref<boolean>(false)

// Connection options for new connections
const connectionOptions = ref({
  mdToken: '',
  projectId: '',
  username: '',
  password: '',
  account: '',
  sshPrivateKey: '',
})

// Form validation
const isFormValid = ref(true)

// Connection requirements mapping
const connectionRequirements = {
  'duckdb': { fields: [], autoImport: true },
  'motherduck': { fields: ['mdToken'], autoImport: false },
  'bigquery': { fields: ['projectId'], autoImport: false },
  'snowflake': { fields: ['username', 'account', 'sshPrivateKey'], autoImport: false }
}

// Computed properties
const requiresFields = computed(() => {
  const req = connectionRequirements[connectionType.value as keyof typeof connectionRequirements]
  return req ? !req.autoImport : true
})

const requiredFields = computed(() => {
  const req = connectionRequirements[connectionType.value as keyof typeof connectionRequirements]
  return req ? req.fields : []
})

// Validation function
function validateForm() {
  if (!connectionType.value) {
    isFormValid.value = false
    return
  }

  const required = requiredFields.value
  for (const field of required) {
    if (!connectionOptions.value[field as keyof typeof connectionOptions.value]) {
      isFormValid.value = false
      return
    }
  }

  isFormValid.value = true
}

// Fetch dashboard from URL
const fetchDashboard = async (url: string) => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }
    const data = await response.text()
    const dashboardObj = JSON.parse(data)
    
    // Validate dashboard structure
    if (!dashboardObj.name) {
      throw new Error('Invalid dashboard: missing name')
    }
    
    dashboardData.value = dashboardObj
    dashboardName.value = dashboardObj.name
    return dashboardObj
  } catch (err) {
    console.error('Error fetching dashboard:', err)
    throw err
  }
}

// Import dashboard
const performImport = async () => {
  try {
    if (!dashboardData.value) {
      throw new Error('No dashboard data to import')
    }

    // Create dashboard object
    const dashboardObj = DashboardModel.fromSerialized(dashboardData.value)
    dashboardObj.storage = 'local'
    dashboardObj.id = Math.random().toString(36).substring(2, 15)

    // Handle connection creation/assignment
    let connectionName = connectionType.value

    if (connectionName !== 'duckdb') {
      // Create new connection for non-DuckDB types
      connectionName = `${dashboardObj.name}-connection`
      
      if (!connectionStore.connections[connectionName]) {
        connectionStore.newConnection(connectionName, connectionType.value, {
          mdToken: connectionOptions.value.mdToken,
          projectId: connectionOptions.value.projectId,
          username: connectionOptions.value.username,
          password: connectionOptions.value.password,
          account: connectionOptions.value.account,
          privateKey: connectionOptions.value.sshPrivateKey,
        })
      }
    }

    // Set connection
    dashboardObj.connection = connectionName

    // Add to dashboard store
    dashboardStore.addDashboard(dashboardObj)

    // Save changes
    await saveAll()

    // Show success
    importSuccess.value = true

    // Emit completion event with dashboard ID
    emit('importComplete', dashboardObj.id)

    // Auto-redirect after short delay
    setTimeout(() => {
      screenNavigation.setActiveDashboard(dashboardObj.id)
      screenNavigation.setActiveScreen('dashboard')
    }, 500)

  } catch (err) {
    console.error('Import failed:', err)
    error.value = err instanceof Error ? err.message : 'Import failed'
  }
}

// Auto-import for DuckDB (no fields required)
const autoImport = async () => {
  if (!requiresFields.value) {
    await performImport()
  }
}

// Initialize auto-import
onMounted(async () => {
  try {
    // Get URL parameters
    const importUrlParam = getDefaultValueFromHash('import', '')
    const connectionParam = getDefaultValueFromHash('connection', '')

    if (!importUrlParam || !connectionParam) {
      error.value = 'Missing required import parameters'
      isLoading.value = false
      return
    }

    importUrl.value = decodeURIComponent(importUrlParam)
    connectionType.value = connectionParam

    // Validate connection type
    if (!connectionRequirements[connectionType.value as keyof typeof connectionRequirements]) {
      error.value = `Unsupported connection type: ${connectionType.value}`
      isLoading.value = false
      return
    }

    // Fetch dashboard
    await fetchDashboard(importUrl.value)
    isLoading.value = false

    // Auto-import if no fields required (DuckDB)
    if (!requiresFields.value) {
      await autoImport()
    } else {
      // Validate form for required fields
      validateForm()
    }

  } catch (err) {
    console.error('Auto-import initialization failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load dashboard'
    isLoading.value = false
  }
})

// Manual import for connections requiring fields
const handleManualImport = async () => {
  if (!isFormValid.value) return
  await performImport()
}

// Fallback to manual import
const switchToManualImport = () => {
  screenNavigation.setActiveScreen('dashboard')
  // Could emit event to show manual import modal
}
</script>

<template>
  <div class="auto-import-container">
    <!-- Loading State -->
    <div v-if="isLoading" class="import-state">
      <div class="loading-spinner"></div>
      <h2>Importing Dashboard...</h2>
      <p>Fetching dashboard from: {{ importUrl }}</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="import-state error-state">
      <div class="error-icon">⚠️</div>
      <h2>Import Failed</h2>
      <p class="error-message">{{ error }}</p>
      <div class="error-actions">
        <button @click="switchToManualImport" class="manual-import-button">
          Try Manual Import
        </button>
      </div>
    </div>

    <!-- Success State -->
    <div v-else-if="importSuccess" class="import-state success-state">
      <div class="success-icon">✅</div>
      <h2>Import Successful!</h2>
      <p>Dashboard "{{ dashboardName }}" has been imported successfully.</p>
      <p class="redirect-message">Redirecting to dashboard...</p>
    </div>

    <!-- Connection Setup Required -->
    <div v-else-if="requiresFields" class="import-form">
      <div class="import-header">
        <h2>Import Dashboard: {{ dashboardName }}</h2>
        <p class="import-source">From: {{ importUrl }}</p>
      </div>

      <div class="connection-setup">
        <h3>{{ connectionType.charAt(0).toUpperCase() + connectionType.slice(1) }} Connection Setup</h3>
        <p class="setup-description">
          This dashboard requires a {{ connectionType }} connection. Please provide the necessary credentials:
        </p>

        <!-- MotherDuck Fields -->
        <div v-if="connectionType === 'motherduck'" class="form-group">
          <label for="md-token">MotherDuck Token</label>
          <input
            type="text"
            v-model.trim="connectionOptions.mdToken"
            id="md-token"
            placeholder="Enter your MotherDuck token"
            class="connection-input"
            @input="validateForm"
          />
        </div>

        <!-- BigQuery Fields -->
        <div v-if="connectionType === 'bigquery'" class="form-group">
          <label for="project-id">BigQuery Project ID</label>
          <input
            type="text"
            v-model.trim="connectionOptions.projectId"
            id="project-id"
            placeholder="Enter your billing project ID"
            class="connection-input"
            @input="validateForm"
          />
        </div>

        <!-- Snowflake Fields -->
        <template v-if="connectionType === 'snowflake'">
          <div class="form-group">
            <label for="snowflake-username">Username</label>
            <input
              type="text"
              v-model.trim="connectionOptions.username"
              id="snowflake-username"
              placeholder="Snowflake username"
              class="connection-input"
              @input="validateForm"
            />
          </div>
          <div class="form-group">
            <label for="snowflake-account">Account</label>
            <input
              type="text"
              v-model.trim="connectionOptions.account"
              id="snowflake-account"
              placeholder="Snowflake account identifier"
              class="connection-input"
              @input="validateForm"
            />
          </div>
          <div class="form-group">
            <label for="snowflake-key">Private Key</label>
            <input
              type="text"
              v-model.trim="connectionOptions.sshPrivateKey"
              id="snowflake-key"
              placeholder="Private key for authentication"
              class="connection-input"
              @input="validateForm"
            />
          </div>
        </template>
      </div>

      <div class="form-actions">
        <button
          @click="handleManualImport"
          class="import-button"
          :disabled="!isFormValid"
        >
          Import Dashboard
        </button>
        <button @click="switchToManualImport" class="cancel-button">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auto-import-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
  background-color: var(--bg-color);
}

.import-state {
  text-align: center;
  max-width: 500px;
  padding: 40px;
  background-color: var(--sidebar-bg);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.import-form {
  max-width: 600px;
  padding: 30px;
  background-color: var(--sidebar-bg);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.import-header {
  margin-bottom: 30px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
}

.import-header h2 {
  margin: 0 0 10px 0;
  color: var(--text-color);
}

.import-source {
  font-size: 14px;
  color: var(--text-muted);
  word-break: break-all;
}

.connection-setup h3 {
  margin: 0 0 15px 0;
  color: var(--text-color);
}

.setup-description {
  margin-bottom: 25px;
  color: var(--text-muted);
  line-height: 1.5;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-color);
}

.connection-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  font-size: 14px;
  box-sizing: border-box;
}

.connection-input:focus {
  outline: none;
  border-color: var(--special-text);
}

.form-actions {
  display: flex;
  gap: 15px;
  justify-content: flex-end;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.import-button {
  background-color: var(--special-text);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.import-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.cancel-button {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-color);
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
}

.manual-import-button {
  background-color: var(--special-text);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

/* State-specific styling */
.error-state {
  border-left: 4px solid #ef4444;
}

.success-state {
  border-left: 4px solid #10b981;
}

.error-icon, .success-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.error-message {
  color: #ef4444;
  margin-bottom: 20px;
}

.redirect-message {
  color: var(--text-muted);
  font-style: italic;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border);
  border-top: 4px solid var(--special-text);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Responsive design */
@media (max-width: 768px) {
  .auto-import-container {
    padding: 10px;
  }
  
  .import-form, .import-state {
    padding: 20px;
  }
  
  .form-actions {
    flex-direction: column;
  }
  
  .import-source {
    font-size: 12px;
  }
}
</style>