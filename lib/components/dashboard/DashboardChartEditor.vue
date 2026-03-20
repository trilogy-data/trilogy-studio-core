<script lang="ts" setup>
import { ref } from 'vue'
import SimpleEditor from '../SimpleEditor.vue'
import DashboardEditorDialog from './DashboardEditorDialog.vue'
import { type Import } from '../../stores/resolver'
import type { ContentInput } from '../../stores/resolver'

interface EditorRef {
  getContent: () => string
}

export interface DashboardChartEditorProps {
  content: string
  connectionName: string
  imports: Import[]
  rootContent: ContentInput[]
  initialWidth?: number
  initialHeight?: number
}

const props = defineProps<DashboardChartEditorProps>()

const emit = defineEmits(['save', 'cancel'])
const queryText = ref(props.content)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)

function saveQuery(): void {
  if (editor.value) {
    emit('save', editor.value.getContent())
  }
}

function cancel(): void {
  emit('cancel')
}
</script>

<template>
  <DashboardEditorDialog
    :initialWidth="props.initialWidth"
    :initialHeight="props.initialHeight"
    saveLabel="Save Query"
    saveTestId="save-dashboard-chart"
    @save="saveQuery"
    @cancel="cancel"
  >
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
  </DashboardEditorDialog>
</template>

<style scoped>
.editor-body {
  flex: 1;
  overflow: hidden;
}

.editor-content {
  height: 100%;
  width: 100%;
}
</style>
