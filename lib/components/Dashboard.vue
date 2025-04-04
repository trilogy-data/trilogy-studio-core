<script lang="ts" setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
import { useDashboardStore } from '../stores/dashboardStore'
import {
  type LayoutItem,
  type GridItemData,
  type CellType,
  CELL_TYPES,
  type DimensionClick,
} from '../dashboards/base'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import { type Import } from '../stores/resolver'

// Props definition
const props = defineProps<{
  name: string
  connectionId?: string
}>()

// Initialize the dashboard store
const dashboardStore = useDashboardStore()

// Add filter state and debouncing
const filter = ref('')
const filterInput = ref('')
const debounceTimeout = ref<number | null>(null)

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

// Track currently edited item
const editingItem = ref<LayoutItem | null>(null)
const showQueryEditor = ref(false)
const showMarkdownEditor = ref(false)

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

// Track layout changes
const onLayoutUpdated = (newLayout: any) => {
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
      filters: [],
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
      filters: [],
    }
  }
  const itemFilters = item.filters || []
  let finalFilters = itemFilters

  if (dashboard.value.filter) {
    // Check if we already have this global filter
    const hasGlobalFilter = itemFilters.some(
      (f) => f.source === 'global' && f.value === dashboard.value?.filter,
    )

    // Only create a new array if needed
    if (!hasGlobalFilter) {
      finalFilters = [{ value: dashboard.value.filter, source: 'global' }, ...itemFilters]
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
    filters: finalFilters,
    connectionName: dashboard.value.connection,
    chartFilters: item.chartFilters || [],
    conceptFilters: item.conceptFilters || [],
    parameters: item.parameters || {},
    onRefresh: handleRefresh, // Add refresh callback to be used by chart components
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

// Handle refresh event from the dashboard header
function handleRefresh(itemId?: string): void {
  if (!dashboard.value) return

  // If an itemId is provided, refresh only that item
  if (itemId) {
    // Create a refresh event for the specific chart
    const refreshEvent = new CustomEvent('chart-refresh', { detail: { itemId } })
    window.dispatchEvent(refreshEvent)

    // Also update dimensions for the specific item
    updateItemDimensions(itemId)
    return
  }

  // Otherwise refresh all items
  // Dispatch a global refresh event that all charts can listen to
  const refreshEvent = new CustomEvent('dashboard-refresh')
  window.dispatchEvent(refreshEvent)

  console.log('Refreshing all dashboard items')

  // Trigger resize on all items to ensure charts update
  triggerResize()
}

function setCrossFilter(info: DimensionClick): void {
  if (!dashboard.value || !dashboard.value.id) return
  // Use store to update item cross filters
  dashboardStore.updateItemCrossFilters(
    dashboard.value.id,
    info.source,
    info.filters,
    info.chart,
    info.append ? 'append' : 'add',
  )
}

function removeFilter(itemId: string, filterSource: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  // Use store to remove item cross filters
  dashboardStore.removeItemCrossFilter(dashboard.value.id, itemId, filterSource)
}

function unSelect(itemId: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  // Use store to remove item cross filters
  console.log('unselecting item')
  dashboardStore.removeItemCrossFilterSource(dashboard.value.id, itemId)
}

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
      @refresh="handleRefresh"
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
          <DashboardGridItem
            :item="item"
            :edit-mode="editMode"
            :filter="filter"
            :get-item-data="getItemData"
            @dimension-click="setCrossFilter"
            :set-item-data="setItemData"
            @edit-content="openEditor"
            @remove-filter="removeFilter"
            @background-click="unSelect"
            @update-dimensions="updateItemDimensions"
          />
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
        :connectionName="getItemData(editingItem.i).connectionName || ''"
        :imports="getItemData(editingItem.i).imports || []"
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
    <template v-if="name">
      <h2>Dashboard Not Found</h2>
      <p>The dashboard "{{ name }}" could not be found.</p>
    </template>
    <template v-else>
      <h2>Ready to <i class="mdi mdi-chart-line"></i>?</h2>
      <dashboard-creator-inline class="inline-creator" :visible="true"></dashboard-creator-inline>
    </template>
  </div>
</template>

<style>
.inline-creator {
  max-width: 400px;
}

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
  /* border: 1px solid var(--border); */
  /* box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); */
}

.vue-grid-item .resizing {
  opacity: 0.9;
}

.vue-grid-item .static {
  background: var(--sidebar-selector-bg);
}

/* Editor Overlay */
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
  background-color: var(--bg-color);
  padding: 20px;
  border-radius: 5px;
  max-width: 500px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
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
