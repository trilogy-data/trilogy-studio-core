<script lang="ts" setup>
import { ref, computed } from 'vue'
import DashboardChart from './DashboardChart.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'
import DashboardTable from './DashboardTable.vue'
import DashboardFilter from './DashboardFilter.vue'
import Tooltip from '../Tooltip.vue'
import { useClickOutside } from '../../composables/useClickOutside'
import {
  type GridItemDataResponse,
  type LayoutItem,
  CELL_TYPES,
  type DimensionClick,
} from '../../dashboards/base'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { CompletionItem } from '../../stores/resolver'

export interface DashboardGridItemProps {
  dashboardId: string
  item: LayoutItem
  editMode: boolean
  symbols: CompletionItem[]
  getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse
  getDashboardQueryExecutor: (dashboardId: string) => DashboardQueryExecutor
  setItemData: (itemId: string, dashboardId: string, data: any) => void
}

const props = defineProps<DashboardGridItemProps>()

const emit = defineEmits<{
  'edit-content': [item: LayoutItem]
  'update-dimensions': [itemId: string]
  'dimension-click': [DimensionClick]
  'background-click': [itemId: string]
  'remove-filter': [itemId: string, filterSource: string]
  'remove-item': [itemId: string]
  'copy-item': [itemId: string]
}>()

const editingItemTitle = ref(false)
const editableItemName = ref('')
const isHeaderVisible = ref(false)
const controlsDismissed = ref(false)
const contentEditToolbarRef = ref<HTMLElement | null>(null)
const devToolbarRef = ref<HTMLElement | null>(null)

function cleanFilterValue(value: string): string {
  return value.replace(/'''/g, "'").replace('local.', '')
}

function truncateFilterValue(value: string, maxLength: number = 1000): string {
  const cleanValue = cleanFilterValue(value)
  if (cleanValue.length <= maxLength) {
    return cleanValue
  }
  return cleanValue.substring(0, maxLength) + '...'
}

function startTitleEditing(): void {
  if (!props.editMode) return

  const currentItemData = props.getItemData(props.item.i, props.dashboardId)
  isHeaderVisible.value = false
  controlsDismissed.value = false
  editingItemTitle.value = true
  editableItemName.value = currentItemData.name

  setTimeout(() => {
    const input = document.getElementById(`title-input-${props.item.i}`)
    if (input) {
      input.focus()
    }
  }, 0)
}

function saveTitleEdit(): void {
  if (editingItemTitle.value) {
    const currentItemData = props.getItemData(props.item.i, props.dashboardId)
    const newName = editableItemName.value.trim() || currentItemData.name

    props.setItemData(props.item.i, props.dashboardId, { name: newName })
    editingItemTitle.value = false
  }
}

function toggleCrossFilterEligible(): void {
  const currentItemData = props.getItemData(props.item.i, props.dashboardId)
  const newAllowCrossFilter = !currentItemData.allowCrossFilter

  props.setItemData(props.item.i, props.dashboardId, {
    allowCrossFilter: newAllowCrossFilter,
  })
}

function increaseHeight(): void {
  const newHeight = props.item.h + 1
  props.setItemData(props.item.i, props.dashboardId, {
    dimensions: {
      width: props.item.w,
      height: newHeight,
    },
  })
}

function decreaseHeight(): void {
  const newHeight = Math.max(1, props.item.h - 1)
  props.setItemData(props.item.i, props.dashboardId, {
    dimensions: {
      width: props.item.w,
      height: newHeight,
    },
  })
}

function cancelTitleEdit(): void {
  editingItemTitle.value = false
}

function openEditor(): void {
  if (isSectionHeader.value) {
    startTitleEditing()
    return
  }
  emit('edit-content', props.item)
}

function removeItem(): void {
  if (confirm(`Are you sure you want to remove "${itemData.value.name}"?`)) {
    emit('remove-item', props.item.i)
  }
}

function copyItem(): void {
  emit('copy-item', props.item.i)
}

function dimensionClick(v: DimensionClick): void {
  emit('dimension-click', v)
}

function backgroundClick(): void {
  emit('background-click', props.item.i)
}

function removeFilter(filterSource: string): void {
  emit('remove-filter', props.item.i, filterSource)
}

const itemData = computed(() => props.getItemData(props.item.i, props.dashboardId))
const isSectionHeader = computed(() => itemData.value.type === CELL_TYPES.SECTION_HEADER)

const cellComponent = computed(() => {
  switch (itemData.value.type) {
    case CELL_TYPES.CHART:
      return DashboardChart
    case CELL_TYPES.TABLE:
      return DashboardTable
    case CELL_TYPES.FILTER:
      return DashboardFilter
    case CELL_TYPES.SECTION_HEADER:
      return null
    case CELL_TYPES.MARKDOWN:
    default:
      return DashboardMarkdown
  }
})

const getPlaceholderText = computed(() => {
  switch (itemData.value.type) {
    case CELL_TYPES.CHART:
      return 'Chart Name'
    case CELL_TYPES.TABLE:
      return 'Table Name'
    case CELL_TYPES.FILTER:
      return 'Filter Name'
    case CELL_TYPES.SECTION_HEADER:
      return 'Section Header'
    case CELL_TYPES.MARKDOWN:
    default:
      return 'Note Name'
  }
})

const supportsFilters = computed(() => {
  //@ts-ignore
  return [CELL_TYPES.CHART, CELL_TYPES.TABLE, CELL_TYPES.MARKDOWN].includes(itemData.value.type)
})

const filterCount = computed(() => {
  return itemData.value.filters ? itemData.value.filters.length : 0
})

const visibleHeaderFilters = computed(() => {
  return (itemData.value.filters || []).slice(0, 2)
})

const hiddenFilterCount = computed(() => {
  return Math.max(0, filterCount.value - visibleHeaderFilters.value.length)
})

type WidgetHeaderLevel = 1 | 2 | 3

function parseWidgetHeaderTitle(
  rawTitle: string | undefined,
  fallbackTitle: string,
): {
  text: string
  level: WidgetHeaderLevel
} {
  const trimmedTitle = rawTitle?.trim()
  if (!trimmedTitle) {
    return { text: fallbackTitle, level: 3 }
  }

  const headingMatch = trimmedTitle.match(/^(#{1,3})\s*(.+)$/)
  if (!headingMatch) {
    return { text: trimmedTitle, level: 3 }
  }

  const headingText = headingMatch[2]?.trim()
  if (!headingText) {
    return { text: trimmedTitle, level: 3 }
  }

  return {
    text: headingText,
    level: headingMatch[1].length as WidgetHeaderLevel,
  }
}

const parsedDisplayTitle = computed(() => {
  return parseWidgetHeaderTitle(itemData.value.name, getPlaceholderText.value)
})

const displayTitle = computed(() => {
  return parsedDisplayTitle.value.text
})

const titleLevelClass = computed(() => {
  return `item-title-level-${parsedDisplayTitle.value.level}`
})

const editControlsVisible = computed(() => {
  return isHeaderVisible.value && !editingItemTitle.value && !controlsDismissed.value
})

function dismissHoverControls(): void {
  if (!editControlsVisible.value) {
    return
  }

  controlsDismissed.value = true
  isHeaderVisible.value = false
}

function handleMouseEnter(): void {
  isHeaderVisible.value = true
  controlsDismissed.value = false
}

function handleMouseLeave(): void {
  isHeaderVisible.value = false
  controlsDismissed.value = false
}

useClickOutside([contentEditToolbarRef, devToolbarRef], dismissHoverControls, {
  enabled: () => editControlsVisible.value,
  eventName: 'mousedown',
})
</script>

<template>
  <div
    class="grid-item-content"
    :data-testid="`dashboard-component-${item.i}`"
    :class="{
      'grid-item-chart-style': [CELL_TYPES.CHART, CELL_TYPES.TABLE, CELL_TYPES.FILTER].includes(
        //@ts-ignore
        itemData.type,
      ),
      'grid-item-section-header-style': isSectionHeader,
      'grid-item-edit-style': editMode,
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div
      v-if="editMode && isSectionHeader"
      class="dev-toolbar-shell"
      :class="{ 'dev-toolbar-visible': editControlsVisible }"
    >
      <div ref="devToolbarRef" class="dev-toolbar" data-testid="dashboard-item-header-controls">
        <button
          @click="openEditor"
          class="control-btn"
          :data-testid="`edit-dashboard-item-content-${item.i}`"
          title="Edit title"
        >
          <i class="mdi mdi-pencil-outline icon"></i>
        </button>
        <button
          @click="copyItem"
          class="control-btn"
          :data-testid="`copy-dashboard-item-${item.i}`"
          title="Copy item"
        >
          <i class="mdi mdi-content-copy icon"></i>
        </button>
        <button
          @click="removeItem"
          class="control-btn dashboard-remove-btn"
          :data-testid="`remove-dashboard-item-${item.i}`"
          title="Remove item"
        >
          <i class="mdi mdi-delete-outline icon"></i>
        </button>
      </div>
    </div>

    <div v-if="!isSectionHeader" class="grid-item-header">
      <div class="grid-item-header-left">
        <div v-if="editMode" class="drag-handle-icon grid-item-drag-handle">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="drag-handle-svg"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </div>

        <div class="item-title-container no-drag">
          <div
            v-if="!editingItemTitle"
            class="item-title editable-title"
            :class="[titleLevelClass, { 'item-title-static': !editMode }]"
            :title="displayTitle"
            @click="startTitleEditing"
          >
            <span class="item-title-text">{{ displayTitle }}</span>
            <i v-if="editMode" class="mdi mdi-pencil-outline edit-indicator"></i>
          </div>

          <input
            v-else
            :id="`title-input-${item.i}`"
            v-model="editableItemName"
            @blur="saveTitleEdit"
            @keyup.enter="saveTitleEdit"
            @keyup.esc="cancelTitleEdit"
            class="title-input"
            type="text"
            :placeholder="getPlaceholderText"
          />
        </div>
      </div>

      <div class="grid-item-header-right">
        <div v-if="supportsFilters && filterCount > 0" class="header-filters no-drag">
          <Tooltip
            v-for="(filter, index) in visibleHeaderFilters"
            :key="`${filter.source}-${filter.value}-${index}`"
            :content="cleanFilterValue(filter.value)"
            position="bottom"
          >
            <div class="header-filter-chip">
              <span class="filter-content">
                <span class="filter-source"
                  >{{ filter.source === 'global' ? filter.source : 'cross' }}:&nbsp;</span
                >
                <span class="filter-value">{{ truncateFilterValue(filter.value, 40) }}</span>
              </span>
              <button
                v-if="editMode && filter.source !== 'global'"
                class="filter-remove-btn"
                @click="removeFilter(filter.source)"
                :title="`Remove ${filter.source} filter`"
              >
                x
              </button>
            </div>
          </Tooltip>

          <Tooltip
            v-if="hiddenFilterCount > 0"
            :content="`${hiddenFilterCount} more filter(s)`"
            position="bottom"
          >
            <div class="header-filter-chip filter-overflow">
              +{{ hiddenFilterCount }}
            </div>
          </Tooltip>
        </div>
      </div>
    </div>

    <div class="content-area" :class="{ 'section-header-content': isSectionHeader }">
      <template v-if="isSectionHeader">
        <div
          v-if="!editingItemTitle"
          class="section-header-display no-drag"
          :class="[titleLevelClass, { 'section-header-editable': editMode }]"
          :title="displayTitle"
          @click="startTitleEditing"
        >
          <span class="section-header-text">{{ displayTitle }}</span>
        </div>

        <input
          v-else
          :id="`title-input-${item.i}`"
          v-model="editableItemName"
          @blur="saveTitleEdit"
          @keyup.enter="saveTitleEdit"
          @keyup.esc="cancelTitleEdit"
          class="title-input section-header-input no-drag"
          type="text"
          :placeholder="getPlaceholderText"
        />
      </template>

      <component
        v-else
        :is="cellComponent"
        :dashboardId="props.dashboardId"
        :itemId="item.i"
        :setItemData="setItemData"
        :getItemData="getItemData"
        :getDashboardQueryExecutor="getDashboardQueryExecutor"
        :editMode="editMode"
        :symbols="props.symbols || []"
        @dimension-click="dimensionClick"
        @background-click="backgroundClick"
      />

      <div
        v-if="editMode && !isSectionHeader"
        class="content-edit-overlay no-drag"
        :class="{ 'content-edit-overlay-visible': editControlsVisible }"
      >
        <div
          ref="contentEditToolbarRef"
          class="content-edit-toolbar"
          data-testid="dashboard-item-header-controls"
        >
          <button
            @click="increaseHeight"
            class="control-btn"
            :data-testid="`increase-height-item-${item.i}`"
            title="Increase height"
          >
            <i class="mdi mdi-plus icon"></i>
          </button>
          <button
            @click="decreaseHeight"
            class="control-btn"
            :data-testid="`decrease-height-item-${item.i}`"
            title="Decrease height"
          >
            <i class="mdi mdi-minus icon"></i>
          </button>
          <button
            @click="openEditor"
            class="control-btn"
            :data-testid="`edit-dashboard-item-content-${item.i}`"
            title="Edit data"
          >
            <i class="mdi mdi-database-edit-outline icon"></i>
          </button>
          <button
            @click="toggleCrossFilterEligible"
            class="control-btn"
            :data-testid="`toggle-crossfilter-item-content-${item.i}`"
            :title="
              itemData.allowCrossFilter ? 'Toggle cross-filtering OFF' : 'Toggle cross-filtering ON'
            "
          >
            <i v-if="itemData.allowCrossFilter" class="mdi mdi-filter-remove-outline icon"></i>
            <i v-else class="mdi mdi-filter-outline icon"></i>
          </button>
          <button
            @click="copyItem"
            class="control-btn"
            :data-testid="`copy-dashboard-item-${item.i}`"
            title="Copy item"
          >
            <i class="mdi mdi-content-copy icon"></i>
          </button>
          <button
            @click="removeItem"
            class="control-btn dashboard-remove-btn"
            :data-testid="`remove-dashboard-item-${item.i}`"
            title="Remove item"
          >
            <i class="mdi mdi-delete-outline icon"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-item-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  color: var(
    --trilogy-embed-result-window-font,
    var(--result-window-font, var(--text-color, #1f2937))
  );
  position: relative;
  overflow-y: hidden;
  background-color: var(--trilogy-embed-dashboard-background, var(--dashboard-background, #ffffff));
  border-radius: 14px;
  box-shadow:
    inset 0 0 0 1px var(--trilogy-embed-border, var(--border-color, var(--border, #d6dde6))),
    var(--trilogy-embed-surface-shadow, var(--surface-shadow, 0 1px 2px rgba(15, 23, 42, 0.08)));
}

.grid-item-section-header-style {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}

.grid-item-section-header-style .dev-toolbar-shell {
  position: absolute;
  top: -4px;
  left: 0;
  right: 0;
  z-index: 2;
  pointer-events: none;
}

.grid-item-section-header-style .dev-toolbar {
  pointer-events: auto;
  margin: 0 auto;
}

.dev-toolbar-shell {
  display: flex;
  justify-content: center;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height 0.18s ease,
    opacity 0.18s ease;
  transition-delay: 0s;
  flex-shrink: 0;
}

.dev-toolbar-visible {
  max-height: calc(var(--chart-control-height) + 8px);
  opacity: 1;
  transition-delay: var(--hover-drawer-delay);
}

.dev-toolbar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 3px 8px 4px;
}

.grid-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 27px;
  padding: 4px 12px 3px;
  background-color: var(--trilogy-embed-panel-header-bg, var(--panel-header-bg, #f6f8fb));
  border-bottom: 1px solid var(--trilogy-embed-border, var(--border-color, var(--border, #d6dde6)));
  flex-shrink: 0;
}

.grid-item-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.grid-item-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  flex: 1;
}

@media (min-width: 769px) {
  .grid-item-content *:not(.grid-item-drag-handle) {
    touch-action: none;
  }

  .item-title-container {
    flex: 1;
    min-width: 0;
    touch-action: none;
  }
}

@media (max-width: 768px) {
  .grid-item-content *:not(.grid-item-drag-handle) {
    touch-action: auto;
  }

  .item-title-container {
    flex: 1;
    min-width: 0;
    touch-action: auto;
  }
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.section-header-content {
  box-sizing: border-box;
  width: 100%;
  height: auto;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 2px 12px;
}

.content-edit-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(15, 23, 42, 0.16);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.content-edit-overlay-visible {
  opacity: 1;
  pointer-events: auto;
}

.content-edit-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  max-width: min(100%, 280px);
  padding: 8px;
  border-radius: 14px;
  background: color-mix(
    in srgb,
    var(--trilogy-embed-bg, var(--bg-color, #ffffff)) 92%,
    rgba(15, 23, 42, 0.92)
  );
  border: 1px solid rgba(148, 163, 184, 0.28);
  box-shadow: 0 20px 38px rgba(15, 23, 42, 0.3);
  transform: translateY(12px) scale(0.98);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.content-edit-overlay-visible .content-edit-toolbar {
  transform: translateY(0) scale(1);
}

.item-title {
  font-family: var(--font-heading);
  font-size: var(--widget-title-font-size);
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
}

.item-title-level-1 {
  font-size: calc(var(--section-title-font-size) + 1px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.035em;
}

.item-title-level-2 {
  font-size: calc(var(--widget-title-font-size) + 2px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.item-title-level-3 {
  font-size: var(--widget-title-font-size);
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.editable-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 1px 0;
  cursor: pointer;
}

.item-title-static {
  cursor: default;
}

.item-title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-header-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: auto;
  text-align: center;
  color: var(--trilogy-embed-dashboard-helper-text, var(--dashboard-helper-text, #425466));
  opacity: 0.9;
  overflow: hidden;
}

.section-header-display::before,
.section-header-display::after {
  content: '';
  flex: 1 1 0;
  min-width: 18px;
  height: 1px;
  background: var(--trilogy-embed-border-light, var(--border-light, #e1e6ed));
  opacity: 0.9;
}

.section-header-editable {
  cursor: pointer;
}

.section-header-editable:hover {
  color: var(--trilogy-embed-special-text, var(--special-text, #2563eb));
}

.section-header-text {
  min-width: 0;
  max-width: min(100%, 900px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
}

.editable-title:hover {
  color: var(--trilogy-embed-special-text, var(--special-text, #2563eb));
}

.item-title-static:hover {
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
}

.edit-indicator {
  font-size: 13px;
  opacity: 0.5;
  flex-shrink: 0;
}

.editable-title:hover .edit-indicator {
  opacity: 0.9;
}

.title-input {
  width: 100%;
  padding: 4px 6px;
  font-size: var(--font-size);
  font-weight: 600;
  border: 1px solid var(--trilogy-embed-special-text, var(--special-text, #2563eb));
  outline: none;
  background-color: var(--trilogy-embed-bg, var(--bg-color, #ffffff));
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  border-radius: 10px;
}

.section-header-input {
  box-sizing: border-box;
  max-width: min(100%, 560px);
  text-align: center;
}

.grid-item-section-header-style :deep(.vue-resizable-handle) {
  opacity: 0;
  pointer-events: none;
}

.grid-item-drag-handle {
  cursor: move !important;
}

.drag-handle-icon {
  display: flex;
  align-items: center;
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  opacity: 0.45;
}

.vue-resizable-handle {
  color: white !important;
}

.grid-item-header:hover .drag-handle-icon {
  opacity: 0.7;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--chart-control-height);
  height: var(--chart-control-height);
  border: 1px solid
    var(--trilogy-embed-overlay-border, var(--overlay-border, rgba(148, 163, 184, 0.14)));
  background-color: var(
    --trilogy-embed-floating-surface-strong,
    var(--floating-surface-strong, rgba(255, 255, 255, 0.97))
  );
  color: var(--trilogy-embed-floating-text, var(--floating-text, var(--text-color, #1f2937)));
  cursor: pointer;
  font-size: var(--button-font-size);
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;
  border-radius: 10px;
}

.control-btn:hover {
  background-color: var(
    --trilogy-embed-floating-surface,
    var(--floating-surface, rgba(255, 255, 255, 0.9))
  );
  border-color: rgba(
    var(--trilogy-embed-special-text-rgb, var(--special-text-rgb, 37, 99, 235)),
    0.28
  );
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}

.control-btn.dashboard-remove-btn {
  background: var(
    --trilogy-embed-floating-surface-strong,
    var(--floating-surface-strong, rgba(255, 255, 255, 0.97))
  );
  color: var(--trilogy-embed-delete-color, #dc2626);
  border-color: rgba(220, 38, 38, 0.32);
  opacity: 0.82;
}

.control-btn.dashboard-remove-btn:hover {
  background: #dc2626 !important;
  background-color: #dc2626 !important;
  border-color: #dc2626 !important;
  color: #ffffff !important;
  opacity: 1;
  box-shadow: 0 10px 24px rgba(220, 38, 38, 0.28);
}

.control-btn.dashboard-remove-btn:hover .icon {
  color: #ffffff !important;
}

.icon {
  font-size: 15px;
}

.header-filters {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  flex-wrap: nowrap;
  margin-left: auto;
}

.header-filter-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 220px;
  padding: 1px 7px;
  font-size: 10px;
  letter-spacing: var(--ui-label-letter-spacing);
  background: rgba(
    var(--trilogy-embed-special-text-rgb, var(--special-text-rgb, 37, 99, 235)),
    0.08
  );
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px
    rgba(var(--trilogy-embed-special-text-rgb, var(--special-text-rgb, 37, 99, 235)), 0.18);
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
}

.filter-content {
  display: flex;
  align-items: center;
  min-width: 0;
}

.filter-source {
  font-weight: 600;
  color: var(--trilogy-embed-special-text, var(--special-text, #2563eb));
  flex-shrink: 0;
}

.filter-value {
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.filter-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 3px;
  border: none;
  background: none;
  color: var(--trilogy-embed-text-color, var(--text-color, #1f2937));
  opacity: 0.7;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  width: 14px;
  height: 14px;
  padding: 0;
}

.filter-remove-btn:hover {
  opacity: 1;
  background-color: rgba(148, 163, 184, 0.08);
}

.filter-overflow {
  font-weight: 600;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .dev-toolbar-visible {
    max-height: calc(var(--chart-control-height) + 6px);
  }

  .dev-toolbar {
    padding: 2px 6px 4px;
  }

  .grid-item-header {
    padding: 3px 10px 2px;
    min-height: 25px;
  }

  .content-edit-overlay {
    padding: 10px;
  }

  .content-edit-toolbar {
    max-width: 100%;
    gap: 4px;
    padding: 6px;
  }

  .grid-item-header-right {
    justify-content: flex-end;
  }

  .header-filters {
    max-width: 45%;
  }

  .header-filter-chip {
    max-width: 150px;
  }

  .control-btn {
    width: 32px;
    height: 32px;
  }
}
</style>
