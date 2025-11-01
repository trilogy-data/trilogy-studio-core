<script lang="ts" setup>
import { ref, computed, nextTick } from 'vue'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
import DashboardAddItemModal from './DashboardAddItemModal.vue'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import DashboardCTA from './DashboardCTA.vue'
import DashboardBase from './DashboardBase.vue'
import { CELL_TYPES } from '../../dashboards/base'

defineProps<{
  name: string
  connectionId?: string
  viewMode?: boolean
}>()

// Use the base dashboard logic
const dashboardBase = ref<InstanceType<typeof DashboardBase>>()

const mobileMinHeight = 400 // Minimum height for mobile items

// Computed properties from base with proper fallbacks
const dashboard = computed(() => dashboardBase.value?.dashboard)
const sortedLayout = computed(() => dashboardBase.value?.sortedLayout || [])
const editMode = computed(() => dashboardBase.value?.editMode || false)
const selectedConnection = computed(() => dashboardBase.value?.selectedConnection || '')
const filter = computed(() => dashboardBase.value?.filter || '')
const filterError = computed(() => dashboardBase.value?.filterError || '')
const globalCompletion = computed(() => dashboardBase.value?.globalCompletion || [])
const showAddItemModal = computed(() => dashboardBase.value?.showAddItemModal || false)
const showQueryEditor = computed(() => dashboardBase.value?.showQueryEditor || false)
const showMarkdownEditor = computed(() => dashboardBase.value?.showMarkdownEditor || false)
const editingItem = computed(() => dashboardBase.value?.editingItem)

// Function wrappers that ensure base is available
const getItemData = (itemId: string, dashboardId: string) => {
  return dashboardBase.value!.getItemData(itemId, dashboardId)
}

const setItemData = (itemId: string, dashboardId: string, data: any) => {
  dashboardBase.value!.setItemData(itemId, dashboardId, data)
}

const validateFilter = async (filter: string) => {
  return dashboardBase.value!.validateFilter(filter)
}

// Mobile-specific methods
function updateItemDimensions(itemId: string): void {
  if (!dashboard.value) return

  const container = document.querySelector(`.mobile-item[data-i="${itemId}"] .grid-item-content`)
  if (container) {
    const rect = container.getBoundingClientRect()
    const headerHeight = 36 // Approximate height of the header

    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height - headerHeight)

    if (dashboard.value.id && dashboardBase.value) {
      dashboardBase.value.setItemData(itemId, dashboard.value.id, { width, height })
    }
  }
}

function triggerResize(): void {
  if (!dashboard.value) return

  sortedLayout.value.forEach((item) => {
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
function handleToggleEditMode() {
  dashboardBase.value?.toggleEditMode()

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
    console.log('Scrolling to bottom')
    console.log('Container scrollHeight:', container.scrollHeight)
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
      behavior: 'smooth' 
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
    
    if (itemTop > currentScrollTop + 50) { // Small offset to ensure we move to next item
      targetItem = item
      break
    }
  }
  
  if (targetItem) {
    container.scrollTo({ 
      top: targetItem.offsetTop - 15, // Account for gap
      behavior: 'smooth' 
    })
  }
}
</script>

<template>
  <DashboardBase
    ref="dashboardBase"
    :key="name"
    :name="name"
    :connection-id="connectionId"
    :view-mode="viewMode"
    :is-mobile="true"
    @dimensions-update="updateItemDimensions"
    @trigger-resize="triggerResize"
  />

  <div class="dashboard-mobile-container" v-if="dashboard">
    <DashboardHeader
      :dashboard="dashboard"
      :edit-mode="editMode"
      :edits-locked="dashboard.state === 'locked'"
      :selected-connection="selectedConnection"
      :filterError="filterError"
      :globalCompletion="globalCompletion"
      :validateFilter="validateFilter"
      @connection-change="dashboardBase?.onConnectionChange"
      @filter-change="dashboardBase?.handleFilterChange"
      @import-change="dashboardBase?.handleImportChange"
      @add-item="dashboardBase?.openAddItemModal"
      @clear-items="dashboardBase?.clearItems"
      @toggle-edit-mode="handleToggleEditMode"
      @refresh="dashboardBase?.handleRefresh"
      @clear-filter="dashboardBase?.handleFilterClear"
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
          v-if="dashboardBase"
          :dashboard-id="dashboard.id"
          :item="item"
          :edit-mode="editMode"
          :filter="filter"
          :get-item-data="getItemData"
          :symbols="[]"
          :get-dashboard-query-executor="dashboardBase.getDashboardQueryExecutor"
          @dimension-click="dashboardBase?.setCrossFilter"
          @background-click="dashboardBase?.unSelect"
          :set-item-data="setItemData"
          @edit-content="dashboardBase?.openEditor"
          @remove-filter="dashboardBase?.removeFilter"
          @update-dimensions="updateItemDimensions"
          @remove-item="dashboardBase?.removeItem"
          @copy-item="dashboardBase?.copyItem"
        />
      </div>
    </div>

    <!-- Mobile Navigation Bar -->
    <div class="mobile-nav-bar" v-if="sortedLayout.length > 0">
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
    <DashboardAddItemModal
      :show="showAddItemModal"
      @add="dashboardBase?.addItem"
      @close="dashboardBase?.closeAddModal"
    />

    <!-- Content Editors -->
    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ChartEditor
        :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).content"
        :showing="showQueryEditor"
        @save="dashboardBase?.saveContent"
        @cancel="dashboardBase?.closeEditors"
      />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <MarkdownEditor
        :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).structured_content"
        @save="dashboardBase?.saveContent"
        @cancel="dashboardBase?.closeEditors"
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
        @dashboard-created="dashboardBase?.dashboardCreated"
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
  padding-bottom: 80px; /* Space for navigation bar */
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