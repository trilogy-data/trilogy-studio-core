<template>
  <sidebar-list title="Editors">
    <template #actions>
      <div class="action-container"><button @click="saveEditors()">Save</button>
        <editor-creator />
      </div>
    </template>
    <div v-for="(editors, key) in editorsByStorage" :key="key" class="storage-group">
      <h4 class="text-sm">{{ displayKey(key) }} ({{ editors.length }})</h4>
      <li v-for="editor in editors" :key="editor.name" class="editor-item p-1" @click="onEditorClick(editor)">
        <div class="editor-content">
          <tooltip content="Raw SQL Editor" v-if="editor.type == 'sql'"><i class="mdi mdi-alpha-s-box-outline"></i>
          </tooltip>
          <tooltip content="Trilogy Editor" v-else> <i class="mdi mdi-alpha-t-box-outline"></i></tooltip>
          <span @click="onEditorClick(editor)" class="padding-left hover:bg-gray-400">{{ editor.name }}</span>
          <span class="editor-connection"> ({{ editor.connection }})</span>
          <span class="remove-btn"><i class="mdi mdi-close" @click="deleteEditor(editor)"></i></span>
        </div>
      </li>
    </div>
  </sidebar-list>
</template>

<style scoped>
.padding-left {
  padding-left: 5px;
}

.text-sm {
  font-weight: 400;
  margin-top: 0px;
  margin-bottom: 5px;
  padding-left: 5px;
}

.storage-group {
  margin-top: 5px;
  border-left: 2px solid var(--border);
}

.remove-btn {
  background-color: transparent;
  border: none;
  color: var(--text-light);
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
  width: 24px;
  opacity: 0.5;
  color: red;
  text-align: center;
  /* border: 1px solid var(--border-light); */
}


.remove-btn:hover {
  background-color: var(--button-mouseover)
    /* Lighter gray when hovered */
}


.action-container {
  display: flex;
  align-items: center;
  /* Aligns items vertically */
  gap: 0.5rem;
  /* Adds space between the button and editor-creator */
  max-width: 20%;
}

.editor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* border: 1px solid var(--border-light); */
  padding: 2px;
}

.editor-content {
  display: flex;
  justify-content: space-between;
  padding-left: 5px;
  width: 100%;
  font-size: 15px;
}

.editor-content:hover {
  background-color: var(--bg-light);
}

.editor-connection {
  text-align: left;
  /* font-size: 0.8rem; */
  opacity: 0.5;
  flex-grow: 1;
  padding-left: 4px;
  /* Makes the connection name take up remaining space */
}
</style>
<script lang="ts">
import { inject } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import EditorCreator from './EditorCreator.vue'
import EditorModel from '../models/editor';
import SidebarList from './SidebarList.vue';
import Tooltip from './Tooltip.vue';
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
    EditorCreator,
    SidebarList,
    Tooltip,
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
      this.$emit("save-editors");
    },
    displayKey(key: string) {
      return key === 'local' ? 'Local Storage' : key;
    }
  },
};
</script>
