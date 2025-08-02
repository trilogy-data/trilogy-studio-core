<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLLMConnectionStore } from '../../stores'
import Tooltip from '../Tooltip.vue'
import FilterAutocomplete from './DashboardFilterAutocomplete.vue'
import { type CompletionItem } from '../../stores/resolver'

const props = defineProps({
  filterValue: {
    type: String,
    default: '',
  },
  filterError: String,
  isLoading: Boolean,
  globalCompletion: {
    type: Array as () => CompletionItem[],
    default: () => [],
  },
  validateFilter: {
    type: Function,
    default: () => true,
  },
})

const emit = defineEmits(['filter-change', 'filter-apply', 'clear-filter'])

const llmStore = useLLMConnectionStore()

// Refs
const isLoading = ref(props.isLoading)
const filterInputRef = ref<HTMLInputElement | null>(null)
const filterTextareaRef = ref<HTMLTextAreaElement | null>(null)
const filterInput = ref(props.filterValue || '')
const hasUnappliedChanges = ref(false)
const isDropdownOpen = ref(false)

// Display filter value (replace newlines with spaces for display)
const displayFilterValue = computed(() => {
  return filterInput.value.replace(/\n/g, ' ')
})

// Apply the filter changes
function applyFilter() {
  emit('filter-apply', filterInput.value)
  hasUnappliedChanges.value = false
  closeDropdown()
}

// Clear the filter
function clearFilter() {
  filterInput.value = ''
  hasUnappliedChanges.value = true
  emit('filter-change', '')
  emit('filter-apply', '')
  emit('clear-filter', '')
  // Focus the textarea after clearing
  setTimeout(() => {
    if (filterTextareaRef.value) {
      filterTextareaRef.value.focus()
    }
  }, 0)
}

// Track filter input changes
function onFilterInput(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement
  filterInput.value = target.value
  hasUnappliedChanges.value = true
  emit('filter-change', filterInput.value)
}

// Open dropdown for multi-line editing
function openDropdown() {
  isDropdownOpen.value = true
  // Focus textarea after DOM update
  setTimeout(() => {
    if (filterTextareaRef.value) {
      filterTextareaRef.value.focus()
      // Set cursor to end
      const length = filterInput.value.length
      filterTextareaRef.value.setSelectionRange(length, length)
    }
  }, 0)
}

// Close dropdown
function closeDropdown() {
  isDropdownOpen.value = false
}

// Handle clicks outside dropdown
function handleClickOutside(event: Event) {
  const target = event.target as HTMLElement
  const dropdown = document.querySelector('.filter-dropdown')
  const input = filterInputRef.value

  if (dropdown && !dropdown.contains(target) && target !== input) {
    closeDropdown()
  }
}

// Generate filter using LLM
const filterLLM = () => {
  isLoading.value = true
  let concepts = props.globalCompletion.map((item) => ({
    name: item.label,
    type: item.datatype,
    description: item.description,
  }))

  llmStore
    .generateFilterQuery(filterInput.value, concepts, props.validateFilter)
    .then((response) => {
      if (response && response.length > 0) {
        // Strip "where" off if present
        filterInput.value = response.replace(/^\s*where\s+/i, '')
        // Mark as having changes that need to be applied
        hasUnappliedChanges.value = true
        // Apply the filter
        emit('filter-apply', filterInput.value)
      }
      isLoading.value = false
    })
    .catch(() => {
      isLoading.value = false
    })
}

// Handle keyboard shortcuts
function handleFilterKeydown(event: KeyboardEvent) {
  // Add Enter key as a shortcut to search (only in single-line input)
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
    if (!isDropdownOpen.value) {
      event.preventDefault()
      applyFilter()
    }
  }
  // Keep Ctrl+Shift+Enter for LLM generation
  else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    filterLLM()
  }
  // Escape to close dropdown
  else if (event.key === 'Escape' && isDropdownOpen.value) {
    event.preventDefault()
    closeDropdown()
  }
}

// Handle textarea keyboard shortcuts
function handleTextareaKeydown(event: KeyboardEvent) {
  // Ctrl+Enter or Cmd+Enter to apply filter
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    applyFilter()
  }
  // Keep Ctrl+Shift+Enter for LLM generation
  else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    filterLLM()
  }
  // Escape to close dropdown
  else if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  }
}

// Compute filter validation status
const filterStatus = computed(() => {
  if ((props.filterError || '').length > 0) {
    return 'error'
  }
  return filterInput.value ? 'valid' : 'neutral'
})

// Handle completion selection
function handleCompletionSelected(completion: { text: string; cursorPosition: number }) {
  filterInput.value = completion.text
  // Mark as having changes
  hasUnappliedChanges.value = true
  emit('filter-change', filterInput.value)

  // Set cursor position and focus the appropriate input
  const activeElement = isDropdownOpen.value ? filterTextareaRef.value : filterInputRef.value
  if (activeElement) {
    activeElement.focus()
    activeElement.setSelectionRange(completion.cursorPosition, completion.cursorPosition)
  }
}

// Watch for external filter changes
watch(
  () => props.filterValue,
  (newValue) => {
    if (newValue !== filterInput.value) {
      filterInput.value = newValue || ''
      hasUnappliedChanges.value = false
    }
  },
)

// Watch for external loading state changes
watch(
  () => props.isLoading,
  (newValue) => {
    isLoading.value = newValue
  },
)

// Watch dropdown state to add/remove click listener
watch(isDropdownOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})
</script>

<template>
  <div class="filter-container">
    <!-- <label for="filter">Where</label> -->
    <div class="filter-input-wrapper">
      <input
        id="filter"
        data-testid="filter-input"
        type="text"
        :value="displayFilterValue"
        @input="onFilterInput"
        @keydown="handleFilterKeydown"
        @focus="openDropdown"
        placeholder="Add a global filter..."
        :class="{ 'filter-error': filterStatus === 'error' }"
        :disabled="isLoading"
        ref="filterInputRef"
      />

      <!-- Multi-line dropdown -->
      <div v-if="isDropdownOpen" class="filter-dropdown">
        <div class="dropdown-header">
          <span>Global Filters</span>
          <button @click="closeDropdown" class="close-button" title="Close (Esc)">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <textarea
          ref="filterTextareaRef"
          class="filter-textarea"
          :value="filterInput"
          @input="onFilterInput"
          @keydown="handleTextareaKeydown"
          :placeholder="
            llmStore.hasActiveDefaultConnection
              ? `Use a SQL condition (ex color='blue' or color='red') or text to filter.
Use Ctrl+Enter to apply, Ctrl+Shift+Enter for text to SQL`
              : `Use a SQL condition (ex color='blue') to filter.
Use Ctrl+Enter to apply`
          "
          :class="{ 'filter-error': filterStatus === 'error' }"
          :disabled="isLoading"
          rows="4"
        ></textarea>

        <!-- Error message in dropdown -->
        <div v-if="filterError" class="dropdown-error-message" data-testid="dropdown-error-message">
          <i class="mdi mdi-alert-circle"></i>
          <span>{{ filterError }}</span>
        </div>

        <div class="dropdown-actions">
          <button
            @click="applyFilter"
            class="apply-button"
            :disabled="isLoading"
            :class="{ 'has-changes': hasUnappliedChanges }"
            title="Apply filter (Ctrl+Enter)"
          >
            <i class="mdi mdi-check"></i>
            Apply
          </button>
          <button
            v-if="llmStore.hasActiveDefaultConnection"
            @click="filterLLM"
            class="llm-button"
            :disabled="isLoading"
            title="Text to filter (Ctrl+Shift+Enter)"
          >
            <i class="mdi mdi-creation" :class="{ hidden: isLoading }"></i>
            <div v-if="isLoading" class="loader-container">
              <div class="loader"></div>
            </div>
            Text to Filter
          </button>
          <button
            @click="clearFilter"
            class="clear-button"
            :disabled="isLoading"
            title="Clear filter"
          >
            <i class="mdi mdi-close-circle-outline"></i>
            Clear
          </button>
        </div>
      </div>

      <FilterAutocomplete
        :input-value="filterInput"
        :completion-items="globalCompletion"
        :input-element="isDropdownOpen ? filterTextareaRef : filterInputRef"
        v-if="isDropdownOpen ? filterTextareaRef : filterInputRef"
        @select-completion="handleCompletionSelected"
      />

      <!-- Search button -->
      <button
        @click="applyFilter"
        class="search-button"
        data-testid="filter-search-button"
        :disabled="isLoading"
        :class="{ 'has-changes': hasUnappliedChanges }"
        title="Apply filter (Enter)"
      >
        <div class="button-content">
          <i class="mdi mdi-magnify"></i>
          <Tooltip
            :content="hasUnappliedChanges ? 'Apply changes (Enter)' : 'Search (Enter)'"
            position="top"
          >
            <span class="tooltip-trigger"></span>
          </Tooltip>
        </div>
      </button>

      <!-- LLM button -->
      <button
        @click="filterLLM"
        class="sparkle-button"
        data-testid="filter-llm-button"
        :disabled="isLoading"
        v-if="llmStore.hasActiveDefaultConnection"
        title="Transform text to filter if you have a configured LLM connection"
      >
        <div class="button-content">
          <i class="mdi mdi-creation" :class="{ hidden: isLoading }"></i>
          <div v-if="isLoading" class="loader-container">
            <div class="loader"></div>
          </div>
          <Tooltip
            :content="isLoading ? 'Processing...' : 'Text to filter (Ctrl+Shift+Enter)'"
            position="top"
          >
            <span class="tooltip-trigger"></span>
          </Tooltip>
        </div>
      </button>

      <!-- Validation indicator -->
      <div class="filter-validation-icon" v-if="filterStatus !== 'neutral'">
        <div
          v-if="filterStatus === 'error'"
          class="filter-icon error"
          data-testid="filter-error-icon"
        >
          <span class="icon-x">✕</span>
          <Tooltip :content="filterError || 'Unknown Error'" position="bottom">
            <span class="tooltip-trigger" data-testid="filter-error-tooltip-trigger"></span>
          </Tooltip>
        </div>
        <div
          v-else-if="filterStatus === 'valid'"
          class="filter-icon valid"
          data-testid="filter-valid-icon"
        >
          <Tooltip content="This is a syntactically correct filter." position="top">
            <span class="icon-check" data-testid="filter-valid-tooltip-trigger">✓</span>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-textarea {
  box-sizing: border-box;
}

.filter-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.filter-container label {
  margin-right: 10px;
  font-weight: 400;
  color: var(--text-color);
  white-space: nowrap;
  font-size: 18px;
}

.filter-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 5px;
  background-color: var(--bg-color);
}

.filter-container input {
  padding: 4px;
  border: 1px solid var(--border);
  color: var(--sidebar-selector-font);
  background-color: var(--bg-color);
  width: 100%;
  font-size: var(--font-size);
  height: 30px;
  cursor: pointer;
}

/* Error message in dropdown styles */
.dropdown-error-message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 8px 12px;
  padding: 8px 10px;
  background-color: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: 4px;
  color: #ff3b30;
  font-size: 12px;
  line-height: 1.4;
}

.dropdown-error-message .mdi {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 1px;
}

/* Dropdown styles */
.filter-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-color);
  border: 1px solid var(--border);
  border-top: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: 0;
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border);
  font-weight: 500;
  color: var(--text-color);
}

.close-button {
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  background: var(--border);
}

.filter-dropdown textarea {
  width: 100%;
  padding: 8px 12px;
  border: none;
  outline: none;
  background: var(--bg-color);
  color: var(--sidebar-selector-font);
  font-size: var(--font-size);
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
}

.filter-dropdown textarea.filter-error {
  border-left: 3px solid #ff3b30;
}

.dropdown-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-color);
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}

.apply-button,
.llm-button,
.clear-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.apply-button:hover,
.llm-button:hover,
.clear-button:hover {
  background: var(--border);
}

.apply-button.has-changes {
  background: var(--special-text);
  color: white;
  border-color: var(--special-text);
}

.clear-button:hover {
  background: rgba(255, 59, 48, 0.1);
  border-color: rgba(255, 59, 48, 0.3);
  color: #ff3b30;
}

.apply-button:disabled,
.llm-button:disabled,
.clear-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Search button styles */
.search-button {
  position: absolute;
  right: 65px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  width: 30px;
  height: 30px;
  z-index: 2;
  transition: all 0.2s ease-in-out;
}

.search-button.has-changes {
  color: var(--special-text);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}

.sparkle-button {
  position: absolute;
  right: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  width: 30px;
  height: 30px;
  z-index: 2;
}

.button-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mdi {
  font-size: 16px;
}

.hidden {
  display: none;
}

/* Loader animation */
.loader-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.loader {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 2px solid var(--special-text);
  width: 16px;
  height: 16px;
  animation: loader-spin 1s linear infinite;
}

@keyframes loader-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.filter-error {
  border-color: #ff3b30 !important;
}

.filter-validation-icon {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
}

.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.filter-icon.error {
  color: #ff3b30;
}

.filter-icon.valid {
  color: #4cd964;
}

.icon-x {
  font-weight: bold;
  font-size: 14px;
}

.icon-check {
  font-weight: bold;
  font-size: 14px;
}

.tooltip-trigger {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: help;
}

/* Media query adjustments */
@media (max-width: 768px) {
  .filter-container {
    flex: 1;
    margin-top: 5px;
    padding-right: 10px;
  }

  .sparkle-button {
    right: 30px;
  }

  .search-button {
    right: 60px;
  }
}

@media (max-width: 480px) {
  .filter-container {
    flex-direction: row;
    align-items: center;
  }

  .filter-container label {
    margin-right: 8px;
    white-space: nowrap;
  }

  .sparkle-button {
    right: 25px;
  }

  .search-button {
    right: 50px;
  }

  .dropdown-actions {
    flex-direction: column;
  }

  .apply-button,
  .llm-button,
  .clear-button {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 360px) {
  .sparkle-button {
    right: 20px;
  }

  .search-button {
    right: 45px;
  }
}
</style>
