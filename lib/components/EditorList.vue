<template>
  <div class="editor-list">
    <h2 class="text-lg font-bold mb-2">Editors</h2>
    <ul class="space-y-1">
      <li v-for="editor in editors" :key="editor.id" class="editor-item p-2 cursor-pointer hover:bg-gray-200 rounded"
        @click="onEditorClick(editor)">
        <div class="editor-content">
          <span>[{{editor.type}}] {{ editor.name }}</span>
          <span class="editor-connection">{{ editor.connection }}</span>
        </div>
      </li>
    </ul>
    <editor-creator/>
  </div>
</template>

<style scoped>
.editor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border-light);
  padding: 2px;
}

.editor-list {
  border: 1px solid var(--border-light);
  border-radius: 0px;
  padding: 16px;
  height: 100%;
}

.editor-content {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.editor-connection {
  text-align: right;
  flex-grow: 1; /* Makes the connection name take up remaining space */
}
</style>
<script lang="ts">
import type { PropType } from 'vue'
import EditorModel from "../models/editor.ts";
import EditorCreator from './EditorCreator.vue'
export default {
  name: "EditorList",
  props: {
    // // List of editors passed as a prop
    // editors: {
    //   type: Array as PropType<Array<EditorModel>>,
    //   required: true,
    // },
  },
  setup() {

  },
  components: {
    EditorCreator
  },
  methods: {
    // Emit an event when an editor is clicked
    onEditorClick(editor: string) {
      this.$emit("editor-selected", editor.name);
    },
  },
};
</script>

