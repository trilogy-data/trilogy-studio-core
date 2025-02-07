<template>
  <div class="editor-list">
    <h2 class="text-lg font-bold mb-2">Editors</h2>
    <button @click="saveEditors()">Save</button>
    <ul class="space-y-1">
      <div v-for="(editors, key) in editorsByStorage" :key="key" class="storage-group mb-4">
        <h3 class="text-sm font-bold mb-2">{{ key }}</h3>
        <ul>
          <li v-for="editor in editors" :key="editor.name"
            class="editor-item p-2 cursor-pointer hover:bg-gray-200 rounded" >
            <div class="editor-content" @click="onEditorClick(editor)">
              <span>[{{ editor.type }}] {{ editor.name }}</span>
              <span class="editor-connection">{{ editor.connection }}</span>
              <button @click="deleteEditor(editor)">x</button>
            </div>
          </li>
        </ul>
      </div>
    </ul>
    <editor-creator />
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
  flex-grow: 1;
  /* Makes the connection name take up remaining space */
}
</style>
<script lang="ts">
import { inject } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import EditorCreator from './EditorCreator.vue'
import EditorModel from '../models/editor';
export default {
  name: "EditorList",
  props: {
  },
  setup() {
    const editorStore = inject<EditorStoreType>('editorStore');
    if (!editorStore) {
      throw new Error('Editor store is not provided!');
    }
    return { editorStore }

  },
  computed: {
    editorsByStorage() {
      const editorsByStorage: Record<string, Array<EditorModel>> = {};

      Object.values(this.editorStore.editors).forEach((editor) => {
        if (!editorsByStorage[editor.storage]) {
          editorsByStorage[editor.storage] = [];
        }
        editorsByStorage[editor.storage].push(editor);
      });

      return editorsByStorage;
    }
  },
  components: {
    EditorCreator
  },
  methods: {
    // Emit an event when an editor is clicked
    onEditorClick(editor: EditorModel) {
      this.$emit("editor-selected", editor.name);
    },
    deleteEditor(editor: EditorModel) {
      this.editorStore.removeEditor(editor.name);
    },
    saveEditors() {
      console.log('saving editors 1')
      this.$emit("save-editors");
    }
  },
};
</script>
