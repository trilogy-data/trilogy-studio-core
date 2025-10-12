<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import SimpleEditor from '../SimpleEditor.vue'
import ResizeHandles from './ResizeHandles.vue'
import { useResizableDialog } from '../../composables/useResizableDialog'
import { type Import } from '../../stores/resolver'
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
const queryEditorContent = ref(contentData.value.query)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)

// Tab management
const activeTab = ref('markdown')

// Use the resizable dialog composable
const {
  editorElement,
  dialogStyle,
  startResize,
} = useResizableDialog(
  () => emit('cancel'),
  {
    initialWidth: props.initialWidth,
    initialHeight: props.initialHeight,
  }
)

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
watch(activeTab, (_, oldTab) => {
  if (oldTab === 'query' && editor.value) {
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
</script>

<template>
  <div class="editor-overlay">
    <div class="content-editor" ref="editorElement" :style="dialogStyle">
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
          />
        </div>
      </div>

      <div class="editor-actions">
        <button @click="saveContent" class="save-button" data-testid="save-dashboard-markdown">
          Save Content
        </button>
        <button @click="cancel" class="cancel-button">Cancel</button>
      </div>

      <!-- Use the ResizeHandles component -->
      <ResizeHandles :onStartResize="startResize" />
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