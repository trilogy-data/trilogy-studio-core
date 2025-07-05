<script lang="ts" setup>
import { ref, defineEmits } from 'vue'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits(['save', 'cancel'])

const markdownText = ref(props.content)

function saveMarkdown(): void {
  emit('save', markdownText.value)
}

function cancel(): void {
  emit('cancel')
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
</script>

<template>
  <div class="editor-overlay">
    <div class="content-editor">
      <h3>Edit Markdown</h3>
      <div class="markdown-toolbar">
        <button @click="addBold" title="Bold"><strong>B</strong></button>
        <button @click="addItalic" title="Italic"><em>I</em></button>
        <button @click="addHeading" title="Heading">H</button>
        <button @click="addList" title="List">•</button>
        <button @click="addLink" title="Link">🔗</button>
      </div>
      <textarea
        v-model="markdownText"
        placeholder="Enter markdown content here..."
        class="markdown-editor"
      ></textarea>
      <div class="editor-actions">
        <button @click="saveMarkdown" class="save-button">Save Markdown</button>
        <button @click="cancel" class="cancel-button">Cancel</button>
      </div>
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
  width: 75vw;
  height: 75vh;
  max-width: none;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.content-editor h3 {
  margin-top: 0;
  margin-bottom: 15px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 10px;
  color: var(--text-color);
  flex-shrink: 0;
}

.markdown-toolbar {
  display: flex;
  gap: 5px;
  margin-bottom: 10px;
  flex-shrink: 0;
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
}

.markdown-toolbar button:hover {
  background-color: var(--bg-color);
}

.markdown-editor {
  width: 100%;
  flex: 1;
  padding: 10px;
  border: 1px solid var(--border);
  font-family: monospace;
  resize: none;
  margin-bottom: 15px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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

/* Mobile handling - keep existing mobile behavior */
@media (max-width: 768px) {
  .content-editor {
    width: 90%;
    height: 80%;
    max-width: none;
  }
}
</style>