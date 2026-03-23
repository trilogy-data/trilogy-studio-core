<!-- ImportSelector.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { type DashboardImport } from '../../dashboards/base'
import { useClickOutside } from '../../composables/useClickOutside'

export interface ImportSelectorProps {
  availableImports: DashboardImport[]
  activeImports: DashboardImport[]
  compact?: boolean
}

const props = defineProps<ImportSelectorProps>()

const emit = defineEmits<{
  'update:imports': [imports: DashboardImport[]]
  explore: [DashboardImport]
}>()

// Show/hide dropdown
const showDropdown = ref<boolean>(false)
const selectorRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')

// Toggle dropdown visibility
function toggleDropdown(): void {
  showDropdown.value = !showDropdown.value
}

// Close dropdown
function closeDropdown(): void {
  showDropdown.value = false
}

// Check if import is active
function isImportActive(importId: string): boolean {
  return props.activeImports.some((imp) => imp.id === importId)
}

// Toggle an import (single select mode)
function toggleImport(importItem: DashboardImport): void {
  let newImports: DashboardImport[] = []

  if (isImportActive(importItem.id)) {
    // If already active, deselect it (empty array)
    newImports = []
  } else {
    // If not active, select only this one
    newImports = [{ name: importItem.name, alias: importItem.alias, id: importItem.id }]
  }

  emit('update:imports', newImports)
}

// Clear all imports
function clearAllImports(): void {
  emit('update:imports', [])
}

// Explore selected import
function exploreImport(importItem: DashboardImport): void {
  emit('explore', importItem)
}

// Count of active imports
const activeCount = computed((): number => props.activeImports.length)
const filteredImports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return props.availableImports
  }

  return props.availableImports.filter((importItem) =>
    importItem.name.toLowerCase().includes(query),
  )
})

watch(showDropdown, (isOpen) => {
  if (!isOpen) {
    searchQuery.value = ''
  }
})

useClickOutside(selectorRef, closeDropdown, {
  enabled: () => showDropdown.value,
})
</script>

<template>
  <div ref="selectorRef" class="import-selector" data-testid="dashboard-import-wrapper">
    <div class="import-selector-header" @click="toggleDropdown">
      <div
        class="import-summary"
        :class="{ 'has-imports': activeCount > 0, compact: compact }"
        data-testid="dashboard-import-selector"
      >
        <div class="summary-content">
          <i class="mdi mdi-file-document-edit-outline summary-icon"></i>
          <span v-if="activeCount === 0">No imports</span>
          <span v-else-if="activeCount === 1" class="summary-text" :title="activeImports[0].name">
            {{ activeImports[0].name }}
          </span>
          <span v-else>{{ activeImports.length }} import(s) selected</span>
        </div>
        <svg
          class="dropdown-icon"
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
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>

    <div class="import-dropdown" :class="{ compact: compact }" v-if="showDropdown">
      <div class="import-dropdown-header">
        <h4>Available Data Sources</h4>
        <div class="dropdown-action-buttons">
          <button v-if="activeCount > 0" class="clear-all-button" @click="clearAllImports">
            Clear Selection
          </button>
          <button
            class="close-dropdown-button"
            @click.stop="closeDropdown"
            title="Close dropdown"
            data-testid="close-model-selector"
          >
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="import-search">
        <input
          v-model="searchQuery"
          type="text"
          class="import-search-input"
          placeholder="Search data sources..."
          data-testid="dashboard-import-search"
        />
      </div>

      <div class="import-list">
        <div
          v-for="importItem in filteredImports"
          :key="importItem.id"
          class="import-item"
          :class="{ active: isImportActive(importItem.id) }"
          @click="toggleImport(importItem)"
          :data-testid="`set-dashboard-source-${importItem.name}`"
        >
          <div class="import-checkbox">
            <svg
              v-if="isImportActive(importItem.id)"
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
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="import-name">{{ importItem.name }}</div>
        </div>
        <div v-if="filteredImports.length === 0" class="import-empty-state">
          No matching data sources
        </div>
      </div>

      <div class="active-imports" v-if="activeCount > 0">
        <h4>Current Selection</h4>
        <div class="active-import-list">
          <div class="active-import-item">
            <span>{{ activeImports[0].name }}</span>
            <div class="import-actions">
              <button
                class="explore-import-button"
                @click.stop="exploreImport(activeImports[0])"
                title="Explore this data source"
                data-testid="explore-dashboard-import"
              >
                <svg
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
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </button>
              <button class="remove-import-button" @click.stop="clearAllImports">
                <svg
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
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-selector {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 1 260px;
  min-width: 160px;
  max-width: 260px;
  z-index: 220;
}

.import-selector-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  width: 100%;
}

.import-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 44px;
  padding: 0 14px 0 40px;
  border: 1px solid var(--border-light);
  color: var(--dashboard-helper-text);
  font-size: var(--font-size);
  background-color: var(--query-window-bg);
  appearance: none;
  cursor: pointer;
  min-width: 0;
  outline: none;
  border-radius: 12px;
  box-sizing: border-box;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.import-summary.compact {
  height: 28px;
  padding: 0 10px 0 30px;
  border-radius: 8px;
  font-size: 12px;
}

.import-summary.has-imports {
  color: var(--text-color);
}

.import-selector-header:hover .import-summary {
  border-color: var(--special-text);
}

.summary-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.summary-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-icon {
  position: absolute;
  left: 12px;
  font-size: 18px;
  color: var(--text-color);
}

.import-summary.compact .summary-icon {
  left: 8px;
  font-size: 14px;
}

.dropdown-icon {
  flex-shrink: 0;
  margin-left: 10px;
  color: var(--dashboard-helper-text);
}

.import-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 1200;
  width: 300px;
  background-color: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
  padding: 12px;
}

.import-dropdown.compact {
  top: calc(100% + 4px);
}

.import-dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.import-dropdown-header h4 {
  margin: 0;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
}

.import-search {
  margin-bottom: 10px;
}

.import-search-input {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--query-window-bg);
  color: var(--text-color);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.import-search-input:focus {
  border-color: var(--special-text);
}

.dropdown-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-all-button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--delete-color);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}

.clear-all-button:hover {
  background: rgba(248, 113, 113, 0.08);
}

.close-dropdown-button {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.7;
  padding: 4px;
}

.close-dropdown-button:hover {
  opacity: 1;
  background-color: rgba(148, 163, 184, 0.08);
  border-radius: 4px;
}

.import-list {
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 8px;
  text-align: left;
}

.import-item {
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
}

.import-item:hover {
  background-color: var(--button-mouseover);
}

.import-item.active {
  background-color: rgba(var(--special-text-rgb), 0.1);
}

.import-empty-state {
  padding: 12px 8px;
  color: var(--text-faint);
  font-size: 12px;
  text-align: left;
}

.import-checkbox {
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-light);
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-item.active .import-checkbox {
  background-color: var(--special-text);
  border-color: var(--special-text);
  color: white;
}

.import-name {
  flex: 1;
}

.active-imports h4 {
  margin: 8px 0;
  color: var(--text-color);
}

.active-import-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.active-import-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(var(--special-text-rgb), 0.12);
  color: var(--text-color);
  padding: 4px 8px;
  font-size: 12px;
  width: 100%;
  border-radius: 10px;
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.explore-import-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  opacity: 0.75;
  border-radius: 2px;
}

.explore-import-button:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.1);
}

.remove-import-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  opacity: 0.7;
  border-radius: 2px;
}

.remove-import-button:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.1);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .import-selector {
    flex-basis: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .import-selector-header {
    width: 100%;
  }

  .import-summary {
    min-width: 0;
    height: 40px;
    padding: 0 12px 0 36px;
  }

  .summary-content {
    justify-content: flex-start;
  }

  .import-dropdown {
    width: 90vw;
  }
}

@media (max-width: 480px) {
  .import-selector {
    max-width: 100%;
  }
}
</style>
