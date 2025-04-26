<script lang="ts" setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount, inject, watch } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
// Add this new import
import DashboardAddItemModal from './DashboardAddItemModal.vue'
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
import type { Import, CompletionItem } from '../stores/resolver'
import QueryExecutionService from '../stores/queryExecutionService'
import DashboardCTA from './DashboardCTA.vue'

// Props definition
const props = defineProps<{
  name: string
  connectionId?: string
  // Add max-width configuration prop with default value
  maxWidth?: number
  viewMode?: boolean
}>()

// Initialize the dashboard store
const dashboardStore = useDashboardStore()
const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
// Add filter state and debouncing
const filter = ref('')
const filterInput = ref('')
const filterError = ref('')
const debounceTimeout = ref<number | null>(null)

// Set default max width if not provided
const dashboardMaxWidth = computed(() => props.maxWidth || 1500)

// watch dashboard ID and update completion
watch(
  () => props.name,
  (newId) => {
    if (newId) {
      populateCompletion()
    }
  },
)

// Mode Toggle (edit/view)

// Draggable and resizable states
const draggable = ref(true)
const resizable = ref(true)

// Track currently edited item
const editingItem = ref<LayoutItem | null>(null)
const showQueryEditor = ref(false)
const showMarkdownEditor = ref(false)
const globalCompletion = ref<CompletionItem[]>([])

// Get the active dashboard
const dashboard = computed(() => {
  // Try to find the dashboard by name
  const dashboard = Object.values(dashboardStore.dashboards).find((d) => d.id === props.name)

  // If dashboard doesn't exist, try to create it with the provided connection
  console.log('Dashboard:', dashboard)
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

// Ensure dashboard is set as active when component mounts
onMounted(() => {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.setActiveDashboard(dashboard.value.id)

    // Initialize the filter from the dashboard if it exists
    if (dashboard.value.filter) {
      filter.value = dashboard.value.filter
      filterInput.value = dashboard.value.filter
    }
    // populate our autocomplete
    populateCompletion()
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

const editMode = props.viewMode
  ? ref(false)
  : dashboard.value
    ? ref(!dashboard.value.published)
    : ref(true)
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

const stripAllWhitespace = (str: string): string => {
  return str.replace(/\s+/g, '');
}


async function handleFilterChange(newFilter: string) {
  console.log('New filter:', newFilter)
  if (!newFilter || stripAllWhitespace(newFilter) === '') {
    filterError.value = ''
    if (dashboard.value && dashboard.value.id) {
      dashboardStore.updateDashboardFilter(dashboard.value.id, newFilter)
    }
    return
  }
  if (dashboard.value && dashboard.value.id) {
    filter.value = newFilter

    await queryExecutionService
      ?.generateQuery(dashboard.value.connection, {
        text: 'select 1 as test;',
        queryType: 'duckdb',
        editorType: 'trilogy',
        extraFilters: [newFilter],
        imports: dashboard.value.imports,
      })
      .then(() => {
        filterError.value = ''
        if (dashboard.value && dashboard.value.id) {
          dashboardStore.updateDashboardFilter(dashboard.value.id, newFilter)
        }
      })
      .catch((error) => {
        filterError.value = error.message
        return false
      })
  }
}

async function populateCompletion() {
  if (dashboard.value && dashboard.value.id) {
    await queryExecutionService
      ?.validateQuery(dashboard.value.connection, {
        text: 'select 1 as test;',
        queryType: 'duckdb',
        editorType: 'trilogy',
        imports: dashboard.value.imports,
      })
      .then((results) => {
        if (results) {
          globalCompletion.value = results.data.completion_items
        }

        filterError.value = ''
      })
      .catch((error) => {
        console.log(error)
      })
  }
}

const validateFilter = async (filter: string) => {
  console.log('Validating filter:', filter)
  if (dashboard.value && dashboard.value.id) {
    let promises = await queryExecutionService
      ?.executeQuery(
        dashboard.value.connection,
        {
          text: 'select 1 as test;',
          queryType: 'duckdb',
          editorType: 'trilogy',
          imports: dashboard.value.imports,
          extraFilters: [filter],
        },
        () => {},
        () => {},
        () => {},
        () => {},
        true,
      )
    if (!promises) {
      throw new Error('No promises returned from query execution service')
    }
    await promises.resultPromise
  }
  else throw new Error('Dashboard not found')
}

async function handleImportChange(newImports: Import[]) {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.updateDashboardImports(dashboard.value.id, newImports)
    await populateCompletion()
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
    } else if (itemData.type === CELL_TYPES.TABLE) {
      showQueryEditor.value = true
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
function getItemData(itemId: string, dashboardId: string): GridItemData {
  if (dashboardId && dashboard.value && dashboard.value.id !== dashboardId) {
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
    onRefresh: handleRefresh, // Add refresh callback to be used by chart components,
  }
}

// Use a wrapper function to set data via the store
function setItemData(itemId: string, dashboardId: string, data: any): void {
  if (!dashboard.value || !dashboard.value.id) return

  if (!dashboardId || dashboard.value.id !== dashboardId) {
    console.warn('Dashboard ID mismatch. Cannot set item data.')
    return
  }

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
  //global fields
  let globalFields = globalCompletion.value.map((f) => f.label)
  const finalFilters = Object.entries(info.filters).reduce(
    (acc, [key, value]) => {
      let lookup = key.includes('.') ? key : 'local.' + key
      if (globalFields.includes(lookup)) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, string>,
  )
  if (!finalFilters || Object.keys(finalFilters).length === 0) return
  dashboardStore.updateItemCrossFilters(
    dashboard.value.id,
    info.source,
    finalFilters,
    info.chart,
    info.append ? 'append' : 'add',
  )
}

function removeFilter(itemId: string, filterSource: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  // Use store to remove item cross filters
  dashboardStore.removeItemCrossFilter(dashboard.value.id, itemId, filterSource)
}

function removeItem(itemId: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  // Use store to remove item from dashboard
  dashboardStore.removeItemFromDashboard(dashboard.value.id, itemId)
}

function unSelect(itemId: string): void {
  if (!dashboard.value || !dashboard.value.id) return
  // Use store to remove item cross filters
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
      :filterError="filterError"
      :globalCompletion="globalCompletion"
      :validateFilter="validateFilter"
      @connection-change="onConnectionChange"
      @filter-change="handleFilterChange"
      @import-change="handleImportChange"
      @add-item="openAddItemModal"
      @clear-items="clearItems"
      @toggle-edit-mode="toggleEditMode"
      @refresh="handleRefresh"
    />
    <div v-if="dashboard && layout.length === 0" class="empty-dashboard-wrapper">
      <DashboardCTA :dashboard-id="dashboard.id" />
    </div>
    <div v-else class="grid-container">
      <div class="grid-content" :style="{ maxWidth: dashboardMaxWidth + 'px' }">
        <GridLayout
          :col-num="16"
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
              :dashboard-id="dashboard.id"
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
              @remove-item="removeItem"
            />
          </grid-item>
        </GridLayout>
      </div>
    </div>

    <!-- Add Item Modal -->
    <DashboardAddItemModal :show="showAddItemModal" @add="addItem" @close="closeAddModal" />

    <!-- Content Editors -->
    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ChartEditor
        :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :content="getItemData(editingItem.i, dashboard.id).content"
        :showing="showQueryEditor"
        @save="saveContent"
        @cancel="closeEditors"
      />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <MarkdownEditor
        :content="getItemData(editingItem.i, dashboard.id).content"
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

.toggle-mode-button {
  background-color: var(--button-bg) !important;
  color: var(--text-color) !important;
}

.grid-container {
  flex: 1;
  overflow: auto;
  padding: 15px;
  background-color: var(--bg-color);
  display: flex;
  justify-content: center;
}

.grid-content {
  width: 100%;
  height: 100%;
  /* Default max width can be overridden by prop */
  /* max-width is set via inline style using the dashboardMaxWidth computed property */
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
  text-align: center;
}

.dashboard-not-found h2 {
  margin-bottom: 1rem;
}

.empty-dashboard-wrapper {
  justify-content: center;
  padding: 20px;
  flex: 1;
}
</style>
