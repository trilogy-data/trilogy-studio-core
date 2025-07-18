<template>
  <div>
    <!-- Button to trigger popup -->
    <button
      class="quick-new-editor-button trilogy-class"
      @click.stop="openPopup"
      :data-testid="`create-datasource-${table.name}`"
      title="Create Datasource From Table"
    >
      <i class="mdi mdi-database-plus-outline"></i>
    </button>

    <!-- Popup Modal -->
    <div v-if="showPopup" class="popup-overlay" @click.self="closePopup">
      <div class="popup-content">
        <div class="popup-header">
          <h3>Create Datasource from {{ table.name }}</h3>
          <button class="close-button" @click="closePopup">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="popup-body">
          <!-- Main Content Grid -->
          <div class="content-grid">
            <!-- Left Column -->
            <div class="left-column">
              <!-- Column Configuration -->
              <div class="form-section">
                <label class="section-label">Column Configuration</label>
                <div class="column-config-container">
                  <div 
                    v-for="column in table.columns" 
                    :key="column.name"
                    class="column-config-item"
                  >
                    <div class="column-row">
                      <div class="column-info">
                                                                      <span class="pk-label">Grain Key?</span>
                        <label class="checkbox-label">
          
                          <input
                            type="checkbox"
                            :value="column.name"
                            v-model="selectedGrainKeys"
                            @change="updateDatasourcePreview"
                          />

                          <span class="checkbox-text">{{ column.name }}</span>
                          <span class="column-type">({{ column.trilogyType }})</span>

                        </label>
                      </div>
                      <div class="column-description">
                        <input
                          type="text"
                          :value="columnDescriptions[column.name] || column.description || ''"
                          @input="updateColumnDescription(column.name, $event.target.value)"
                          placeholder="Enter description..."
                          class="description-input"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="selectedGrainKeys.length === 0" class="warning-text">
                  No grain keys. A placeholder will be used.
                </div>
                <div v-else> 
                    <span class="primary-key-badge">Grain Key: {{ selectedGrainKeys.join(', ') }}</span>
                    </div> 
              </div>

              <!-- Sample Data -->
              <div class="form-section">
                <label class="section-label">Sample Data</label>
                <div class="sample-data-container">
                  <div v-if="isLoading" class="loading-indicator">
                    <div class="spinner"></div>
                    <span>Loading sample data...</span>
                  </div>
                  <div v-else-if="error" class="error-text">
                    ⚠️ Error loading sample data: {{ error }}
                  </div>
                  <div v-else-if="sampleData && sampleData.data && sampleData.data.length > 0" class="data-table-wrapper">
                    <DataTable
                      :results="sampleData.data"
                      :headers="sampleData.headers"
                      :fitParent="true"
                    />
                    <div class="sample-info">
                      Showing {{ sampleData.data.length }} rows
                    </div>
                  </div>
                  <div v-else class="no-data-text">
                    No sample data available
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column - Datasource Preview -->
            <div class="right-column">
              <div class="form-section">
                <label class="section-label">Datasource Preview</label>
                <div class="code-preview">

          <code-block
            :content="datasourcePreview"
            language="preql"
          />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="popup-footer">
          <button class="cancel-button" @click="closePopup">Cancel</button>
          <button class="create-button" @click="createDatasource">Create Datasource</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import type { Connection, Table } from '../connections'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import { Results } from '../editors/results'
import DataTable from './DataTable.vue'
import CodeBlock from './CodeBlock.vue'

interface CreateDatasourcePopupProps {
  connection: Connection
  table: Table
}

const props = defineProps<CreateDatasourcePopupProps>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Injected dependencies
const editorStore = inject<EditorStoreType>('editorStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const saveEditors = inject<Function>('saveEditors')
const setActiveScreen = inject<Function>('setActiveScreen')
const setActiveEditor = inject<Function>('setActiveEditor')

if (!editorStore || !connectionStore || !saveEditors || !setActiveScreen || !setActiveEditor) {
  throw 'must inject editorStore, connectionStore and related functions to CreateDatasourcePopup'
}

// Reactive state
const showPopup = ref(false)
const selectedGrainKeys = ref<string[]>([])
const sampleData = ref<Results | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const columnDescriptions = ref<Record<string, string>>({})

// Initialize primary keys and descriptions from table columns
onMounted(() => {
  selectedGrainKeys.value = props.table.columns
    .filter(column => column.primary)
    .map(column => column.name)
  
  // Initialize column descriptions
  props.table.columns.forEach(column => {
    if (column.description) {
      columnDescriptions.value[column.name] = column.description
    }
  })
})

// Computed datasource preview
const datasourcePreview = computed(() => {
  const primaryKeyFields = selectedGrainKeys.value
  const keyPrefix = primaryKeyFields.length > 0 ? `${primaryKeyFields.join('.')}` : 'PLACEHOLDER'
  
  const propertyDeclarations = props.table.columns
    .map((column) => {
      const description = columnDescriptions.value[column.name] || column.description || ''
      const descriptionComment = description ? ` #${description}` : ''
      return selectedGrainKeys.value.includes(column.name)
        ? `key ${column.name} ${column.trilogyType};${descriptionComment}`
        : `property <${keyPrefix}>.${column.name} ${column.trilogyType};${descriptionComment}`
    })
    .join('\n')
  
  const columnDefinitions = props.table.columns
    .map((column) => `\t${column.name},`)
    .join('\n')

  const grainDeclaration = primaryKeyFields.length > 0 ? `grain (${primaryKeyFields.join(', ')})` : ''
  
  let address = props.table.name
  if (props.connection.type === 'bigquery-oauth') {
    address = `\`${props.table.database}.${props.table.schema}.${props.table.name}\``
  } else if (props.connection.type == 'snowflake') {
    address = `${props.table.database}.${props.table.schema}.${props.table.name}`
  }
  
  return `#auto-generated datasource from table/view ${props.table.name}\n\n${propertyDeclarations}\n\ndatasource ${props.table.name} (\n${columnDefinitions}\n)\n${grainDeclaration}\naddress ${address};`
})

// Methods
const openPopup = async () => {
  showPopup.value = true
  await loadSampleData()
}

const closePopup = () => {
  showPopup.value = false
  sampleData.value = null
  error.value = null
  emit('close')
}

const loadSampleData = async () => {
  // Skip if we already have data
  if (sampleData.value?.data?.length > 0) return

  isLoading.value = true
  error.value = null

  try {
    if (!connectionStore.connections[props.connection.name]) {
      throw new Error('Connection not found')
    }

    const result = await connectionStore.connections[props.connection.name].getTableSample(
      props.table.database,
      props.table.schema,
      props.table.name,
      50
    )

    sampleData.value = result || new Results(new Map(), [])
  } catch (err) {
    console.error('Error loading sample data:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load sample data'
  } finally {
    isLoading.value = false
  }
}

const updateColumnDescription = (columnName: string, description: string) => {
  columnDescriptions.value[columnName] = description
  updateDatasourcePreview()
}

const updateDatasourcePreview = () => {
  // Trigger reactivity for datasource preview
  // The computed property will automatically update
}

const createDatasource = async () => {
  try {
    const timestamp = Date.now()
    const editorName = `datasource-${props.table.name}-${timestamp}`
    
    const editor = editorStore.newEditor(
      editorName,
      'preql',
      props.connection.name,
      datasourcePreview.value
    )
    
    await saveEditors()
    setActiveEditor(editor.id)
    setActiveScreen('editors')
    
    closePopup()
  } catch (error) {
    console.error('Failed to create datasource:', error)
  }
}
</script>

<style scoped>
.quick-new-editor-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--sidebar-list-item-height);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.2s;
}

.quick-new-editor-button:hover {
  background-color: var(--hover-color);
}

.quick-new-editor-button i {
  font-size: 16px;
}

.trilogy-class {
  color: #cc6900;
}

.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.popup-content {
  background: var(--sidebar-bg);
  border: 1px solid var(--border);
  width: 95%;
  max-width: 1800px;
  max-height: 90vh;
  overflow-y: auto;
  color: var(--text-color);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.popup-header h3 {
  margin: 0;
  font-size: 18px;
}

.close-button {
  background: transparent;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  font-size: 20px;
  padding: 4px;
}

.close-button:hover {
  background-color: var(--hover-color);
}

.popup-body {
  padding: 16px;
}

.content-grid {
  display: grid;
  grid-template-columns: 70fr 30fr;
  gap: 24px;
  height: 100%;
}

.left-column {
  display: flex;
  flex-direction: column;
  max-width: 60vw;
}

.right-column {
  display: flex;
  flex-direction: column;
}



.section-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-color);
}

.primary-key-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
}

.warning-text {
  color: #ff9800;
  font-size: 12px;
  margin-top: 8px;
}

.column-config-container {
  border: 1px solid var(--border);
  background: var(--query-window-bg);
  max-height: 400px;
  overflow-y: auto;
}

.column-config-item {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.column-config-item:last-child {
  border-bottom: none;
}

.column-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.column-info {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  flex: 1;
}

.checkbox-label input[type="checkbox"] {
  margin-right: 8px;
}

.checkbox-text {
  font-weight: 500;
  margin-right: 8px;
}

.column-type {
  color: var(--text-muted);
  font-size: 12px;
  margin-right: 8px;
}

.pk-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.column-name {
  font-weight: 500;
  font-size: 14px;
}

.primary-key-badge {
  background: #cc6900;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.column-description {
  width: 100%;
}

.description-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  background: var(--sidebar-bg);
  color: var(--text-color);
  font-size: 12px;
  border-radius: 4px;
}

.description-input:focus {
  outline: none;
  border-color: #cc6900;
}

.sample-data-container {
  border: 1px solid var(--border);
  background: var(--query-window-bg);
  min-height: 50%;
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  padding: 2rem;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--border);
  border-top: 3px solid #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-text {
  color: #f44336;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.data-table-wrapper {
  border: 1px solid var(--border);
  border-radius: 4px;
  height: 250px;
  width: 100%;
}

.sample-info {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--sidebar-bg);
  border-top: 1px solid var(--border);
  text-align: center;
}

.no-data-text {
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: 2rem;
}

.code-preview {
  border: 1px solid var(--border);
  background: var(--query-window-bg);
  padding: 12px;
  overflow-x: auto;
  max-height: 85%;
}

.code-preview pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border);
}

.cancel-button,
.create-button {
  padding: 8px 16px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 14px;
}

.cancel-button {
  background: transparent;
  color: var(--text-color);
}

.cancel-button:hover {
  background-color: var(--hover-color);
}

.create-button {
  background-color: #cc6900;
  color: white;
}

.create-button:hover {
  background-color: #b85c00;
}

/* Responsive adjustments */
@media (max-width: 1400px) {
  .content-grid {
    grid-template-columns: 1fr;
    width: 100%;
  }
  
  .code-preview {
    height: 300px;
  }

  .left-column {
    max-width: 87vw;
  }

  .popup-content {
    width: 100%;
  }
}
</style>