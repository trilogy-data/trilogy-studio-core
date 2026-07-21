<template>
  <div class="editor-actions" :class="`editor-actions-${variant}`">
    <div class="action-group action-group-scope">
      <button
        v-if="editorType === 'sql'"
        class="toggle-button action-item action-item-scope"
        :class="{ 'toggle-on': tags.includes(EditorTag.STARTUP_SCRIPT) }"
        :aria-pressed="tags.includes(EditorTag.STARTUP_SCRIPT)"
        data-testid="editor-set-startup-script"
        title="Run this script on connection startup"
        aria-label="Toggle startup script"
        @click="$emit('toggle-tag', EditorTag.STARTUP_SCRIPT)"
      >
        <span class="toggle-indicator"></span>
        <span class="action-label">Startup</span>
      </button>
      <loading-button
        v-if="supportsEditorSourceTag(editorType) && connectionHasModel"
        :useDefaultStyle="false"
        class="toggle-button action-item action-item-scope"
        :class="{ 'toggle-on': tags.includes(EditorTag.SOURCE) }"
        :aria-pressed="tags.includes(EditorTag.SOURCE)"
        :action="() => $emit('toggle-tag', EditorTag.SOURCE)"
        testId="editor-set-source"
        title="Include this editor as a source model"
        aria-label="Toggle source model"
      >
        <span class="toggle-indicator"></span>
        <span class="action-label">Source</span>
      </loading-button>
    </div>

    <div v-if="hasScopeAction" class="toolbar-divider"></div>

    <div class="action-group">
      <button
        class="action-item action-item-compact"
        data-testid="editor-save-button"
        title="Save editor"
        aria-label="Save editor"
        @click="$emit('save')"
      >
        <i class="mdi mdi-content-save-outline icon"></i>
        <span class="action-label">Save</span>
      </button>
      <loading-button
        v-if="supportsEditorValidation(editorType)"
        :useDefaultStyle="false"
        class="action-item action-item-compact"
        :action="() => $emit('validate')"
        testId="editor-validate-button"
        title="Parse editor"
        aria-label="Parse editor"
      >
        <i class="mdi mdi-code-braces icon"></i>
        <span class="action-label">Parse</span>
      </loading-button>
      <button
        v-if="supportsEditorFormatting(editorType)"
        class="action-item action-item-compact"
        data-testid="editor-format-button"
        title="Format editor"
        aria-label="Format editor"
        @click="$emit('format')"
      >
        <i class="mdi mdi-format-align-left icon"></i>
        <span class="action-label">Format</span>
      </button>
    </div>

    <div v-if="supportsEditorAssistant(editorType)" class="toolbar-divider"></div>
    <div v-if="supportsEditorAssistant(editorType)" class="action-group">
      <loading-button
        :useDefaultStyle="false"
        class="action-item action-item-ai action-item-compact"
        :action="() => $emit('generate')"
        testId="editor-generate-button"
        title="Open AI assistant"
        aria-label="Open AI assistant"
      >
        <i class="mdi mdi-creation-outline icon"></i>
        <span class="action-label">AI</span>
      </loading-button>
    </div>

    <div v-if="supportsEditorLocalExecution(editorType)" class="toolbar-divider"></div>
    <div
      v-if="supportsEditorLocalExecution(editorType)"
      class="action-group action-group-execute"
    >
      <button
        class="action-item"
        :class="{ 'button-cancel': loading, 'button-run': !loading }"
        data-testid="editor-run-button"
        :title="loading ? 'Cancel query' : 'Run query'"
        :aria-label="loading ? 'Cancel query' : 'Run query'"
        @click="loading ? $emit('cancel') : $emit('run')"
      >
        <i v-if="loading" class="mdi mdi-stop-circle-outline icon"></i>
        <i v-else class="mdi mdi-play-outline icon"></i>
        <span class="action-label">{{ loading ? 'Cancel' : 'Run' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import LoadingButton from '../LoadingButton.vue'
import { EditorTag } from '../../editors'

import {
  supportsEditorAssistant,
  supportsEditorFormatting,
  supportsEditorLocalExecution,
  supportsEditorSourceTag,
  supportsEditorValidation,
} from '../../editors/fileTypes'

const props = defineProps({
  editorType: { type: String, required: true },
  tags: { type: Array as PropType<EditorTag[]>, required: true },
  loading: { type: Boolean, default: false },
  connectionHasModel: { type: Boolean, default: false },
  variant: { type: String as PropType<'desktop' | 'mobile'>, required: true },
})

defineEmits(['save', 'validate', 'format', 'run', 'cancel', 'toggle-tag', 'generate'])

const hasScopeAction = computed(
  () =>
    props.editorType === 'sql' ||
    (supportsEditorSourceTag(props.editorType) && props.connectionHasModel),
)
</script>

<style scoped>
.editor-actions { display: flex; align-items: center; min-width: 0; }
.action-group { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.action-group-scope { margin-right: 2px; }
.action-group-execute { margin-left: 2px; }
.toolbar-divider { width: 1px; height: 14px; margin: 0 4px; background: var(--border-light); flex-shrink: 0; }
.editor-actions :deep(.action-item) {
  display: flex; align-items: center; justify-content: center; gap: 0.3rem;
  width: auto; min-width: 0; height: 24px; min-height: 24px; margin: 0; padding: 0 9px;
  box-sizing: border-box; border: 1px solid var(--border-light); border-radius: 6px;
  background: transparent; color: var(--text-color); cursor: pointer; white-space: nowrap;
  font-size: 12px; font-weight: 500; line-height: 1;
  transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}
.editor-actions :deep(.contents) { display: inline-flex; align-items: center; gap: 0.3rem; }
.editor-actions :deep(.action-item:hover) { background: var(--button-mouseover); }
.editor-actions :deep(.action-item-scope) { padding: 0 10px; font-size: 11px; color: var(--text-faint); }
.editor-actions :deep(.toggle-button) { border-radius: 999px; }
.toggle-indicator { width: 6px; height: 6px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
.editor-actions :deep(.toggle-on) {
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.26); color: var(--special-text);
}
.toggle-on .toggle-indicator { background: var(--special-text); }
.editor-actions :deep(.action-item-ai) {
  color: var(--special-text); border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.16);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.025);
}
.icon { font-size: 14px; }
.editor-actions :deep(.button-cancel) { background: var(--error-color); color: white; border-color: var(--error-color); }
.editor-actions :deep(.button-run) { background: var(--special-text); color: white; border-color: var(--special-text); }
.editor-actions :deep(.button-run:hover) {
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.92);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.92);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb, 37, 99, 235), 0.12);
}
.editor-actions :deep(.button-cancel:hover) { filter: brightness(0.96); }

.editor-actions-mobile { width: 100%; justify-content: flex-start; gap: 6px; align-items: stretch; overflow: hidden; }
.editor-actions-mobile .action-group { gap: 6px; flex: 1 1 auto; min-width: 0; }
.editor-actions-mobile .toolbar-divider { display: none; }
.editor-actions-mobile :deep(.action-item) {
  flex: 1 1 44px; height: 40px; min-height: 40px; padding: 0 10px; border-radius: 10px;
}
.editor-actions-mobile :deep(.action-item-compact) { width: auto; min-width: 44px; padding: 0; gap: 0; }
.editor-actions-mobile :deep(.action-item-compact .action-label) { display: none; }
.editor-actions-mobile :deep(.action-item-scope) { width: auto; min-width: 64px; padding: 0 12px; }
.editor-actions-mobile .action-group-execute { margin-left: auto; flex: 1.4 1 82px; }
.editor-actions-mobile :deep(.action-group-execute .action-item) { width: 100%; min-width: 78px; padding: 0 14px; }
.editor-actions-mobile :deep(.action-group-execute .action-label) { display: inline; }

@media screen and (max-width: 520px) {
  .editor-actions-mobile :deep(.action-item) { height: 38px; min-height: 38px; }
  .editor-actions-mobile :deep(.action-item-compact) { min-width: 40px; }
  .editor-actions-mobile :deep(.action-group-execute .action-item) { min-width: 68px; }
}
</style>
