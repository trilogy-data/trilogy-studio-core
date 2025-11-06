<template>
  <div class="symbols-pane" :style="{ height: editorHeightCalc }">
    <div class="search-container">
      <input
        type="text"
        class="symbols-search"
        placeholder="Search symbols..."
        v-model="searchQuery"
        @input="filterSymbols"
        ref="symbolSearchInput"
      />
      <div class="symbol-count">({{ filteredSymbols.length }})</div>
    </div>
    <div class="filter-container">
      <label class="filter-label">
        <input type="checkbox" v-model="filters.keys" @change="filterSymbols" />
        <i class="mdi mdi-key-outline" title="Show Keys"></i>
        <!-- <span>Keys</span> -->
      </label>
      <label class="filter-label">
        <input type="checkbox" v-model="filters.properties" @change="filterSymbols" />
        <i class="mdi mdi-tag-outline" title="Show Properties"></i>
        <!-- <span>Properties</span> -->
      </label>
      <label class="filter-label">
        <input type="checkbox" v-model="filters.metrics" @change="filterSymbols" />
        <i class="mdi mdi-cube-outline" title="Show Metrics"></i>
        <!-- <span>Metrics</span> -->
      </label>
      <button
        v-if="isFiltering"
        class="clear-filters-btn"
        @click="clearFilters"
        title="'Clear all filters'"
      >
        <i class="mdi mdi-filter-remove-outline"></i>
      </button>
    </div>
    <div class="symbols-list">
      <div
        v-for="(symbol, index) in filteredSymbols"
        :key="index"
        class="symbol-item"
        @click="$emit('select-symbol', symbol)"
        @mouseenter="showTooltip($event, symbol)"
        @mouseleave="hideTooltip"
        @mousemove="updateTooltipPosition($event)"
      >
        <div class="symbol-icon" :class="getIconClass(symbol)" :title="getIconTooltip(symbol)">
          <i v-if="getIconType(symbol) === 'mdi'" :class="getIconMdiClass(symbol)"></i>
          <template v-else>{{ getSymbolChar(symbol) }}</template>
        </div>
        <div class="symbol-details">
          <div class="symbol-label">{{ symbol.label }}</div>
          <div v-if="symbol.description" class="symbol-description">{{ symbol.description }}</div>
          <div v-if="symbol.calculation" class="symbol-description">{{ symbol.calculation }}</div>
        </div>
      </div>
      <div v-if="filteredSymbols.length === 0" class="no-symbols">No matching symbols found</div>
    </div>

    <!-- Custom Tooltip -->
    <div
      v-if="tooltip.visible"
      class="custom-tooltip"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="tooltip-header">
        <div class="tooltip-icon" :class="getIconClass(tooltip.symbol)">
          <i
            v-if="getIconType(tooltip.symbol) === 'mdi'"
            :class="getIconMdiClass(tooltip.symbol)"
          ></i>
          <template v-else>{{ getSymbolChar(tooltip.symbol) }}</template>
        </div>
        <div class="tooltip-title">{{ tooltip.symbol.label }}</div>
      </div>

      <div class="tooltip-content">
        <div v-if="tooltip.symbol.type" class="tooltip-row">
          <span class="tooltip-label">Type:</span>
          <!-- <span class="tooltip-value type-value">{{ tooltip.symbol.type }}</span> -->
          <span
            v-if="tooltip.symbol.datatype && tooltip.symbol.datatype !== tooltip.symbol.type"
            class="tooltip-datatype"
          >
            {{ tooltip.symbol.datatype }}
          </span>
        </div>

        <!-- <div v-if="tooltip.symbol.trilogyType" class="tooltip-row">
          <span class="tooltip-label">Trilogy:</span>
          <span class="tooltip-value trilogy-value">{{ tooltip.symbol.trilogyType }}</span>
        </div> -->

        <div v-if="tooltip.symbol.trilogySubType" class="tooltip-row">
          <span class="tooltip-label">Category:</span>
          <span class="tooltip-value category-value" :class="tooltip.symbol.trilogySubType">
            {{ tooltip.symbol.trilogySubType }}
          </span>
        </div>

        <div
          v-if="tooltip.symbol.description && tooltip.symbol.description.trim()"
          class="tooltip-row description-row"
        >
          <span class="tooltip-label">Description:</span>
          <div class="tooltip-value description-value">{{ tooltip.symbol.description }}</div>
        </div>

        <div
          v-if="tooltip.symbol.calculation && tooltip.symbol.calculation.trim()"
          class="tooltip-row calculation-row"
        >
          <span class="tooltip-label">Calculation:</span>
          <div class="tooltip-value calculation-value">{{ tooltip.symbol.calculation }}</div>
        </div>

        <div v-if="tooltip.symbol.keys && tooltip.symbol.keys.length > 0" class="tooltip-row">
          <span class="tooltip-label">Keys:</span>
          <div class="tooltip-value keys-value">
            <span v-for="(key, idx) in tooltip.symbol.keys" :key="idx" class="key-tag">
              {{ key }}
            </span>
          </div>
        </div>

        <div
          v-if="tooltip.symbol.insertText && tooltip.symbol.insertText !== tooltip.symbol.label"
          class="tooltip-row"
        >
          <span class="tooltip-label">Insert:</span>
          <code class="tooltip-value insert-value">{{ tooltip.symbol.insertText }}</code>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType, watch, computed, reactive, nextTick } from 'vue'
import type { CompletionItem } from '../stores/resolver'

// Centralized icon configuration for easier management
const ICON_CONFIG = {
  // MDI icons for trilogy subtypes
  trilogy: {
    key: { icon: 'mdi-key-outline', tooltip: 'Key' },
    property: { icon: 'mdi-tag-outline', tooltip: 'Property' },
    metric: { icon: 'mdi-cube-outline', tooltip: 'Metric' },
  },
  // Character icons for standard types
  standard: {
    function: { char: 'ƒ', tooltip: 'Function' },
    variable: { char: 'V', tooltip: 'Variable' },
    class: { char: 'C', tooltip: 'Class' },
    interface: { char: 'I', tooltip: 'Interface' },
    method: { char: 'M', tooltip: 'Method' },
    property: { char: 'P', tooltip: 'Property' },
    field: { char: 'F', tooltip: 'Field' },
    constant: { char: 'K', tooltip: 'Constant' },
    enum: { char: 'E', tooltip: 'Enum' },
    keyword: { char: 'K', tooltip: 'Keyword' },
    default: { char: 'S', tooltip: 'Symbol' },
  },
}

export default defineComponent({
  name: 'SymbolsPane',
  props: {
    symbols: {
      type: Array as PropType<CompletionItem[]>,
      required: true,
    },
    editorHeight: {
      type: Number,
      required: false,
      default: null,
    },
  },
  emits: ['select-symbol', 'focus-search'],

  setup(props) {
    const searchQuery = ref('')
    const filteredSymbols = ref<CompletionItem[]>([])
    const symbolSearchInput = ref<HTMLInputElement | null>(null)

    const editorHeightCalc = computed(() => {
      return props.editorHeight ? `${props.editorHeight}px` : '100%'
    })

    // Filter checkboxes
    const filters = ref({
      keys: true,
      properties: true,
      metrics: true,
    })

    // Tooltip state
    const tooltip = reactive({
      visible: false,
      x: 0,
      y: 0,
      symbol: {} as CompletionItem,
    })

    let tooltipTimeout: NodeJS.Timeout | null = null

    // Computed property to check if any filters are applied
    const isFiltering = computed(() => {
      return !filters.value.keys || !filters.value.properties || !filters.value.metrics
    })

    // Function to clear all filters (reset to default state)
    const clearFilters = () => {
      filters.value.keys = true
      filters.value.properties = true
      filters.value.metrics = true
      filterSymbols()
    }

    // Determine icon display type (mdi or character)
    const getIconType = (symbol: CompletionItem): string => {
      return symbol.trilogySubType && ICON_CONFIG.trilogy[symbol.trilogySubType] ? 'mdi' : 'char'
    }

    // Get MDI class for trilogy subtypes
    const getIconMdiClass = (symbol: CompletionItem): string => {
      if (symbol.trilogySubType && ICON_CONFIG.trilogy[symbol.trilogySubType]) {
        return `mdi ${ICON_CONFIG.trilogy[symbol.trilogySubType].icon}`
      }
      return ''
    }

    // Get symbol character for standard types
    const getSymbolChar = (symbol: CompletionItem): string => {
      const type = symbol.type.toLowerCase() as keyof typeof ICON_CONFIG.standard
      return ICON_CONFIG.standard[type]?.char || ICON_CONFIG.standard.default.char
    }

    // Get CSS class for the icon container
    const getIconClass = (symbol: CompletionItem): string => {
      if (symbol.trilogySubType) {
        return symbol.trilogySubType.toLowerCase()
      }
      return symbol.type.toLowerCase()
    }

    // Get tooltip text for the icon
    const getIconTooltip = (symbol: CompletionItem): string => {
      if (symbol.trilogySubType && ICON_CONFIG.trilogy[symbol.trilogySubType]) {
        return ICON_CONFIG.trilogy[symbol.trilogySubType].tooltip
      }

      const type = symbol.type.toLowerCase() as keyof typeof ICON_CONFIG.standard
      return ICON_CONFIG.standard[type]?.tooltip || ICON_CONFIG.standard.default.tooltip
    }

    // Show custom tooltip
    const showTooltip = async (event: MouseEvent, symbol: CompletionItem) => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout)
      }

      tooltipTimeout = setTimeout(async () => {
        const containerEl = document.querySelector('.symbols-pane') as HTMLElement
        if (!containerEl) return

        const containerRect = containerEl.getBoundingClientRect()
        
        // Set initial position relative to container
        tooltip.x = event.clientX - containerRect.left + 10
        tooltip.y = event.clientY - containerRect.top + 10
        tooltip.symbol = symbol
        tooltip.visible = true

        // Wait for DOM update and adjust position
        await nextTick()
        updateTooltipPosition(event)
      }, 500) // 500ms delay before showing tooltip
    }

    // Hide custom tooltip
    const hideTooltip = () => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout)
        tooltipTimeout = null
      }
      tooltip.visible = false
    }

    // Update tooltip position relative to container
    const updateTooltipPosition = (event: MouseEvent) => {
      if (!tooltip.visible) return

      const offset = 10
      const containerEl = document.querySelector('.symbols-pane') as HTMLElement
      const tooltipEl = document.querySelector('.custom-tooltip') as HTMLElement

      if (!containerEl) return

      const containerRect = containerEl.getBoundingClientRect()
      
      // Calculate position relative to container
      let x = event.clientX - containerRect.left + offset
      let y = event.clientY - containerRect.top + offset

      if (tooltipEl) {
        const tooltipRect = tooltipEl.getBoundingClientRect()
        
        // Safety check for rendered tooltip
        if (tooltipRect.width === 0 || tooltipRect.height === 0) {
          // Tooltip not fully rendered, try again next frame
          requestAnimationFrame(() => updateTooltipPosition(event))
          return
        }
        
        // Adjust if tooltip would go outside container bounds
        if (x + tooltipRect.width > containerRect.width) {
          x = event.clientX - containerRect.left - tooltipRect.width - offset
        }

        if (y + tooltipRect.height > containerRect.height) {
          y = event.clientY - containerRect.top - tooltipRect.height - offset
        }

        // Ensure tooltip stays within container
        x = Math.max(offset, Math.min(x, containerRect.width - tooltipRect.width - offset))
        y = Math.max(offset, Math.min(y, containerRect.height - tooltipRect.height - offset))
      }

      tooltip.x = x
      tooltip.y = y
    }

    // Filter symbols based on search query and checkbox filters
    const filterSymbols = (): void => {
      if (!props.symbols) {
        filteredSymbols.value = []
        return
      }

      const query = searchQuery.value.toLowerCase().trim()

      // Start with all symbols
      let filtered = [...props.symbols]

      // Apply type filters (keys, properties, metrics)
      filtered = filtered.filter((symbol: CompletionItem) => {
        // If it's a key and keys are filtered out
        if (symbol.trilogySubType === 'key' && !filters.value.keys) {
          return false
        }
        // If it's a property and properties are filtered out
        if (symbol.trilogySubType === 'property' && !filters.value.properties) {
          return false
        }
        // If it's a metric and metrics are filtered out
        if (symbol.trilogySubType === 'metric' && !filters.value.metrics) {
          return false
        }
        // Keep all other symbols
        return true
      })

      // If there's a search query, apply text filtering
      if (query) {
        // Sort function for prioritizing matches at the beginning
        const sortMatches = (a: CompletionItem, b: CompletionItem): number => {
          const aLabelLower = a.label.toLowerCase()
          const bLabelLower = b.label.toLowerCase()

          const aStartsWithQuery = aLabelLower.startsWith(query)
          const bStartsWithQuery = bLabelLower.startsWith(query)

          // Prioritize items that start with the query
          if (aStartsWithQuery && !bStartsWithQuery) return -1
          if (!aStartsWithQuery && bStartsWithQuery) return 1

          // If both or neither start with the query, sort alphabetically
          return aLabelLower.localeCompare(bLabelLower)
        }

        filtered = filtered
          .filter((symbol: CompletionItem) => {
            const label = symbol.label.toLowerCase()
            const description = (symbol.description || '').toLowerCase()
            return label.includes(query) || description.includes(query)
          })
          .sort(sortMatches)
      }

      filteredSymbols.value = filtered.sort((a, b) => {
        // Sort by label alphabetically
        return a.label.localeCompare(b.label)
      })
    }

    // Watch for changes in symbols or search query
    watch(
      () => props.symbols,
      (_) => {
        filterSymbols()
      },
      { immediate: true },
    )

    watch(searchQuery, () => {
      filterSymbols()
    })

    const focusSearch = (): void => {
      if (symbolSearchInput.value) {
        symbolSearchInput.value.focus()
      }
    }

    return {
      searchQuery,
      filteredSymbols,
      symbolSearchInput,
      filters,
      isFiltering,
      tooltip,
      clearFilters,
      filterSymbols,
      getIconType,
      getIconMdiClass,
      getSymbolChar,
      getIconClass,
      getIconTooltip,
      showTooltip,
      hideTooltip,
      updateTooltipPosition,
      focusSearch,
      editorHeightCalc,
    }
  },
})
</script>

<style scoped>
/* Symbols pane styling */
.symbols-pane {
  width: 300px;
  border-left: 1px solid var(--border-color, #444);
  display: flex;
  flex-direction: column;
  background-color: var(--editor-bg);
  font-size: 12px;
  overflow-y: scroll;
  position: relative;

  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.search-container {
  display: flex;
  align-items: center;
  padding: 4px;
  border-bottom: 1px solid var(--border-color, #444);
}

.symbols-search {
  flex: 0.9;
  height: 24px;
  background-color: var(--editor-bg);
  color: var(--text-color, #d4d4d4);
  border: 1px solid var(--border-color, #444);
  padding: 0 6px;
  font-size: 12px;
}

.symbol-count {
  margin-left: 8px;
  margin-right: 8px;
  font-size: 10px;
  color: var(--text-subtle, #aaa);
}

.filter-container {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color, #444);
  background-color: var(--editor-bg);
  flex-wrap: wrap;
}

.filter-label {
  display: flex;
  align-items: center;
  margin-right: 10px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-color, #d4d4d4);
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 2px 4px;
  border-radius: 4px;
}

.filter-label:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.05);
}

.filter-label input {
  margin-right: 4px;
}

.filter-label i {
  margin-right: 4px;
  font-size: 14px;
}

.filter-label i.mdi-key-outline {
  color: #f8c555;
}

.filter-label i.mdi-tag-outline {
  color: #9cdcfe;
}

.filter-label i.mdi-cube-outline {
  color: #75beff;
}

.clear-filters-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-subtle, #aaa);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-filters-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--text-color, #d4d4d4);
}

.symbols-list {
  flex-grow: 1;
  overflow-y: scroll;
}

.symbol-item {
  display: flex;
  padding: 4px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  align-items: center;
}

.symbol-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.symbol-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  font-size: 11px;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.1);
  color: #d4d4d4;
}

/* Symbol type colors */
.symbol-icon.function {
  color: #dcdcaa;
}
.symbol-icon.variable {
  color: #9cdcfe;
}
.symbol-icon.class {
  color: #4ec9b0;
}
.symbol-icon.interface {
  color: #b8d7a3;
}
.symbol-icon.method {
  color: #dcdcaa;
}
.symbol-icon.property {
  color: #9cdcfe;
}
.symbol-icon.field {
  color: #9cdcfe;
}
.symbol-icon.constant {
  color: #4fc1ff;
}
.symbol-icon.enum {
  color: #b8d7a3;
}
.symbol-icon.keyword {
  color: #569cd6;
}
.symbol-icon.key {
  color: #f8c555;
}
.symbol-icon.metric {
  color: #75beff;
}

.symbol-details {
  overflow: hidden;
  flex: 1;
}

.symbol-label {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.symbol-description {
  font-size: 10px;
  color: var(--text-subtle, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.no-symbols {
  padding: 8px;
  color: var(--text-subtle, #888);
  font-style: italic;
  text-align: center;
}

/* Custom Tooltip Styles */
.custom-tooltip {
  position: absolute;
  z-index: 1000;
  background-color: var(--result-window-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0;
  font-size: 12px;
  color: var(--text-color);
  max-width: 320px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
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
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
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
  background-color: var(--button-bg);
}

.tooltip-icon.function {
  color: #dcdcaa;
}
.tooltip-icon.variable {
  color: #9cdcfe;
}
.tooltip-icon.class {
  color: #4ec9b0;
}
.tooltip-icon.interface {
  color: #b8d7a3;
}
.tooltip-icon.method {
  color: #dcdcaa;
}
.tooltip-icon.property {
  color: #9cdcfe;
}
.tooltip-icon.field {
  color: #9cdcfe;
}
.tooltip-icon.constant {
  color: #4fc1ff;
}
.tooltip-icon.enum {
  color: #b8d7a3;
}
.tooltip-icon.keyword {
  color: #569cd6;
}
.tooltip-icon.key {
  color: #f8c555;
}
.tooltip-icon.metric {
  color: #75beff;
}

.tooltip-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-color);
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
  min-width: 80px;
  color: var(--text-faint);
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

.tooltip-datatype {
  color: var(--text-faint);
  font-style: italic;
  margin-left: 4px;
}

.trilogy-value {
  color: #b8d7a3;
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

.description-row,
.calculation-row {
  flex-direction: column;
  align-items: stretch;
}

.description-row .tooltip-label,
.calculation-row .tooltip-label {
  margin-bottom: 4px;
}

.description-value {
  color: var(--text-color);
  line-height: 1.4;
}

.calculation-value {
  color: #dcdcaa;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  /* background-color: var(--button-bg); */
  padding: 4px 6px;
  border-radius: 3px;
  line-height: 1.3;
}

.keys-value {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.key-tag {
  background-color: rgba(248, 197, 85, 0.15);
  color: #f8c555;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
}

.insert-value {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  background-color: var(--button-bg);
  padding: 2px 4px;
  border-radius: 3px;
  color: #9cdcfe;
  font-size: 10px;
}

@media screen and (max-width: 768px) {
  .symbols-pane {
    width: 100%;
    height: 150px;
    border-left: none;
    border-top: 1px solid var(--border-color, #444);
  }

  .custom-tooltip {
    max-width: 280px;
    font-size: 11px;
  }
}
</style>