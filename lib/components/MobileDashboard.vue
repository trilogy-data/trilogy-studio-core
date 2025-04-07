<script lang="ts" setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount, inject } from 'vue'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
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
import { type Import } from '../stores/resolver'
import QueryExecutionService from '../stores/queryExecutionService'

// Props definition
const props = defineProps<{
  name: string
  connectionId?: string
}>()

// Initialize the dashboard store
const dashboardStore = useDashboardStore()
const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')

// Filter state
const filter = ref('')
const filterError = ref('')

// Ensure dashboard is set as active when component mounts
onMounted(() => {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.setActiveDashboard(dashboard.value.id)

    // Initialize the filter from the dashboard if it exists
    if (dashboard.value.filter) {
      filter.value = dashboard.value.filter
    }
  }

  // Set up resize observer to track container resizing
  const resizeObserver = new ResizeObserver(() => {
    triggerResize()
  })

  // Observe the mobile container
  const mobileContainer = document.querySelector('.mobile-container')
  if (mobileContainer) {
    resizeObserver.observe(mobileContainer)
  }
})

// Edit mode toggle - even though not draggable in mobile, still need edit capabilities
const editMode = ref(true)
const toggleEditMode = () => {
  editMode.value = !editMode.value

  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    triggerResize()
  })
}

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

// Get the dashboard layout from the store - sorted by y position for mobile view
const sortedLayout = computed(() => {
  if (!dashboard.value) return []
  // Sort layout items by y coordinate to establish vertical order
  return [...dashboard.value.layout].sort((a, b) => a.y - b.y)
})

// Get the selected connection from the dashboard
const selectedConnection = computed(() => {
  if (!dashboard.value) return ''
  return dashboard.value.connection
})

async function handleFilterChange(newFilter: string) {
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

function handleImportChange(newImports: Import[]) {
  if (dashboard.value && dashboard.value.id) {
    dashboardStore.updateDashboardImports(dashboard.value.id, newImports)
  }
}

// Function to trigger resize on all items
function triggerResize(): void {
  if (!dashboard.value) return

  sortedLayout.value.forEach((item) => {
    updateItemDimensions(item.i)
  })
}

// Function to update dimensions for a specific item
function updateItemDimensions(itemId: string): void {
  if (!dashboard.value) return

  const container = document.querySelector(`.mobile-item[data-i="${itemId}"] .grid-item-content`)
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

// Add a new item modal
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

// Clear all items
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
    onRefresh: handleRefresh, // Add refresh callback to be used by chart components
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

// Handle refresh event
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

// Calculate approximate height for mobile items based on original proportions
function calculateMobileHeight(item: LayoutItem): number {
  if (!dashboard.value || !dashboard.value.gridItems[item.i]) {
    return 300; // Default height if we can't calculate
  }

  
  const gridItem = dashboard.value.gridItems[item.i];
  
  // If we have stored width and height, use that to calculate ratio
  if (gridItem.width && gridItem.height) {
    const aspectRatio = gridItem.height / gridItem.width;
    const viewportWidth = window.innerWidth - 30; // Adjust for padding
    
    // Calculate new height based on aspect ratio and full width
    // With min and max constraints for usability
    const calculatedHeight = viewportWidth * aspectRatio;
    return Math.max(Math.min(calculatedHeight, 700), 400);
  }
  
  // If no stored dimensions, use the grid layout's width and height
  const aspectRatio = item.h / item.w;
  // Target height based on aspect ratio, with reasonable constraints
  return Math.max(Math.min(aspectRatio * 12 * 30, 600), 400);
}

// Clean up any event listeners
onBeforeUnmount(() => {
  // Any cleanup needed
})
</script>

<template>
  <div class="dashboard-mobile-container" v-if="dashboard">
    <DashboardHeader 
      :dashboard="dashboard" 
      :edit-mode="editMode" 
      :selected-connection="selectedConnection"
      :filterError="filterError" 
      @connection-change="onConnectionChange" 
      @filter-change="handleFilterChange"
      @import-change="handleImportChange" 
      @add-item="openAddItemModal" 
      @clear-items="clearItems"
      @toggle-edit-mode="toggleEditMode" 
      @refresh="handleRefresh" 
    />

    <div class="mobile-container">
      <!-- Mobile layout - vertically stacked grid items -->
      <div 
        v-for="item in sortedLayout" 
        :key="item.i" 
        :data-i="item.i" 
        class="mobile-item"
        :style="{ height: `${calculateMobileHeight(item)}px` }"
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
        />
      </div>
    </div>

    <!-- Add Item Modal -->
    <DashboardAddItemModal 
      :show="showAddItemModal" 
      @add="addItem" 
      @close="closeAddModal" 
    />

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
.dashboard-mobile-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  font-size: var(--font-size);
  color: var(--text-color);
  background-color: var(--bg-color);
  overflow: hidden; /* Prevent double scrollbars */
}

.mobile-container {
  flex: 1;
  overflow-y: auto; /* Explicitly enable vertical scrolling */
  padding: 15px;
  background-color: var(--bg-color);
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding-bottom: 80px; /* Add padding at the bottom for better scrolling experience */
}

.mobile-item {
  width: 100%;
  background: var(--result-window-bg);
  position: relative;
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

.inline-creator {
  max-width: 100%;
}
</style>