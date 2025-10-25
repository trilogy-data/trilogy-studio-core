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
      <div class="popup-content" data-testid="datasource-creation-modal">
        <div class="popup-header">
          <h3 data-testid="modal-title">Create Datasource from {{ table.name }}</h3>
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
                    v-for="column in tableColumns"
                    :key="`${column.name}-${componentKey}`"
                    class="column-config-item"
                    :data-testid="`column-config-${column.name}`"
                  >
                    <div class="column-row">
                      <div class="column-info">
                        <span class="pk-label">
                          <span>Grain Key?</span>
                          <label class="checkbox-label">
                            <input
                              type="checkbox"
                              :value="column.name"
                              v-model="selectedGrainKeys"
                              @change="updateDatasourcePreview"
                              :data-testid="`grain-key-checkbox-${column.name}`"
                            />
                          </label>
                        </span>
                        <div class="menu-title" @click="() => startEditing(column.name)">
                          Field:
                          <span
                            v-if="!isEditing[column.name]"
                            class="editable-text"
                            :data-testid="`edit-column-name-${column.name}`"
                          >
                            {{ columnAliases[column.name] }}
                            <span class="edit-indicator" data-testid="edit-editor-name">✎</span>
                          </span>
                          <input
                            v-else
                            ref="nameInput"
                            :data-testid="`column-name-input-${column.name}`"
                            v-model="columnAliases[column.name]"
                            @blur="() => stopEditing(column.name)"
                            @keyup.enter="() => stopEditing(column.name)"
                            @keyup.esc="() => cancelEditing(column.name)"
                            class="name-input"
                            type="text"
                          />
                        </div>
                        <span class="column-type">(bound to: {{ column.name }})</span>
                        <span class="column-type">({{ column.trilogyType }})</span>
                      </div>
                      <div class="column-description">
                        <input
                          type="text"
                          :value="columnDescriptions[column.name] || column.description || ''"
                          @input="
                            updateColumnDescription(
                              column.name,
                              ($event.target as HTMLInputElement)?.value,
                            )
                          "
                          placeholder="Enter description..."
                          class="description-input"
                          :data-testid="`description-input-${column.name}`"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-if="selectedGrainKeys.length === 0"
                  class="warning-text"
                  data-testid="no-grain-keys-warning"
                >
                  No grain keys selected. All columns inferred as keys.
                </div>
                <div v-else>
                  <span class="primary-key-badge" data-testid="grain-key-display"
                    >Grain Key: {{ selectedGrainKeys.join(', ') }}</span
                  >
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
                  <div
                    v-else-if="sampleData && sampleData.data && sampleData.data.length > 0"
                    class="data-table-wrapper"
                  >
                    <div class="data-table-wrapper-core">
                      <DataTable
                        :results="sampleData.data"
                        :headers="sampleData.headers"
                        :fitParent="true"
                        data-testid="sample-data-table"
                      />
                    </div>
                    <div class="sample-info" data-testid="sample-data-info">
                      Showing {{ sampleData.data.length }} rows
                    </div>
                  </div>
                  <div v-else class="no-data-text">No sample data available</div>
                </div>
              </div>
            </div>

            <!-- Right Column - Datasource Preview -->
            <div class="right-column">
              <div class="form-section">
                <label class="section-label">Datasource Preview</label>
                <div class="code-preview" data-testid="datasource-preview">
                  <code-block :content="datasourcePreview" language="trilogy" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="popup-footer">
          <button class="cancel-button" @click="closePopup" data-testid="cancel-datasource-button">
            Cancel
          </button>
          <button
            class="create-button"
            @click="createDatasource"
            data-testid="create-datasource-button"
          >
            Create Datasource
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, inject } from 'vue'
import type { Connection, Table } from '../../connections'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import { Results } from '../../editors/results'
import DataTable from '../DataTable.vue'
import CodeBlock from '../CodeBlock.vue'

export interface CreateDatasourcePopupProps {
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
const columnAliases = ref<Record<string, string>>({})
const isEditing = ref<Record<string, boolean>>({})
const componentKey = ref(0) // Force re-render key
const originalColumnAliases = ref<Record<string, string>>({}) // Store original values for canceling

// Reactive computed for table columns to ensure proper reactivity
const tableColumns = computed(() => props.table?.columns || [])

// Initialize data when table changes
const initializeColumnData = async () => {
  console.log('Initializing column data for table:', props.table.name)
  if (props.table?.columns.length === 0) {
    console.log('No columns found for table:', props.table.name)
    console.log('Forcing refresh')
    await connectionStore.connections[props.connection.name].refreshColumns(
      props.table.database,
      props.table.schema,
      props.table.name,
    )
  }

  // Clear existing data
  selectedGrainKeys.value = []
  columnDescriptions.value = {}
  columnAliases.value = {}
  originalColumnAliases.value = {}
  isEditing.value = {}

  // Initialize with fresh data
  props.table.columns.forEach((column) => {
    // Set primary keys
    if (column.primary) {
      selectedGrainKeys.value.push(column.name)
    }

    // Initialize column data
    columnAliases.value[column.name] = column.name
    originalColumnAliases.value[column.name] = column.name
    isEditing.value[column.name] = false

    if (column.description) {
      columnDescriptions.value[column.name] = column.description
    }
  })

  // Force component update
  componentKey.value++
}

// Watch for table prop changes to reinitialize
watch(
  () => props.table,
  () => {
    showPopup.value === true ? initializeColumnData : () => {}
  },
  { immediate: true, deep: true },
)

// Computed datasource preview
const datasourcePreview = computed(() => {
  if (!tableColumns.value.length) return ''

  let primaryKeyInputs = selectedGrainKeys.value
  if (selectedGrainKeys.value.length === 0) {
    primaryKeyInputs = tableColumns.value.map((x) => x.name)
  }
  const primaryKeyFields = primaryKeyInputs.map((x) => columnAliases.value[x] || x)
  const keyPrefix = primaryKeyFields.length > 0 ? `${primaryKeyFields.join(',')}` : 'PLACEHOLDER'

  const propertyDeclarations = tableColumns.value
    .map((column) => {
      const description = columnDescriptions.value[column.name] || column.description || ''
      const descriptionComment = description ? ` #${description}` : ''
      const alias = columnAliases.value[column.name] || column.name
      return primaryKeyFields.includes(alias)
        ? `key ${alias} ${column.trilogyType};${descriptionComment}`
        : `property <${keyPrefix}>.${alias} ${column.trilogyType};${descriptionComment}`
    })
    .join('\n')

  const columnDefinitions = tableColumns.value
    .map((column) => {
      const alias = columnAliases.value[column.name] || column.name
      return column.name !== alias ? `\t${column.name}:${alias},` : `\t${column.name},`
    })
    .join('\n')

  const grainDeclaration =
    primaryKeyFields.length > 0 ? `grain (${primaryKeyFields.join(', ')})` : ''

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
  await initializeColumnData()
  await loadSampleData()
  await nextTick()
  showPopup.value = true
}

const closePopup = () => {
  console.log('Closing popup and resetting state...')
  showPopup.value = false
  sampleData.value = null
  error.value = null
  // Reset all data
  selectedGrainKeys.value = []
  columnDescriptions.value = {}
  columnAliases.value = {}
  originalColumnAliases.value = {}
  isEditing.value = {}
  emit('close')
}

const loadSampleData = async () => {
  // Skip if we already have data
  if ((sampleData.value?.data?.length || 0) > 0) return

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
      50,
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
  console.log('Updating datasource preview...')
  componentKey.value++
}

const startEditing = (columnName: string) => {
  originalColumnAliases.value[columnName] = columnAliases.value[columnName]
  isEditing.value[columnName] = true
}

const stopEditing = (columnName: string) => {
  isEditing.value[columnName] = false
  updateDatasourcePreview()
}

const cancelEditing = (columnName: string) => {
  columnAliases.value[columnName] = originalColumnAliases.value[columnName]
  isEditing.value[columnName] = false
}

const createDatasource = async () => {
  try {
    const editorName = `${props.table.name}`

    const editor = editorStore.newEditor(
      editorName,
      'preql',
      props.connection.name,
      datasourcePreview.value,
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

.form-section {
  height: 100%;
  /* overflow-y: auto; */
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
  z-index: 100;
  cursor: default;
}

.popup-content {
  background: var(--sidebar-bg);
  border: 1px solid var(--border);
  width: 95%;
  max-width: 90vw;
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
  color: var(--text-color);
  padding-bottom: 4px;
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

.checkbox-label input[type='checkbox'] {
  margin-right: 8px;
}

.checkbox-text {
  font-weight: 500;
  margin-right: 8px;
}

.column-type {
  color: var(--text-faint);
  font-size: 12px;
  margin-right: 8px;
}

.pk-label {
  font-size: 10px;
  color: var(--text-faint);
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
  border: 1px solid var(--border);
  background: var(--sidebar-bg);
  color: var(--text-color);
  font-size: 12px;
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
  width: 100%;
  height: 250px;
}

.data-table-wrapper-core {
  overflow: auto;
  height: 210px;
}

.sample-info {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--sidebar-bg);
  border-top: 1px solid var(--border);
  text-align: center;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  overflow-y: scroll;
  max-height: 50vh;
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

.menu-title {
  cursor: pointer;
}

.editable-text {
  border-bottom: 1px dashed var(--text-faint);
  cursor: pointer;
}

.edit-indicator {
  margin-left: 4px;
  opacity: 0.6;
  font-size: 10px;
}

.name-input {
  border: 1px solid var(--border);
  background: var(--sidebar-bg);
  color: var(--text-color);
  font-size: 12px;
  padding: 2px 4px;
}

.name-input:focus {
  outline: none;
  border-color: #cc6900;
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
