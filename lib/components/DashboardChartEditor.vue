<script lang="ts" setup>
import { ref, defineEmits, onMounted, onUnmounted } from 'vue'
import SimpleEditor from './SimpleEditor.vue'
import { type Import } from '../stores/resolver'
import { nextTick } from 'process'

interface EditorRef {
  getContent: () => string
}

const props = defineProps<{
  content: string
  connectionName: string
  imports: Import[]
  showing: boolean
  initialWidth?: number
  initialHeight?: number
}>()

const emit = defineEmits(['save', 'cancel'])
const queryText = ref(props.content)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)

// Add refs for resizing
const isResizing = ref(false)
const resizeDirection = ref('')
const startX = ref(0)
const startY = ref(0)
const startWidth = ref(0)
const startHeight = ref(0)
const startTop = ref(0)
const startLeft = ref(0)
const editorWidth = ref(props.initialWidth || 800)
const editorHeight = ref(props.initialHeight || 400)
const editorTop = ref(50) // % from top
const editorLeft = ref(50) // % from left
const editorElement = ref<HTMLElement | null>(null)
const canCloseOnClickOutside = ref(true)

function saveQuery(): void {
  if (editor.value) {
    const editorContent = editor.value.getContent()
    emit('save', editorContent)
  }
}

function cancel(): void {
  emit('cancel')
}

function handleClickOutside(event: MouseEvent): void {
  const popupElement = document.querySelector('.content-editor')
  if (!popupElement || !props.showing || !canCloseOnClickOutside.value) return
  
  // Don't close if we're currently resizing
  if (isResizing.value) return
  
  // Check if the click was outside the popup
  if (!popupElement.contains(event.target as Node)) {
    // Calculate distance from popup edges
    const rect = popupElement.getBoundingClientRect()
    const bufferZone = 100 // pixels buffer around the popup
    
    const isCloseToLeft = event.clientX >= rect.left - bufferZone && event.clientX <= rect.left
    const isCloseToRight = event.clientX >= rect.right && event.clientX <= rect.right + bufferZone
    const isCloseToTop = event.clientY >= rect.top - bufferZone && event.clientY <= rect.top
    const isCloseToBottom = event.clientY >= rect.bottom && event.clientY <= rect.bottom + bufferZone
    
    // Only close if the click is outside the buffer zone
    if (!(isCloseToLeft || isCloseToRight || isCloseToTop || isCloseToBottom)) {
      emit('cancel')
    }
  }
}

// Start resizing
function startResize(e: MouseEvent, direction: string): void {
  if (!editorElement.value) return
  
  isResizing.value = true
  resizeDirection.value = direction
  startX.value = e.clientX
  startY.value = e.clientY
  startWidth.value = editorElement.value.offsetWidth
  startHeight.value = editorElement.value.offsetHeight
  
  const rect = editorElement.value.getBoundingClientRect()
  startTop.value = rect.top
  startLeft.value = rect.left
  
  // Prevent click outside from triggering while resizing
  canCloseOnClickOutside.value = false
  
  // Prevent text selection while resizing
  e.preventDefault()
}

// Handle resizing
function handleResize(e: MouseEvent): void {
  if (!isResizing.value) return
  
  const direction = resizeDirection.value
  
  // Calculate new dimensions based on the drag direction
  if (direction.includes('e')) {
    // Right edge - adjust width
    const newWidth = startWidth.value + (e.clientX - startX.value)
    editorWidth.value = Math.max(400, newWidth)
  }
  
  if (direction.includes('w')) {
    // Left edge - adjust width and position
    const deltaX = e.clientX - startX.value
    const newWidth = startWidth.value - deltaX
    
    if (newWidth >= 400) {
      editorWidth.value = newWidth
      const overlay = document.querySelector('.editor-overlay') as HTMLElement
      if (overlay) {
        const containerWidth = overlay.offsetWidth
        const newLeftPx = startLeft.value + deltaX
        editorLeft.value = (newLeftPx / containerWidth) * 100
      }
    }
  }
  
  if (direction.includes('s')) {
    // Bottom edge - adjust height
    const newHeight = startHeight.value + (e.clientY - startY.value)
    editorHeight.value = Math.max(200, newHeight)
  }
  
  if (direction.includes('n')) {
    // Top edge - adjust height and position
    const deltaY = e.clientY - startY.value
    const newHeight = startHeight.value - deltaY
    
    if (newHeight >= 200) {
      editorHeight.value = newHeight
    }
  }
}

// Stop resizing
function stopResize(): void {
  isResizing.value = false
  resizeDirection.value = ''
}

onMounted(() => {
  nextTick(() => {
    document.addEventListener('click', handleClickOutside)
    // Add global mouse event listeners for resizing
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', (e) => {
      if (isResizing.value) {
        stopResize()
        
        // Prevent this mouse up from triggering handleClickOutside immediately
        e.stopPropagation()
        
        // Reset the click outside protection timer
        setTimeout(() => {
          canCloseOnClickOutside.value = true
        }, 100)
      }
    })
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<template>
  <div class="editor-overlay">
    <div 
      class="content-editor"
      ref="editorElement"
      :style="{ 
        width: `${editorWidth}px`, 
        height: `${editorHeight}px`,
        top: `${editorTop}%`,
        left: `${editorLeft}%`,
        transform: `translate(-50%, -50%)`
      }"
    >
      <div class="editor-body">
        <SimpleEditor
          class="editor-content"
          :initContent="queryText"
          :connectionName="connectionName"
          :imports="imports"
          ref="editor"
        ></SimpleEditor>
      </div>
      <div class="editor-actions">
        <button @click="saveQuery" class="save-button" data-testid="save-dashboard-chart">
          Save Query
        </button>
        <button @click="cancel" class="cancel-button">Cancel</button>
      </div>
      
      <!-- Resize handles -->
      <div class="resize-handle resize-handle-n" @mousedown="(e) => startResize(e, 'n')"></div>
      <div class="resize-handle resize-handle-e" @mousedown="(e) => startResize(e, 'e')"></div>
      <div class="resize-handle resize-handle-s" @mousedown="(e) => startResize(e, 's')"></div>
      <div class="resize-handle resize-handle-w" @mousedown="(e) => startResize(e, 'w')"></div>
      <div class="resize-handle resize-handle-ne" @mousedown="(e) => startResize(e, 'ne')"></div>
      <div class="resize-handle resize-handle-nw" @mousedown="(e) => startResize(e, 'nw')"></div>
      <div class="resize-handle resize-handle-se" @mousedown="(e) => startResize(e, 'se')"></div>
      <div class="resize-handle resize-handle-sw" @mousedown="(e) => startResize(e, 'sw')"></div>
    </div>
  </div>
</template>

<style scoped>
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

.content-editor {
  position: absolute;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  padding: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-body {
  flex: 1;
  overflow: hidden;
}

.editor-content {
  height: 100%;
  width: 100%;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 10px;
  flex-shrink: 0;
}

.save-button,
.cancel-button {
  padding: 8px 16px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: var(--button-font-size);
}

.save-button {
  background-color: var(--special-text);
  color: white;
}

.cancel-button {
  background-color: var(--delete-color);
  color: white;
}

/* Resize handles */
.resize-handle {
  position: absolute;
  background-color: transparent;
  z-index: 10;
}

.resize-handle-n {
  top: 0;
  left: 0;
  height: 8px;
  width: 100%;
  cursor: n-resize;
}

.resize-handle-e {
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: e-resize;
}

.resize-handle-s {
  bottom: 0;
  left: 0;
  height: 8px;
  width: 100%;
  cursor: s-resize;
}

.resize-handle-w {
  top: 0;
  left: 0;
  width: 8px;
  height: 100%;
  cursor: w-resize;
}

.resize-handle-ne {
  top: 0;
  right: 0;
  width: 15px;
  height: 15px;
  cursor: ne-resize;
}

.resize-handle-nw {
  top: 0;
  left: 0;
  width: 15px;
  height: 15px;
  cursor: nw-resize;
}

.resize-handle-se {
  bottom: 0;
  right: 0;
  width: 15px;
  height: 15px;
  cursor: se-resize;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 15 15'%3E%3Cpath fill='rgba(150, 150, 150, 0.8)' d='M11 9.5L11 11H9.5V9.5H11M11 5.5V7H9.5V5.5H11M7 9.5V11H5.5V9.5H7M7 5.5V7H5.5V5.5H7Z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: bottom right;
}

.resize-handle-sw {
  bottom: 0;
  left: 0;
  width: 15px;
  height: 15px;
  cursor: sw-resize;
}
</style>