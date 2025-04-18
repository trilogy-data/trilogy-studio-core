<!-- FilterAutocomplete.vue -->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { CompletionItem } from '../stores/resolver'

const props = defineProps({
  inputValue: {
    type: String,
    required: true,
  },
  completionItems: {
    type: Array as () => CompletionItem[],
    required: true,
  },
  inputElement: {
    type: Object as () => HTMLInputElement | null,
    default: null,
  },
})

const emit = defineEmits(['select-completion'])

const isVisible = ref(false)
const selectedIndex = ref(0)
const cursorPosition = ref(0)
const currentWord = ref('')
const wordStartPosition = ref(0)

const dropdown = ref<HTMLElement | null>(null)

// Calculate position relative to input
const dropdownStyle = computed(() => {
  if (!props.inputElement) return {}

  // Get the input element's position
  const rect = props.inputElement.getBoundingClientRect()

  return {
    top: `${rect.bottom}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    maxHeight: '200px',
  }
})

// Find current word being typed at cursor position
const updateCurrentWord = () => {
  if (!props.inputElement) return

  cursorPosition.value = props.inputElement.selectionStart || 0
  const text = props.inputValue

  // Find the start of the current word (from cursor position backward to a space or beginning)
  let start = cursorPosition.value
  while (start > 0 && !/\s/.test(text.charAt(start - 1))) {
    start--
  }

  // Find the end of the current word (from cursor position forward to a space or end)
  let end = cursorPosition.value
  while (end < text.length && !/\s/.test(text.charAt(end))) {
    end++
  }

  wordStartPosition.value = start
  currentWord.value = text.substring(start, end)
}

// Filter completion items based on current word
const filteredItems = computed(() => {
  if (!currentWord.value.trim()) return []

  const query = currentWord.value.toLowerCase()
  return props.completionItems
    .filter((item) => item.label.toLowerCase().includes(query))
    .sort((a, b) => {
      // Prioritize items that start with the query
      const aStarts = a.label.toLowerCase().startsWith(query)
      const bStarts = b.label.toLowerCase().startsWith(query)

      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      // Then sort alphabetically
      return a.label.localeCompare(b.label)
    })
    .slice(0, 10) // Limit to 10 suggestions
})

// Show dropdown if we have matches
watch(filteredItems, (items) => {
  isVisible.value = items.length > 0
  selectedIndex.value = 0 // Reset selection when items change
})

// Handle keyboard navigation in dropdown
const handleKeyDown = (event: KeyboardEvent) => {
  if (!isVisible.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % filteredItems.value.length
      break
    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value =
        (selectedIndex.value - 1 + filteredItems.value.length) % filteredItems.value.length
      break
    case 'Enter':
    case 'Tab':
      if (filteredItems.value.length > 0) {
        event.preventDefault()
        selectCompletion(filteredItems.value[selectedIndex.value])
      }
      break
    case 'Escape':
      event.preventDefault()
      isVisible.value = false
      break
  }
}

// Apply the selected completion
const selectCompletion = (item: CompletionItem) => {
  // Create the replacement text (full input with the current word replaced)
  const prefix = props.inputValue.substring(0, wordStartPosition.value)
  const suffix = props.inputValue.substring(cursorPosition.value)

  emit('select-completion', {
    text: prefix + item.label + suffix,
    cursorPosition: wordStartPosition.value + item.label.length,
  })

  isVisible.value = false
}

// Handle clicks outside to close dropdown
const handleClickOutside = (event: MouseEvent) => {
  if (
    dropdown.value &&
    !dropdown.value.contains(event.target as Node) &&
    props.inputElement !== event.target
  ) {
    isVisible.value = false
  }
}

// Get icon class for symbol type (similar to SymbolsPane)
const getIconClass = (symbol: CompletionItem): string => {
  if (symbol.trilogySubType) {
    return symbol.trilogySubType.toLowerCase()
  }
  return symbol.type.toLowerCase()
}

// Track input position and content changes
watch(
  () => props.inputValue,
  () => {
    updateCurrentWord()
  },
)


// Setup event listeners
onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  if (props.inputElement) {
    console.log('Adding event listeners to inputElement')
    console.log(props.inputElement)
    // props.inputElement.addEventListener('keydown', handleKeyDown)
    // props.inputElement.addEventListener('click', updateCurrentWord)
    // props.inputElement.addEventListener('focus', updateCurrentWord)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  if (props.inputElement) {
    // props.inputElement.removeEventListener('keydown', handleKeyDown)
    // props.inputElement.removeEventListener('click', updateCurrentWord)
    // props.inputElement.removeEventListener('focus', updateCurrentWord)
  }
})

// Initialize
updateCurrentWord()
</script>

<template>
  <div v-if="isVisible" ref="dropdown" class="autocomplete-dropdown" :style="dropdownStyle">
    <div
      v-for="(item, index) in filteredItems"
      :key="index"
      class="completion-item"
      :class="{ selected: index === selectedIndex }"
      @click="selectCompletion(item)"
    >
      <div class="symbol-icon" :class="getIconClass(item)">
        <i
          v-if="item.trilogySubType"
          :class="`mdi ${
            item.trilogySubType === 'key'
              ? 'mdi-key-outline'
              : item.trilogySubType === 'property'
                ? 'mdi-tag-outline'
                : 'mdi-cube-outline'
          }`"
        ></i>
        <template v-else>
          {{
            item.type === 'function'
              ? 'ƒ'
              : item.type === 'variable'
                ? 'V'
                : item.type === 'class'
                  ? 'C'
                  : item.type === 'interface'
                    ? 'I'
                    : item.type === 'method'
                      ? 'M'
                      : item.type === 'property'
                        ? 'P'
                        : item.type === 'field'
                          ? 'F'
                          : item.type === 'constant'
                            ? 'K'
                            : item.type === 'enum'
                              ? 'E'
                              : item.type === 'keyword'
                                ? 'K'
                                : 'S'
          }}
        </template>
      </div>
      <div class="completion-details">
        <div class="completion-label">{{ item.label }}</div>
        <div class="completion-description">{{ item.description }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.autocomplete-dropdown {
  position: fixed;
  background-color: var(--query-window-bg, #1e1e1e);
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  overflow-y: auto;
  z-index: 1000;
  max-height: 200px;
}

.completion-item {
  display: flex;
  padding: 6px 8px;
  cursor: pointer;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.completion-item:hover,
.completion-item.selected {
  background-color: rgba(255, 255, 255, 0.1);
}

.completion-item.selected {
  border-left: 2px solid var(--special-text, #75beff);
}

.symbol-icon {
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

/* Symbol type colors - matching SymbolsPane styles */
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

.completion-details {
  overflow: hidden;
  flex: 1;
}

.completion-label {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.completion-description {
  font-size: 10px;
  color: var(--text-subtle, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
