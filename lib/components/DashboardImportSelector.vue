<!-- ImportSelector.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { type Import } from '../stores/resolver'

interface ImportSelectorProps {
  availableImports: Import[]
  activeImports: Import[]
}

const props = defineProps<ImportSelectorProps>()

const emit = defineEmits<{
  'update:imports': [imports: Import[]]
}>()

// Show/hide dropdown
const showDropdown = ref<boolean>(false)

// Toggle dropdown visibility
function toggleDropdown(): void {
  showDropdown.value = !showDropdown.value
}

// Check if import is active
function isImportActive(importName: string): boolean {
  return props.activeImports.some((imp) => imp.name === importName)
}

// Toggle an import (single select mode)
function toggleImport(importItem: Import): void {
  let newImports: Import[] = []

  if (isImportActive(importItem.name)) {
    // If already active, deselect it (empty array)
    newImports = []
  } else {
    // If not active, select only this one
    newImports = [{ name: importItem.name, alias: importItem.name }]
  }

  emit('update:imports', newImports)
}

// Clear all imports
function clearAllImports(): void {
  emit('update:imports', [])
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
  <div class="import-selector">
    <div class="import-selector-header" @click="toggleDropdown">
      <label>Root Source</label>
      <div class="import-summary" :class="{ 'has-imports': activeCount > 0 }">
        <span v-if="activeCount === 0">No imports</span>
        <span v-else-if="activeCount === 1">{{ activeImports[0].name }}</span>
        <span v-else>1 import selected</span>
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
        <button v-if="activeCount > 0" class="clear-all-button" @click="clearAllImports">
          Clear Selection
        </button>
      </div>

      <div class="import-list">
        <div
          v-for="importItem in availableImports"
          :key="importItem.name"
          class="import-item"
          :class="{ active: isImportActive(importItem.name) }"
          @click="toggleImport(importItem)"
        >
          <div class="import-checkbox">
            <svg
              v-if="isImportActive(importItem.name)"
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
            <button class="remove-import-button" @click.stop="clearAllImports">
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
}

.import-selector-header label {
  margin-right: 10px;
  font-weight: bold;
  color: var(--text-color);
  white-space: nowrap;
}

.import-summary {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  min-width: 150px;
  justify-content: space-between;
}

.import-summary.has-imports {
  color: var(--text-color);
  border-color: var(--special-text);
}

.dropdown-icon {
  margin-left: 8px;
}

.import-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
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

.import-list {
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
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
  background-color: var(--special-text);
  color: white;
  padding: 4px 8px;
  font-size: 12px;
}

.remove-import-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  opacity: 0.7;
}

.remove-import-button:hover {
  opacity: 1;
}
</style>
