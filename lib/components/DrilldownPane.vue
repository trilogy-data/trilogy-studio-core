<template>
  <div class="drilldown-pane">
    <!-- Header with title and action buttons -->
    <div class="drilldown-header">
      <div class="header-title">Select Drilldown Dimensions</div>
      <div class="header-actions">
        <button
          class="action-btn submit-btn"
          @click="handleSubmit"
          :disabled="selected.length === 0"
          title="Submit selection (Enter)"
        >
          <i class="mdi mdi-check"></i>
          Submit
        </button>
        <button class="action-btn close-btn" @click="handleClose" title="Close (Escape)">
          <i class="mdi mdi-close"></i>
        </button>
      </div>
    </div>

    <div class="search-container">
      <input
        type="text"
        class="drilldown-search"
        placeholder="Search dimensions..."
        v-model="searchQuery"
        @input="filterDimensions"
        @keydown="handleSearchKeydown"
        ref="drilldownSearchInput"
      />
      <div class="dimension-count">({{ filteredDimensions.length }})</div>
    </div>

    <div class="selected-dimensions" v-if="selected.length > 0">
      <div class="selected-list">
        <div v-for="dimension in selected" :key="dimension" class="selected-item">
          <span class="selected-name">{{ dimension }}</span>
          <button
            class="remove-btn"
            @click="removeDimension(dimension)"
            :title="`Remove ${dimension}`"
          >
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>
    </div>

    <div class="dimensions-list" ref="dimensionsList">
      <div
        v-for="(dimension, index) in filteredDimensions"
        :key="index"
        class="dimension-item"
        :class="{
          selected: selected.includes(dimension.label),
          disabled: dimension.type === 'metric',
          highlighted: highlightedIndex === index,
        }"
        @click="selectDimension(dimension)"
        @mouseenter="
          (event) => {
            showTooltip(event, dimension)
            setHighlightedIndex(index)
          }
        "
        @mouseleave="hideTooltip"
        @mousemove="updateTooltipPosition($event)"
      >
        <div
          class="dimension-icon"
          :class="getIconClass(dimension)"
          :title="getIconTooltip(dimension)"
        >
          <i v-if="getIconType(dimension) === 'mdi'" :class="getIconMdiClass(dimension)"></i>
          <template v-else>{{ getDimensionChar(dimension) }}</template>
        </div>
        <div class="dimension-details">
          <div class="dimension-label">{{ dimension.label }}</div>
          <div v-if="dimension.description" class="dimension-description">
            {{ dimension.description }}
          </div>
        </div>
        <div v-if="selected.includes(dimension.label)" class="selected-indicator">
          <i class="mdi mdi-check"></i>
        </div>
      </div>
      <div v-if="filteredDimensions.length === 0" class="no-dimensions">
        No matching dimensions found
      </div>
    </div>

    <!-- Custom Tooltip -->
    <div
      v-if="tooltip.visible"
      class="custom-tooltip"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="tooltip-header">
        <div class="tooltip-icon" :class="getIconClass(tooltip.dimension)">
          <i
            v-if="getIconType(tooltip.dimension) === 'mdi'"
            :class="getIconMdiClass(tooltip.dimension)"
          ></i>
          <template v-else>{{ getDimensionChar(tooltip.dimension) }}</template>
        </div>
        <div class="tooltip-title">{{ tooltip.dimension.label }}</div>
      </div>

      <div class="tooltip-content">
        <div v-if="tooltip.dimension.type" class="tooltip-row">
          <span class="tooltip-label">Type:</span>
          <span class="tooltip-value type-value">{{ tooltip.dimension.type }}</span>
        </div>

        <div v-if="tooltip.dimension.trilogySubType" class="tooltip-row">
          <span class="tooltip-label">Category:</span>
          <span class="tooltip-value category-value" :class="tooltip.dimension.trilogySubType">
            {{ tooltip.dimension.trilogySubType }}
          </span>
        </div>

        <div
          v-if="tooltip.dimension.description && tooltip.dimension.description.trim()"
          class="tooltip-row description-row"
        >
          <span class="tooltip-label">Description:</span>
          <div class="tooltip-value description-value">{{ tooltip.dimension.description }}</div>
        </div>

        <div v-if="tooltip.dimension.type === 'metric'" class="tooltip-row">
          <span class="tooltip-label">Note:</span>
          <div class="tooltip-value warning-value">Metrics cannot be used for drilldown</div>
        </div>
      </div>
    </div>

    <!-- Keyboard shortcuts help -->
    <div class="keyboard-hints">
      <span class="hint">↑↓ Navigate</span>
      <span class="hint">Enter Add/Submit</span>
      <span class="hint">Esc Close</span>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  type PropType,
  reactive,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
} from 'vue'

import type { CompletionItem } from '../stores/resolver'

// Centralized icon configuration
const ICON_CONFIG = {
  trilogy: {
    key: { icon: 'mdi-key-outline', tooltip: 'Key Dimension' },
    property: { icon: 'mdi-tag-outline', tooltip: 'Property Dimension' },
    metric: { icon: 'mdi-cube-outline', tooltip: 'Metric (Cannot Drilldown)' },
  },
  standard: {
    dimension: { char: 'D', tooltip: 'Dimension' },
    column: { char: 'C', tooltip: 'Column' },
    field: { char: 'F', tooltip: 'Field' },
    default: { char: 'D', tooltip: 'Dimension' },
  },
}

export default defineComponent({
  name: 'DrilldownPane',
  props: {
    drilldownRemove: {
      type: String,
      required: true,
    },
    drilldownFilter: {
      type: String,
      required: true,
    },
    symbols: {
      type: Array as PropType<CompletionItem[]>,
      required: true,
    },
  },

  emits: ['select-dimension', 'remove-dimension', 'close', 'submit'],

  setup(props, { emit }) {
    const searchQuery = ref('')
    const filteredDimensions = ref<CompletionItem[]>([])
    const drilldownSearchInput = ref<HTMLInputElement | null>(null)
    const dimensionsList = ref<HTMLElement | null>(null)
    const selected = ref<string[]>([])
    const highlightedIndex = ref(-1)

    // Tooltip state
    const tooltip = reactive({
      visible: false,
      x: 0,
      y: 0,
      dimension: {} as CompletionItem,
    })

    let tooltipTimeout: NodeJS.Timeout | null = null

    // Focus search input when component mounts
    onMounted(() => {
      nextTick(() => {
        if (drilldownSearchInput.value) {
          drilldownSearchInput.value.focus()
        }
        document.addEventListener('keydown', handleGlobalKeydown)
      })
    })

    onUnmounted(() => {
      document.removeEventListener('keydown', handleGlobalKeydown)
    })

    // Global keyboard event handler
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      // Only handle events if the component has focus or search input is focused
      const isSearchFocused = document.activeElement === drilldownSearchInput.value
      const isComponentActive = drilldownSearchInput.value
        ?.closest('.drilldown-pane')
        ?.contains(document.activeElement)

      if (!isSearchFocused && !isComponentActive) return

      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }

    // Handle keyboard navigation in search input
    const handleSearchKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          navigateDown()
          break
        case 'ArrowUp':
          event.preventDefault()
          navigateUp()
          break
        case 'Enter':
          event.preventDefault()
          if (
            highlightedIndex.value >= 0 &&
            highlightedIndex.value < filteredDimensions.value.length
          ) {
            selectDimension(filteredDimensions.value[highlightedIndex.value])
            highlightedIndex.value = -1
          } else {
            // If nothing is highlighted, submit the form
            handleSubmit()
          }
          break
        case 'Escape':
          event.preventDefault()
          handleClose()
          break
      }
    }

    // Navigation functions
    const navigateDown = () => {
      if (filteredDimensions.value.length === 0) return

      highlightedIndex.value = Math.min(
        highlightedIndex.value + 1,
        filteredDimensions.value.length - 1,
      )
      scrollToHighlighted()
    }

    const navigateUp = () => {
      if (filteredDimensions.value.length === 0) return

      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
      scrollToHighlighted()
    }

    const scrollToHighlighted = () => {
      nextTick(() => {
        const highlighted = dimensionsList.value?.querySelector('.dimension-item.highlighted')
        if (highlighted) {
          highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      })
    }

    const setHighlightedIndex = (index: number) => {
      highlightedIndex.value = index
    }

    // Filter dimensions based on search query and exclude metrics
    const filterDimensions = (): void => {
      const query = searchQuery.value.toLowerCase().trim()

      filteredDimensions.value = props.symbols.filter((dimension) => {
        // Apply search filter
        const matchesSearch =
          !query ||
          dimension.label.toLowerCase().includes(query) ||
          (dimension.description && dimension.description.toLowerCase().includes(query))

        return matchesSearch
      })

      // Reset highlighted index when filtering
      if (filteredDimensions.value.length > 0) {
        highlightedIndex.value = 0
      } else {
        highlightedIndex.value = -1
      }
    }

    // Watch for changes in available dimensions
    watch(
      () => props.symbols,
      () => {
        filterDimensions()
      },
      { immediate: true },
    )

    // Watch for changes in search query
    watch(searchQuery, () => {
      filterDimensions()
    })

    // Icon helper functions
    const getIconType = (dimension: CompletionItem): string => {
      return dimension.trilogySubType && ICON_CONFIG.trilogy[dimension.trilogySubType]
        ? 'mdi'
        : 'char'
    }

    const getIconMdiClass = (dimension: CompletionItem): string => {
      if (dimension.trilogySubType && ICON_CONFIG.trilogy[dimension.trilogySubType]) {
        return `mdi ${ICON_CONFIG.trilogy[dimension.trilogySubType].icon}`
      }
      return ''
    }

    const getDimensionChar = (dimension: CompletionItem): string => {
      const type = dimension.type.toLowerCase() as keyof typeof ICON_CONFIG.standard
      return ICON_CONFIG.standard[type]?.char || ICON_CONFIG.standard.default.char
    }

    const getIconClass = (dimension: CompletionItem): string => {
      if (dimension.trilogySubType) {
        return dimension.trilogySubType.toLowerCase()
      }
      return dimension.type.toLowerCase()
    }

    const getIconTooltip = (dimension: CompletionItem): string => {
      if (dimension.trilogySubType && ICON_CONFIG.trilogy[dimension.trilogySubType]) {
        return ICON_CONFIG.trilogy[dimension.trilogySubType].tooltip
      }

      const type = dimension.type.toLowerCase() as keyof typeof ICON_CONFIG.standard
      return ICON_CONFIG.standard[type]?.tooltip || ICON_CONFIG.standard.default.tooltip
    }

    // Select dimension for drilldown
    const selectDimension = (dimension: CompletionItem) => {
      // Don't allow selection of metrics
      if (dimension.type === 'metric' || dimension.trilogySubType === 'metric') {
        return
      }

      // Don't allow selection if already selected
      if (selected.value.includes(dimension.label)) {
        return
      }

      selected.value.push(dimension.label)
      emit('select-dimension', dimension)
    }

    // Remove dimension from selection
    const removeDimension = (dimensionLabel: string) => {
      selected.value = selected.value.filter((label) => label !== dimensionLabel)
      emit('remove-dimension', dimensionLabel)
    }

    // Handle submit action
    const handleSubmit = () => {
      if (selected.value.length > 0) {
        emit('submit', selected.value)
      }
    }

    // Handle close action
    const handleClose = () => {
      emit('close')
    }

    // Tooltip functions
    const showTooltip = (event: MouseEvent, dimension: CompletionItem) => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout)
      }

      tooltipTimeout = setTimeout(() => {
        tooltip.dimension = dimension
        tooltip.visible = true
        updateTooltipPosition(event)
      }, 500)
    }

    const hideTooltip = () => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout)
        tooltipTimeout = null
      }
      tooltip.visible = false
    }

    const updateTooltipPosition = (event: MouseEvent) => {
      if (!tooltip.visible) return

      const offset = 10
      const tooltipEl = document.querySelector('.custom-tooltip') as HTMLElement

      if (tooltipEl) {
        const rect = tooltipEl.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        let x = event.clientX + offset
        let y = event.clientY + offset

        // Adjust if tooltip would go off-screen
        if (x + rect.width > viewportWidth) {
          x = event.clientX - rect.width - offset
        }

        if (y + rect.height > viewportHeight) {
          y = event.clientY - rect.height - offset
        }

        tooltip.x = Math.max(0, x)
        tooltip.y = Math.max(0, y)
      } else {
        tooltip.x = event.clientX + offset
        tooltip.y = event.clientY + offset
      }
    }

    return {
      searchQuery,
      filteredDimensions,
      drilldownSearchInput,
      dimensionsList,
      tooltip,
      selected,
      highlightedIndex,
      filterDimensions,
      selectDimension,
      removeDimension,
      handleSubmit,
      handleClose,
      handleSearchKeydown,
      setHighlightedIndex,
      getIconType,
      getIconMdiClass,
      getDimensionChar,
      getIconClass,
      getIconTooltip,
      showTooltip,
      hideTooltip,
      updateTooltipPosition,
    }
  },
})
</script>

<style scoped>
.drilldown-pane {
  width: 100%;
  height: 100%;
  background-color: var(--bg-color);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 320px;
  min-height: 250px;
}

/* Header styles */
.drilldown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--sidebar-bg);
  color: #d4d4d4;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.submit-btn {
  color: #9cdcfe;
  border-color: rgba(0, 122, 255, 0.4);
}

.submit-btn:hover:not(:disabled) {
  background-color: rgba(0, 122, 255, 0.2);
  border-color: rgba(0, 122, 255, 0.6);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-btn {
  padding: 4px 6px;
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.4);
}

.close-btn:hover {
  border-color: rgba(255, 107, 107, 0.6);
}

.search-container {
  display: flex;
  align-items: center;
  padding-left: 8px;
  padding-top: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.drilldown-search {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.drilldown-search:focus {
  border-color: rgba(0, 122, 255, 0.6);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

.drilldown-search::placeholder {
  color: #888;
}

.dimension-count {
  margin-left: 8px;
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

.selected-dimensions {
  padding-left: 8px;
  border-bottom: 1px solid var(--border);
}

.selected-label {
  color: #888;
  font-size: 11px;
  margin-bottom: 6px;
  font-weight: 500;
}

.selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.selected-item {
  display: flex;
  align-items: center;
  background-color: rgba(0, 122, 255, 0.2);
  border: 1px solid rgba(0, 122, 255, 0.4);
  border-radius: 4px;
  padding: 2px 4px 2px 6px;
  font-size: 11px;
}

.selected-name {
  color: var(--color);
  margin-right: 4px;
}

.remove-btn {
  background: none;
  border: none;
  color: #9cdcfe;
  cursor: pointer;
  padding: 0;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
}

.remove-btn:hover {
  color: #fff;
}

.dimensions-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.dimension-item {
  display: flex;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  align-items: center;
  margin-bottom: 2px;
  transition: background-color 0.15s ease;
}

.dimension-item:hover:not(.disabled) {
  background-color: rgba(255, 255, 255, 0.08);
}

.dimension-item.highlighted {
  background-color: rgba(0, 122, 255, 0.2);
  border: 1px solid rgba(0, 122, 255, 0.4);
}

.dimension-item.selected {
  background-color: rgba(0, 122, 255, 0.15);
  border: 1px solid rgba(0, 122, 255, 0.3);
}

.dimension-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dimension-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  font-size: 11px;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.1);
  color: #d4d4d4;
  flex-shrink: 0;
}

/* Icon colors for different types */
.dimension-icon.key {
  color: #f8c555;
}

.dimension-icon.property {
  color: #9cdcfe;
}

.dimension-icon.metric {
  color: #75beff;
}

.dimension-icon.dimension {
  color: #b8d7a3;
}

.dimension-icon.column {
  color: #dcdcaa;
}

.dimension-icon.field {
  color: #9cdcfe;
}

.dimension-details {
  overflow: hidden;
  flex: 1;
}

.dimension-label {
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dimension-description {
  font-size: 10px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.selected-indicator {
  color: #007acc;
  margin-left: 8px;
  flex-shrink: 0;
}

.no-dimensions {
  padding: 16px;
  color: #888;
  font-style: italic;
  text-align: center;
  font-size: 12px;
}

/* Keyboard hints */
.keyboard-hints {
  display: flex;
  gap: 12px;
  padding: 6px 8px;
  background-color: var(--sidebar-bg);
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: #888;
}

.hint {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Custom Tooltip Styles */
.custom-tooltip {
  position: fixed;
  z-index: 1000;
  background-color: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 0;
  font-size: 12px;
  color: #d4d4d4;
  max-width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  pointer-events: none;
  animation: tooltipFadeIn 0.2s ease-out;
}

@keyframes tooltipFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tooltip-header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background-color: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px 6px 0 0;
}

.tooltip-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  font-size: 12px;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.1);
}

.tooltip-icon.key {
  color: #f8c555;
}

.tooltip-icon.property {
  color: #9cdcfe;
}

.tooltip-icon.metric {
  color: #75beff;
}

.tooltip-icon.dimension {
  color: #b8d7a3;
}

.tooltip-icon.column {
  color: #dcdcaa;
}

.tooltip-icon.field {
  color: #9cdcfe;
}

.tooltip-title {
  font-weight: 600;
  font-size: 13px;
  color: #fff;
}

.tooltip-content {
  padding: 8px 10px;
}

.tooltip-row {
  display: flex;
  margin-bottom: 6px;
  align-items: flex-start;
}

.tooltip-row:last-child {
  margin-bottom: 0;
}

.tooltip-label {
  min-width: 70px;
  color: #888;
  font-size: 11px;
  font-weight: 500;
  margin-right: 8px;
  flex-shrink: 0;
}

.tooltip-value {
  flex: 1;
  font-size: 11px;
  word-break: break-word;
}

.type-value {
  color: #4ec9b0;
  font-weight: 500;
}

.category-value {
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.category-value.key {
  background-color: rgba(248, 197, 85, 0.2);
  color: #f8c555;
}

.category-value.property {
  background-color: rgba(156, 220, 254, 0.2);
  color: #9cdcfe;
}

.category-value.metric {
  background-color: rgba(117, 190, 255, 0.2);
  color: #75beff;
}

.description-row {
  flex-direction: column;
  align-items: stretch;
}

.description-row .tooltip-label {
  margin-bottom: 4px;
}

.description-value {
  color: #d4d4d4;
  line-height: 1.4;
}

.warning-value {
  color: #ff6b6b;
  font-style: italic;
}

/* Responsive design */
@media screen and (max-width: 480px) {
  .drilldown-pane {
    min-width: 280px;
    font-size: 11px;
  }

  .drilldown-header {
    padding: 6px 8px;
  }

  .header-title {
    font-size: 12px;
  }

  .action-btn {
    padding: 3px 6px;
    font-size: 10px;
  }

  .search-container {
    padding-left: 6px;
    padding-right: 6px;
  }

  .drilldown-search {
    font-size: 11px;
    padding: 4px 6px;
  }

  .dimension-item {
    padding: 4px 6px;
  }

  .custom-tooltip {
    max-width: 250px;
    font-size: 11px;
  }

  .keyboard-hints {
    padding: 4px 6px;
    font-size: 9px;
  }
}

@media screen and (max-height: 300px) {
  .selected-dimensions {
    display: none;
  }

  .keyboard-hints {
    display: none;
  }
}
</style>
