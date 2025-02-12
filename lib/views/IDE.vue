<template>
  <div class="main">
    <sidebar-layout>
      <template #sidebar>
        <sidebar @editor-selected="setActiveEditor" @screen-selected="setActiveScreen"
          @save-editors="saveEditorsCall" />
      </template>

      <template v-if="activeScreen === 'editors'">
        <vertical-split-layout>
          <template #editor v-if="activeEditorData">
            <editor :key="activeEditor" :editorName="activeEditor" @save-editors="saveEditorsCall" />
          </template>
          <template #results v-if="activeEditorData">
            <error-message v-if="activeEditorData.error" :message="activeEditorData.error"></error-message>
            <data-table v-else-if="activeEditorData.results" :headers="activeEditorData.results.headers"
              :results="activeEditorData.results.data" />
          </template>
        </vertical-split-layout>
      </template>

      <template v-else-if="activeScreen === 'tutorial'">
        <Tutorial/>
      </template>
      <template v-else-if="activeScreen === 'models'">
        <ModelView/>
      </template>
      <template v-else>
        <div>How'd you get here?</div>
      </template>

    </sidebar-layout>
  </div>
</template>

<style scoped>
.ide-context-manager {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  flex-shrink: 0;
}

.main {
  width: 100vw;
  height: 100vh;

}

aside {
  flex-shrink: 0;
}
</style>
<script lang="ts">
import SidebarLayout from "../components/SidebarLayout.vue";
import Sidebar from '../components/Sidebar.vue';
// editor imports
import Editor from "../components/Editor.vue";
import DataTable from "../components/DataTable.vue";
import VerticalSplitLayout from "../components/VerticalSplitLayout.vue";
import ErrorMessage from "../components/ErrorMessage.vue"

// tutorial imports
import Tutorial from "../components/Tutorial.vue";

//model imports
import ModelView from '../components/Models.vue';

import type { EditorStoreType } from '../stores/editorStore.ts';
import type { ConnectionStoreType } from '../stores/connectionStore.ts';
import AxiosResolver from '../stores/resolver.ts'
import { getDefaultValueFromHash, pushHashToUrl } from '../stores/urlStore';
import { inject } from 'vue';




export default {
  name: "IDEComponent",
  data() {
    let screen = getDefaultValueFromHash('screen');
    return {
      activeEditor: 'Test Editor',
      activeScreen: screen ? screen : 'editors',
    };
  },
  components: {
    Sidebar,
    Editor,
    DataTable,
    SidebarLayout,
    VerticalSplitLayout,
    ErrorMessage,
    Tutorial,
    ModelView,
  },
  setup() {
    type ResolverType = typeof AxiosResolver;
    const connectionStore = inject<ConnectionStoreType>('connectionStore');
    const editorStore = inject<EditorStoreType>('editorStore');
    const trilogyResolver = inject<ResolverType>('trilogyResolver');
    let saveEditors = inject<Function>('saveEditors');
    if (!editorStore || !connectionStore || !trilogyResolver) {
      throw new Error('Editor store and connection store and trilogy resolver are not provided!');
    }
    if (!saveEditors) {
      saveEditors = () => { };
    }
    return { connectionStore, editorStore, trilogyResolver, saveEditors };
  },
  methods: {
    // Sets the currently active editor
    setActiveEditor(editor: string) {
      this.activeEditor = editor
    },
    setActiveScreen(screen: string) {
      this.activeScreen = screen
      pushHashToUrl('screen', screen)
    },
    saveEditorsCall() {
      this.saveEditors()
    }

  },
  computed: {
    // The currently active editor data
    activeEditorData() {
      let r = this.editorStore.editors[this.activeEditor];
      return r
    },
    editorList() {
      return Object.keys(this.editors).map((editor) => this.editors[editor]);
    },
    editors() {
      return this.editorStore.editors
    }
  },
  props: {
  },
};
</script>
