<script setup lang="ts">
import { ref, inject, onMounted, computed, onBeforeUnmount } from 'vue'
import { type DashboardStoreType } from '../../stores/dashboardStore'
import { type ConnectionStoreType, connectionTypes } from '../../stores/connectionStore'
import { type EditorStoreType } from '../../stores/editorStore'
import { type ModelConfigStoreType } from '../../stores/modelStore'
import { ModelImportService } from '../../models/helpers'
import useScreenNavigation from '../../stores/useScreenNavigation'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import trilogyIcon from '../../static/trilogy.png'

const emit = defineEmits<{
  importComplete: [dashboardId: string]
  fullScreen: [boolean]
}>()

const dashboardStore = inject<DashboardStoreType>('dashboardStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const editorStore = inject<EditorStoreType>('editorStore')
const modelStore = inject<ModelConfigStoreType>('modelStore')
const saveDashboards = inject<Function>('saveDashboards')
const saveAll = inject<Function>('saveAll')
const screenNavigation = useScreenNavigation()

if (
  !dashboardStore ||
  !connectionStore ||
  !editorStore ||
  !modelStore ||
  !saveDashboards ||
  !saveAll
) {
  throw new Error('Required stores not provided')
}

// Auto-import state
const isLoading = ref<boolean>(true)
const modelUrl = ref<string>('')
const dashboardName = ref<string>('')
const modelName = ref<string>('')
const connectionType = ref<string>('')
const error = ref<string | null>(null)
const importSuccess = ref<boolean>(false)
const importedDashboardId = ref<string>('')

// Loading timer state
const startTime = ref<number>(Date.now())
const elapsedTime = ref('0 ms')
let timeout: ReturnType<typeof setTimeout> | null = null

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
  duckdb: { fields: [], autoImport: true },
  motherduck: { fields: ['mdToken'], autoImport: false },
  bigquery: { fields: ['projectId'], autoImport: false },
  snowflake: { fields: ['username', 'account', 'sshPrivateKey'], autoImport: false },
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

const connectionName = computed(() => {
  const conn = connectionTypes.find((c) => c.value === connectionType.value)
  return conn ? conn.label : connectionType.value
})

// Timer functions
const getUpdateInterval = (_: number): number => {
  return 100
}

const updateElapsedTime = () => {
  const ms = Date.now() - startTime.value
  if (ms < 1000) {
    elapsedTime.value = `${ms} ms`
  } else if (ms < 60000) {
    const seconds = (ms / 1000).toFixed(1)
    elapsedTime.value = `${seconds} sec`
  } else {
    const minutes = Math.floor(ms / 60000)
    const remainingSeconds = ((ms % 60000) / 1000).toFixed(1)
    elapsedTime.value =
      remainingSeconds !== '0.0' ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`
  }
  
  // Only continue timer if still loading or importing
  if (isLoading.value || importSuccess.value) {
    const nextInterval = getUpdateInterval(ms)
    timeout = setTimeout(updateElapsedTime, nextInterval)
  }
}

const stopTimer = () => {
  if (timeout) {
    clearTimeout(timeout)
    timeout = null
  }
}

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

// Import model and dashboard
const performImport = async () => {
  try {
    if (!modelUrl.value || !dashboardName.value || !modelName.value) {
      throw new Error('Missing required import parameters')
    }
    
    // Reset timer for import process
    startTime.value = Date.now()
    isLoading.value = true
    if (timeout) clearTimeout(timeout)
    updateElapsedTime()
    
    emit('fullScreen', true)
    // Create new connection for non-DuckDB types
    let connectionName = `${modelName.value}-connection`
    const modelImportService = new ModelImportService(editorStore, modelStore, dashboardStore)
    if (!modelStore.models[modelName.value]) {
      modelStore.newModelConfig(modelName.value, true)
    }
    if (!connectionStore.connections[connectionName]) {
      connectionStore.newConnection(connectionName, connectionType.value, {
        mdToken: connectionOptions.value.mdToken,
        projectId: connectionOptions.value.projectId,
        username: connectionOptions.value.username,
        password: connectionOptions.value.password,
        account: connectionOptions.value.account,
        privateKey: connectionOptions.value.sshPrivateKey,
        model: modelName.value,
      })
    }

    // Initialize ModelImportService

    // Import model (this will also import any dashboards included in the model)
    let imports = await modelImportService.importModel(
      modelName.value,
      modelUrl.value,
      connectionName,
    )
    connectionStore.connections[connectionName].setModel(modelName.value)
    // Find the imported dashboard by name and connection

    let lookup = dashboardName.value
    let matched = imports?.dashboards.get(dashboardName.value)
    if (matched) {
      lookup = matched
    }
    const importedDashboard = Object.values(dashboardStore.dashboards).find(
      (dashboard) => dashboard.name === lookup && dashboard.connection === connectionName,
    )

    if (!importedDashboard) {
      // look by file name

      let connectionDashboards = Object.values(dashboardStore.dashboards)
        .filter((dashboard) => dashboard.connection === connectionName)
        .map((d) => d.name)
        .join(', ')
      throw new Error(
        `Dashboard "${dashboardName.value}" was not found in the imported model, have ${connectionDashboards}`,
      )
    }

    importedDashboardId.value = importedDashboard.id

    // Save changes
    await saveAll()

    // Show success
    isLoading.value = false
    importSuccess.value = true
    // Ensure connection is valid
    await connectionStore.resetConnection(connectionName)
    
    // Keep timer running for success state briefly
    if (timeout) clearTimeout(timeout)
    updateElapsedTime()
    
    // Stop timer after success message is shown
    setTimeout(() => {
      stopTimer()
    }, 2000)
    
    // Emit completion event with dashboard ID
    emit('importComplete', importedDashboard.id)

    // Auto-redirect after short delay
    setTimeout(() => {
      screenNavigation.setActiveModel(null)
      screenNavigation.setActiveDashboard(importedDashboard.id)
      screenNavigation.setActiveScreen('dashboard')
    }, 500)
  } catch (err) {
    console.error('Import failed:', err)
    error.value = err instanceof Error ? err.message : 'Import failed'
    isLoading.value = false
    stopTimer()
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
    // Start the timer
    startTime.value = Date.now()
    updateElapsedTime()
    
    // Get URL parameters
    const modelUrlParam = getDefaultValueFromHash('model', '')
    const dashboardNameParam = getDefaultValueFromHash('dashboard', '')
    const modelNameParam = getDefaultValueFromHash('modelName', '')
    const connectionParam = getDefaultValueFromHash('connection', '')

    if (!modelUrlParam || !dashboardNameParam || !modelNameParam || !connectionParam) {
      error.value = 'Missing required import parameters (model, dashboard, modelName, connection)'
      isLoading.value = false
      stopTimer()
      return
    }

    modelUrl.value = decodeURIComponent(modelUrlParam)
    dashboardName.value = decodeURIComponent(dashboardNameParam)
    modelName.value = decodeURIComponent(modelNameParam)
    connectionType.value = connectionParam

    // Validate connection type
    if (!connectionRequirements[connectionType.value as keyof typeof connectionRequirements]) {
      error.value = `Unsupported connection type: ${connectionType.value}`
      isLoading.value = false
      stopTimer()
      return
    }

    // Auto-import if no fields required (DuckDB) - keep loading/timer running
    if (!requiresFields.value) {
      await autoImport()
    } else {
      // Stop loading for form input - user needs to provide data
      isLoading.value = false
      stopTimer()
      // Validate form for required fields
      validateForm()
    }
  } catch (err) {
    console.error('Auto-import initialization failed:', err)
    error.value = err instanceof Error ? err.message : 'Failed to initialize import'
    isLoading.value = false
    stopTimer()
  }
})

onBeforeUnmount(() => {
  stopTimer()
})

// Manual import for connections requiring fields
const handleManualImport = async () => {
  if (!isFormValid.value) return
  await performImport()
}

// Fallback to manual import
const switchToManualImport = () => {
  screenNavigation.setActiveDashboard(null)
  screenNavigation.setActiveScreen('dashboard')
  // Could emit event to show manual import modal
}
</script>

<template>
  <div class="auto-import-container">
    <!-- Loading State (with spinning trilogy logo and timer) -->
    <div v-if="isLoading" class="import-state loading-state">
      <div class="loading-content">
        <img :src="trilogyIcon" class="trilogy-icon spinning" alt="Loading" />
        <h2 class ="import-headline">Importing your dashboard...</h2>
        <!-- <div class="import-details">
          <p><strong>Dashboard:</strong> {{ dashboardName }}</p>
          <p class="import-source"><strong>From:</strong> {{ modelUrl }}</p>
        </div> -->
                <p class="import-details">
          This may take a few seconds.
        </p>
      </div>
    </div>

    <!-- Success State (with spinning trilogy logo briefly) -->
    <div v-else-if="importSuccess" class="import-state success-state">
      <div class="success-content">
        <img :src="trilogyIcon" class="trilogy-icon spinning" alt="Success" />
        <!-- <div class="success-icon">✅</div> -->
        <h2 class ="import-headline">Preparing your dashboard...</h2>
        <p class="import-details">
          This may take a few seconds.
        </p>
        <!-- <p class="redirect-message">Initiating {{ connectionName }} connection, then redirecting to dashboard... Please wait while we reticulate the splines.</p> -->
        <!-- <div class="loading-timer">({{ elapsedTime }})</div> -->
      </div>
    </div>

    <!-- Error State (no spinning logo) -->
    <div v-else-if="error" class="import-state error-state">
      <div class="error-icon">⚠️</div>
      <h2 class ="import-headline">Dashboard Load Failed</h2>
      <p class="error-message">{{ error }}</p>
      <div class="error-actions">
        <button @click="switchToManualImport" class="manual-import-button">
          Try Manual Import
        </button>
      </div>
    </div>

    <!-- Connection Setup Required (no spinning logo - user input needed) -->
    <div v-else-if="requiresFields" class="import-form">
      <div class="import-header">
        <h2 class ="import-headline">Import Model & Dashboard</h2>
        <div class="import-details">
          <p><strong>Model:</strong> {{ modelName }}</p>
          <p><strong>Dashboard:</strong> {{ dashboardName }}</p>
          <p class="import-source"><strong>From:</strong> {{ modelUrl }}</p>
        </div>
      </div>

      <div class="connection-setup">
        <h3>
          {{ connectionName }} Connection Setup
        </h3>
        <p class="setup-description">
          This model requires a {{ connectionType }} connection. Please provide the required
          configuration:
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
        <button @click="handleManualImport" class="import-button" :disabled="!isFormValid">
          Import Model & Dashboard
        </button>
        <button @click="switchToManualImport" class="cancel-button">Cancel</button>
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


.import-form {
  max-width: 600px;
  padding: 30px;
  background-color: var(--sidebar-bg);
  /* box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); */
}

/* Trilogy icon styles */
.trilogy-icon {
  height: 60px;
  width: 60px;
}

.trilogy-icon.spinning {
  animation: spin 1.25s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Loading state specific styles */


.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.success-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.loading-timer {
  margin-top: 15px;
  font-size: 14px;
  color: var(--text-muted);
  font-style: italic;
}

.import-header {
  margin-bottom: 30px;
  margin-top: 30px;

  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
}

.import-header h2 {
  margin: 0 0 15px 0;
  color: var(--text-color);
  
}

.import-details {
  text-align: left;
  margin-top: 15px;
  color: var(--text-faint);
}

.import-details p {
  margin: 8px 0;
  
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

.import-headline {
  font-weight: 500;
  margin-top: 30px;

}

.connection-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
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
  cursor: pointer;
}

.manual-import-button {
  background-color: var(--special-text);
  color: white;
  border: none;
  padding: 12px 24px;
  cursor: pointer;
  font-weight: 500;
}

/* State-specific styling */
.import-state {
  text-align: center;
  max-width: 500px;
  padding: 40px;
  background-color: var(--editor-bg);
  border: 1px solid var(--border);
}

.error-state {
  border: 1px solid var(--border);
  border-left: 4px solid #ef4444;
  border-right: 4px solid #ef4444;
}

.success-state {
  border: 1px solid var(--border);
}

.error-icon,
.success-icon {
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

/* Responsive design */
@media (max-width: 768px) {
  .auto-import-container {
    padding: 10px;
  }

  .import-form,
  .import-state {
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