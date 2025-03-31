<template>
    <div class="symbols-pane" v-show="symbols && symbols.length > 0">
        <div class="search-container">
            <input type="text" 
                   class="symbols-search" 
                   placeholder="Search symbols..." 
                   v-model="searchQuery" 
                   @input="filterSymbols"
                   ref="symbolSearchInput">
            <div class="symbol-count">{{ filteredSymbols.length }} symbols</div>
        </div>
        <div class="symbols-list">
            <div v-for="(symbol, index) in filteredSymbols" 
                 :key="index" 
                 class="symbol-item"
                 @click="$emit('select-symbol', symbol)">
                <div class="symbol-icon" :class="symbol.type.toLowerCase()">{{ getSymbolIcon(symbol.type) }}</div>
                <div class="symbol-details">
                    <div class="symbol-label">{{ symbol.label }}</div>
                    <div class="symbol-description">{{ symbol.description }}</div>
                </div>
            </div>
            <div v-if="filteredSymbols.length === 0" class="no-symbols">
                No matching symbols found
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, PropType, watch } from 'vue';

export interface CompletionItem {
    label: string;
    description: string;
    type: string;
    insertText: string;
}

const SYMBOL_ICONS: Record<string, string> = {
    'function': 'ƒ',
    'variable': 'V',
    'class': 'C',
    'interface': 'I',
    'method': 'M',
    'property': 'P',
    'field': 'F',
    'constant': 'K',
    'enum': 'E',
    'keyword': 'K',
    'default': '𝑆'
};

export default defineComponent({
    name: 'SymbolsPane',
    props: {
        symbols: {
            type: Array as PropType<CompletionItem[]>,
            required: true
        }
    },
    emits: ['select-symbol', 'focus-search'],
    
    setup(props, { emit }) {
        const searchQuery = ref('');
        const filteredSymbols = ref<CompletionItem[]>([]);
        const symbolSearchInput = ref<HTMLInputElement | null>(null);
        
        // Watch for changes in symbols or search query
        watch(() => props.symbols, (newSymbols) => {
            filterSymbols();
        }, { immediate: true });
        
        watch(searchQuery, () => {
            filterSymbols();
        });
        
        // Filter symbols based on search query
        const filterSymbols = (): void => {
            if (!props.symbols) {
                filteredSymbols.value = [];
                return;
            }
            
            const query = searchQuery.value.toLowerCase().trim();
            
            if (!query) {
                filteredSymbols.value = [...props.symbols];
                return;
            }
            
            // Sort function for prioritizing matches at the beginning
            const sortMatches = (a: CompletionItem, b: CompletionItem): number => {
                const aLabelLower = a.label.toLowerCase();
                const bLabelLower = b.label.toLowerCase();
                
                const aStartsWithQuery = aLabelLower.startsWith(query);
                const bStartsWithQuery = bLabelLower.startsWith(query);
                
                // Prioritize items that start with the query
                if (aStartsWithQuery && !bStartsWithQuery) return -1;
                if (!aStartsWithQuery && bStartsWithQuery) return 1;
                
                // If both or neither start with the query, sort alphabetically
                return aLabelLower.localeCompare(bLabelLower);
            };
            
            filteredSymbols.value = props.symbols
                .filter((symbol: CompletionItem) => {
                    const label = symbol.label.toLowerCase();
                    const description = (symbol.description || '').toLowerCase();
                    return label.includes(query) || description.includes(query);
                })
                .sort(sortMatches);
        };
        
        const getSymbolIcon = (type: string): string => {
            return SYMBOL_ICONS[type.toLowerCase()] || SYMBOL_ICONS.default;
        };
        
        const focusSearch = (): void => {
            if (symbolSearchInput.value) {
                symbolSearchInput.value.focus();
            }
        };
        
        return {
            searchQuery,
            filteredSymbols,
            symbolSearchInput,
            filterSymbols,
            getSymbolIcon,
            focusSearch
        };
    }
});
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
}

.search-container {
    display: flex;
    align-items: center;
    padding: 4px;
    border-bottom: 1px solid var(--border-color, #444);
}

.symbols-search {
    flex: 1;
    height: 24px;
    background-color: var(--input-bg, #3c3c3c);
    color: var(--text-color, #d4d4d4);
    border: 1px solid var(--border-color, #444);
    padding: 0 6px;
    font-size: 12px;
}

.symbol-count {
    margin-left: 4px;
    font-size: 10px;
    color: var(--text-subtle, #aaa);
}

.symbols-list {
    overflow-y: auto;
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
.symbol-icon.function { color: #dcdcaa; }
.symbol-icon.variable { color: #9cdcfe; }
.symbol-icon.class { color: #4ec9b0; }
.symbol-icon.interface { color: #b8d7a3; }
.symbol-icon.method { color: #dcdcaa; }
.symbol-icon.property { color: #9cdcfe; }
.symbol-icon.field { color: #9cdcfe; }
.symbol-icon.constant { color: #4fc1ff; }
.symbol-icon.enum { color: #b8d7a3; }
.symbol-icon.keyword { color: #569cd6; }

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