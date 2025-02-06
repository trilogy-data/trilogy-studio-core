<template>
  <div class="main">
    <SidebarLayout>
      <template #sidebar>
        <EditorList :editors="editors" @editor-selected="setActiveEditor" />
      </template>
      <VerticalSplitLayout>
        <template v-slot:editor="{ x, y }" v-if="activeEditorData">
          <Editor :editorName="activeEditor" :x="x" :y="y" />
        </template>
        <template #results>
          <DataTable :headers="activeEditorData.results.headers" :results="activeEditorData.results.data" />
        </template>
      </VerticalSplitLayout>
    </SidebarLayout>
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
<script>

import EditorList from "../components/EditorList.vue";
import Editor from "../components/Editor.vue";
import DataTable from "../components/DataTable.vue";
import SidebarLayout from "../components/SidebarLayout.vue";
import VerticalSplitLayout from "../components/VerticalSplitLayout.vue";
import EditorModel from "../models/editor.ts";
export default {
  name: "IDEContextManager",
  data() {
    return {
      headers: new Map(),
    };
  },
  components: {
    EditorList,
    Editor,
    DataTable,
    SidebarLayout,
    VerticalSplitLayout,
  },
  methods: {
    // Sets the currently active editor
    setActiveEditor(editor) {
      this.$emit("set-active-editor", editor);
    },
  },
  computed: {
    // The currently active editor
    activeEditorData() {
      let r = this.editors[this.activeEditor];
      console.log(r.results)
      return r
    },
  },
  props: {
    // The currently active editor
    activeEditor: {
      type: String,
    },
    editors: {
      type: Array[EditorModel],
      default: () => [],
    },
  },
};
</script>
