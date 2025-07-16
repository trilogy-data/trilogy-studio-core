<script lang="ts" setup>
import { ref, computed } from 'vue'
import DashboardChart from './DashboardChart.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'
import DashboardTable from './DashboardTable.vue'
import {
  type GridItemData,
  type LayoutItem,
  CELL_TYPES,
  type DimensionClick,
} from '../dashboards/base'

// Props definition
const props = defineProps<{
  dashboardId: string
  item: LayoutItem
  editMode: boolean
  getItemData: (itemId: string, dashboardId: string) => GridItemData
  setItemData: (itemId: string, dashboardId: string, data: any) => void
}>()

// Emits
const emit = defineEmits<{
  'edit-content': [item: LayoutItem]
  'update-dimensions': [itemId: string]
  'dimension-click': [DimensionClick]
  'background-click': [itemId: string]
  'remove-filter': [itemId: string, filterSource: string]
  'remove-item': [itemId: string]
}>()

// Item title editing states
const editingItemTitle = ref(false)
const editableItemName = ref('')

// Header visibility state
const isHeaderVisible = ref(false)

// Filter visibility state
const isFiltersVisible = ref(false)

// Start editing an item title
function startTitleEditing(): void {
  if (!props.editMode) return // Only allow editing in edit mode

  const itemData = props.getItemData(props.item.i, props.dashboardId)
  editingItemTitle.value = true
  editableItemName.value = itemData.name

  // Focus on the input field after rendering
  setTimeout(() => {
    const input = document.getElementById(`title-input-${props.item.i}`)
    if (input) {
      input.focus()
    }
  }, 0)
}

// Save edited title
function saveTitleEdit(): void {
  if (editingItemTitle.value) {
    const itemData = props.getItemData(props.item.i, props.dashboardId)

    // Don't allow empty names
    const newName = editableItemName.value.trim() || itemData.name

    // Update item name via setItemData
    props.setItemData(props.item.i, props.dashboardId, { name: newName })

    editingItemTitle.value = false
  }
}

// Cancel title editing
function cancelTitleEdit(): void {
  editingItemTitle.value = false
}

// Open content editor
function openEditor(): void {
  emit('edit-content', props.item)
}

function removeItem(): void {
  if (confirm(`Are you sure you want to remove "${itemData.value.name}"?`)) {
    emit('remove-item', props.item.i)
  }
}

function dimensionClick(v: DimensionClick): void {
  emit('dimension-click', v)
}

function backgroundClick(): void {
  emit('background-click', props.item.i)
}

// Remove a filter by index
function removeFilter(filterSource: string): void {
  emit('remove-filter', props.item.i, filterSource)
}

// Get item data
const itemData = computed(() => props.getItemData(props.item.i, props.dashboardId))

// Determine which component to render based on the cell type
const cellComponent = computed(() => {
  switch (itemData.value.type) {
    case CELL_TYPES.CHART:
      return DashboardChart
    case CELL_TYPES.TABLE:
      return DashboardTable
    case CELL_TYPES.MARKDOWN:
    default:
      return DashboardMarkdown
  }
})

// Determine placeholder text based on cell type
const getPlaceholderText = computed(() => {
  switch (itemData.value.type) {
    case CELL_TYPES.CHART:
      return 'Chart Name'
    case CELL_TYPES.TABLE:
      return 'Table Name'
    case CELL_TYPES.MARKDOWN:
    default:
      return 'Note Name'
  }
})

// Check if the item type supports filters
const supportsFilters = computed(() => {
  //@ts-ignore
  return [CELL_TYPES.CHART, CELL_TYPES.TABLE].includes(itemData.value.type)
})

// Get the count of filters applied to this item
const filterCount = computed(() => {
  return itemData.value.filters ? itemData.value.filters.length : 0
})
</script>

<template>
  <div
    class="grid-item-content"
    :data-testid="`dashboard-component-${item.i}`"
    :class="{
      //@ts-ignore
      'grid-item-chart-style': [CELL_TYPES.CHART, CELL_TYPES.TABLE].includes(itemData.type),
      'grid-item-edit-style': editMode,
    }"
    @mouseenter="
      () => {
        isHeaderVisible = true
        isFiltersVisible = true
      }
    "
    @mouseleave="
      () => {
        isHeaderVisible = false
        isFiltersVisible = false
      }
    "
  >
    <!-- Edit Content button (always visible in edit mode) -->
    <button
      v-if="editMode"
      @click="openEditor"
      class="edit-button always-visible"
      :data-testid="`edit-dashboard-item-content-${item.i}`"
    >
      Data
    </button>
    <button
      v-if="editMode"
      @click="removeItem"
      class="remove-button always-visible"
      :data-testid="`remove-dashboard-item-${item.i}`"
    >
      Remove
    </button>
    <!-- Transparent overlay header (only in edit mode) -->
    <div
      v-if="editMode"
      class="grid-item-header overlay-header"
      :class="{ 'header-visible': isHeaderVisible || editingItemTitle }"
    >
      <!-- Drag handle icon -->
      <div class="drag-handle-icon grid-item-drag-handle">
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

      <!-- Editable item title -->
      <div class="item-title-container">
        <!-- Display title (clickable) -->
        <div v-if="!editingItemTitle" class="item-title editable-title" @click="startTitleEditing">
          {{ itemData.name }}
          <span class="edit-indicator">✎</span>
        </div>

        <!-- Edit title input -->
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

    <!-- Filters display container -->
    <div class="filters-container" v-if="supportsFilters">
      <!-- Edit mode - show filters normally -->
      <template v-if="editMode">
        <div
          class="filter-tag"
          v-for="(filter, index) in itemData.filters"
          :key="`${filter.source}-${filter.value}-${index}`"
        >
          <span class="filter-content">
            <span class="filter-source"
              >{{ filter.source === 'global' ? filter.source : 'cross' }}:&nbsp</span
            >
            <span class="filter-value">
              {{ filter.value.replace(/'''/g, "'").replace('local.', '') }}</span
            >
          </span>
          <button
            class="filter-remove-btn"
            @click="removeFilter(filter.source)"
            title="Remove filter"
            v-if="filter.source !== 'global'"
          >
            ×
          </button>
        </div>
      </template>

      <!-- View mode - show icon with count, or detailed filters on mouseover -->
      <template v-else>
        <div class="filter-summary" v-if="!isFiltersVisible && filterCount > 0">
          <svg
            class="filter-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
        </div>

        <div v-if="isFiltersVisible && filterCount > 0" class="filter-details">
          <div
            class="filter-tag"
            v-for="(filter, index) in itemData.filters"
            :key="`${filter.source}-${filter.value}-${index}`"
          >
            <span class="filter-content">
              <span class="filter-source"
                >{{ filter.source === 'global' ? filter.source : 'cross' }}:&nbsp</span
              >
              <span class="filter-value">
                {{ filter.value.replace(/'''/g, "'").replace('local.', '') }}</span
              >
            </span>
            <button
              class="filter-remove-btn"
              @click="removeFilter(filter.source)"
              :title="`Remove ${filter.source} filter`"
              v-if="filter.source !== 'global'"
            >
              ×
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Content area -->
    <div class="content-area" :class="{ 'content-area-filter': supportsFilters }">
      <!-- Render the appropriate component based on cell type -->
      <component
        :is="cellComponent"
        :dashboardId="props.dashboardId"
        :itemId="item.i"
        :setItemData="setItemData"
        :getItemData="getItemData"
        :editMode="editMode"
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
  /* margin:12px; */
  /* padding: 4px; */
  display: flex;
  flex-direction: column;
  color: var(--result-window-font);
  border: 1px solid var(--dashboard-border);
  position: relative;
  /* Important for positioning the overlay header */
  overflow-y: hidden;
  background-color: var(--dashboard-background);
}

.overlay-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background-color: rgba(var(--sidebar-bg-rgb, 245, 245, 245), 0.8);
  backdrop-filter: blur(2px);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.header-visible {
  opacity: 1;
  pointer-events: all;
}

.grid-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 4px;
  border-bottom: 1px solid transparent;
  height: var(--chart-control-height);
}

/* Make sure non-drag-handle content doesn't trigger dragging */
.grid-item-content *:not(.grid-item-drag-handle) {
  touch-action: auto !important;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.content-area-filter {
  height: calc(100% - 24px);
}

.item-title-container {
  flex: 1;
  min-width: 0;
  /* Allows flex child to shrink below min-content width */
}

.item-title {
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editable-title {
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  display: flex;
  align-items: left;
  /* justify-content: space-between; */
}

.editable-title:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.edit-indicator {
  font-size: 12px;
  margin-left: 8px;
  opacity: 0.6;
  display: none;
}

.editable-title:hover .edit-indicator {
  display: inline;
}

.title-input {
  width: 100%;
  padding: 4px;
  font-size: var(--font-size);
  font-weight: bold;
  border: 1px solid var(--special-text);
  outline: none;
  background-color: var(--sidebar-selector-bg);
  color: var(--text-color);
}

.edit-button {
  /* padding: 4px 8px;*/
  color: var(--special-text);
  border: 1px solid var(--special-text);
  background-color: transparent;
  /* border: none; */
  cursor: pointer;
  font-size: var(--small-font-size);
  margin-left: 8px;
}

.remove-button {
  /* padding: 4px 8px;*/
  color: var(--delete-color);
  border: 1px solid var(--delete-color);
  background-color: transparent;
  cursor: pointer;
  font-size: var(--small-font-size);
  margin-left: 8px;
}

.edit-button.always-visible {
  position: absolute;
  top: 4px;
  right: 70px;
  z-index: 20;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.remove-button.always-visible {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 20;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.edit-button:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.1);
}

.remove-button:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.1);
}

.grid-item-drag-handle {
  cursor: move !important;
  /* Show move cursor */
}

.drag-handle-icon {
  display: flex;
  align-items: center;
  margin-right: 10px;
  color: var(--text-color);
  opacity: 0.5;
}

.vue-resizable-handle {
  color: white !important;
}

.grid-item-header:hover .drag-handle-icon {
  opacity: 0.8;
}

/* Filter styles */
.filters-container {
  display: flex;
  flex-wrap: wrap;
  /* gap: 4px; */
  /* padding: 3px 6px; */
  /* border-bottom: 1px solid var(--border); */
  /*background-color: var(--sidebar-bg);*/
  min-height: 24px;
}

.filter-tag {
  display: flex;
  align-items: center;
  /* background-color: 'black';  
  border-radius: 0px; */
  /* border: 1px solid var(--border); */
  padding: 0px 3px 0px 3px;
  font-size: calc(var(--small-font-size) - 5px);
}

.filter-content {
  display: flex;
  /* gap: 2px; */
  align-items: center;
}

.filter-source {
  font-weight: 600;
  color: var(--special-text);
}

.filter-value {
  color: var(--text-color);
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
  font-size: 14px;
  font-weight: bold;
  width: 14px;
  height: 14px;
  padding: 0;
}

.filter-remove-btn:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.1);
}

/* No filters message - optional */
.no-filters {
  font-style: italic;
  color: var(--text-muted);
  font-size: var(--small-font-size);
}

/* View mode filter summary styles */
.filter-summary {
  display: flex;
  align-items: center;
  padding: 2px 6px;
  /* background-color: rgba(var(--sidebar-bg-rgb, 245, 245, 245), 0.5); */
  /* border-radius: 12px; */
  cursor: pointer;
}

.filter-icon {
  margin-right: 3px;
  color: var(--special-text);
}

.filter-count {
  font-size: calc(var(--small-font-size) - 3px);
  font-weight: 600;
  color: var(--text-color);
}

.filter-details {
  display: flex;
  flex-wrap: wrap;
  /* padding: 2px; */
  background-color: rgba(var(--sidebar-bg), 0.7);
  /* box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); */
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
