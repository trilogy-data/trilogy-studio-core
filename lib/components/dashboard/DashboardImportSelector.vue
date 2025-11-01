<!-- ImportSelector.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { type DashboardImport } from '../../dashboards/base'

interface ImportSelectorProps {
  availableImports: DashboardImport[]
  activeImports: DashboardImport[]
}

const props = defineProps<ImportSelectorProps>()

const emit = defineEmits<{
  'update:imports': [imports: DashboardImport[]]
  explore: [DashboardImport]
}>()

// Show/hide dropdown
const showDropdown = ref<boolean>(false)

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

  if (isImportActive(importItem.name)) {
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

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent): void {
  const importSelector = document.querySelector('.import-selector')
  if (importSelector && !importSelector.contains(event.target as Node) && showDropdown.value) {
    showDropdown.value = false
  }
}

// Add event listener on mounted
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// Remove event listener on unmounted
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="import-selector" data-testid="dashboard-import-wrapper">
    <div class="import-selector-header" @click="toggleDropdown">
      <div
        class="import-summary"
        :class="{ 'has-imports': activeCount > 0 }"
        data-testid="dashboard-import-selector"
      >
        <div class="summary-content">
          <i class="mdi mdi-file-document-edit-outline summary-icon"></i>
          <span v-if="activeCount === 0">No imports</span>
          <span v-else-if="activeCount === 1">{{ activeImports[0].name }}</span>
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

    <div class="import-dropdown" v-if="showDropdown">
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

      <div class="import-list">
        <div
          v-for="importItem in availableImports"
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
  min-width: 200px;
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
  border: 1px solid var(--border);
  color: var(--sidebar-selector-font);
  /* min-width: 150px; */
  justify-content: space-between;
  width: 100%;
}

.import-summary {
  padding: 6px 12px 6px 36px;
  border: 1px solid var(--border);
  color: var(--sidebar-selector-font);
  font-size: var(--font-size);
  background-color: var(--bg-color);
  appearance: none;
  cursor: pointer;
  min-width: 150px;
  outline: none;
  border-radius: 0; /* Remove rounded corners */
  -webkit-appearance: none;
  -moz-appearance: none;
}

.import-summary.has-imports {
  color: var(--text-color);
}

.summary-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-icon {
  position: absolute;
  left: 10px;
  font-size: 18px;
  color: var(--text-color);
}

.dropdown-icon {
  margin: 0px 8px;
}

.import-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  width: 300px;
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  padding: 12px;
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
}

.dropdown-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-all-button {
  border: none;
  background: none;
  color: var(--delete-color);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}

.clear-all-button:hover {
  text-decoration: underline;
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
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.import-list {
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
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
  background-color: var(--sidebar-bg);
}

.import-item.active {
  background-color: rgba(var(--special-text-rgb), 0.1);
}

.import-checkbox {
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
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
  background-color: var(--special-text);
  color: white;
  padding: 4px 8px;
  font-size: 12px;
  width: 100%;
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
  color: white;
  opacity: 0.8;
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
  color: white;
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
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    /* max-width: 300px; */
    /* min-width: unset; */
  }

  .import-selector-header {
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .import-summary {
    padding: 4px 0px;
    text-align: center;
  }

  .summary-content {
    justify-content: center;
    flex: 1;
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
