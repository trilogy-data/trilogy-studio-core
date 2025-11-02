<script lang="ts" setup>
import { ref, computed, nextTick } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
import DashboardAddItemModal from './DashboardAddItemModal.vue'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import DashboardCTA from './DashboardCTA.vue'
import { useDashboard } from './useDashboard'

const props = defineProps<{
  name: string
  connectionId?: string
  maxWidth?: number
  viewMode?: boolean
}>()

const emit = defineEmits<{
  fullScreen: [enabled: boolean]
}>()

// Use the dashboard composable
const {
  // State
  dashboard,
  layout,
  editMode,
  selectedConnection,
  filter,
  filterError,
  globalCompletion,
  showAddItemModal,
  showQueryEditor,
  showMarkdownEditor,
  editingItem,
  dashboardMaxWidth,

  // Methods
  handleFilterChange,
  handleFilterClear,
  handleImportChange,
  validateFilter,
  onConnectionChange,
  toggleEditMode,
  onLayoutUpdated,
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
  updateTitle,
} = useDashboard(
  {
    name: props.name,
    connectionId: props.connectionId,
    maxWidth: props.maxWidth,
    viewMode: props.viewMode,
    isMobile: false,
  },
  {
    layoutUpdated: (newLayout) => onLayoutUpdated(newLayout),
    dimensionsUpdate: (itemId) => updateItemDimensions(itemId),
    triggerResize: () => triggerResize(),
    fullScreen: (enabled) => emit('fullScreen', enabled),
  },
)

// Desktop-specific reactive state
const editable = computed(() => dashboard.value?.state === 'editing' || false)
const loaded = ref(false)
const isExportingImage = ref(false)

// Desktop-specific methods
function updateItemDimensions(itemId: string): void {
  if (!dashboard.value) return

  const container = document.querySelector(`.vue-grid-item[data-i="${itemId}"] .grid-item-content`)
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

  layout.value.forEach((item) => {
    updateItemDimensions(item.i)
  })
}

function layoutReadyEvent() {
  loaded.value = true
  // Trigger initial resize after layout is ready
  nextTick(() => {
    triggerResize()
  })
}

// Handle layout updates with draggable/resizable state management
function onLayoutUpdatedDesktop(newLayout: any) {
  if (loaded.value === true) {
    onLayoutUpdated(newLayout)
    // Trigger resize on layout changes
    nextTick(() => {
      triggerResize()
    })
  }
}

// Update draggable/resizable when edit mode changes
function handleToggleEditMode() {
  toggleEditMode()
  emit('fullScreen', !editMode.value)
  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    triggerResize()
  })
}

// Image Export functionality
async function exportToImage() {
  if (!dashboard.value) return

  isExportingImage.value = true

  try {
    // Dynamically import html2canvas only when needed
    const { default: html2canvas } = await import('html2canvas')

    // Find the dashboard content element
    const dashboardElement = document.querySelector('.grid-content')
    if (!dashboardElement) {
      throw new Error('Dashboard content not found')
    }

    // Temporarily disable any hover effects and transitions for cleaner capture
    dashboardElement.classList.add('image-export-mode')

    // Wait a moment for any pending renders
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Capture the dashboard as canvas
    const canvas = await html2canvas(dashboardElement as HTMLElement, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher scale for better quality
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: dashboardElement.scrollWidth,
      height: dashboardElement.scrollHeight,
    })

    // Convert canvas to image and download
    const imgData = canvas.toDataURL('image/png')

    // Create download link
    const link = document.createElement('a')
    link.download = `${dashboard.value.name || 'dashboard'}_${new Date().toISOString().split('T')[0]}.png`
    link.href = imgData

    // Trigger download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (error) {
    console.error('Error exporting image:', error)
    alert('Failed to export image. Please try again.')
  } finally {
    // Remove export mode class
    const dashboardElement = document.querySelector('.grid-content')
    if (dashboardElement) {
      dashboardElement.classList.remove('image-export-mode')
    }
    isExportingImage.value = false
  }
}
</script>

<template>
  <div class="dashboard-container" v-if="dashboard">
    <DashboardHeader
      :dashboard="dashboard"
      :edit-mode="editMode"
      :edits-locked="dashboard.state === 'locked'"
      :selected-connection="selectedConnection"
      :filterError="filterError"
      :globalCompletion="globalCompletion"
      :validateFilter="validateFilter"
      :is-exporting-image="isExportingImage"
      @connection-change="onConnectionChange"
      @filter-change="handleFilterChange"
      @import-change="handleImportChange"
      @add-item="openAddItemModal"
      @clear-items="clearItems"
      @toggle-edit-mode="handleToggleEditMode"
      @refresh="handleRefresh"
      @clear-filter="handleFilterClear"
      @title-update="updateTitle"
      @export-image="exportToImage"
    />

    <div v-if="dashboard && layout.length === 0" class="empty-dashboard-wrapper">
      <DashboardCTA :dashboard-id="dashboard.id" />
    </div>

    <div v-else class="grid-container">
      <div class="grid-content" :style="{ maxWidth: dashboardMaxWidth + 'px' }">
        <GridLayout
          :col-num="20"
          :row-height="30"
          :is-draggable="editable"
          :is-resizable="editable"
          :is-bounded="true"
          :layout="layout"
          :vertical-compact="true"
          :use-css-transforms="true"
          @layout-updated="onLayoutUpdatedDesktop"
          @layout-ready="layoutReadyEvent"
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
              :symbols="globalCompletion"
              :get-dashboard-query-executor="getDashboardQueryExecutor"
              @dimension-click="setCrossFilter"
              :set-item-data="setItemData"
              @edit-content="openEditor"
              @remove-filter="removeFilter"
              @background-click="unSelect"
              @update-dimensions="updateItemDimensions"
              @copy-item="copyItem"
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
      <dashboard-creator-inline
        class="inline-creator"
        :visible="true"
        @dashboard-created="dashboardCreated"
      ></dashboard-creator-inline>
    </template>
  </div>
</template>

<style scoped>
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
}

/* Image export mode styles to clean up the appearance */
.grid-content.image-export-mode * {
  transition: none !important;
  animation: none !important;
}

.grid-content.image-export-mode .vue-grid-item:hover {
  transform: none !important;
}

.vue-grid-layout {
  background: var(--bg-color);
  height: 100%;
}

.vue-grid-item:not(.vue-grid-placeholder) {
  background: var(--result-window-bg);
}

.vue-grid-item .resizing {
  opacity: 0.9;
}

.vue-grid-item .static {
  background: var(--sidebar-selector-bg);
}

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
