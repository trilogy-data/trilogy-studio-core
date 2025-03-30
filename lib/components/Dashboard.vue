<script lang="ts" setup>
import { ref, reactive, markRaw, h, computed, watch, onMounted, nextTick } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardChart from './DashboardChart.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'

// Define types
interface LayoutItem {
  x: number
  y: number
  w: number
  h: number
  i: string
  static: boolean
}

interface Connection {
  id: number
  name: string
}

interface GridItemData {
  type: string
  content: string
  name: string
  width?: number   // Added width field
  height?: number  // Added height field
}

// Mode Toggle (edit/view)
const editMode = ref(true)
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

// Start with an empty layout
const layout = ref<LayoutItem[]>([])

// Track the next item ID to ensure unique IDs
const nextId = ref(0)

// Track currently edited item
const editingItem = ref<LayoutItem | null>(null)
const showQueryEditor = ref(false)
const showMarkdownEditor = ref(false)

// Cell types
const CELL_TYPES = {
  CHART: 'chart',
  MARKDOWN: 'markdown',
} as const

type CellType = (typeof CELL_TYPES)[keyof typeof CELL_TYPES]

// Mock connections for dropdown
const connections = ref<Connection[]>([
  { id: 1, name: 'PostgreSQL Connection' },
  { id: 2, name: 'MySQL Connection' },
  { id: 3, name: 'MongoDB Connection' },
  { id: 4, name: 'REST API Connection' },
])

const selectedConnection = ref<Connection>(connections.value[0])

// Store for grid item content
const gridItems = reactive(new Map<string, GridItemData>())

// Modal state for adding a new item
const showAddItemModal = ref(false)
const newItemType = ref<CellType>(CELL_TYPES.CHART)

// Item title editing states
const editingItemTitle = ref<string | null>(null)
const editableItemName = ref('')

// Track layout changes
const onLayoutUpdated = (newLayout: LayoutItem[]) => {
  layout.value = newLayout
  
  // Trigger resize on layout changes
  nextTick(() => {
    triggerResize()
  })
}

// Function to trigger resize on all grid items
function triggerResize(): void {
  layout.value.forEach(item => {
    updateItemDimensions(item.i)
  })
}

// Function to update dimensions for a specific grid item
function updateItemDimensions(itemId: string): void {
  const container = document.querySelector(`.vue-grid-item[data-i="${itemId}"] .grid-item-content`)
  if (container) {
    const rect = container.getBoundingClientRect()
    const itemData = gridItems.get(itemId)
    
    if (itemData) {
      // Account for the header height when calculating content height
      const headerHeight = 36 // Approximate height of the header
      
      gridItems.set(itemId, {
        ...itemData,
        width: Math.floor(rect.width),
        height: Math.floor(rect.height - headerHeight)
      })
    }
  }
}

// Add a new grid item with type
function openAddItemModal(): void {
  showAddItemModal.value = true
}

function addItem(type: CellType = CELL_TYPES.CHART): void {
  const itemId = nextId.value.toString()

  // Create grid item
  layout.value.push({
    x: 0,
    y: 0,
    w: 4,
    h: type === CELL_TYPES.MARKDOWN ? 3 : 10, // Markdown cells are smaller by default
    i: itemId,
    static: false,
  })

  // Initialize with default content based on type
  const defaultName = type === CELL_TYPES.CHART ? `Chart ${itemId}` : `Note ${itemId}`

  gridItems.set(itemId, {
    type: type,
    content:
      type === CELL_TYPES.CHART
        ? "SELECT unnest([1,2,3,4]) as value, 'example' as dim  "
        : '# Markdown Cell\nEnter your markdown content here.',
    name: defaultName, // Default name for the item
    width: 0,
    height: 0
  })

  nextId.value++
  showAddItemModal.value = false
  
  // Update dimensions after add
  nextTick(() => {
    updateItemDimensions(itemId)
  })
}

// Clear all grid items
function clearItems(): void {
  layout.value = []
  gridItems.clear()
  nextId.value = 0
}

// Edit functions
function openEditor(item: LayoutItem): void {
  editingItem.value = item
  const itemData = gridItems.get(item.i)

  if (itemData?.type === CELL_TYPES.CHART) {
    showQueryEditor.value = true
  } else if (itemData?.type === CELL_TYPES.MARKDOWN) {
    showMarkdownEditor.value = true
  }
}

// Save content and close editor
function saveContent(content: string): void {
  if (editingItem.value) {
    const itemId = editingItem.value.i
    const itemData = gridItems.get(itemId)

    if (itemData) {
      gridItems.set(itemId, {
        ...itemData,
        content: content,
      })
    }
  }
  closeEditors()
}

// Close all editors
function closeEditors(): void {
  showQueryEditor.value = false
  showMarkdownEditor.value = false
  editingItem.value = null
}

// Get item data
function getItemData(itemId: string): GridItemData {
  return gridItems.get(itemId) || { 
    type: CELL_TYPES.CHART, 
    content: '', 
    name: `Item ${itemId}`,
    width: 0,
    height: 0
  }
}

function setItemData(itemId: string, data: GridItemData): void {
  // Preserve width and height if they exist
  const currentData = gridItems.get(itemId)
  if (currentData) {
    data.width = data.width || currentData.width
    data.height = data.height || currentData.height
  }
  
  gridItems.set(itemId, data)
}

// Handle connection change
function onConnectionChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  const connectionId = parseInt(target.value)
  selectedConnection.value =
    connections.value.find((conn) => conn.id === connectionId) || connections.value[0]
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
  if (editingItemTitle.value === itemId) {
    const itemData = getItemData(itemId)

    // Don't allow empty names
    const newName = editableItemName.value.trim() || itemData.name

    gridItems.set(itemId, {
      ...itemData,
      name: newName,
    })

    editingItemTitle.value = null
  }
}

// Cancel title editing
function cancelTitleEdit(): void {
  editingItemTitle.value = null
}

// Initialize dimension tracking on mount
onMounted(() => {
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

// Watch layout changes to update dimensions
watch(layout, () => {
  nextTick(() => {
    triggerResize()
  })
}, { deep: true })

// Generic Content Editor Component (using render function)
interface ContentEditorProps {
  content: string
  title: string
  placeholder: string
}

const ContentEditor = {
  props: {
    content: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      required: true,
    },
    placeholder: {
      type: String,
      default: 'Enter content here...',
    },
  },
  setup(props: ContentEditorProps, { emit }: any) {
    const contentText = ref(props.content)

    function saveContent(): void {
      emit('save', contentText.value)
    }

    function cancel(): void {
      emit('cancel')
    }

    return { contentText, saveContent, cancel }
  },
  render() {
    return h('div', { class: 'editor-overlay' }, [
      h('div', { class: 'content-editor' }, [
        h('h3', {}, this.title),
        h('textarea', {
          value: this.contentText,
          placeholder: this.placeholder,
          onInput: (e: Event) => (this.contentText = (e.target as HTMLTextAreaElement).value),
        }),
        h('div', { class: 'editor-actions' }, [
          h('button', { onClick: this.saveContent }, 'Save'),
          h('button', { onClick: this.cancel }, 'Cancel'),
        ]),
      ]),
    ])
  },
}
</script>

<template>
  <div class="dashboard-container">
    <div class="dashboard-controls">
      <div class="connection-selector">
        <label for="connection">Connection:</label>
        <select id="connection" @change="onConnectionChange">
          <option v-for="conn in connections" :key="conn.id" :value="conn.id">
            {{ conn.name }}
          </option>
        </select>
      </div>
      <div class="grid-actions">
        <button @click="openAddItemModal" class="add-button" v-if="editMode">Add Item</button>
        <button @click="clearItems" class="clear-button" v-if="editMode">Clear All</button>
        <button @click="toggleEditMode" class="toggle-mode-button">
          {{ editMode ? 'View Mode' : 'Edit Mode' }}
        </button>
      </div>
    </div>

    <div class="grid-container">
      <GridLayout
        :col-num="12"
        :row-height="30"
        :is-draggable="draggable"
        :is-resizable="resizable"
        :layout="layout"
        :vertical-compact="true"
        :use-css-transforms="true"
        :drag-handle-class="'grid-item-drag-handle'"
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
        >
          <div class="grid-item-content">
            <div class="grid-item-header grid-item-drag-handle" v-if="editMode">
              <!-- Drag handle icon -->
              <div class="drag-handle-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
              <button @click="openEditor(item)" class="edit-button">Edit</button>
            </div>

            <!-- Non-edit mode title display -->
            <div class="view-mode-header" v-if="!editMode">
              <div class="item-title">{{ getItemData(item.i).name }}</div>
            </div>

            <!-- Render the appropriate component based on cell type -->
            <component
              :is="
                getItemData(item.i).type === CELL_TYPES.CHART ? DashboardChart : DashboardMarkdown
              "
              :itemId="item.i"
              :setItemData="setItemData"
              :getItemData="getItemData"
              :editMode="editMode"
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
      <ContentEditor
        :content="getItemData(editingItem.i).content"
        :title="'Edit Query'"
        :placeholder="'Enter your SQL query here...'"
        @save="saveContent"
        @cancel="closeEditors"
      />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <ContentEditor
        :content="getItemData(editingItem.i).content"
        :title="'Edit Markdown'"
        :placeholder="'Enter markdown content here...'"
        @save="saveContent"
        @cancel="closeEditors"
      />
    </Teleport>
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
  padding: 8px;
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
  min-width: 0; /* Allows flex child to shrink below min-content width */
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
  cursor: move !important; /* Show move cursor */
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

.content-editor,
.add-item-modal {
  width: 80%;
  max-width: 800px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
}

.content-editor h3,
.add-item-modal h3 {
  margin-top: 0;
  margin-bottom: 15px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 10px;
  color: var(--text-color);
}

.content-editor textarea {
  width: 100%;
  height: 200px;
  padding: 10px;
  border: 1px solid var(--border);
  font-family: monospace;
  resize: vertical;
  margin-bottom: 15px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
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
</style>