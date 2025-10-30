<template>
  <div>
    <!-- Generic modal dialog -->
    <teleport to="body" v-if="showModal && currentItem">
      <div class="confirmation-overlay">
        <div 
          class="confirmation-dialog" 
          ref="editorElement" 
          :style="dialogStyle"
        >
          <div class="modal-header">
            <h2>{{ currentItem.title }}</h2>
            <button 
              @click="skipSequence" 
              class="exit-button"
              data-testid="exit-modal"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
          <div class="modal-content">
            <p>{{ currentItem.content }}</p>
          </div>
          <div class="progress-section" v-if="activeItems.length > 1">
            <span class="progress-indicator">
              {{ currentIndex + 1 }} of {{ activeItems.length }}
            </span>
          </div>
          <div class="button-container">
            <button
              v-if="hasNext"
              @click="nextItem"
              class="primary-button"
              data-testid="next-item"
            >
              Next →
            </button>
            <button
              v-else
              @click="completeSequence"
              class="primary-button"
              data-testid="complete-sequence"
            >
              Got it!
            </button>
            <button @click="skipSequence" class="cancel-btn">Skip</button>
          </div>
          
          <!-- Resize handles -->
          <ResizeHandles :onStartResize="startResize" />
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ResizeHandles from '../composables/ResizeHandles.vue' // Adjust path as needed
import { useResizableDialog } from '../composables/useResizableDialog' // Adjust path as needed

// Modal item interface
export interface ModalItem {
  id: string
  title: string
  content: string
}

// Define props
const props = defineProps({
  showModal: {
    type: Boolean,
    required: true,
  },
  activeItems: {
    type: Array as () => ModalItem[],
    default: () => [],
  },
  initialWidth: {
    type: Number,
    default: 500,
  },
  initialHeight: {
    type: Number,
    default: 400,
  },
})

// Define emits
const emit = defineEmits([
  'mark-item-read',
  'close-modal',
])

// Local state
const currentIndex = ref(0)

// Use the resizable dialog composable
const { editorElement, dialogStyle, startResize } = useResizableDialog(
  () => emit('close-modal'),
  {
    initialWidth: props.initialWidth,
    initialHeight: props.initialHeight,
    minWidth: 400,
    minHeight: 300,
  }
)

// Computed properties
const currentItem = computed(() => {
  const items = props.activeItems
  return items.length > 0 ? items[currentIndex.value] : null
})

const hasNext = computed(() => {
  return currentIndex.value < props.activeItems.length - 1
})

// Methods
const nextItem = () => {
  if (currentItem.value) {
    // Mark current item as read
    emit('mark-item-read', currentItem.value.id)
  }
  
  if (hasNext.value) {
    currentIndex.value++
  } else {
    // This shouldn't happen, but close if it does
    emit('close-modal')
  }
}

const completeSequence = () => {
  if (currentItem.value) {
    // Mark current item as read
    emit('mark-item-read', currentItem.value.id)
  }
  emit('close-modal')
}

const skipSequence = () => {
  emit('close-modal')
}

// Reset index when items change
watch(() => props.activeItems, () => {
  currentIndex.value = 0
})
</script>

<style scoped>
/* Using global variables from style.css */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

h2 {
  font-size: var(--big-font-size);
  margin: 0;
  color: var(--text-color);
  flex: 1;
}

.exit-button {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.6;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin-left: 12px;
}

.exit-button:hover {
  opacity: 1;
  background-color: var(--border-light);
}

.exit-button:focus {
  outline: 2px solid var(--special-text);
  outline-offset: 2px;
}

.modal-content {
  margin: 20px 0;
  flex: 1;
  overflow-y: auto;
}

.modal-content p {
  color: var(--text-color);
  line-height: 1.5;
  margin: 0;
}

.progress-section {
  text-align: center;
  margin-bottom: 16px;
}

.progress-indicator {
  color: var(--text-color);
  font-size: var(--font-size);
  opacity: 0.7;
}

.button-container {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
  flex-shrink: 0;
}

.primary-button {
  background-color: var(--special-text);
  color: white;
  padding: 10px 20px;
  border: none;
  cursor: pointer;
  font-size: var(--font-size);
}

.primary-button:hover {
  opacity: 0.9;
}

.cancel-btn {
  background-color: transparent;
  color: var(--text-color);
  padding: 10px 20px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: var(--font-size);
}

.cancel-btn:hover {
  background-color: var(--border-light);
}

/* Updated overlay and dialog styles for resizable functionality */
.confirmation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.confirmation-dialog {
  position: absolute;
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media screen and (max-width: 768px) {
  .confirmation-dialog {
    max-width: 100vw;
    max-height: 100vh;
  }
}
</style>