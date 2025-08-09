<script lang="ts" setup>
import { ref, defineEmits, onMounted, onUnmounted, computed, watch } from 'vue'
import SimpleEditor from '../SimpleEditor.vue'
import { type Import } from '../../stores/resolver'
import { nextTick } from 'process'
import type { ContentInput } from '../../stores/resolver'
import type { MarkdownData } from '../../dashboards/base'

interface EditorRef {
  getContent: () => string
}

const props = defineProps<{
  content: MarkdownData
  connectionName: string
  imports: Import[]
  rootContent: ContentInput[]
  // showing: boolean
  initialWidth?: number
  initialHeight?: number
}>()

const emit = defineEmits(['save', 'cancel'])

// Handle both old string format and new object format
const contentData = computed(() => {
  if (typeof props.content === 'string') {
    return { markdown: props.content, query: '' }
  }
  return { markdown: props.content.markdown || '', query: props.content.query || '' }
})

const markdownText = ref(contentData.value.markdown)
const queryText = ref(contentData.value.query)
// Add internal state for the query editor content
const queryEditorContent = ref(contentData.value.query)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)

// Tab management
const activeTab = ref('markdown')

// Add refs for resizing
const isResizing = ref(false)
const resizeDirection = ref('')
const startX = ref(0)
const startY = ref(0)
const startWidth = ref(0)
const startHeight = ref(0)
const startTop = ref(0)
const startLeft = ref(0)

// Calculate default dimensions - 75% of viewport on desktop
const getDefaultDimensions = () => {
  const isDesktop = window.innerWidth > 768
  if (isDesktop) {
    return {
      width: Math.floor(window.innerWidth * 0.75),
      height: Math.floor(window.innerHeight * 0.75),
    }
  } else {
    // Mobile defaults remain unchanged
    return {
      width: 800,
      height: 400,
    }
  }
}

const defaultDimensions = getDefaultDimensions()
const editorWidth = ref(props.initialWidth || defaultDimensions.width)
const editorHeight = ref(props.initialHeight || defaultDimensions.height)
const editorTop = ref(50) // % from top
const editorLeft = ref(50) // % from left
const editorElement = ref<HTMLElement | null>(null)
const canCloseOnClickOutside = ref(true)

// Update refs when props change
watch(
  () => props.content,
  (newContent) => {
    const data =
      typeof newContent === 'string'
        ? { markdown: newContent, query: '' }
        : { markdown: newContent.markdown || '', query: newContent.query || '' }

    markdownText.value = data.markdown
    queryText.value = data.query
    queryEditorContent.value = data.query
  },
)

// Watch for tab changes to preserve query editor content
watch(activeTab, (newTab, oldTab) => {
  if (oldTab === 'query' && editor.value) {
    // Save the current query editor content before switching away
    queryEditorContent.value = editor.value.getContent()
  }
})

function saveContent(): void {
  // If we're currently on the query tab, get the latest content
  if (activeTab.value === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }
  
  const contentToSave = {
    markdown: markdownText.value,
    query: queryEditorContent.value,
  }
  emit('save', contentToSave)
}

function cancel(): void {
  emit('cancel')
}

function switchTab(tab: string): void {
  // Save current query editor content before switching
  if (activeTab.value === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }
  activeTab.value = tab
}

function handleClickOutside(event: MouseEvent): void {
  const popupElement = document.querySelector('.content-editor')
  if (!popupElement || !canCloseOnClickOutside.value) return

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
    const isCloseToBottom =
      event.clientY >= rect.bottom && event.clientY <= rect.bottom + bufferZone

    // Only close if the click is outside the buffer zone
    if (!(isCloseToLeft || isCloseToRight || isCloseToTop || isCloseToBottom)) {
      emit('cancel')
    }
  }
}

// Helper functions for markdown formatting buttons
function insertMarkdown(prefix: string, suffix: string = ''): void {
  const textarea = document.querySelector('.markdown-editor') as HTMLTextAreaElement
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = markdownText.value.substring(start, end)
  const before = markdownText.value.substring(0, start)
  const after = markdownText.value.substring(end)

  markdownText.value = before + prefix + selectedText + suffix + after

  // Restore focus and selection
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length)
  }, 0)
}

function addBold(): void {
  insertMarkdown('**', '**')
}

function addItalic(): void {
  insertMarkdown('*', '*')
}

function addHeading(): void {
  insertMarkdown('## ')
}

function addList(): void {
  insertMarkdown('- ')
}

function addLink(): void {
  insertMarkdown('[', '](url)')
}

function addDataReference(): void {
  insertMarkdown('{data[0].field_name}')
}

function addLoop(): void {
  insertMarkdown('{{#each data}}\n- {{field_name}}\n{{/each}}')
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
    {{ content }}
    <div
      class="content-editor"
      ref="editorElement"
      :style="{
        width: `${editorWidth}px`,
        height: `${editorHeight}px`,
        top: `${editorTop}%`,
        left: `${editorLeft}%`,
        transform: `translate(-50%, -50%)`,
      }"
    >
      <!-- Tab Navigation -->
      <div class="tab-header">
        <button
          @click="switchTab('markdown')"
          :class="{ active: activeTab === 'markdown' }"
          class="tab-button"
        >
          📝 Markdown Template
        </button>
        <button
          @click="switchTab('query')"
          :class="{ active: activeTab === 'query' }"
          class="tab-button"
        >
          🔍 Data Query
        </button>
      </div>

      <div class="editor-body">
        <!-- Markdown Tab -->
        <div v-if="activeTab === 'markdown'" class="tab-content">
          <div class="markdown-toolbar">
            <button @click="addBold" title="Bold"><strong>B</strong></button>
            <button @click="addItalic" title="Italic"><em>I</em></button>
            <button @click="addHeading" title="Heading">H</button>
            <button @click="addList" title="List">•</button>
            <button @click="addLink" title="Link">🔗</button>
            <div class="toolbar-separator"></div>
            <button @click="addDataReference" title="Insert data reference" class="data-button">
              {}
            </button>
            <button @click="addLoop" title="Insert loop" class="data-button">↻</button>
          </div>
          <textarea
            v-model="markdownText"
            placeholder="Enter markdown content here...

Template examples:
- {field_name} - First row value
- {data[0].field_name} - Specific row
- {data.length} - Total rows
- {{#each data}} {{field_name}} {{/each}} - Loop all
- {{#each data limit=5}} {{field_name}} {{/each}} - Loop first 5"
            class="markdown-editor"
          ></textarea>
        </div>

        <!-- Query Tab -->
        <div v-if="activeTab === 'query'" class="tab-content">
          <div class="query-help">
            <p>
              Write a query to fetch data for your markdown template. Leave empty if no data is
              needed.
            </p>
          </div>
          <SimpleEditor
            class="editor-content"
            :initContent="queryEditorContent"
            :connectionName="connectionName"
            :imports="imports"
            :rootContent="rootContent"
            ref="editor"
          ></SimpleEditor>
        </div>
      </div>

      <div class="editor-actions">
        <button @click="saveContent" class="save-button" data-testid="save-dashboard-markdown">
          Save Content
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

.tab-header {
  display: flex;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-button {
  padding: 8px 16px;
  border: none;
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  font-size: 14px;
}

.tab-button:hover {
  background-color: var(--bg-color);
}

.tab-button.active {
  border-bottom-color: var(--special-text);
  color: var(--special-text);
  font-weight: 500;
}

.editor-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.markdown-toolbar {
  display: flex;
  gap: 5px;
  margin-bottom: 10px;
  flex-shrink: 0;
  align-items: center;
}

.markdown-toolbar button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-selector-bg);
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background-color 0.2s;
}

.markdown-toolbar button:hover {
  background-color: var(--bg-color);
}

.data-button {
  background-color: var(--special-text) !important;
  color: white !important;
  font-weight: bold;
}

.data-button:hover {
  opacity: 0.8;
}

.toolbar-separator {
  width: 1px;
  height: 24px;
  background-color: var(--border);
  margin: 0 5px;
}

.markdown-editor {
  width: 100%;
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  resize: none;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
  line-height: 1.5;
  overflow-y: auto;
}

.markdown-editor:focus {
  outline: 2px solid var(--special-text);
  outline-offset: -2px;
}

.query-help {
  background-color: var(--bg-color);
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.query-help p {
  margin: 0;
}

.editor-content {
  height: 100%;
  width: 100%;
  flex: 1;
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
  border-radius: 4px;
  transition: opacity 0.2s;
}

.save-button {
  background-color: var(--special-text);
  color: white;
}

.save-button:hover {
  opacity: 0.9;
}

.cancel-button {
  background-color: var(--delete-color);
  color: white;
}

.cancel-button:hover {
  opacity: 0.9;
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

@media screen and (max-width: 768px) {
  .content-editor {
    max-width: 100vw;
  }

  .tab-button {
    font-size: 12px;
    padding: 6px 12px;
  }
}
</style>