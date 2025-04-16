<script setup lang="ts">
import { ref, inject } from 'vue'
import { type DashboardStoreType } from '../stores/dashboardStore'
import { type ConnectionStoreType } from '../stores/connectionStore'
import { DashboardModel } from '../dashboards'

//@ts-ignore
const props = defineProps<{
  isOpen: boolean
}>()

// @ts-ignore
const _ = props
const emit = defineEmits<{
  close: []
}>()
const dashboardStore = inject<DashboardStoreType>('dashboardStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const saveDashboards = inject<Function>('saveDashboards')
if (!dashboardStore || !connectionStore || !saveDashboards) {
  throw new Error('DashboardStore or ConnectionStore not provided')
}

// Add dashboard content ref for the textarea
const dashboardJson = ref<string>('')
const selectedConnection = ref<string>('')
const jsonError = ref<string | null>(null)
const isLoading = ref<boolean>(false)

// Add URL input
const dashboardUrl = ref<string>('')
const importMode = ref<'paste' | 'url'>('paste')
const urlError = ref<string | null>(null)

// Function to fetch dashboard from URL
const fetchDashboardFromUrl = async () => {
  if (!dashboardUrl.value) {
    urlError.value = 'Please enter a URL'
    setTimeout(() => {
      urlError.value = null
    }, 3000)
    return
  }

  isLoading.value = true
  urlError.value = null

  try {
    const response = await fetch(dashboardUrl.value)
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }
    const data = await response.text()
    dashboardJson.value = data
    isLoading.value = false
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    urlError.value = `Failed to fetch from URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    isLoading.value = false
    setTimeout(() => {
      urlError.value = null
    }, 5000)
  }
}

const importDashboard = () => {
  try {
    // Parse string to object
    const dashboardObj = DashboardModel.fromSerialized(JSON.parse(dashboardJson.value))

    // Set storage to "local"
    dashboardObj.storage = 'local'

    // Set connection to the selected connection
    dashboardObj.connection = selectedConnection.value

    // Set id to a random string
    dashboardObj.id = Math.random().toString(36).substring(2, 15)

    // Add it to dashboard store
    dashboardStore.addDashboard(dashboardObj)

    // Show success message
    importSuccess.value = true

    // Reset form
    dashboardJson.value = ''
    dashboardUrl.value = ''

    saveDashboards()

    // Close popup after a short delay
    setTimeout(() => {
      importSuccess.value = false
      emit('close')
    }, 1500)
  } catch (e) {
    jsonError.value = 'Invalid JSON format'
    setTimeout(() => {
      jsonError.value = null
    }, 3000)
  }
}

// Handle copy functionality
const importSuccess = ref<boolean>(false)

// Handle click outside to close popup
const popupContent = ref<HTMLElement | null>(null)
const handleClickOutside = (event: MouseEvent): void => {
  if (popupContent.value && !popupContent.value.contains(event.target as Node)) {
    emit('close')
  }
}
</script>
<template>
  <div v-if="isOpen" class="popup-overlay" @click="handleClickOutside">
    <div class="popup-content" ref="popupContent" data-testid="dashboard-import-popup">
      <div class="popup-header">
        <h3>Import Dashboard</h3>
        <button @click="emit('close')" class="close-button" data-testid="close-popup-button">
          ✕
        </button>
      </div>

      <div class="popup-body">
        <!-- Import mode selector -->
        <div class="import-mode-selector">
          <button
            :class="['mode-button', { active: importMode === 'paste' }]"
            @click="importMode = 'paste'"
            data-testid="paste-mode-button"
          >
            Paste JSON
          </button>
          <button
            :class="['mode-button', { active: importMode === 'url' }]"
            @click="importMode = 'url'"
            data-testid="url-mode-button"
          >
            From URL
          </button>
        </div>

        <!-- Paste JSON input (shown when importMode is 'paste') -->
        <div v-if="importMode === 'paste'" class="input-group">
          <label for="dashboard-json">Paste Dashboard JSON</label>
          <textarea
            id="dashboard-json"
            v-model="dashboardJson"
            placeholder="Paste your dashboard JSON here"
            rows="16"
            class="dashboard-textarea"
            data-testid="dashboard-json-input"
          ></textarea>
          <div v-if="jsonError" class="error-message">{{ jsonError }}</div>
        </div>

        <!-- URL input (shown when importMode is 'url') -->
        <div v-if="importMode === 'url'" class="input-group">
          <label for="dashboard-url">Dashboard URL</label>
          <div class="url-input-container">
            <input
              type="text"
              id="dashboard-url"
              v-model="dashboardUrl"
              placeholder="https://example.com/dashboard.json"
              class="url-input"
              data-testid="dashboard-url-input"
            />
            <button
              @click="fetchDashboardFromUrl"
              class="fetch-button"
              :disabled="isLoading"
              data-testid="fetch-url-button"
            >
              {{ isLoading ? 'Loading...' : 'Fetch' }}
            </button>
          </div>
          <div v-if="urlError" class="error-message">{{ urlError }}</div>

          <!-- Preview fetched JSON -->
          <div v-if="dashboardJson && importMode === 'url'" class="preview-container">
            <label>Dashboard JSON Preview</label>
            <div class="json-preview">
              <pre>{{
                dashboardJson.length > 500 ? dashboardJson.substring(0, 500) + '...' : dashboardJson
              }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Implemented connection selector -->
      <div class="connection-selector">
        <label for="connection-select">Select Connection</label>
        <select
          id="connection-select"
          v-model="selectedConnection"
          class="connection-dropdown"
          data-testid="connection-select"
        >
          <option value="" disabled>-- Select Connection --</option>
          <option
            v-for="connection in connectionStore.connections"
            :key="connection.name"
            :value="connection.name"
          >
            {{ connection.name }}
          </option>
        </select>
      </div>

      <div class="popup-footer">
        <button
          @click="importDashboard"
          class="copy-button"
          data-testid="import-dashboard-button"
          :disabled="!dashboardJson || !selectedConnection || isLoading"
        >
          {{ importSuccess ? 'Imported!' : 'Import' }}
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.popup-content {
  background-color: var(--sidebar-bg);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid var(--border);
}

.popup-header h3 {
  margin: 0;
  color: var(--text-color);
}

.close-button {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-color);
}

.popup-body {
  padding: 15px;
  flex: 1;
  overflow: auto;
}

.json-container {
  background-color: var(--sidebar-selector-bg);
  padding: 10px;
  overflow: auto;
  max-height: 50vh;
}

.json-container pre {
  margin: 0;
  color: var(--sidebar-selector-font);
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
}

.popup-footer {
  padding: 15px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
}

.copy-button {
  background-color: var(--special-text);
  color: white;
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;
}

.copy-button:hover {
  opacity: 0.9;
}

.copy-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

/* Added styles for new elements */
.dashboard-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: monospace;
  padding: 10px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  resize: vertical;
}

.input-group {
  margin-bottom: 15px;
}

.input-group label {
  display: block;
  margin-bottom: 5px;
  color: var(--text-color);
  font-weight: 500;
}

.connection-selector {
  padding: 0 15px 15px 15px;
}

.connection-dropdown {
  width: 100%;
  padding: 8px;
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  border: 1px solid var(--border);
}

.error-message {
  color: #ff4d4f;
  margin-top: 5px;
  font-size: 14px;
}

/* New styles for URL input */
.import-mode-selector {
  display: flex;
  margin-bottom: 15px;
  border-bottom: 1px solid var(--border);
}

.mode-button {
  background: none;
  border: none;
  padding: 10px 15px;
  cursor: pointer;
  color: var(--text-color);
  border-bottom: 2px solid transparent;
  flex: 1;
}

.mode-button.active {
  border-bottom: 2px solid var(--special-text);
  font-weight: 500;
}

.url-input-container {
  display: flex;
  margin-bottom: 10px;
}

.url-input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
}

.fetch-button {
  background-color: var(--special-text);
  color: white;
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}

.fetch-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.preview-container {
  margin-top: 15px;
}

.json-preview {
  background-color: var(--sidebar-selector-bg);
  padding: 10px;
  border: 1px solid var(--border);
  max-height: 200px;
  overflow: auto;
}

.json-preview pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
  color: var(--sidebar-selector-font);
}

/* Media queries for responsiveness */
@media (max-width: 768px) {
  .popup-content {
    width: 95%;
  }

  .json-container {
    max-height: 40vh;
  }

  .json-preview {
    max-height: 150px;
  }
}

@media (max-width: 480px) {
  .popup-header {
    padding: 10px;
  }

  .popup-body {
    padding: 10px;
  }

  .popup-footer {
    padding: 10px;
  }

  .json-container {
    max-height: 30vh;
  }

  .connection-selector {
    padding: 0 10px 10px 10px;
  }

  .mode-button {
    padding: 8px;
    font-size: 14px;
  }

  .json-preview {
    max-height: 120px;
  }
}
</style>
