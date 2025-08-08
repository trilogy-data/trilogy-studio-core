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

// Calculate approximate height for mobile items based on original proportions
function calculateMobileHeight(item: any): number | string {
  if (!dashboard.value || !dashboard.value.gridItems[item.i]) {
    return 300 // Default height if we can't calculate
  }

  if (getItemData(item.i, dashboard.value.id).type === CELL_TYPES.MARKDOWN) {
    return '100%' // Full height for markdown items
  }

  const gridItem = dashboard.value.gridItems[item.i]

  // If we have stored width and height, use that to calculate ratio
  if (gridItem.width && gridItem.height) {
    const aspectRatio = gridItem.height / gridItem.width
    const viewportWidth = window.innerWidth - 30 // Adjust for padding

    // Calculate new height based on aspect ratio and full width
    // With min and max constraints for usability
    const calculatedHeight = viewportWidth * aspectRatio
    return Math.max(Math.min(calculatedHeight, 400), 400)
  }

  // If no stored dimensions, use the grid layout's width and height
  const aspectRatio = item.h / item.w
  // Target height based on aspect ratio, with reasonable constraints
  return Math.max(Math.min(aspectRatio * 12 * 30, 600), 400)
}

// Handle edit mode toggle for mobile
function handleToggleEditMode() {
  dashboardBase.value?.toggleEditMode()

  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    triggerResize()
  })
}
</script>

<template>
  <DashboardBase ref="dashboardBase" :key="name" :name="name" :connection-id="connectionId" :view-mode="viewMode"
    :is-mobile="true" @dimensions-update="updateItemDimensions" @trigger-resize="triggerResize" />

  <div class="dashboard-mobile-container" v-if="dashboard">
    <DashboardHeader :dashboard="dashboard" :edit-mode="editMode" :edits-locked="dashboard.state === 'locked'"
      :selected-connection="selectedConnection" :filterError="filterError" :globalCompletion="globalCompletion"
      :validateFilter="validateFilter" @connection-change="dashboardBase?.onConnectionChange"
      @filter-change="dashboardBase?.handleFilterChange" @import-change="dashboardBase?.handleImportChange"
      @add-item="dashboardBase?.openAddItemModal" @clear-items="dashboardBase?.clearItems"
      @toggle-edit-mode="handleToggleEditMode" @refresh="dashboardBase?.handleRefresh"
      @clear-filter="dashboardBase?.handleFilterClear" />

    <div v-if="dashboard && sortedLayout.length === 0" class="empty-dashboard-wrapper">
      <DashboardCTA :dashboard-id="dashboard.id" />
    </div>

    <div v-else class="mobile-container">
      <!-- Mobile layout - vertically stacked grid items -->
      <div v-for="item in sortedLayout" :key="item.i" :data-i="item.i" class="mobile-item"
        :style="{ height: `${calculateMobileHeight(item)}px` }">
        <DashboardGridItem v-if="dashboardBase" :dashboard-id="dashboard.id" :item="item" :edit-mode="editMode"
          :filter="filter" :get-item-data="getItemData"
          :get-dashboard-query-executor="dashboardBase.getDashboardQueryExecutor"
          @dimension-click="dashboardBase?.setCrossFilter" :set-item-data="setItemData"
          @edit-content="dashboardBase?.openEditor" @remove-filter="dashboardBase?.removeFilter"
          @background-click="dashboardBase?.unSelect" @update-dimensions="updateItemDimensions"
          @remove-item="dashboardBase?.removeItem" @copy-item="dashboardBase?.copyItem" />
      </div>
    </div>

    <!-- Add Item Modal -->
    <DashboardAddItemModal :show="showAddItemModal" @add="dashboardBase?.addItem"
      @close="dashboardBase?.closeAddModal" />

    <!-- Content Editors -->
    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ChartEditor :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).content" :showing="showQueryEditor"
        @save="dashboardBase?.saveContent" @cancel="dashboardBase?.closeEditors" />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <MarkdownEditor :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).structured_content" @save="dashboardBase?.saveContent"
        @cancel="dashboardBase?.closeEditors" />
    </Teleport>
  </div>

  <div v-else class="dashboard-not-found">
    <template v-if="name">
      <h2>Dashboard Not Found</h2>
      <p>The dashboard "{{ name }}" could not be found.</p>
    </template>
    <template v-else>
      <h2>Ready to <i class="mdi mdi-chart-line"></i>?</h2>
      <dashboard-creator-inline class="inline-creator" :visible="true"
        @dashboard-created="dashboardBase?.dashboardCreated"></dashboard-creator-inline>
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
}

.mobile-item {
  width: 100%;
  background: var(--result-window-bg);
  position: relative;
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
</style>
