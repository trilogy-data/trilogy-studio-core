<script lang="ts" setup>
import { ref, computed } from 'vue'
import DashboardChart from './DashboardChart.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'
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
}>()

// Item title editing states
const editingItemTitle = ref(false)
const editableItemName = ref('')

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

function dimensionClick(v: DimensionClick): void {
  emit('dimension-click', v)
}

function backgroundClick(): void {
  console.log('emitting bg grid')
  emit('background-click', props.item.i)
}

// Remove a filter by index
function removeFilter(filterSource: string): void {
  emit('remove-filter', props.item.i, filterSource)
}

// Get item data
const itemData = computed(() => props.getItemData(props.item.i, props.dashboardId))

// Compute if item has filters
const hasFilters = computed(() => {
  return itemData.value.filters && itemData.value.filters.length > 0
})
</script>

<template>
  <div
    class="grid-item-content"
    :class="{
      'grid-item-chart-style': itemData.type === CELL_TYPES.CHART,
      'grid-item-edit-style': editMode,
    }"
  >
    <div class="grid-item-header" v-if="editMode">
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
          :placeholder="itemData.type === CELL_TYPES.CHART ? 'Chart Name' : 'Note Name'"
        />
      </div>
      <button @click="openEditor" class="edit-button" data-testid='edit-dashboard-item-content'>Edit Content</button>
    </div>

    <!-- Non-edit mode title display -->
    <!--<div class="view-mode-header" v-if="!editMode">
      <div class="item-title">{{ itemData.name }}</div>
    </div> -->

    <!-- Filters display (for both edit and view modes) -->
    <div class="filters-container" v-if="hasFilters && itemData.type === CELL_TYPES.CHART">
      <div
        class="filter-tag"
        v-for="(filter, index) in itemData.filters"
        :key="`${filter.source}-${filter.value}-${index}`"
      >
        <span class="filter-content">
          <span class="filter-source"
            >{{ filter.source === 'global' ? filter.source : 'cross' }}:</span
          >
          <span class="filter-value">{{ filter.value.replace(/'''/g, "'") }}</span>
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
    </div>

    <!-- Render the appropriate component based on cell type -->
    <component
      :is="itemData.type === CELL_TYPES.CHART ? DashboardChart : DashboardMarkdown"
      :dashboardId="props.dashboardId"
      :itemId="item.i"
      :setItemData="setItemData"
      :getItemData="getItemData"
      :editMode="editMode"
      @dimension-click="dimensionClick"
      @background-click="backgroundClick"
    />
  </div>
</template>

<style scoped>
.grid-item-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  color: var(--result-window-font);
}

.grid-item-edit-style {
  border: 1px solid var(--border);
}

.grid-item-chart-style {
  border: 1px solid var(--border);
}

.grid-item-header,
.view-mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 4px;
  /* padding: 4px; */
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  height: var(--chart-control-height);
}

/* Make sure non-drag-handle content doesn't trigger dragging */
.grid-item-content *:not(.grid-item-drag-handle) {
  touch-action: auto !important;
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
  align-items: center;
  justify-content: space-between;
}

.editable-title:hover {
  background-color: rgba(0, 0, 0, 0.05);
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
  padding: 4px 8px;
  background-color: var(--special-text);
  color: white;
  border: none;
  cursor: pointer;
  font-size: var(--small-font-size);
  margin-left: 8px;
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

.grid-item-header:hover .drag-handle-icon {
  opacity: 0.8;
}

/* Filter styles */
.filters-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  /* padding: 3px 6px; */
  border-bottom: 1px solid var(--border);
  /*background-color: var(--sidebar-bg);*/
  min-height: 24px;
}

.filter-tag {
  display: flex;
  align-items: center;
  background-color: var(--sidebar-selector-bg);
  /* border: 1px solid var(--border); */
  padding: 1px 6px 1px 6px;
  font-size: calc(var(--small-font-size) - 1px);
}

.filter-content {
  display: flex;
  gap: 2px;
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
</style>
