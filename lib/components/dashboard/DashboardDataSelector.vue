<template>
  <div class="result-select row pa-0 ba-0">
    <div class="select-container">
      <div class="search-input-wrapper">
        <span 
          v-if="hasSelection" 
          class="inline-label"
        >
          {{ fieldLabel }}:
        </span>
        <input
          ref="searchInput"
          v-model="searchText"
          type="text"
          class="search-input"
          :class="{ 'has-inline-label': hasSelection }"
          :placeholder="placeholderText"
          :disabled="!selectOptions || selectOptions.length === 0"
          @focus="handleFocus"
          @input="onSearchInput"
          @blur="handleBlur"
        />
        <span class="search-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
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
        </span>
      </div>

      <Teleport to="body">
        <div
          v-if="showDropdown && filteredOptions.length > 0"
          class="dropdown-list"
          :style="dropdownStyle"
        >
          <!-- Select All option -->
          <div
            class="dropdown-item select-all"
            :class="{ selected: !selectedValue }"
            @mousedown.prevent="selectAll"
          >
            Select All
          </div>

          <div
            v-for="(option, index) in filteredOptions"
            :key="index"
            class="dropdown-item"
            :class="{ selected: selectedValue === option.value }"
            @mousedown.prevent="selectOption(option)"
            v-html="highlightMatch(option.label)"
          ></div>
        </div>

        <div
          v-if="showDropdown && searchText && filteredOptions.length === 0"
          class="dropdown-list"
          :style="dropdownStyle"
        >
          <div class="dropdown-item no-results">No matches found</div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.result-select {
  display: flex;
  flex-direction: column;
  flex-basis: 100%;
  flex-grow: 1;
  flex-shrink: 1;
  flex: 1 1 100%;
  flex-wrap: nowrap;
  background-color: var(--result-window-bg);
  position: relative;
  overflow: visible;
  /* Prevent clipping */
}

.select-container {
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: visible;
  /* Prevent clipping */
  z-index: 1;
  /* Base z-index */
}

.search-input-wrapper {
  position: relative;
  width: 99%;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-light, #d0d0d0);
  background-color: var(--bg-color, #ffffff);
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.search-input-wrapper:hover:not(:has(.search-input:disabled)) {
  border-color: var(--border-dark, #999999);
}

.search-input-wrapper:focus-within {
  border-color: var(--primary-color, #0066cc);
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
}

.inline-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-muted, #666666);
  padding-left: 12px;
  padding-right: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  padding: 6px 40px 6px 0;
  font-size: 14px;
  color: var(--text-color, #333333);
  background: transparent;
  border: none;
  box-sizing: border-box;
  transition: background-color 0.2s;
}

.search-input.has-inline-label {
  padding-left: 0;
}

.search-input:focus {
  outline: none;
}

.search-input:disabled {
  background-color: var(--border-light, #d0d0d0);
  color: var(--text-color-muted, #999999);
  cursor: not-allowed;
  opacity: 0.6;
}

.search-input-wrapper:has(.search-input:disabled) {
  background-color: var(--border-light, #d0d0d0);
  cursor: not-allowed;
  opacity: 0.6;
}

.search-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-color-muted, #999999);
  pointer-events: none;
}

.search-icon svg {
  width: 100%;
  height: 100%;
}

.dropdown-list {
  /* Position is set via inline styles when using Teleport */
  max-height: 300px;
  overflow-y: auto;
  background-color: var(--bg-color, #ffffff);
  border: 1px solid var(--border-light, #d0d0d0);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 9999;
  /* Very high z-index to ensure it appears above everything */
  margin-top: 0;
}

.dropdown-item {
  padding: 5px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  color: var(--text-color, #333333);
  border-bottom: 1px solid var(--border-light, #e0e0e0);
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background-color: var(--hover-bg, #f5f5f5);
}

.dropdown-item.selected {
  background-color: var(--selected-bg, #e6f2ff);
  font-weight: 500;
}

.dropdown-item.select-all {
  font-weight: 600;
  color: var(--primary-color, #0066cc);
  border-bottom: 2px solid var(--border-light, #e0e0e0);
}

.dropdown-item.select-all:hover {
  background-color: var(--primary-light-bg, #f0f7ff);
}

.dropdown-item.select-all.selected {
  background-color: var(--primary-selected-bg, #cce7ff);
}

.dropdown-item.no-results {
  color: var(--text-color-muted, #999999);
  cursor: default;
  text-align: center;
  font-style: italic;
}

.dropdown-item.no-results:hover {
  background-color: transparent;
}

/* Highlight styling */
.dropdown-item :deep(mark) {
  background-color: #ffeb3b;
  color: inherit;
  font-weight: 600;
  padding: 0;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .select-container {
    padding: 12px;
  }

  .search-input {
    font-size: 16px;
    /* Prevent zoom on iOS */
    padding: 12px 40px 12px 0;
  }

  .search-input.has-inline-label {
    padding-left: 0;
  }

  .inline-label {
    font-size: 11px;
    padding-left: 12px;
    padding-right: 6px;
  }

  .dropdown-list {
    max-height: 250px;
  }
}

/* Scrollbar styling */
.dropdown-list::-webkit-scrollbar {
  width: 8px;
}

.dropdown-list::-webkit-scrollbar-track {
  background: var(--bg-color, #f1f1f1);
}

.dropdown-list::-webkit-scrollbar-thumb {
  background: var(--border-dark, #888);
  border-radius: 4px;
}

.dropdown-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-muted, #555);
}

.dark-theme .dropdown-list::-webkit-scrollbar-track {
  background: var(--dark-bg-color, #1a1a1a);
}

.dark-theme .dropdown-list::-webkit-scrollbar-thumb {
  background: var(--dark-border-color, #555);
}

.dark-theme .dropdown-list::-webkit-scrollbar-thumb:hover {
  background: var(--dark-border-hover, #777);
}
</style>

<script lang="ts">
import type { ResultColumn, Row } from '../../editors/results'
import { ColumnType } from '../../editors/results'
import type { PropType } from 'vue'
import { computed, inject } from 'vue'
import type { UserSettingsStoreType } from '../../stores/userSettingsStore.ts'

export interface SelectOption {
  label: string
  value: any
}

export default {
  data() {
    return {
      selectedValue: '' as any,
      selectedLabel: '' as string,
      searchText: '',
      showDropdown: false,
      inputElement: null as HTMLElement | null,
    }
  },
  props: {
    headers: {
      type: Map<String, ResultColumn>,
      required: true,
    },
    results: {
      type: Array as PropType<readonly Row[]>,
      required: true,
    },
    containerHeight: Number,
    cellClick: {
      type: Function,
      default: () => {},
    },
    backgroundClick: {
      type: Function,
      default: () => {},
    },
    prettyPrint: {
      type: Boolean,
      default: false,
    },
    fitParent: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const settingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    if (!settingsStore) {
      throw new Error('userSettingsStore not provided')
    }
    const currentTheme = computed(() => settingsStore.settings.theme)

    return {
      settingsStore,
      currentTheme,
    }
  },
  computed: {
    headersArray() {
      return Array.from(this.headers.values())
    },
    firstColumn(): ResultColumn | null {
      return this.headersArray[0] || null
    },
    secondColumn(): ResultColumn | null {
      return this.headersArray[1] || null
    },
    displayColumn(): ResultColumn | null {
      return this.firstColumn
    },
    valueColumn(): ResultColumn | null {
      // If two columns exist, use second as value; otherwise use first for both
      return this.secondColumn || this.firstColumn
    },
    selectOptions(): SelectOption[] {
      if (!this.displayColumn || !this.valueColumn || !this.results || this.results.length === 0) {
        return []
      }

      const displayFieldName = this.displayColumn.name
      const valueFieldName = this.valueColumn.name
      const options: SelectOption[] = []

      this.results.forEach((row) => {
        const displayValue = row[displayFieldName]
        const actualValue = row[valueFieldName]

        if (
          displayValue !== null &&
          displayValue !== undefined &&
          actualValue !== null &&
          actualValue !== undefined
        ) {
          const label = this.formatValue(displayValue, this.displayColumn!)
          options.push({
            label: label,
            value: actualValue,
          })
        }
      })

      return options
    },
    filteredOptions(): SelectOption[] {
      if (!this.searchText) {
        return this.selectOptions
      }

      const searchLower = this.searchText.toLowerCase()
      return this.selectOptions.filter((option) => option.label.toLowerCase().includes(searchLower))
    },
    placeholderText(): string {
      // When something is selected, show a simpler placeholder
      if (this.hasSelection) {
        return this.selectedLabel || 'Type to search...'
      }
      
      if (!this.selectOptions || this.selectOptions.length === 0) {
        return 'No data available'
      }
      return this.firstColumn
        ? `Select ${this.firstColumn?.name}`
        : 'Select an option'
    },
    hasSelection(): boolean {
      return !!(this.selectedLabel && this.selectedValue)
    },
    fieldLabel(): string {
      return this.firstColumn?.name || 'Field'
    },
    dropdownStyle(): Record<string, string> {
      if (!this.inputElement) {
        return {}
      }

      const rect = this.inputElement.getBoundingClientRect()
      return {
        position: 'fixed',
        top: `${rect.bottom}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
      }
    },
  },
  mounted() {
    // Initialize searchText with selectedLabel if there's a pre-selected value
    if (this.selectedLabel && !this.searchText) {
      this.searchText = this.selectedLabel
    }
  },
  watch: {
    // Watch for external changes to selectedLabel and update searchText accordingly
    selectedLabel(newLabel) {
      if (newLabel && !this.showDropdown) {
        this.searchText = newLabel
      }
    }
  },
  methods: {
    formatValue(value: any, column: ResultColumn): string {
      // Handle different column types
      switch (column.type) {
        case ColumnType.FLOAT:
          if (column.traits?.includes('usd')) {
            return `$${Number(value).toFixed(column.scale || 2)}`
          } else if (column.traits?.includes('percent')) {
            return `${(Number(value) * 100).toFixed(2)}%`
          }
          return Number(value).toFixed(column.scale || 2)

        case ColumnType.DATETIME:
        case ColumnType.TIMESTAMP:
        case ColumnType.DATE:
        case ColumnType.TIME:
          // Simple date formatting - you might want to use luxon here
          if (value instanceof Date) {
            return value.toLocaleString()
          }
          return String(value)

        case ColumnType.BOOLEAN:
          return value ? '✓' : '✗'

        case ColumnType.ARRAY:
        case ColumnType.STRUCT:
          return JSON.stringify(value)

        default:
          return String(value)
      }
    },

    highlightMatch(label: string): string {
      if (!this.searchText) {
        return label
      }

      const searchLower = this.searchText.toLowerCase()
      const labelLower = label.toLowerCase()
      const index = labelLower.indexOf(searchLower)

      if (index === -1) {
        return label
      }

      const before = label.slice(0, index)
      const match = label.slice(index, index + this.searchText.length)
      const after = label.slice(index + this.searchText.length)

      return `${before}<mark>${match}</mark>${after}`
    },

    selectOption(option: SelectOption) {
      this.selectedValue = option.value
      this.selectedLabel = option.label
      this.searchText = option.label // Show the selected label in the input
      this.showDropdown = false
      this.handleSelection()
    },

    selectAll() {
      // Clear the selection instead of setting a value
      this.selectedValue = ''
      this.selectedLabel = ''
      this.searchText = ''
      this.showDropdown = false

      // Emit backgroundClick event when Select All is chosen to clear filters
      this.$emit('background-click')
      this.backgroundClick()
    },

    onSearchInput() {
      // Clear selection when user starts typing something different
      if (this.searchText !== this.selectedLabel && this.selectedLabel) {
        this.selectedValue = ''
        this.selectedLabel = ''
      }
      this.showDropdown = true
      this.updateInputElement()
    },

    handleFocus() {
      // Clear the input when focused to allow fresh searching
      this.searchText = ''
      this.showDropdown = true
      this.updateInputElement()
    },

    updateInputElement() {
      this.inputElement = this.$refs.searchInput as HTMLElement
    },

    handleBlur() {
      // Delay to allow click event on dropdown items to fire
      setTimeout(() => {
        this.showDropdown = false
        // Restore the selected label if no search was performed
        if (this.selectedLabel && !this.searchText) {
          this.searchText = this.selectedLabel
        }
      }, 200)
    },

    handleSelection() {
      if (!this.valueColumn || !this.selectedValue) {
        return
      }

      const field = this.valueColumn.address || this.valueColumn.name

      // Emit cell-click event with the same structure as the table component
      this.$emit('cell-click', {
        filters: { [field]: this.selectedValue },
        append: false,
      })
    },
  },
}
</script>