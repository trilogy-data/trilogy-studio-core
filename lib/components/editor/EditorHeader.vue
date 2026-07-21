<template>
  <div class="desktop-editor-header">
    <div class="menu-left">
      <div class="menu-title" data-testid="edit-editor-name" @click="startEditing">
        <span v-if="!isEditing" class="editable-text" data-testid="editor-name-display">
          {{ name }}
          <span class="edit-indicator"><i class="mdi mdi-pencil-outline"></i></span>
        </span>
        <input
          v-else
          ref="nameInput"
          v-model="editableName"
          class="name-input"
          data-testid="editor-name-input"
          type="text"
          @blur="finishEditing"
          @keyup.enter="finishEditing"
          @keyup.esc="cancelEditing"
        />
      </div>
    </div>
    <editor-toolbar-actions
      :editor-type="editorType"
      :tags="tags"
      :loading="loading"
      :connection-has-model="connectionHasModel"
      variant="desktop"
      @save="emit('save')"
      @validate="emit('validate')"
      @format="emit('format')"
      @run="emit('run')"
      @cancel="emit('cancel')"
      @toggle-tag="(tag) => emit('toggle-tag', tag)"
      @generate="emit('generate')"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, type PropType } from 'vue'
import { EditorTag } from '../../editors'
import EditorToolbarActions from './EditorToolbarActions.vue'

const props = defineProps({
  name: { type: String, required: true },
  editorType: { type: String, required: true },
  tags: { type: Array as PropType<EditorTag[]>, required: true },
  loading: { type: Boolean, default: false },
  connectionHasModel: { type: Boolean, default: false },
})
const emit = defineEmits([
  'name-update',
  'save',
  'validate',
  'format',
  'run',
  'cancel',
  'toggle-tag',
  'generate',
])

const isEditing = ref(false)
const editableName = ref('')
const nameInput = ref<HTMLInputElement>()

const startEditing = async (): Promise<void> => {
  editableName.value = props.name
  isEditing.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

const finishEditing = (): void => {
  if (!isEditing.value) return
  isEditing.value = false
  const nextName = editableName.value.trim()
  if (nextName && nextName !== props.name) emit('name-update', nextName)
}

const cancelEditing = (): void => {
  isEditing.value = false
}
</script>

<style scoped>
.desktop-editor-header {
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  gap: 0.35rem;
  min-height: 32px;
  padding: 0 6px 0 10px;
  border-bottom: 1px solid var(--border-light);
  background: var(--query-window-bg);
}
.menu-left { display: flex; align-items: center; min-width: 0; flex: 1 1 auto; }
.menu-title {
  display: flex; align-items: center; width: 100%; padding: 0.25rem 0; overflow: hidden;
  cursor: pointer; white-space: nowrap; text-overflow: ellipsis; font-weight: 500;
}
.editable-text { display: flex; align-items: center; gap: 0.4rem; min-width: 0; overflow: hidden; }
.edit-indicator { flex-shrink: 0; opacity: 0; font-size: 13px; transition: opacity 0.2s ease; }
.menu-title:hover .edit-indicator { opacity: 1; }
.name-input {
  width: auto; min-width: 100%; padding: 0.3rem 0.6rem; border: 1px solid var(--border);
  border-radius: 8px; background: var(--bg-color); color: var(--text-color);
  font: inherit; font-weight: 500;
}
.name-input:focus {
  outline: none; border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.45);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
}
</style>
