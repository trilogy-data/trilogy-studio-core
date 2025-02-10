<template>
  <div class="sidebar-container">
    <!-- Vertical icon strip -->

    <div class="sidebar-icons">
      <tooltip content="Trilogy Studio (Alpha)"><img class="trilogy-icon" :src="trilogyIcon" /></tooltip>
      <div v-for="(item, index) in sidebarItems" :key="item.name" class="sidebar-icon" @click="selectItem(index)"
        :class="{ active: selectedIndex === index }">
        <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
      </div>
    </div>

    <!-- Placeholder for selected content -->
    <div class="sidebar-content">
      <EditorList v-if="selectedIndex === 0" @editor-selected="editorSelected" @save-editors="saveEditors" />
      <ConnectionList v-else-if="selectedIndex === 1" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import EditorList from "./EditorList.vue";
import ConnectionList from "./ConnectionList.vue";
import trilogyIcon from "../static/trilogy.png";
import Tooltip from "./Tooltip.vue";
export default defineComponent({
  name: "Sidebar",
  data() {
    return {
      selectedIndex: 0, // Index of the currently selected sidebar item
      trilogyIcon: trilogyIcon,
      sidebarItems: [
        {
          name: "edit",
          tooltip: 'Code Editors',
          icon: "mdi mdi-file-document-edit",
        },
        {
          name: "database",
          tooltip: 'Connections',
          icon: "mdi mdi-database",
        },
        //   {
        //     name: "Extensions",
        //     iconClass: "fas fa-puzzle-piece",
        //     component: "Extensions", // Replace with your actual component
        //   },
      ],
    };
  },
  components: {
    EditorList,
    ConnectionList,
    Tooltip

  },
  computed: {
    selectedItem() {
      return this.sidebarItems[this.selectedIndex];
    },
  },
  methods: {
    selectItem(index: number) {
      this.selectedIndex = index;
    },
    editorSelected(editor: string) {
      this.$emit("editor-selected", editor);
    },
    saveEditors() {

      this.$emit("save-editors");
    }
  },
});
</script>

<style scoped>
.trilogy-icon {
  width: 30px;
  height: 30px;
}

.sidebar-container {
  display: flex;
  height: 100vh;
  background-color: var(--sidebar-bg);
  color: var(--sidebar-font);
}

.sidebar-icons {
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  padding-top: 10px;
  width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  font-weight: 200;
}

.sidebar-icon {
  margin: 10px 0;
  width: 100%;
  cursor: pointer;
  text-align: center;
}

.sidebar-icon span {
  font-size: 12px;
  display: block;
}

.sidebar-icon i {
  font-size: 20px;
}

.sidebar-icon.active {
  background-color: var(--sidebar-selector-selected-bg);
  /* border-radius: 50%; */
}

.sidebar-content {
  flex-grow: 1;
  /* background-color: white; */
  padding: 5px;
  overflow-y: auto;
}
</style>