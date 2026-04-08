<script lang="ts" setup>
import { ref, computed, nextTick, inject } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
import DashboardAddItemModal from './DashboardAddItemModal.vue'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import DashboardCTA from './DashboardCTA.vue'
import DashboardChatPanel from './DashboardChatPanel.vue'
import { useDashboard } from './useDashboard'
import { useDashboardStore } from '../../stores/dashboardStore'
import { type DashboardState } from '../../dashboards/base'
import { resolveMdiIconPath } from '../../icons/registerMdiIcons'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
export interface DashboardProps {
  name: string
  connectionId?: string
  maxWidth?: number
  viewMode?: boolean
}

const props = defineProps<DashboardProps>()

const emit = defineEmits<{
  fullScreen: [enabled: boolean]
}>()
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
  toggleMode,
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
  dashboard,
  {
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
const gridContentRef = ref<HTMLElement | null>(null)

// Chat panel state
const chatPanelOpen = ref(false)
const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
const hasLlmConnection = computed(() => !!llmConnectionStore?.activeConnection)

function toggleChatPanel() {
  chatPanelOpen.value = !chatPanelOpen.value
}

function handleRefreshItem(itemId: string): string | undefined {
  return handleRefresh(itemId)
}

function handleForkInvestigation() {
  if (!dashboard.value) return
  const name = `Investigation ${Date.now().toString().slice(-4)}`
  dashboardStore.forkDashboard(dashboard.value.id, name)
}

interface ExportItemMetric {
  id: string
  left: number
  top: number
  width: number
  height: number
}

interface ExportLayoutMetrics {
  width: number
  height: number
  items: ExportItemMetric[]
}

function waitForAnimationFrames(frameCount: number = 2): Promise<void> {
  return new Promise((resolve) => {
    const runFrame = (remaining: number) => {
      if (remaining <= 0) {
        resolve()
        return
      }

      requestAnimationFrame(() => runFrame(remaining - 1))
    }

    runFrame(frameCount)
  })
}

function sanitizeDownloadName(name: string | undefined): string {
  const normalized = (name || 'dashboard')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || 'dashboard'
}

function collectExportLayoutMetrics(gridContent: HTMLElement): ExportLayoutMetrics {
  const gridContentRect = gridContent.getBoundingClientRect()
  const gridLayout = gridContent.querySelector<HTMLElement>('.vue-grid-layout')
  const items = Array.from(gridContent.querySelectorAll<HTMLElement>('.vue-grid-item[data-i]'))
    .map((item) => {
      const id = item.dataset.i
      if (!id) {
        return null
      }

      const rect = item.getBoundingClientRect()
      return {
        id,
        left: Math.max(0, Math.round(rect.left - gridContentRect.left)),
        top: Math.max(0, Math.round(rect.top - gridContentRect.top)),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      }
    })
    .filter((item): item is ExportItemMetric => item !== null)

  const width = Math.max(
    Math.ceil(gridContent.scrollWidth),
    Math.ceil(gridContent.clientWidth),
    Math.ceil(gridLayout?.scrollWidth || 0),
    ...items.map((item) => item.left + item.width),
  )

  const height = Math.max(
    Math.ceil(gridContent.scrollHeight),
    Math.ceil(gridContent.clientHeight),
    Math.ceil(gridLayout?.scrollHeight || 0),
    ...items.map((item) => item.top + item.height),
  )

  return { width, height, items }
}

function applyExportCloneLayout(
  clonedGridContent: HTMLElement,
  metrics: ExportLayoutMetrics,
): void {
  const itemMetrics = new Map(metrics.items.map((item) => [item.id, item]))

  clonedGridContent.classList.add('image-export-mode', 'image-export-render')
  clonedGridContent.style.width = `${metrics.width}px`
  clonedGridContent.style.maxWidth = `${metrics.width}px`
  clonedGridContent.style.height = 'auto'
  clonedGridContent.style.minHeight = `${metrics.height}px`
  clonedGridContent.style.overflow = 'visible'
  clonedGridContent.style.padding = '0'
  clonedGridContent.style.margin = '0'

  const clonedGridLayout = clonedGridContent.querySelector<HTMLElement>('.vue-grid-layout')
  if (clonedGridLayout) {
    clonedGridLayout.style.position = 'relative'
    clonedGridLayout.style.width = `${metrics.width}px`
    clonedGridLayout.style.height = `${metrics.height}px`
    clonedGridLayout.style.minHeight = `${metrics.height}px`
    clonedGridLayout.style.maxHeight = 'none'
    clonedGridLayout.style.overflow = 'visible'
  }

  clonedGridContent
    .querySelectorAll<HTMLElement>(
      '.vue-grid-placeholder, .content-edit-overlay, .dev-toolbar-shell, .vue-resizable-handle, .controls-toggle, .drag-handle-icon, .edit-indicator, .filter-remove-btn',
    )
    .forEach((element) => {
      element.style.display = 'none'
    })

  clonedGridContent.querySelectorAll<HTMLElement>('.vue-grid-item').forEach((element) => {
    const metric = itemMetrics.get(element.dataset.i || '')
    if (!metric) {
      return
    }

    element.style.position = 'absolute'
    element.style.transform = 'none'
    element.style.left = `${metric.left}px`
    element.style.top = `${metric.top}px`
    element.style.width = `${metric.width}px`
    element.style.height = `${metric.height}px`
    element.style.margin = '0'
  })

  clonedGridContent
    .querySelectorAll<HTMLElement>('.grid-item-content:not(.grid-item-section-header-style)')
    .forEach((element) => {
      element.style.boxShadow = 'none'
      element.style.border =
        '1px solid var(--trilogy-embed-border-light, var(--border-light, #e1e6ed))'
      element.style.backgroundColor =
        'var(--trilogy-embed-dashboard-background, var(--dashboard-background, #ffffff))'
      element.style.overflow = 'hidden'
    })

  clonedGridContent.querySelectorAll<HTMLElement>('.vega-container').forEach((element) => {
    if (!element.classList.contains('vega-active')) {
      element.style.display = 'none'
      return
    }

    element.style.opacity = '1'
    element.style.pointerEvents = 'none'
  })

  const clonedWindow = clonedGridContent.ownerDocument.defaultView

  clonedGridContent.querySelectorAll<HTMLElement>('.mdi').forEach((element) => {
    const path = resolveMdiIconPath(element.classList)
    if (!path) {
      return
    }

    const computedStyle = clonedWindow?.getComputedStyle(element)
    const fontSize = computedStyle?.fontSize || '16px'
    const color = computedStyle?.color || 'currentColor'
    const lineHeight = computedStyle?.lineHeight || '1'

    const svg = clonedGridContent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', fontSize)
    svg.setAttribute('height', fontSize)
    svg.setAttribute('aria-hidden', 'true')
    svg.style.display = 'block'
    svg.style.width = fontSize
    svg.style.height = fontSize
    svg.style.fill = color
    svg.style.flexShrink = '0'

    const pathElement = clonedGridContent.ownerDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    pathElement.setAttribute('d', path)
    pathElement.setAttribute('fill', 'currentColor')
    svg.appendChild(pathElement)

    element.replaceChildren(svg)
    element.classList.add('mdi-export-inline')
    element.style.display = 'inline-flex'
    element.style.alignItems = 'center'
    element.style.justifyContent = 'center'
    element.style.width = fontSize
    element.style.height = fontSize
    element.style.minWidth = fontSize
    element.style.minHeight = fontSize
    element.style.lineHeight = lineHeight
    element.style.color = color
  })
}

// Desktop-specific methods
function updateItemDimensions(itemId: string): void {
  if (!dashboard.value) return

  const container = document.querySelector(`.vue-grid-item[data-i="${itemId}"] .grid-item-content`)
  if (container) {
    const rect = container.getBoundingClientRect()
    const headerHeight = getItemData(itemId, dashboard.value.id).type === 'section-header' ? 0 : 36

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
function handleToggleMode(mode: DashboardState) {
  toggleMode(mode)
  emit('fullScreen', mode === 'fullscreen')
  // Trigger resize on mode toggle to ensure charts update
  nextTick(() => {
    triggerResize()
  })
}

// Image Export functionality
async function exportToImage() {
  if (!dashboard.value || isExportingImage.value) return

  isExportingImage.value = true

  try {
    // Dynamically import html2canvas only when needed
    const { default: html2canvas } = await import('html2canvas')

    // Find the dashboard content element
    const dashboardElement = gridContentRef.value
    if (!dashboardElement) {
      throw new Error('Dashboard content not found')
    }

    // Temporarily disable any hover effects and transitions for cleaner capture
    dashboardElement.classList.add('image-export-mode')

    // Wait for pending layout, font, and chart renders to settle.
    await nextTick()
    await waitForAnimationFrames(3)

    if ('fonts' in document) {
      await document.fonts.ready
    }

    const exportMetrics = collectExportLayoutMetrics(dashboardElement)

    // Capture the dashboard as canvas
    const canvas = await html2canvas(dashboardElement as HTMLElement, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: exportMetrics.width,
      height: exportMetrics.height,
      windowWidth: exportMetrics.width,
      windowHeight: exportMetrics.height,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDocument) => {
        const clonedGridContent = clonedDocument.querySelector<HTMLElement>('.grid-content')
        if (!clonedGridContent) {
          return
        }

        applyExportCloneLayout(clonedGridContent, exportMetrics)
      },
    })

    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })

    if (!imageBlob) {
      throw new Error('Failed to create dashboard image')
    }

    const downloadUrl = URL.createObjectURL(imageBlob)

    // Create download link
    const link = document.createElement('a')
    link.download = `${sanitizeDownloadName(dashboard.value.name)}_${new Date().toISOString().split('T')[0]}.png`
    link.href = downloadUrl

    // Trigger download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    console.error('Error exporting image:', error)
    alert('Failed to export image. Please try again.')
  } finally {
    const dashboardElement = gridContentRef.value
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
      :edits-locked="dashboard.state === 'locked'"
      :selected-connection="selectedConnection"
      :filterError="filterError"
      :globalCompletion="globalCompletion"
      :validateFilter="validateFilter"
      :export-image-action="exportToImage"
      :has-llm-connection="hasLlmConnection"
      :chat-open="chatPanelOpen"
      @connection-change="onConnectionChange"
      @filter-change="handleFilterChange"
      @import-change="handleImportChange"
      @add-item="openAddItemModal"
      @clear-items="clearItems"
      @mode-change="handleToggleMode"
      @refresh="handleRefresh"
      @clear-filter="handleFilterClear"
      @title-update="updateTitle"
      @export-image="exportToImage"
      @toggle-chat="toggleChatPanel"
      @fork-investigation="handleForkInvestigation"
    />

    <div class="dashboard-body" :class="{ 'chat-open': chatPanelOpen }">
      <div class="dashboard-main">
        <div v-if="dashboard && layout.length === 0" class="empty-dashboard-wrapper">
          <DashboardCTA :dashboard-id="dashboard.id" />
        </div>

        <div v-else class="grid-container">
          <div
            ref="gridContentRef"
            class="grid-content"
            :style="{ maxWidth: dashboardMaxWidth + 'px' }"
          >
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
      </div>

      <DashboardChatPanel
        v-if="chatPanelOpen && dashboard"
        :dashboard="dashboard"
        :get-dashboard-query-executor="getDashboardQueryExecutor"
        :refresh-item="handleRefreshItem"
        @close="chatPanelOpen = false"
      />
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
  background-color: var(--main-bg-color);
}

.dashboard-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dashboard-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toggle-mode-button {
  background-color: var(--button-bg) !important;
  color: var(--text-color) !important;
}

.grid-container {
  flex: 1;
  overflow: auto;
  padding: 16px 18px 24px;
  background-color: var(--main-bg-color);
  display: flex;
  justify-content: center;
  min-height: 0;
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

.grid-content.image-export-mode {
  overflow: visible !important;
}

.grid-content.image-export-mode :deep(.vue-grid-layout) {
  overflow: visible !important;
}

.grid-content.image-export-mode .vue-grid-item:hover {
  transform: none !important;
}

.grid-content.image-export-mode .content-edit-overlay,
.grid-content.image-export-mode .dev-toolbar-shell,
.grid-content.image-export-mode :deep(.vue-resizable-handle),
.grid-content.image-export-mode .drag-handle-icon,
.grid-content.image-export-mode .edit-indicator,
.grid-content.image-export-mode .controls-toggle,
.grid-content.image-export-mode .filter-remove-btn {
  display: none !important;
}

.grid-content.image-export-mode .vega-container:not(.vega-active) {
  display: none !important;
}

.grid-content.image-export-mode .mdi-export-inline::before,
.grid-content.image-export-mode .mdi-export-inline::after {
  display: none !important;
  content: none !important;
}

.grid-content.image-export-mode .grid-item-content:not(.grid-item-section-header-style) {
  box-shadow: none !important;
  border: 1px solid var(--trilogy-embed-border-light, var(--border-light, #e1e6ed)) !important;
  background: var(
    --trilogy-embed-dashboard-background,
    var(--dashboard-background, #ffffff)
  ) !important;
  overflow: hidden !important;
}

.vue-grid-layout {
  background: transparent;
  height: 100%;
}

.vue-grid-item:not(.vue-grid-placeholder) {
  background: transparent;
}

.vue-grid-item .resizing {
  opacity: 0.9;
}

.vue-grid-item .static {
  background: var(--sidebar-selector-bg);
}

:deep(.vue-resizable-handle) {
  width: 22px !important;
  height: 22px !important;
  right: -6px !important;
  bottom: -6px !important;
  background-image: none !important;
  background-color: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  opacity: 0.96;
}

:deep(.vue-resizable-handle::before) {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 13px;
  height: 13px;
  border-right: 1.5px solid rgba(148, 163, 184, 0.72);
  border-bottom: 1.5px solid rgba(148, 163, 184, 0.72);
  border-radius: 0 0 15px 0;
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
