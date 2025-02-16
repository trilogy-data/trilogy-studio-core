    <template>
      <sidebar-list title="Editors">
        <template #actions>
          <!-- Tags as filters -->
          <span v-for="tag in EditorTag" :key="tag" :class="{ 'tag-excluded': !hiddenTags.has(tag) }" class="tag"
            @click="toggleTagFilter(tag)">
            {{ hiddenTags.has(tag) ? 'Show' : 'Hide' }} editors with {{ tag }} tag
          </span>
          <div class="button-container">
            <editor-creator />
            <loading-button ref="loadingButton" :action="saveEditors"
              :keyCombination="['control', 's']">Save</loading-button>

          </div>
        </template>
        <div v-for="(connections, storage) in groupedEditors" :key="storage" class="storage-group">
          <h4 class="text-sm" @click="toggleCollapse(storage)">
            {{ displayKey(storage) }} ({{ Object.values(connections).flat().length }})
          </h4>
          <div v-if="!collapsed[storage]">
            <div v-for="(editors, connection) in connections" :key="connection" class="connection-group">
              <div class="text-sm left-pad" @click="toggleCollapse(connection)">{{ connection }} ({{ editors.length }})</div>
              <ul class="list" v-if="!collapsed[connection]">
                <li v-for="editor in editors" :key="editor.name" class="editor-item p-1" @click="onEditorClick(editor)">
                  <div class="editor-content">
                    <div class="main-content">
                      <tooltip content="Raw SQL Editor" v-if="editor.type == 'sql'">
                        <i class="mdi mdi-alpha-s-box-outline"></i>
                      </tooltip>
                      <tooltip content="Trilogy Editor" v-else>
                        <i class="mdi mdi-alpha-t-box-outline"></i>
                      </tooltip>
                      <span @click="onEditorClick(editor)" class="padding-left hover:bg-gray-400">{{ editor.name
                        }}</span>
                      <span v-for="tag in editor.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                    <tooltip content="Delete Editor" position="left">
                      <span class="remove-btn" @click.stop="deleteEditor(editor)">
                        <i class="mdi mdi-close"></i>
                      </span>
                    </tooltip>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </sidebar-list>
    </template>

<style scoped>
.list {
  padding-top: 0px;
  margin-top: 0px;
  margin-bottom: 0px;
}
.padding-left {
  padding-left: 5px;
  text-align: left;
}

.left-pad {
  margin-left: 5px;
  text-align: left;
}

.text-sm {
  font-weight: 400;
  margin-top: 0px;
  /* margin-bottom: 5px; */
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
  color: rgb(114, 1, 1);
  text-align: center;
  /* border: 1px solid var(--border-light); */
}


.remove-btn:hover {
  background-color: var(--button-mouseover)
    /* Lighter gray when hovered */
}



.editor-item {
  display: flex;
  /* justify-content: space-between; */
  /* align-items: left; */
  /* border: 1px solid var(--border-light); */
  padding: 2px;
}

.main-content {
  display: flex;
  align-items: center;
}

.editor-content {
  display: flex;
  justify-content: space-between;
  /* This is the key change */
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

.tag {
  cursor: pointer;
  background: var(--tag-bg, lightgray);
  padding: 2px 5px;
  margin: 2px;
  /* border-radius: 4px; */
  font-size: 8px;
}

.tag:hover {
  background: var(--tag-hover-bg, gray);
}

.tag-excluded {
  background: darkgray;
}
</style>
<script lang="ts">
import { inject, ref, computed } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import EditorCreator from './EditorCreator.vue'
import EditorModel from '../editors/editor';
import SidebarList from './SidebarList.vue';
import Tooltip from './Tooltip.vue';
import LoadingButton from './LoadingButton.vue';
import { EditorTag } from '../editors';
export default {
  name: "EditorList",
  props: {
  },
  setup() {
    const editorStore = inject<EditorStoreType>('editorStore');
    if (!editorStore) {
      throw new Error('Editor store is not provided!');
    }

    const collapsed = ref<Record<string, boolean>>({});
    const toggleCollapse = (key: string) => {
      collapsed.value[key] = !collapsed.value[key];
    };

    const hiddenTags = ref<Set<string>>(new Set(['source']));
    const toggleTagFilter = (tag: string) => {
      if (hiddenTags.value.has(tag)) {
        hiddenTags.value.delete(tag);
      } else {
        hiddenTags.value.add(tag);
      }
    };

    const groupedEditors = computed(() => {
      const result: Record<string, Record<string, EditorModel[]>> = {};

      Object.values(editorStore.editors).forEach((editor) => {
        if (hiddenTags.value.size > 0 && editor.tags.some(tag => hiddenTags.value.has(tag))) {
          return;
        }
        if (!result[editor.storage]) {
          result[editor.storage] = {};
        }
        if (!result[editor.storage][editor.connection]) {
          result[editor.storage][editor.connection] = [];
        }
        result[editor.storage][editor.connection].push(editor);
      });

      // Sort the editors alphabetically by name in each group
      Object.keys(result).forEach(storage => {
        Object.keys(result[storage]).forEach(connection => {
          result[storage][connection].sort((a, b) => a.name.localeCompare(b.name));
        });
      });

      return result;
    });
    return { editorStore, EditorTag, toggleTagFilter, groupedEditors, toggleCollapse, collapsed, hiddenTags };

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
    LoadingButton,
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
    },
    addDemoEditors() {
      const editor1 = new EditorModel(
        { name: "Duckdb", type: "text", connection: "test-connection", storage: "local", contents: 'select 1 as fun;' },
      )
      this.editorStore.addEditor(editor1);
    }
  },
};
</script>
