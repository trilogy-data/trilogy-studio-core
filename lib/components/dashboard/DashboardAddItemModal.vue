<script lang="ts" setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { CELL_TYPES, type CellType } from '../../dashboards/base'

// Define props and emits
const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  add: [type: CellType]
  close: []
}>()

// Item type selection
const newItemType = ref<CellType>(CELL_TYPES.CHART)

// Add item and emit event
function addItem(): void {
  emit('add', newItemType.value)
}

// Close modal and emit event
function closeModal(): void {
  emit('close')
}

function handleClickOutside(event: MouseEvent): void {
  const importSelector = document.querySelector('.content-editor')
  if (importSelector && !importSelector.contains(event.target as Node) && props.show) {
    emit('close')
  }
}

onMounted(() => {
  nextTick(() => {
    document.addEventListener('click', handleClickOutside)
  })
})

// Remove event listener on unmounted
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <Teleport to="body" v-if="show">
    <div class="editor-overlay">
      <div class="add-item-modal">
        <h3>Add New Item</h3>
        <div class="item-type-selector">
          <label>
            <input type="radio" v-model="newItemType" :value="CELL_TYPES.CHART"
              data-testid="dashboard-add-item-type-chart" />
            Chart
          </label>
          <label>
            <input type="radio" v-model="newItemType" :value="CELL_TYPES.TABLE"
              data-testid="dashboard-add-item-type-table" />
            Table
          </label>
          <label>
            <input type="radio" v-model="newItemType" :value="CELL_TYPES.MARKDOWN"
              data-testid="dashboard-add-item-type-markdown" />
            Markdown
          </label>
          <label>
            <input type="radio" v-model="newItemType" :value="CELL_TYPES.FILTER"
              data-testid="dashboard-add-item-type-filter" />
            Filter
          </label>
        </div>
        <div class="editor-actions">
          <button @click="addItem" class="add-button" data-testid="dashboard-add-item-confirm">
            Add
          </button>
          <button @click="closeModal" class="cancel-button">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Editor Overlay */
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.add-item-modal {
  background-color: var(--bg-color);
  padding: 20px;
  max-width: 500px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.item-type-selector {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.item-type-selector label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-color);
}

.item-type-selector input[type='radio'] {
  accent-color: var(--special-text);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.editor-actions button {
  padding: 8px 16px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: var(--button-font-size);
}

.add-button {
  background-color: var(--special-text);
  color: white;
}

.cancel-button {
  background-color: var(--delete-color);
  color: white;
}
</style>
