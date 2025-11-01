<template>
  <div>
    <!-- Generic modal dialog -->
    <teleport to="body" v-if="showModal && currentItem">
      <div class="confirmation-overlay">
        <div class="confirmation-dialog" ref="editorElement" :style="dialogStyle">
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
            <button v-if="hasNext" @click="nextItem" class="primary-button" data-testid="next-item">
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import ResizeHandles from '../composables/ResizeHandles.vue' // Adjust path as needed
import { useResizableDialog } from '../composables/useResizableDialog' // Adjust path as needed
import type { ModalItem } from '../data/tips'

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
const emit = defineEmits(['mark-item-read', 'close-modal'])

// Local state
const currentIndex = ref(0)
const highlightedElement = ref<HTMLElement | null>(null)

// Highlighting retry mechanism state
const activeHighlightAttempt = ref<string | null>(null)
const highlightRetryCount = ref(0)
const maxHighlightRetries = 50 // Maximum number of retries
const retryInterval = 100 // Retry every 100ms

// Use the resizable dialog composable
const { editorElement, dialogStyle, startResize, canCloseOnClickOutside } = useResizableDialog(
  () => emit('close-modal'),
  {
    initialWidth: props.initialWidth,
    initialHeight: props.initialHeight,
    minWidth: 400,
    minHeight: 300,
  },
)

// Computed properties
const currentItem = computed(() => {
  const items = props.activeItems
  return items.length > 0 ? items[currentIndex.value] : null
})

const hasNext = computed(() => {
  return currentIndex.value < props.activeItems.length - 1
})

const removeGlobalCSS = () => {
  const existingLink = document.getElementById('tutorial-highlight-styles')
  if (existingLink) {
    existingLink.remove()
  }
}

// Highlighting functionality with retry mechanism
const highlightElement = async (dataTestId: string) => {
  await nextTick() // Ensure DOM is updated

  // Set the active attempt to track this highlighting request
  activeHighlightAttempt.value = dataTestId
  highlightRetryCount.value = 0

  // Start the retry loop
  attemptHighlight(dataTestId)
}

const attemptHighlight = async (dataTestId: string) => {
  // Check if this attempt is still active (modal hasn't changed/closed)
  if (activeHighlightAttempt.value !== dataTestId || !props.showModal) {
    return
  }

  // Find the element with the specified data-testid
  const element = document.querySelector(`[data-testid="${dataTestId}"]`) as HTMLElement

  if (element) {
    // Element found! Proceed with highlighting
    await performHighlight(element, dataTestId)
    return
  }

  // Element not found, check if we should retry
  highlightRetryCount.value++

  if (highlightRetryCount.value >= maxHighlightRetries) {
    console.warn(
      `Element with data-testid="${dataTestId}" not found after ${maxHighlightRetries} attempts`,
    )
    activeHighlightAttempt.value = null
    return
  }

  // Schedule next retry
  setTimeout(() => {
    attemptHighlight(dataTestId)
  }, retryInterval)
}

const performHighlight = async (element: HTMLElement, dataTestId: string) => {
  // Double-check this attempt is still active
  if (activeHighlightAttempt.value !== dataTestId || !props.showModal) {
    return
  }

  // Remove previous highlighting
  clearHighlight()

  // Temporarily disable click-outside detection
  const originalCanClose = canCloseOnClickOutside?.value
  if (canCloseOnClickOutside) {
    canCloseOnClickOutside.value = false
  }

  // Add highlight classes
  element.classList.add(
    'tutorial-highlight',
    'tutorial-highlight-transition',
    'tutorial-scroll-target',
  )

  // Determine arrow position based on element's position
  const rect = element.getBoundingClientRect()

  if (rect.top < 100) {
    element.classList.add('arrow-bottom')
  }

  // Scroll element into view smoothly
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  })

  highlightedElement.value = element
  activeHighlightAttempt.value = null // Clear the active attempt

  // Re-enable click-outside detection after scroll animation completes
  setTimeout(() => {
    if (canCloseOnClickOutside) {
      canCloseOnClickOutside.value = originalCanClose ?? true
    }
  }, 1000) // Adjust timing based on your scroll animation duration
}

const clearHighlight = () => {
  // Cancel any active highlighting attempts
  activeHighlightAttempt.value = null

  if (highlightedElement.value) {
    highlightedElement.value.classList.remove(
      'tutorial-highlight',
      'tutorial-highlight-transition',
      'tutorial-scroll-target',
      'arrow-bottom',
    )
    highlightedElement.value = null
  }

  // Clear any other highlighted elements (safety cleanup)
  const highlightedElements = document.querySelectorAll('.tutorial-highlight')
  highlightedElements.forEach((el) => {
    el.classList.remove(
      'tutorial-highlight',
      'tutorial-highlight-transition',
      'tutorial-scroll-target',
      'arrow-bottom',
    )
  })
}

// Methods
const nextItem = async () => {
  if (currentItem.value) {
    // Mark current item as read
    emit('mark-item-read', currentItem.value.id)
  }

  if (hasNext.value) {
    currentIndex.value++
    // Highlighting will be handled by the watcher
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
  if (currentItem.value) {
    // Mark current item as read
    emit('mark-item-read', currentItem.value.id)
  }
  emit('close-modal')
}

// Watchers
// Reset index when items change
watch(
  () => props.activeItems,
  () => {
    currentIndex.value = 0
  },
)

// Handle highlighting when current item changes
watch(
  currentItem,
  async (newItem) => {
    if (newItem?.highlightDataTestId) {
      await highlightElement(newItem.highlightDataTestId)
    } else {
      clearHighlight()
    }
  },
  { immediate: true },
)

// Handle modal visibility changes
watch(
  () => props.showModal,
  (isVisible) => {
    if (isVisible) {
      // Highlight current item if it has a testId
      if (currentItem.value?.highlightDataTestId) {
        nextTick(() => {
          highlightElement(currentItem.value!.highlightDataTestId!)
        })
      }
    } else {
      clearHighlight()
      // Don't remove CSS immediately to allow for smooth transitions
      setTimeout(() => {
        if (!props.showModal) {
          removeGlobalCSS()
        }
      }, 300)
    }
  },
)

// Lifecycle hooks
onMounted(() => {})

onUnmounted(() => {
  clearHighlight()
  removeGlobalCSS()
})

// Handle escape key
const handleEscapeKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.showModal) {
    skipSequence()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscapeKey)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscapeKey)
})
</script>

<style scoped>
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
