
<template>
  <div class="main">
    <sidebar-layout>
      <template #sidebar>
        <sidebar @editor-selected="setActiveEditor" @save-editors="saveEditorsCall" />
      </template>
      <vertical-split-layout>
        <template #editor v-if="activeEditorData">
          <editor :key="activeEditor" :editorName="activeEditor" />
        </template>
        <template #results v-if="activeEditorData">
          <error-message v-if="activeEditorData.error" :message="activeEditorData.error"></error-message>
          <data-table v-else-if="activeEditorData.results" 
          
            :headers="activeEditorData.results.headers" :results="activeEditorData.results.data" />
        </template>
      </vertical-split-layout>
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

import Sidebar from '../components/Sidebar.vue';
import Editor from "../components/Editor.vue";
import DataTable from "../components/DataTable.vue";
import SidebarLayout from "../components/SidebarLayout.vue";
import VerticalSplitLayout from "../components/VerticalSplitLayout.vue";
import ErrorMessage from "../components/ErrorMessage.vue"
import { inject } from 'vue';
import type { EditorStoreType } from '../stores/editorStore.ts';
import type { ConnectionStoreType } from '../stores/connectionStore.ts';
import AxiosResolver from '../stores/resolver.ts'
export default {
  name: "IDEComponent",
  data() {
    return {
      activeEditor: 'Test Editor'
    };
  },
  components: {
    Sidebar,
    Editor,
    DataTable,
    SidebarLayout,
    VerticalSplitLayout,
    ErrorMessage,
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
