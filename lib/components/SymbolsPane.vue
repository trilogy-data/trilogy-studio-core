<template>
  <div class="symbols-pane">
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
    <div class="symbols-list">
      <div
        v-for="(symbol, index) in filteredSymbols"
        :key="index"
        class="symbol-item"
        @click="$emit('select-symbol', symbol)"
      >
        <div 
          class="symbol-icon" 
          :class="getIconClass(symbol)"
          v-tooltip="getIconTooltip(symbol)"
        >
          <i v-if="getIconType(symbol) === 'mdi'" :class="getIconMdiClass(symbol)"></i>
          <template v-else>{{ getSymbolChar(symbol) }}</template>
        </div>
        <div class="symbol-details">
          <div class="symbol-label">{{ symbol.label }}</div>
          <div class="symbol-description">{{ symbol.description }}</div>
        </div>
      </div>
      <div v-if="filteredSymbols.length === 0" class="no-symbols">No matching symbols found</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType, watch } from 'vue'

export interface CompletionItem {
  label: string
  description: string
  type: string
  insertText: string
  trilogyType?: string
  trilogySubType?: string
}

// Centralized icon configuration for easier management
const ICON_CONFIG = {
  // MDI icons for trilogy subtypes
  trilogy: {
    key: { icon: 'mdi-key-outline', tooltip: 'Key' },
    property: { icon: 'mdi-tag-outline', tooltip: 'Property' },
    metric: { icon: 'mdi-cube-outline', tooltip: 'Metric' }
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
    default: { char: 'S', tooltip: 'Symbol' }
  }
}

export default defineComponent({
  name: 'SymbolsPane',
  props: {
    symbols: {
      type: Array as PropType<CompletionItem[]>,
      required: true,
    },
  },
  emits: ['select-symbol', 'focus-search'],

  setup(props) {
    const searchQuery = ref('')
    const filteredSymbols = ref<CompletionItem[]>([])
    const symbolSearchInput = ref<HTMLInputElement | null>(null)

    // Determine icon display type (mdi or character)
    const getIconType = (symbol: CompletionItem): string => {
      return symbol.trilogySubType && ICON_CONFIG.trilogy[symbol.trilogySubType] 
        ? 'mdi' 
        : 'char'
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
      const type = symbol.type.toLowerCase()
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
      
      const type = symbol.type.toLowerCase()
      return ICON_CONFIG.standard[type]?.tooltip || ICON_CONFIG.standard.default.tooltip
    }

    // Filter symbols based on search query
    const filterSymbols = (): void => {
      if (!props.symbols) {
        filteredSymbols.value = []
        return
      }

      const query = searchQuery.value.toLowerCase().trim()

      if (!query) {
        filteredSymbols.value = [...props.symbols]
        return
      }

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

      filteredSymbols.value = props.symbols
        .filter((symbol: CompletionItem) => {
          const label = symbol.label.toLowerCase()
          const description = (symbol.description || '').toLowerCase()
          return label.includes(query) || description.includes(query)
        })
        .sort(sortMatches)
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
      filterSymbols,
      getIconType,
      getIconMdiClass,
      getSymbolChar,
      getIconClass,
      getIconTooltip,
      focusSearch,
    }
  },
})
</script>

<style scoped>
/* Symbols pane styling */
.symbols-pane {
  width: 250px;
  border-left: 1px solid var(--border-color, #444);
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg, #252525);
  font-size: 12px;
  overflow-y: scroll;
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
  background-color: var(--sidebar-bg);
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

.symbols-list {
  overflow-y: scroll;
  flex-grow: 1;
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

@media screen and (max-width: 768px) {
  .symbols-pane {
    width: 100%;
    height: 150px;
    border-left: none;
    border-top: 1px solid var(--border-color, #444);
  }
}
</style>