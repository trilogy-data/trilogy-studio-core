<template>
  <div class="mobile-editor-toolbar">
    <editor-toolbar-actions
      v-bind="$props"
      variant="mobile"
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
import type { PropType } from 'vue'
import { EditorTag } from '../../editors'
import EditorToolbarActions from './EditorToolbarActions.vue'

defineProps({
  editorType: { type: String, required: true },
  tags: { type: Array as PropType<EditorTag[]>, required: true },
  loading: { type: Boolean, default: false },
  connectionHasModel: { type: Boolean, default: false },
})
const emit = defineEmits(['save', 'validate', 'format', 'run', 'cancel', 'toggle-tag', 'generate'])
</script>

<style scoped>
.mobile-editor-toolbar {
  flex: 0 0 auto;
  min-width: 0;
  padding: 6px;
  border-top: 1px solid var(--border-light);
  background: var(--query-window-bg);
}

@media screen and (max-width: 520px) {
  .mobile-editor-toolbar { padding: 5px 4px; }
}
</style>
