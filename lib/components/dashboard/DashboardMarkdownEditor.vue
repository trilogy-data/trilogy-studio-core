<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import SimpleEditor from '../SimpleEditor.vue'
import DashboardEditorDialog from './DashboardEditorDialog.vue'
import { type Import } from '../../stores/resolver'
import type { ContentInput } from '../../stores/resolver'
import type { MarkdownData } from '../../dashboards/base'

interface EditorRef {
  getContent: () => string
}

export interface DashboardMarkdownEditorProps {
  content: MarkdownData
  connectionName: string
  imports: Import[]
  rootContent: ContentInput[]
  initialWidth?: number
  initialHeight?: number
}

const props = defineProps<DashboardMarkdownEditorProps>()

const emit = defineEmits(['save', 'cancel'])

const contentData = computed(() => {
  if (typeof props.content === 'string') {
    return { markdown: props.content, query: '' }
  }
  return { markdown: props.content.markdown || '', query: props.content.query || '' }
})

const markdownText = ref(contentData.value.markdown)
const queryEditorContent = ref(contentData.value.query)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)
const activeTab = ref('markdown')

watch(
  () => props.content,
  (newContent) => {
    const data =
      typeof newContent === 'string'
        ? { markdown: newContent, query: '' }
        : { markdown: newContent.markdown || '', query: newContent.query || '' }

    markdownText.value = data.markdown
    queryEditorContent.value = data.query
  },
)

watch(activeTab, (_, oldTab) => {
  if (oldTab === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }
})

function saveContent(): void {
  if (activeTab.value === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }

  emit('save', {
    markdown: markdownText.value,
    query: queryEditorContent.value,
  })
}

function cancel(): void {
  emit('cancel')
}

function switchTab(tab: string): void {
  if (activeTab.value === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }
  activeTab.value = tab
}

function insertMarkdown(prefix: string, suffix: string = ''): void {
  const textarea = document.querySelector('.markdown-editor') as HTMLTextAreaElement
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = markdownText.value.substring(start, end)
  const before = markdownText.value.substring(0, start)
  const after = markdownText.value.substring(end)

  markdownText.value = before + prefix + selectedText + suffix + after

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
  <DashboardEditorDialog
    :initialWidth="props.initialWidth"
    :initialHeight="props.initialHeight"
    saveLabel="Save Content"
    saveTestId="save-dashboard-markdown"
    @save="saveContent"
    @cancel="cancel"
  >
    <div class="tab-header">
      <button
        @click="switchTab('markdown')"
        :class="{ active: activeTab === 'markdown' }"
        class="tab-button"
      >
        <i class="mdi mdi-note-text-outline"></i>
        <span>Markdown Template</span>
      </button>
      <button
        @click="switchTab('query')"
        :class="{ active: activeTab === 'query' }"
        class="tab-button"
      >
        <i class="mdi mdi-magnify"></i>
        <span>Data Query</span>
      </button>
    </div>

    <div class="editor-body">
      <div v-if="activeTab === 'markdown'" class="tab-content">
        <div class="markdown-toolbar">
          <button @click="addBold" title="Bold"><strong>B</strong></button>
          <button @click="addItalic" title="Italic"><em>I</em></button>
          <button @click="addHeading" title="Heading">H</button>
          <button @click="addList" title="List">
            <i class="mdi mdi-format-list-bulleted"></i>
          </button>
          <button @click="addLink" title="Link">
            <i class="mdi mdi-link-variant"></i>
          </button>
          <div class="toolbar-separator"></div>
          <button @click="addDataReference" title="Insert data reference" class="data-button">
            {}
          </button>
          <button @click="addLoop" title="Insert loop" class="data-button">
            <i class="mdi mdi-refresh"></i>
          </button>
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
  </DashboardEditorDialog>
</template>

<style scoped>
.tab-header {
  display: flex;
  gap: 18px;
  padding: 0 2px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px 11px;
  border: none;
  border-bottom: 3px solid transparent;
  border-radius: 0;
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition:
    color 0.18s ease,
    border-color 0.18s ease;
}

.tab-button:hover {
  color: var(--special-text);
}

.tab-button.active {
  border-bottom-color: var(--special-text);
  color: var(--special-text);
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
  margin-bottom: 12px;
  flex-shrink: 0;
  align-items: center;
  flex-wrap: wrap;
}

.markdown-toolbar button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  background-color: var(--button-bg-color);
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
  border-radius: 10px;
}

.markdown-toolbar button:hover {
  background-color: var(--button-mouseover);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.26);
  color: var(--special-text);
}

.data-button {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.1) !important;
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.2) !important;
  color: var(--special-text) !important;
  font-weight: 700;
}

.data-button:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.14) !important;
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.32) !important;
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
  border-radius: 12px;
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
  background-color: var(--panel-header-bg);
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--dashboard-helper-text);
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

@media screen and (max-width: 768px) {
  .tab-button {
    font-size: 12px;
    padding: 8px 2px 9px;
  }
}
</style>
