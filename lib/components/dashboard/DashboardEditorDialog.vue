<script setup lang="ts">
import ResizeHandles from '../../composables/ResizeHandles.vue'
import { useResizableDialog } from '../../composables/useResizableDialog'

export interface DashboardEditorDialogProps {
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
  saveLabel?: string
  saveTestId?: string
}

const props = withDefaults(defineProps<DashboardEditorDialogProps>(), {
  minWidth: 400,
  minHeight: 200,
  saveLabel: 'Save',
  saveTestId: '',
})

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { editorElement, dialogStyle, startResize } = useResizableDialog(() => emit('cancel'), {
  initialWidth: props.initialWidth,
  initialHeight: props.initialHeight,
  minWidth: props.minWidth,
  minHeight: props.minHeight,
})
</script>

<template>
  <div class="editor-overlay">
    <div ref="editorElement" class="content-editor" :style="dialogStyle">
      <slot />

      <div class="editor-actions">
        <slot name="actions">
          <button
            class="save-button"
            :data-testid="props.saveTestId || undefined"
            @click="emit('save')"
          >
            {{ props.saveLabel }}
          </button>
          <button class="cancel-button" @click="emit('cancel')">Cancel</button>
        </slot>
      </div>

      <ResizeHandles :onStartResize="startResize" />
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  inset: 0;
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
  padding: 14px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  border: 1px solid var(--border);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 12px;
  flex-shrink: 0;
}

.save-button,
.cancel-button {
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 500;
  font-size: var(--button-font-size);
  border-radius: 10px;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.save-button {
  background-color: var(--special-text);
  color: white;
  border: 1px solid var(--special-text);
}

.save-button:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.92);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.92);
}

.cancel-button {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border: 1px solid var(--border);
}

.cancel-button:hover {
  background-color: var(--button-mouseover);
  border-color: var(--button-border);
}

@media screen and (max-width: 768px) {
  .content-editor {
    max-width: 100vw;
  }
}
</style>
