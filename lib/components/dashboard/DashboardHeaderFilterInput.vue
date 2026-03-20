<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLLMConnectionStore } from '../../stores'
import Tooltip from '../Tooltip.vue'
import FilterAutocomplete from './DashboardFilterAutocomplete.vue'
import { type CompletionItem } from '../../stores/resolver'
import { useClickOutside } from '../../composables/useClickOutside'

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

const isLoading = ref(props.isLoading)
const filterInputRef = ref<HTMLInputElement | null>(null)
const filterTextareaRef = ref<HTMLTextAreaElement | null>(null)
const filterDropdownRef = ref<HTMLElement | null>(null)
const filterInput = ref(props.filterValue || '')
const hasUnappliedChanges = ref(false)
const isDropdownOpen = ref(false)

const displayFilterValue = computed(() => {
  return filterInput.value.replace(/\n/g, ' ')
})

const hasFilterText = computed(() => {
  return filterInput.value.trim().length > 0
})

function applyFilter() {
  emit('filter-apply', filterInput.value)
  hasUnappliedChanges.value = false
  closeDropdown()
}

function clearFilter() {
  filterInput.value = ''
  hasUnappliedChanges.value = true
  emit('filter-change', '')
  emit('filter-apply', '')
  emit('clear-filter', '')

  setTimeout(() => {
    if (filterTextareaRef.value) {
      filterTextareaRef.value.focus()
    }
  }, 0)
}

function onFilterInput(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement
  filterInput.value = target.value
  hasUnappliedChanges.value = true
  emit('filter-change', filterInput.value)
}

function openDropdown() {
  isDropdownOpen.value = true
  setTimeout(() => {
    if (filterTextareaRef.value) {
      filterTextareaRef.value.focus()
      const length = filterInput.value.length
      filterTextareaRef.value.setSelectionRange(length, length)
    }
  }, 0)
}

function closeDropdown() {
  isDropdownOpen.value = false
}

const filterLLM = () => {
  isLoading.value = true
  const concepts = props.globalCompletion.map((item) => ({
    name: item.label,
    type: item.datatype,
    description: item.description,
  }))

  llmStore
    .generateFilterQuery(filterInput.value, concepts, props.validateFilter)
    .then((response) => {
      if (response && response.length > 0) {
        filterInput.value = response.replace(/^\s*where\s+/i, '')
        hasUnappliedChanges.value = true
        emit('filter-apply', filterInput.value)
      }
      isLoading.value = false
    })
    .catch(() => {
      isLoading.value = false
    })
}

function handleFilterKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
    if (!isDropdownOpen.value) {
      event.preventDefault()
      applyFilter()
    }
  } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    filterLLM()
  } else if (event.key === 'Escape' && isDropdownOpen.value) {
    event.preventDefault()
    closeDropdown()
  }
}

function handleTextareaKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    applyFilter()
  } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    filterLLM()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  }
}

const filterStatus = computed(() => {
  if ((props.filterError || '').length > 0) {
    return 'error'
  }
  return filterInput.value ? 'valid' : 'neutral'
})

function handleCompletionSelected(completion: { text: string; cursorPosition: number }) {
  filterInput.value = completion.text
  hasUnappliedChanges.value = true
  emit('filter-change', filterInput.value)

  const activeElement = isDropdownOpen.value ? filterTextareaRef.value : filterInputRef.value
  if (activeElement) {
    activeElement.focus()
    activeElement.setSelectionRange(completion.cursorPosition, completion.cursorPosition)
  }
}

watch(
  () => props.filterValue,
  (newValue) => {
    if (newValue !== filterInput.value) {
      filterInput.value = newValue || ''
      hasUnappliedChanges.value = false
    }
  },
)

watch(
  () => props.isLoading,
  (newValue) => {
    isLoading.value = newValue
  },
)

useClickOutside(
  () => [filterDropdownRef.value, filterInputRef.value],
  () => {
    closeDropdown()
  },
  {
    enabled: () => isDropdownOpen.value,
  },
)
</script>

<template>
  <div class="filter-container">
    <div class="filter-input-wrapper">
      <input
        id="filter"
        ref="filterInputRef"
        data-testid="filter-input"
        type="text"
        :value="displayFilterValue"
        @input="onFilterInput"
        @keydown="handleFilterKeydown"
        @focus="openDropdown"
        placeholder="Add a global filter..."
        :class="{ 'filter-error': filterStatus === 'error' }"
        :disabled="isLoading"
      />

      <div v-if="isDropdownOpen" ref="filterDropdownRef" class="filter-dropdown">
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

        <div v-if="filterError" class="dropdown-error-message" data-testid="dropdown-error-message">
          <i class="mdi mdi-alert-circle-outline"></i>
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
            <i class="mdi mdi-auto-fix" :class="{ hidden: isLoading }"></i>
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
        v-if="isDropdownOpen ? filterTextareaRef : filterInputRef"
        :input-value="filterInput"
        :completion-items="globalCompletion"
        :input-element="isDropdownOpen ? filterTextareaRef : filterInputRef"
        @select-completion="handleCompletionSelected"
      />

      <div class="filter-inline-actions">
        <div
          v-if="filterStatus === 'error'"
          class="filter-status error"
          data-testid="filter-error-icon"
        >
          <i class="mdi mdi-alert-circle-outline"></i>
          <Tooltip :content="filterError || 'Unknown Error'" position="bottom">
            <span class="tooltip-trigger" data-testid="filter-error-tooltip-trigger"></span>
          </Tooltip>
        </div>

        <button
          @click="applyFilter"
          class="input-icon-button"
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

        <button
          v-if="llmStore.hasActiveDefaultConnection"
          @click="filterLLM"
          class="input-icon-button"
          data-testid="filter-llm-button"
          :disabled="isLoading"
          title="Transform text to filter if you have a configured LLM connection"
        >
          <div class="button-content">
            <i class="mdi mdi-auto-fix" :class="{ hidden: isLoading }"></i>
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

        <button
          v-if="hasFilterText"
          @click="clearFilter"
          class="input-icon-button clear-icon-button"
          data-testid="clear-filters-button"
          :disabled="isLoading"
          title="Clear all filters"
        >
          <div class="button-content">
            <i class="mdi mdi-close"></i>
            <Tooltip content="Clear all filters" position="top">
              <span class="tooltip-trigger"></span>
            </Tooltip>
          </div>
        </button>
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

.filter-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: var(--query-window-bg);
  border-radius: 12px;
}

.filter-container input {
  width: 100%;
  height: 40px;
  padding: 0 118px 0 14px;
  font-size: var(--font-size);
  color: var(--text-color);
  background-color: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  cursor: pointer;
}

.filter-error {
  border-color: #ff6b6b !important;
}

.filter-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  margin-top: 8px;
  overflow: hidden;
  background: var(--query-window-bg);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-weight: 500;
  color: var(--text-color);
  border-bottom: 1px solid var(--border-light);
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  color: var(--text-color);
  background: none;
  border: none;
  cursor: pointer;
}

.close-button:hover {
  background: var(--border);
}

.filter-dropdown textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px 12px;
  font-size: var(--font-size);
  font-family: inherit;
  color: var(--text-color);
  background: var(--query-window-bg);
  border: none;
  outline: none;
  resize: vertical;
}

.filter-dropdown textarea.filter-error {
  border-left: 3px solid #ff6b6b;
}

.dropdown-error-message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 8px 12px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: #ff6b6b;
  background-color: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: 8px;
}

.dropdown-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-light);
}

.apply-button,
.llm-button,
.clear-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-color);
  background: var(--query-window-bg);
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s ease;
}

.apply-button:hover,
.llm-button:hover,
.clear-button:hover {
  background: var(--border);
}

.apply-button.has-changes {
  color: white;
  background: var(--special-text);
  border-color: var(--special-text);
}

.clear-button:hover {
  color: #ff6b6b;
  background: rgba(255, 59, 48, 0.1);
  border-color: rgba(255, 59, 48, 0.3);
}

.apply-button:disabled,
.llm-button:disabled,
.clear-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.filter-inline-actions {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.input-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--dashboard-helper-text);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.input-icon-button:hover:not(:disabled) {
  color: var(--text-color);
  background: rgba(148, 163, 184, 0.08);
}

.input-icon-button.has-changes {
  color: var(--special-text);
}

.clear-icon-button:hover:not(:disabled) {
  color: #ff6b6b;
  background: rgba(255, 59, 48, 0.1);
}

.filter-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--dashboard-helper-text);
  position: relative;
}

.filter-status.error {
  color: #ff6b6b;
}

.button-content {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.mdi {
  font-size: 16px;
}

.hidden {
  display: none;
}

.loader-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid var(--special-text);
  border-radius: 50%;
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

.tooltip-trigger {
  position: absolute;
  inset: 0;
  cursor: help;
}

@media (max-width: 768px) {
  .filter-container {
    flex: 1;
    margin-top: 0;
  }

  .filter-container input {
    padding-right: 110px;
  }
}

@media (max-width: 480px) {
  .filter-container input {
    padding-right: 102px;
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
</style>
