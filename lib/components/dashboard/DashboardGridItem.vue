<script lang="ts" setup>
import { ref, computed } from 'vue'
import DashboardChart from './DashboardChart.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'
import DashboardTable from './DashboardTable.vue'
import DashboardFilter from './DashboardFilter.vue'
import {
  type GridItemDataResponse,
  type LayoutItem,
  CELL_TYPES,
  type DimensionClick,
} from '../../dashboards/base'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { CompletionItem } from '../../stores/resolver'

const props = defineProps<{
  dashboardId: string
  item: LayoutItem
  editMode: boolean
  symbols: CompletionItem[]
  getItemData: (itemId: string, dashboardId: string) => GridItemDataResponse
  getDashboardQueryExecutor: (dashboardId: string) => DashboardQueryExecutor
  setItemData: (itemId: string, dashboardId: string, data: any) => void
}>()

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

const cellComponent = computed(() => {
  switch (itemData.value.type) {
    case CELL_TYPES.CHART:
      return DashboardChart
    case CELL_TYPES.TABLE:
      return DashboardTable
    case CELL_TYPES.FILTER:
      return DashboardFilter
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

const displayTitle = computed(() => {
  const name = itemData.value.name?.trim()
  return name || getPlaceholderText.value
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
      'grid-item-edit-style': editMode,
    }"
    @mouseenter="
      () => {
        isHeaderVisible = true
      }
    "
    @mouseleave="
      () => {
        isHeaderVisible = false
      }
    "
  >
    <div
      v-if="editMode"
      class="dev-toolbar-shell"
      :class="{ 'dev-toolbar-visible': isHeaderVisible || editingItemTitle }"
    >
      <div class="dev-toolbar" data-testid="dashboard-item-header-controls">
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
          class="control-btn remove-btn"
          :data-testid="`remove-dashboard-item-${item.i}`"
          title="Remove item"
        >
          <i class="mdi mdi-delete-outline icon"></i>
        </button>
      </div>
    </div>

    <div class="grid-item-header">
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
            :class="{ 'item-title-static': !editMode }"
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
          <div
            v-for="(filter, index) in visibleHeaderFilters"
            :key="`${filter.source}-${filter.value}-${index}`"
            class="header-filter-chip"
            :title="cleanFilterValue(filter.value)"
          >
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

          <div
            v-if="hiddenFilterCount > 0"
            class="header-filter-chip filter-overflow"
            :title="`${hiddenFilterCount} more filter(s)`"
          >
            +{{ hiddenFilterCount }}
          </div>
        </div>
      </div>
    </div>

    <div class="content-area">
      <component
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
    </div>
  </div>
</template>

<style scoped>
.grid-item-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  color: var(--result-window-font);
  position: relative;
  overflow-y: hidden;
  background-color: var(--dashboard-background);
  border-radius: 16px;
  box-shadow:
    inset 0 0 0 1px var(--border),
    var(--surface-shadow);
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
  background-color: var(--panel-header-bg);
  border-bottom: 1px solid var(--border-light);
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
}

.item-title {
  font-family: var(--font-heading);
  font-size: var(--widget-title-font-size);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.015em;
  color: var(--text-color);
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

.editable-title:hover {
  color: var(--special-text);
}

.item-title-static:hover {
  color: var(--text-color);
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
  border: 1px solid var(--special-text);
  outline: none;
  background-color: var(--query-window-bg);
  color: var(--text-color);
  border-radius: 10px;
}

.grid-item-drag-handle {
  cursor: move !important;
}

.drag-handle-icon {
  display: flex;
  align-items: center;
  color: var(--text-color);
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
  border: 1px solid var(--overlay-border, rgba(148, 163, 184, 0.24));
  background-color: var(--floating-surface-strong, rgba(255, 255, 255, 0.97));
  color: var(--floating-text, var(--text-color));
  cursor: pointer;
  font-size: var(--button-font-size);
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;
  border-radius: 10px;
}

.control-btn:hover {
  background-color: var(--floating-surface, rgba(255, 255, 255, 0.9));
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.28);
}

.control-btn.remove-btn {
  color: var(--delete-color, #dc2626);
  border-color: currentColor;
  opacity: 0.82;
}

.control-btn.remove-btn:hover {
  background-color: var(--delete-color, #dc2626);
  border-color: var(--delete-color, #dc2626);
  color: #ffffff;
  opacity: 1;
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
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(var(--special-text-rgb, 37, 99, 235), 0.18);
  color: var(--text-color);
}

.filter-content {
  display: flex;
  align-items: center;
  min-width: 0;
}

.filter-source {
  font-weight: 600;
  color: var(--special-text);
  flex-shrink: 0;
}

.filter-value {
  color: var(--text-color);
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
  color: var(--text-color);
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
