<script lang="ts" setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardChart from './DashboardChart.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'
import DashboardHeader from './DashboardHeader.vue'
import { useDashboardStore } from '../stores/dashboardStore'
import { type LayoutItem, type GridItemData, type CellType, CELL_TYPES } from '../dashboards/base'
// import useModelStore from '../stores/modelStore'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import type { Layout } from 'vue3-grid-layout-next/dist/helpers/utils'
import { type Import } from '../stores/resolver'
// Props definition
const props = defineProps<{
  name: string
  connectionId?: string
}>()

// Initialize the dashboard store
const dashboardStore = useDashboardStore()
// const modelStore = useModelStore()

// the modelStore has a list of sources.

// Add filter state and debouncing
const filter = ref('')
const filterInput = ref('')
const debounceTimeout = ref<number | null>(null)

// Mode Toggle (edit/view)
const editMode = ref(false)
const toggleEditMode = () => {
  editMode.value = !editMode.value
  // Update all items to be non-draggable and non-resizable in view mode
  draggable.value = editMode.value
  resizable.value = editMode.value

  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    triggerResize()
  })
}

// Draggable and resizable states
const draggable = ref(true)
const resizable = ref(true)

// Track currently edited item
const editingItem = ref<LayoutItem | null>(null)
const showQueryEditor = ref(false)
const showMarkdownEditor = ref(false)

// Cell types are imported from the dashboard model

// Get the active dashboard
const dashboard = computed(() => {
  // Try to find the dashboard by name
  const dashboard = Object.values(dashboardStore.dashboards).find((d) => d.name === props.name)

  // If dashboard doesn't exist, try to create it with the provided connection
  if (!dashboard && props.connectionId) {
    try {
      return dashboardStore.newDashboard(props.name, props.connectionId)
    } catch (error) {
      console.error('Failed to create dashboard:', error)
      return null
    }
  }

  return dashboard
})

// Get the dashboard layout from the store
const layout = computed(() => {
  if (!dashboard.value) return []
  return dashboard.value.layout
})

// Get the selected connection from the dashboard
const selectedConnection = computed(() => {
  if (!dashboard.value) return ''

  return dashboard.value.connection
})

function handleFilterChange(newFilter: string) {
  if (dashboard.value && dashboard.value.id) {
    filter.value = newFilter
    dashboardStore.updateDashboardFilter(dashboard.value.id, newFilter)
  }
}

function handleImportChange(newImports: Import[]) {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.updateDashboardImports(dashboard.value.id, newImports)
  }
}

// Item title editing states
const editingItemTitle = ref<string | null>(null)
const editableItemName = ref('')

// Track layout changes
const onLayoutUpdated = (newLayout: Layout) => {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.updateDashboardLayout(dashboard.value.id, newLayout as LayoutItem[])

    // Trigger resize on layout changes
    nextTick(() => {
      triggerResize()
    })
  }
}

// Function to trigger resize on all grid items
function triggerResize(): void {
  if (!dashboard.value) return

  layout.value.forEach((item) => {
    updateItemDimensions(item.i)
  })
}

// Function to update dimensions for a specific grid item
function updateItemDimensions(itemId: string): void {
  if (!dashboard.value) return

  const container = document.querySelector(`.vue-grid-item[data-i="${itemId}"] .grid-item-content`)
  if (container) {
    const rect = container.getBoundingClientRect()

    // Account for the header height when calculating content height
    const headerHeight = 36 // Approximate height of the header

    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height - headerHeight)

    // Use the store to update item dimensions
    if (dashboard.value.id) {
      dashboardStore.updateItemDimensions(dashboard.value.id, itemId, width, height)
    }
  }
}

// Modal state for adding a new item
const showAddItemModal = ref(false)
const newItemType = ref<CellType>(CELL_TYPES.CHART)

// Add a new grid item with type
function openAddItemModal(): void {
  showAddItemModal.value = true
}

function addItem(type: CellType = CELL_TYPES.CHART): void {
  if (!dashboard.value || !dashboard.value.id) return

  // Use store to add item to dashboard
  const itemId = dashboardStore.addItemToDashboard(dashboard.value.id, type)

  showAddItemModal.value = false

  // Update dimensions after add
  nextTick(() => {
    updateItemDimensions(itemId)
  })
}

// Clear all grid items
function clearItems(): void {
  if (!dashboard.value || !dashboard.value.id) return

  dashboardStore.clearDashboardItems(dashboard.value.id)
}

// Edit functions
function openEditor(item: LayoutItem): void {
  editingItem.value = item

  if (!dashboard.value || !dashboard.value.id) return

  const dashboardItems = dashboard.value.gridItems
  const itemData = dashboardItems[item.i]

  if (itemData) {
    if (itemData.type === CELL_TYPES.CHART) {
      showQueryEditor.value = true
    } else if (itemData.type === CELL_TYPES.MARKDOWN) {
      showMarkdownEditor.value = true
    }
  }
}

// Save content and close editor
function saveContent(content: string): void {
  if (!dashboard.value || !dashboard.value.id || !editingItem.value) return

  const itemId = editingItem.value.i

  // Use store to update item content
  dashboardStore.updateItemContent(dashboard.value.id, itemId, content)

  closeEditors()
}

// Close all editors
function closeEditors(): void {
  showQueryEditor.value = false
  showMarkdownEditor.value = false
  editingItem.value = null
}

// Get item data from the dashboard
function getItemData(itemId: string): GridItemData {
  if (!dashboard.value) {
    return {
      type: CELL_TYPES.CHART,
      content: '',
      name: `Item ${itemId}`,
      width: 0,
      height: 0,
      imports: [],
    }
  }

  const item = dashboard.value.gridItems[itemId]

  if (!item) {
    return {
      type: CELL_TYPES.CHART,
      content: '',
      name: `Item ${itemId}`,
      width: 0,
      height: 0,
      imports: dashboard.value.imports,
    }
  }

  return {
    type: item.type,
    content: item.content,
    name: item.name,
    width: item.width || 0,
    height: item.height || 0,
    imports: dashboard.value.imports,
    chartConfig: item.chartConfig,
  }
}

// Use a wrapper function to set data via the store
function setItemData(itemId: string, data: any): void {
  if (!dashboard.value || !dashboard.value.id) return

  // Update specific properties through store actions
  if (data.name) {
    dashboardStore.updateItemName(dashboard.value.id, itemId, data.name)
  }

  if (data.chartConfig) {
    dashboardStore.updateItemChartConfig(dashboard.value.id, itemId, data.chartConfig)
  }

  if (data.content) {
    dashboardStore.updateItemContent(dashboard.value.id, itemId, data.content)
  }

  if (data.width && data.height) {
    dashboardStore.updateItemDimensions(dashboard.value.id, itemId, data.width, data.height)
  }
}

// Handle connection change
function onConnectionChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  const connectionId = target.value

  if (dashboard.value && dashboard.value.id) {
    dashboardStore.updateDashboardConnection(dashboard.value.id, connectionId)
  }
}

// Close the add item modal
function closeAddModal(): void {
  showAddItemModal.value = false
}

// Start editing an item title
function startTitleEditing(itemId: string): void {
  if (!editMode.value) return // Only allow editing in edit mode

  const itemData = getItemData(itemId)
  editingItemTitle.value = itemId
  editableItemName.value = itemData.name

  // Focus on the input field after rendering
  setTimeout(() => {
    const input = document.getElementById(`title-input-${itemId}`)
    if (input) {
      input.focus()
    }
  }, 0)
}

// Save edited title
function saveTitleEdit(itemId: string): void {
  if (!dashboard.value || !dashboard.value.id) return

  if (editingItemTitle.value === itemId) {
    const itemData = getItemData(itemId)

    // Don't allow empty names
    const newName = editableItemName.value.trim() || itemData.name

    // Update item name via store
    dashboardStore.updateItemName(dashboard.value.id, itemId, newName)

    editingItemTitle.value = null
  }
}

// Cancel title editing
function cancelTitleEdit(): void {
  editingItemTitle.value = null
}

// Ensure dashboard is set as active when component mounts
onMounted(() => {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.setActiveDashboard(dashboard.value.id)

    // Initialize the filter from the dashboard if it exists
    if (dashboard.value.filter) {
      filter.value = dashboard.value.filter
      filterInput.value = dashboard.value.filter
    }
  }

  // Set up resize observer to track window resizing
  const resizeObserver = new ResizeObserver(() => {
    triggerResize()
  })

  // Observe the grid container
  const gridContainer = document.querySelector('.grid-container')
  if (gridContainer) {
    resizeObserver.observe(gridContainer)
  }
})

// Clean up timeout on component unmount or before destruction
onBeforeUnmount(() => {
  if (debounceTimeout.value !== null) {
    clearTimeout(debounceTimeout.value)
  }
})
</script>

<template>
  <div class="dashboard-container" v-if="dashboard">
    <DashboardHeader
      :dashboard="dashboard"
      :edit-mode="editMode"
      :selected-connection="selectedConnection"
      @connection-change="onConnectionChange"
      @filter-change="handleFilterChange"
      @import-change="handleImportChange"
      @add-item="openAddItemModal"
      @clear-items="clearItems"
      @toggle-edit-mode="toggleEditMode"
    />

    <div class="grid-container">
      <GridLayout
        :col-num="12"
        :row-height="30"
        :is-draggable="draggable"
        :is-resizable="resizable"
        :layout="layout"
        :vertical-compact="true"
        :use-css-transforms="true"
        @layout-updated="onLayoutUpdated"
      >
        <grid-item
          v-for="item in layout"
          :key="item.i"
          :static="item.static"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :i="item.i"
          :data-i="item.i"
          drag-ignore-from=".no-drag"
          drag-handle-class=".grid-item-drag-handle"
        >
          <div class="grid-item-content">
            <div class="grid-item-header" v-if="editMode">
              <!-- Drag handle icon -->
              <div class="drag-handle-icon grid-item-drag-handle">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </div>

              <!-- Editable item title -->
              <div class="item-title-container">
                <!-- Display title (clickable) -->
                <div
                  v-if="editingItemTitle !== item.i"
                  class="item-title editable-title"
                  @click="startTitleEditing(item.i)"
                >
                  {{ getItemData(item.i).name }}
                  <span class="edit-indicator">✎</span>
                </div>

                <!-- Edit title input -->
                <input
                  v-else
                  :id="`title-input-${item.i}`"
                  v-model="editableItemName"
                  @blur="saveTitleEdit(item.i)"
                  @keyup.enter="saveTitleEdit(item.i)"
                  @keyup.esc="cancelTitleEdit"
                  class="title-input"
                  type="text"
                  :placeholder="
                    getItemData(item.i).type === CELL_TYPES.CHART ? 'Chart Name' : 'Note Name'
                  "
                />
              </div>
              <button @click="openEditor(item)" class="edit-button">Edit Content</button>
            </div>

            <!-- Non-edit mode title display -->
            <div class="view-mode-header" v-if="!editMode">
              <div class="item-title">{{ getItemData(item.i).name }}</div>
            </div>

            <!-- Render the appropriate component based on cell type, passing the filter as a prop -->
            <component
              :is="
                getItemData(item.i).type === CELL_TYPES.CHART ? DashboardChart : DashboardMarkdown
              "
              :itemId="item.i"
              :setItemData="setItemData"
              :getItemData="getItemData"
              :editMode="editMode"
              :filter="filter"
            />
          </div>
        </grid-item>
      </GridLayout>
    </div>

    <!-- Add Item Modal -->
    <Teleport to="body" v-if="showAddItemModal">
      <div class="editor-overlay">
        <div class="add-item-modal">
          <h3>Add New Item</h3>
          <div class="item-type-selector">
            <label>
              <input type="radio" v-model="newItemType" :value="CELL_TYPES.CHART" />
              Chart
            </label>
            <label>
              <input type="radio" v-model="newItemType" :value="CELL_TYPES.MARKDOWN" />
              Markdown
            </label>
          </div>
          <div class="editor-actions">
            <button @click="addItem(newItemType)" class="add-button">Add</button>
            <button @click="closeAddModal" class="cancel-button">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Content Editors -->
    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ChartEditor
        :content="getItemData(editingItem.i).content"
        @save="saveContent"
        @cancel="closeEditors"
      />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <MarkdownEditor
        :content="getItemData(editingItem.i).content"
        @save="saveContent"
        @cancel="closeEditors"
      />
    </Teleport>
  </div>
  <div v-else class="dashboard-not-found">
    <h2>Dashboard Not Found</h2>
    <p>The dashboard "{{ name }}" could not be found or created.</p>
  </div>
</template>

<style>
.dashboard-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  font-size: var(--font-size);
  color: var(--text-color);
  background-color: var(--bg-color);
}

.dashboard-controls {
  display: flex;
  justify-content: space-between;
  padding: 15px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
}

/* New styles for the left controls container */
.dashboard-left-controls {
  display: flex;
  gap: 20px;
  align-items: center;
  flex: 1;
}

.connection-selector {
  display: flex;
  align-items: center;
}

.connection-selector label {
  margin-right: 10px;
  font-weight: bold;
  color: var(--text-color);
}

.connection-selector select {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  min-width: 200px;
  font-size: var(--font-size);
}

/* Updated filter container styles */
.filter-container {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 500px;
}

.filter-container label {
  margin-right: 10px;
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
}

.filter-container input {
  padding: 8px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  width: 100%;
  font-size: var(--font-size);
}

.filter-container input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.grid-actions {
  display: flex;
  gap: 10px;
}

.grid-actions button {
  padding: 8px 16px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  font-weight: 500;
  background-color: var(--button-bg);
  color: var(--text-color);
  font-size: var(--button-font-size);
}

.add-button {
  background-color: var(--special-text) !important;
  color: white !important;
}

.clear-button {
  background-color: var(--delete-color) !important;
  color: white !important;
}

.toggle-mode-button {
  background-color: var(--button-bg) !important;
  color: var(--text-color) !important;
}

.grid-container {
  flex: 1;
  overflow: auto;
  padding: 15px;
  background-color: var(--bg-color);
}

.vue-grid-layout {
  background: var(--bg-color);
  height: 100%;
}

.vue-grid-item:not(.vue-grid-placeholder) {
  background: var(--result-window-bg);
  border: 1px solid var(--border);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.vue-grid-item .resizing {
  opacity: 0.9;
}

.vue-grid-item .static {
  background: var(--sidebar-selector-bg);
}

.grid-item-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  color: var(--result-window-font);
}

.grid-item-header,
.view-mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  height: var(--chart-control-height);
}

/* Make sure non-drag-handle content doesn't trigger dragging */
.grid-item-content *:not(.grid-item-drag-handle) {
  touch-action: auto !important;
}

.item-title-container {
  flex: 1;
  min-width: 0;
  /* Allows flex child to shrink below min-content width */
}

.item-title {
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editable-title {
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editable-title:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.edit-indicator {
  font-size: 12px;
  margin-left: 8px;
  opacity: 0.6;
  display: none;
}

.editable-title:hover .edit-indicator {
  display: inline;
}

.title-input {
  width: 100%;
  padding: 4px;
  font-size: var(--font-size);
  font-weight: bold;
  border: 1px solid var(--special-text);
  outline: none;
  background-color: var(--sidebar-selector-bg);
  color: var(--text-color);
}

.edit-button {
  padding: 4px 8px;
  background-color: var(--special-text);
  color: white;
  border: none;
  cursor: pointer;
  font-size: var(--small-font-size);
  margin-left: 8px;
}

.grid-item-drag-handle {
  cursor: move !important;
  /* Show move cursor */
}

.drag-handle-icon {
  display: flex;
  align-items: center;
  margin-right: 10px;
  color: var(--text-color);
  opacity: 0.5;
}

.grid-item-header:hover .drag-handle-icon {
  opacity: 0.8;
}

/* Query Editor Overlay */
.editor-overlay {
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

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.editor-actions button {
  padding: 8px 16px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: var(--button-font-size);
}

.add-button,
.editor-actions button:first-child {
  background-color: var(--special-text);
  color: white;
}

.clear-button,
.cancel-button,
.editor-actions button:last-child {
  background-color: var(--delete-color);
  color: white;
}

/* Add Item Modal */
.add-item-modal {
  max-width: 500px;
}

.item-type-selector {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.item-type-selector label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-color);
}

.item-type-selector input[type='radio'] {
  accent-color: var(--special-text);
}

/* Dashboard not found state */
.dashboard-not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  color: var(--text-color);
  background-color: var(--bg-color);
  padding: 2rem;
  text-align: center;
}

.dashboard-not-found h2 {
  margin-bottom: 1rem;
}
</style>
