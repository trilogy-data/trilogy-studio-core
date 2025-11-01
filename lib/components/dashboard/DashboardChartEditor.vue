<script lang="ts" setup>
import { ref } from 'vue'
import SimpleEditor from '../SimpleEditor.vue'
import ResizeHandles from '../../composables/ResizeHandles.vue'
import { useResizableDialog } from '../../composables/useResizableDialog'
import { type Import } from '../../stores/resolver'
import type { ContentInput } from '../../stores/resolver'

interface EditorRef {
  getContent: () => string
}

const props = defineProps<{
  content: string
  connectionName: string
  imports: Import[]
  rootContent: ContentInput[]
  showing: boolean
  initialWidth?: number
  initialHeight?: number
}>()

const emit = defineEmits(['save', 'cancel'])
const queryText = ref(props.content)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)

// Use the resizable dialog composable
const { editorElement, dialogStyle, startResize } = useResizableDialog(() => emit('cancel'), {
  initialWidth: props.initialWidth,
  initialHeight: props.initialHeight,
})

function saveQuery(): void {
  if (editor.value) {
    const editorContent = editor.value.getContent()
    emit('save', editorContent)
  }
}

function cancel(): void {
  emit('cancel')
}
</script>

<template>
  <div class="editor-overlay">
    <div class="content-editor" ref="editorElement" :style="dialogStyle">
      <div class="editor-body">
        <SimpleEditor
          class="editor-content"
          :initContent="queryText"
          :connectionName="connectionName"
          :imports="imports"
          :rootContent="rootContent"
          ref="editor"
        />
      </div>
      <div class="editor-actions">
        <button @click="saveQuery" class="save-button" data-testid="save-dashboard-chart">
          Save Query
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

@media screen and (max-width: 768px) {
  .content-editor {
    max-width: 100vw;
  }
}
</style>
