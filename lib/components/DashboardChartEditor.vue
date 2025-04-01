<script lang="ts" setup>
import { ref, defineEmits } from 'vue'
import SimpleEditor from './SimpleEditor.vue'
import HighlightComponent from './HighlightComponent.vue'
import { type Import } from '../stores/resolver'
interface EditorRef {
  getContent: () => string
}

const props = defineProps<{
  content: string
  connectionName: string
  imports: Import[]
}>()

const emit = defineEmits(['save', 'cancel'])
const queryText = ref(props.content)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null) // Add this ref to access the child component

function saveQuery(): void {
  // Get content from the editor component using the ref
  if (editor.value) {
    const editorContent = editor.value.getContent()
    emit('save', editorContent)
  }
}

function cancel(): void {
  emit('cancel')
}
// Add SQL syntax validation or preview functionality here if needed
</script>

<template>
  <div class="editor-overlay">
    <div class="content-editor">
      <div class="editor-description">
        <HighlightComponent type="tip"
          >Enter a raw Trilogy script to be used for this chart. The last select will be the output.
          You should not set a where clause (the dashboard will manage that), but can set any other
          part of the query.</HighlightComponent
        >
      </div>
      <div class="editor-body">
        <SimpleEditor
          class="editor-body"
          :initContent="queryText"
          :connectionName="connectionName"
          :imports="imports"
          ref="editor"
        ></SimpleEditor>
      </div>

      <div class="editor-actions">
        <button @click="saveQuery" class="save-button">Save Query</button>
        <button @click="cancel" class="cancel-button">Cancel</button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.editor-body {
  max-height: 400px;
}

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
  width: 80%;
  max-width: 800px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  padding: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
}

.content-editor h3 {
  margin-top: 0;
  margin-bottom: 15px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 10px;
  color: var(--text-color);
}

.editor-description {
  margin-bottom: 15px;
  color: var(--text-color-muted);
  font-size: 0.9em;
}

.sql-editor {
  width: 100%;
  height: 300px;
  padding: 10px;
  border: 1px solid var(--border);
  font-family: monospace;
  resize: vertical;
  margin-bottom: 15px;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 10px;
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
</style>
