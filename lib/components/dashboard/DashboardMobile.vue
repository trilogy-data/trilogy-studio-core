<script lang="ts" setup>
import { nextTick, computed } from 'vue'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
import DashboardAddItemModal from './DashboardAddItemModal.vue'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import DashboardCTA from './DashboardCTA.vue'
import { useDashboard } from './useDashboard'
import { CELL_TYPES, type LayoutItem } from '../../dashboards/base'
import { useDashboardStore } from '../../stores/dashboardStore'
import { type DashboardState } from '../../dashboards/base'
const props = defineProps<{
  name: string
  connectionId?: string
  viewMode?: boolean
}>()

const mobileMinHeight = 400 // Minimum height for mobile items
const dashboardStore = useDashboardStore()
const dashboard = computed(() => {
  const dashboard = Object.values(dashboardStore.dashboards).find((d) => d.id === props.name)

  // If dashboard doesn't exist and we have a connectionId, try to create it
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
// Use the dashboard composable
const {
  // State
  sortedLayout,
  editMode,
  selectedConnection,
  filter,
  filterError,
  globalCompletion,
  showAddItemModal,
  showQueryEditor,
  showMarkdownEditor,
  editingItem,

  // Methods
  handleFilterChange,
  handleFilterClear,
  handleImportChange,
  validateFilter,
  onConnectionChange,
  toggleMode,
  openAddItemModal,
  addItem,
  clearItems,
  removeItem,
  copyItem,
  closeAddModal,
  openEditor,
  saveContent,
  closeEditors,
  getDashboardQueryExecutor,
  getItemData,
  setItemData,
  handleRefresh,
  setCrossFilter,
  removeFilter,
  unSelect,
  dashboardCreated,
} = useDashboard(
  dashboard,
  {
    connectionId: props.connectionId,
    viewMode: props.viewMode,
    isMobile: true,
  },
  {
    layoutUpdated: () => {}, // Not needed for mobile
    dimensionsUpdate: (itemId: string) => updateItemDimensions(itemId),
    triggerResize: () => triggerResize(),
    fullScreen: () => {}, // Not needed for mobile
  },
)

// Mobile-specific methods
function updateItemDimensions(itemId: string): void {
  if (!dashboard.value) return

  const container = document.querySelector(`.mobile-item[data-i="${itemId}"] .grid-item-content`)
  if (container) {
    const rect = container.getBoundingClientRect()
    const headerHeight = 36 // Approximate height of the header

    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height - headerHeight)

    if (dashboard.value.id) {
      setItemData(itemId, dashboard.value.id, { width, height })
    }
  }
}

function triggerResize(): void {
  if (!dashboard.value) return

  sortedLayout.value.forEach((item: LayoutItem) => {
    updateItemDimensions(item.i)
  })
}

function calculateMobileWidth(_: any): number | string {
  // let itemData = getItemData(item.i, dashboard.value.id)
  // if (itemData.type === CELL_TYPES.CHART) {
  //   if (itemData.chartConfig?.chartType === 'headline') {
  //     return `${Math.max(itemData.width || window.innerWidth - 30, 300)}px`
  //   }
  // }

  return '100%' // Full width for mobile items
}

// Calculate approximate height for mobile items based on original proportions
function calculateMobileHeight(item: any): number | string {
  let minHeight = Math.min(window.innerWidth, 400)
  if (!dashboard.value || !dashboard.value.gridItems[item.i]) {
    return minHeight // Default height if we can't calculate
  }

  let itemData = getItemData(item.i, dashboard.value.id)
  if (itemData.type === CELL_TYPES.MARKDOWN) {
    return '100%' // Full height for markdown items
  }

  if (itemData.type === CELL_TYPES.FILTER) {
    return '100%' // Full height for filter items
  }

  if (itemData.type === CELL_TYPES.CHART) {
    if (itemData.chartConfig?.chartType === 'headline') {
      // return the width as height for a headline chart
      if (itemData.width) {
        return `${Math.max(itemData.width / 2, minHeight)}px`
      }
    }
  }

  let maxHeight = itemData.type === CELL_TYPES.CHART ? 1200 : 600
  // If we have stored width and height, use that to calculate ratio
  if (itemData.width && itemData.height) {
    let aspectRatio = item.h / (item.w * 2)
    const viewportWidth = window.innerWidth - 50 // Adjust for padding

    if (['point', 'barh'].includes(itemData.chartConfig?.chartType || '')) {
      aspectRatio = aspectRatio * 1.2 // make these a bit taller
    }

    // Calculate new height based on aspect ratio and full width
    // With min and max constraints for usability
    const calculatedHeight = viewportWidth * aspectRatio

    return `${Math.max(Math.min(calculatedHeight, maxHeight), minHeight)}px`
  }

  // If no stored dimensions, use the grid layout's width and height
  const aspectRatio = item.h / item.w
  // Target height based on aspect ratio, with reasonable constraints
  return `${Math.max(Math.min(aspectRatio * 12 * 30, maxHeight), mobileMinHeight)}px`
}

// Handle edit mode toggle for mobile
function handleToggleMode(mode: DashboardState) {
  toggleMode(mode)
  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    triggerResize()
  })
}
// Mobile navigation scroll functions
function scrollToTop() {
  const container = document.getElementById('page-content')
  if (container) {
    container.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function scrollToBottom() {
  const container = document.getElementById('page-content')
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }
}

function scrollUpOne() {
  const container = document.getElementById('page-content')
  if (!container) return

  const currentScrollTop = container.scrollTop
  const items = container.querySelectorAll('.mobile-item')

  // Find the current item that's mostly visible
  let targetItem = null
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as HTMLElement
    const itemTop = item.offsetTop

    if (itemTop < currentScrollTop) {
      targetItem = item
      break
    }
  }

  if (targetItem) {
    container.scrollTo({
      top: targetItem.offsetTop - 15, // Account for gap
      behavior: 'smooth',
    })
  }
}

function scrollDownOne() {
  const container = document.getElementById('page-content')
  if (!container) return

  const currentScrollTop = container.scrollTop
  const items = container.querySelectorAll('.mobile-item')

  // Find the next item below the current viewport
  let targetItem = null
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as HTMLElement
    const itemTop = item.offsetTop

    if (itemTop > currentScrollTop + 50) {
      // Small offset to ensure we move to next item
      targetItem = item
      break
    }
  }

  if (targetItem) {
    container.scrollTo({
      top: targetItem.offsetTop - 15, // Account for gap
      behavior: 'smooth',
    })
  }
}
</script>

<template>
  <div class="dashboard-mobile-container" v-if="dashboard">
    <DashboardHeader
      :dashboard="dashboard"
      :edits-locked="dashboard.state === 'locked'"
      :selected-connection="selectedConnection"
      :filterError="filterError"
      :globalCompletion="globalCompletion"
      :validateFilter="validateFilter"
      @connection-change="onConnectionChange"
      @filter-change="handleFilterChange"
      @import-change="handleImportChange"
      @add-item="openAddItemModal"
      @clear-items="clearItems"
      @mode-change="handleToggleMode"
      @refresh="handleRefresh"
      @clear-filter="handleFilterClear"
    />

    <div v-if="dashboard && sortedLayout.length === 0" class="empty-dashboard-wrapper">
      <DashboardCTA :dashboard-id="dashboard.id" />
    </div>

    <div v-else class="mobile-container">
      <!-- Mobile layout - vertically stacked grid items -->
      <div
        v-for="item in sortedLayout"
        :key="item.i"
        :data-i="item.i"
        class="mobile-item"
        :style="{
          height: `${calculateMobileHeight(item)}`,
          width: `${calculateMobileWidth(item)}`,
        }"
      >
        <DashboardGridItem
          :dashboard-id="dashboard.id"
          :item="item"
          :edit-mode="editMode"
          :filter="filter"
          :get-item-data="getItemData"
          :symbols="globalCompletion"
          :get-dashboard-query-executor="getDashboardQueryExecutor"
          @dimension-click="setCrossFilter"
          @background-click="unSelect"
          :set-item-data="setItemData"
          @edit-content="openEditor"
          @remove-filter="removeFilter"
          @update-dimensions="updateItemDimensions"
          @remove-item="removeItem"
          @copy-item="copyItem"
        />
      </div>
    </div>

    <!-- Mobile Navigation Bar -->
    <div class="mobile-nav-bar" v-if="sortedLayout.length > 1">
      <button @click="scrollToTop" class="nav-btn" title="Scroll to top">
        <i class="mdi mdi-chevron-double-up"></i>
      </button>
      <button @click="scrollUpOne" class="nav-btn" title="Previous item">
        <i class="mdi mdi-chevron-up"></i>
      </button>
      <button @click="scrollDownOne" class="nav-btn" title="Next item">
        <i class="mdi mdi-chevron-down"></i>
      </button>
      <button @click="scrollToBottom" class="nav-btn" title="Scroll to bottom">
        <i class="mdi mdi-chevron-double-down"></i>
      </button>
    </div>

    <!-- Add Item Modal -->
    <DashboardAddItemModal :show="showAddItemModal" @add="addItem" @close="closeAddModal" />

    <!-- Content Editors -->
    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ChartEditor
        :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).content"
        :showing="showQueryEditor"
        @save="saveContent"
        @cancel="closeEditors"
      />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <MarkdownEditor
        :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).structured_content"
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
      <dashboard-creator-inline
        class="inline-creator"
        :visible="true"
        @dashboard-created="dashboardCreated"
      ></dashboard-creator-inline>
    </template>
  </div>
</template>

<style scoped>
.dashboard-mobile-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  font-size: var(--font-size);
  color: var(--text-color);
  background-color: var(--bg-color);
  overflow: hidden;
  position: relative;
}

.mobile-container {
  flex: 1;
  overflow-y: auto;
  padding: 5px 10px;
  background-color: var(--bg-color);
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding-bottom: 80px;
  /* Space for navigation bar */
}

.mobile-item {
  width: 100%;
  background: var(--result-window-bg);
  position: relative;
}

.mobile-nav-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--result-window-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 8px;
  z-index: 1000;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

.nav-btn {
  background: var(--button-bg, var(--bg-color));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  font-size: 20px;
}

.nav-btn:hover {
  background: var(--button-hover-bg, var(--highlight-color));
  transform: translateY(-1px);
}

.nav-btn:active {
  transform: translateY(0);
  background: var(--button-active-bg, var(--accent-color));
}

.nav-btn i {
  line-height: 1;
}

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

.empty-dashboard-wrapper {
  justify-content: center;
  padding: 20px;
  flex: 1;
}

/* Add responsive touch target sizing */
@media (max-width: 480px) {
  .nav-btn {
    padding: 10px 12px;
    min-width: 44px;
    min-height: 44px;
    font-size: 18px;
  }

  .mobile-nav-bar {
    padding: 6px;
  }
}
</style>
