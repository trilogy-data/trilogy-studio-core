<script lang="ts" setup>
import { ref, computed, nextTick, inject, watch, onBeforeUnmount } from 'vue'
import { registerDashboardBridge, unregisterDashboardBridge } from '../../stores/screenBridge'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import DashboardHeader from './DashboardHeader.vue'
import DashboardGridItem from './DashboardGridItem.vue'
import DashboardAddItemModal from './DashboardAddItemModal.vue'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import FreeformEditor from './DashboardFreeformEditor.vue'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import DashboardCTA from './DashboardCTA.vue'
import useGlobalChatPanel from '../../stores/useGlobalChatPanel'
import { useDashboardAgentAutoRun } from './useDashboardAgentAutoRun'
import { useDashboard } from './useDashboard'
import { useDashboardStore } from '../../stores/dashboardStore'
import { type DashboardState } from '../../dashboards/base'
import { resolveDashboardTheme, applyEmbedPrecedence } from '../../dashboards/theme'
import {
  useResolvedThemeMode,
  useTrilogyEmbedConfig,
  normalizeEmbedTheme,
} from '../../embed/config'
import type { UserSettingsStoreType } from '../../stores/userSettingsStore'
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
  filterError,
  globalCompletion,
  showAddItemModal,
  showQueryEditor,
  showMarkdownEditor,
  showFreeformEditor,
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
  updateTheme,
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

// Container theming. The resolved theme drives both CSS custom properties and
// the two grid props (gutter, row height) that CSS cannot reach.
const settingsStore = inject<UserSettingsStoreType | null>('userSettingsStore', null)
const themeMode = useResolvedThemeMode(settingsStore)
const embedConfig = useTrilogyEmbedConfig()
const resolvedTheme = computed(() =>
  resolveDashboardTheme({ theme: dashboard.value?.theme, mode: themeMode.value }),
)
// An embedding host that named a variable outranks the dashboard definition —
// a shared dashboard should not be able to repaint the host's branding.
const dashboardThemeStyle = computed(() =>
  applyEmbedPrecedence(
    resolvedTheme.value.vars,
    normalizeEmbedTheme(embedConfig.value?.theme)?.variables,
  ),
)

// Desktop-specific reactive state
const editable = computed(() => dashboard.value?.state === 'editing' || false)
const loaded = ref(false)
const isExportingImage = ref(false)
const gridContentRef = ref<HTMLElement | null>(null)

// Chat lives in the global side panel now. The header AI button opens it on
// this dashboard's bound conversation (when one exists); CTA/creator prompts
// fire the headless dashboard agent and surface its chat in the panel.
const globalChatPanel = useGlobalChatPanel()
const chatPanelOpen = computed(() => globalChatPanel.isOpen.value)
const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
const hasLlmConnection = computed(() => !!llmConnectionStore?.activeConnection)

const { submitPrompt: submitAgentPrompt } = useDashboardAgentAutoRun(dashboard, {
  onStarted: (chatId) => globalChatPanel.openPanel(chatId),
})

// The "get started" CTA replaces the grid only while the dashboard is empty
// and the assistant is closed.
const showEmptyCTA = computed(
  () => !!dashboard.value && layout.value.length === 0 && !chatPanelOpen.value,
)

function toggleChatPanel() {
  if (globalChatPanel.isOpen.value) {
    globalChatPanel.closePanel()
    return
  }
  // Resume the dashboard's own session when it has one; otherwise open the
  // panel on whatever conversation the user last had active.
  globalChatPanel.openPanel(dashboard.value?.chatId || undefined)
}

function openChatWithPrompt(prompt: string) {
  if (!prompt || !prompt.trim()) return
  void submitAgentPrompt(prompt)
}

function handleRefreshItem(itemId: string): string | undefined {
  return handleRefresh(itemId)
}

// Publish live capabilities (screenshots, in-view refresh, the mounted query
// executor) for the global chat's dashboard tools. Registration follows the
// bound dashboard, including post-fork id changes.
watch(
  () => dashboard.value?.id,
  (id, previousId) => {
    if (previousId) unregisterDashboardBridge(previousId)
    if (id) {
      registerDashboardBridge({
        dashboardId: id,
        refreshItem: handleRefreshItem,
        captureImage: captureDashboardImage,
        getDashboardQueryExecutor: () => getDashboardQueryExecutor(id) || null,
      })
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (dashboard.value?.id) {
    unregisterDashboardBridge(dashboard.value.id)
  }
})

interface ItemOverflowDiagnostic {
  itemId: string
  visiblePx: number
  contentPx: number
  overflowPx: number
  visibleRatio: number
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

/**
 * Export dimensions for the PNG. Width is exactly what is on screen — the grid
 * lays out within the visible width and never scrolls sideways, so a wider
 * canvas would only add letterboxing. Height covers the full grid, including
 * anything the user has scrolled out of view.
 */
function collectExportDimensions(gridContent: HTMLElement): { width: number; height: number } {
  const gridContentRect = gridContent.getBoundingClientRect()
  const gridLayout = gridContent.querySelector<HTMLElement>('.vue-grid-layout')
  const layoutBottom = gridLayout
    ? gridLayout.getBoundingClientRect().bottom - gridContentRect.top
    : 0

  return {
    width: Math.max(1, Math.ceil(gridContentRect.width)),
    height: Math.max(1, Math.ceil(Math.max(gridContent.scrollHeight, layoutBottom))),
  }
}

/**
 * Walks each grid item looking for inner elements whose content exceeds their
 * visible height — i.e. content that is being clipped or hidden behind a
 * scrollbar. Returns one diagnostic per item that has meaningful overflow,
 * so the agent reviewing a screenshot is told which items are truncated and
 * by how much. Detects both `overflow: hidden` clipping and `overflow: auto/scroll`
 * scrollable regions; the screenshot only renders what is currently visible.
 */
function collectOverflowDiagnostics(gridContent: HTMLElement): ItemOverflowDiagnostic[] {
  const TOLERANCE_PX = 6
  const diagnostics: ItemOverflowDiagnostic[] = []
  const items = Array.from(gridContent.querySelectorAll<HTMLElement>('.vue-grid-item[data-i]'))

  for (const item of items) {
    const id = item.dataset.i
    if (!id) continue

    let worst: ItemOverflowDiagnostic | null = null
    // Check the item itself plus every descendant — anything that clips or scrolls
    // vertically and whose content is taller than its box is hiding content from view.
    const candidates: HTMLElement[] = [item, ...Array.from(item.querySelectorAll<HTMLElement>('*'))]
    for (const el of candidates) {
      const clientHeight = el.clientHeight
      const scrollHeight = el.scrollHeight
      if (clientHeight <= 0) continue
      const overflow = scrollHeight - clientHeight
      if (overflow <= TOLERANCE_PX) continue

      const style = window.getComputedStyle(el)
      const overflowY = style.overflowY
      // Skip elements that allow vertical content to grow beyond them naturally.
      if (overflowY === 'visible') continue

      // Skip canvas elements — chart libraries render to canvas at the size
      // they're given, not clipped, so any scrollHeight discrepancy is noise.
      if (el.tagName === 'CANVAS') continue

      if (!worst || overflow > worst.overflowPx) {
        worst = {
          itemId: id,
          visiblePx: clientHeight,
          contentPx: scrollHeight,
          overflowPx: overflow,
          visibleRatio: clientHeight / scrollHeight,
        }
      }
    }

    if (worst) {
      diagnostics.push(worst)
    }
  }

  return diagnostics
}

// Editing affordances that are visible on screen but do not belong in a
// shared PNG. Excluded via the capture `filter` so the live DOM is untouched.
const EXPORT_EXCLUDED_CLASSES = [
  'vue-grid-placeholder',
  'vue-resizable-handle',
  'content-edit-overlay',
  'dev-toolbar-shell',
  'controls-toggle',
  'drag-handle-icon',
  'edit-indicator',
  'filter-remove-btn',
]

function includeNodeInExport(node: Node): boolean {
  if (!(node instanceof Element)) {
    return true
  }

  const classList = node.classList
  if (EXPORT_EXCLUDED_CLASSES.some((className) => classList.contains(className))) {
    return false
  }

  // Charts keep an inactive container mounted while swapping renders; only
  // the active one reflects what is on screen.
  if (classList.contains('vega-container') && !classList.contains('vega-active')) {
    return false
  }

  return true
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

/**
 * Render the current dashboard to a PNG. Returns the resulting blob plus
 * width/height. Used by both the manual download (exportToImage) and the
 * agent's capture_dashboard_screenshot tool.
 *
 * Capture is delegated to modern-screenshot, which serializes the live DOM
 * into an SVG <foreignObject> and lets the browser itself paint it — so the
 * PNG matches what is on screen (Tabulator tables, box-shadows, mask-image
 * icons, text wrapping) instead of re-implementing CSS layout the way
 * html2canvas did.
 */
async function renderDashboardToPng(): Promise<{
  blob: Blob
  width: number
  height: number
  overflows: ItemOverflowDiagnostic[]
}> {
  // Dynamically import modern-screenshot only when needed
  const { domToBlob } = await import('modern-screenshot')

  // Find the dashboard content element. The agent loop lives in chatStore and
  // outlives this component, so a run can keep issuing tool calls after the
  // user switched tabs/screens and unmounted the dashboard. There is nothing
  // on screen to photograph in that case — say so plainly rather than failing
  // with a message that reads like a broken dashboard.
  const dashboardElement = gridContentRef.value
  if (!dashboardElement) {
    throw new Error(
      'the dashboard is not currently on screen (its tab is not the visible one), so there is nothing to render. Ask the user to reopen the dashboard, or continue without the screenshot.',
    )
  }

  // Wait for pending layout, font, and chart renders to settle.
  await nextTick()
  await waitForAnimationFrames(3)

  if ('fonts' in document) {
    await document.fonts.ready
  }

  const exportMetrics = collectExportDimensions(dashboardElement)
  const overflows = collectOverflowDiagnostics(dashboardElement)

  // Resolve the background painted BEHIND the cards, so dark-mode exports
  // don't get a white background. The dashboard theme can move the canvas
  // away from the card fill, so the canvas variables are checked first and
  // the card background is only the last resort.
  const exportStyles = window.getComputedStyle(dashboardElement)
  const computedBackground = [
    '--dashboard-canvas-bg',
    '--main-bg-color',
    '--trilogy-embed-dashboard-background',
  ]
    .map((name) => exportStyles.getPropertyValue(name).trim())
    .find((value) => !!value)
  const exportBackground = computedBackground || exportStyles.backgroundColor || '#ffffff'

  const imageBlob = await domToBlob(dashboardElement, {
    type: 'image/png',
    width: exportMetrics.width,
    height: exportMetrics.height,
    scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
    backgroundColor: exportBackground,
    filter: includeNodeInExport,
    features: {
      // A card the user scrolled (e.g. a long table) should export the slice
      // they are looking at, not jump back to the top.
      restoreScrollPosition: true,
    },
  })

  if (!imageBlob || imageBlob.size === 0) {
    throw new Error('Failed to create dashboard image')
  }

  return {
    blob: imageBlob,
    width: exportMetrics.width,
    height: exportMetrics.height,
    overflows,
  }
}

// Image Export functionality
async function exportToImage() {
  if (!dashboard.value || isExportingImage.value) return

  isExportingImage.value = true

  try {
    const { blob: imageBlob } = await renderDashboardToPng()
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
    isExportingImage.value = false
  }
}

/**
 * Capture the dashboard for the agent: render to PNG and return the base64
 * string for the model to review. No download is triggered — the user is
 * already looking at the live dashboard.
 */
async function captureDashboardImage(): Promise<{
  base64: string
  mediaType: string
  width: number
  height: number
  overflows: ItemOverflowDiagnostic[]
}> {
  if (!dashboard.value) {
    throw new Error('No dashboard loaded')
  }

  const { blob, width, height, overflows } = await renderDashboardToPng()

  // Convert blob to base64 for the LLM
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      // Strip the "data:image/png;base64," prefix
      const comma = dataUrl.indexOf(',')
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

  return { base64, mediaType: 'image/png', width, height, overflows }
}
</script>

<template>
  <div class="dashboard-container" v-if="dashboard" :style="dashboardThemeStyle">
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
      @theme-change="updateTheme"
      @export-image="exportToImage"
      @toggle-chat="toggleChatPanel"
    />

    <div class="dashboard-body">
      <div class="dashboard-main">
        <div v-if="showEmptyCTA" class="empty-dashboard-wrapper">
          <DashboardCTA :dashboard-id="dashboard.id" @start-chat-with-prompt="openChatWithPrompt" />
        </div>

        <!-- v-show, not v-if: the CTA must not unmount `.grid-content`, or the
             screenshot capture (agent + manual export) loses its element. -->
        <div v-show="!showEmptyCTA" class="grid-container">
          <div
            ref="gridContentRef"
            class="grid-content"
            :style="{ maxWidth: dashboardMaxWidth + 'px' }"
          >
            <GridLayout
              :col-num="20"
              :row-height="resolvedTheme.rowHeight"
              :margin="resolvedTheme.gridMargin"
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

    <Teleport to="body" v-if="showFreeformEditor && editingItem">
      <FreeformEditor
        :connectionName="getItemData(editingItem.i, dashboard.id).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboard.id).imports || []"
        :rootContent="getItemData(editingItem.i, dashboard.id).rootContent || []"
        :content="getItemData(editingItem.i, dashboard.id).freeformData || null"
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
  background-color: var(--dashboard-canvas-bg, var(--main-bg-color));
}

@media (max-width: 768px) {
  .dashboard-container {
    box-sizing: border-box;
    padding-bottom: calc(110px + env(safe-area-inset-bottom));
  }
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
  padding: var(--dashboard-canvas-padding, 16px 18px 24px);
  background-color: var(--dashboard-canvas-bg, var(--main-bg-color));
  display: flex;
  justify-content: center;
  min-height: 0;
}

.grid-content {
  width: 100%;
  height: 100%;
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
