<template>
  <div class="sidebar-container">
    <!-- Vertical icon strip -->
    <div class="sidebar-icons">
      <div v-for="(item, index) in sidebarItems" :key="item.name" class="sidebar-icon" @click="selectItem(index)"
        :class="{ active: selectedIndex === index }">
        <i :class="item.iconClass"></i>
        <span>{{ item.name }}</span>
      </div>
    </div>

    <!-- Placeholder for selected content -->
    <div class="sidebar-content">
      <EditorList v-if="selectedIndex === 0" />
      <ConnectionList v-if="selectedIndex === 1" @editor-selected="editorSelected" @save-editors="saveEditors" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import EditorList from "./EditorList.vue";
import ConnectionList from "./ConnectionList.vue";
export default defineComponent({
  name: "Sidebar",
  data() {
    return {
      selectedIndex: 0, // Index of the currently selected sidebar item
      sidebarItems: [
        {
          name: "Editors",
          iconClass: "fas fa-folder",
        },
        {
          name: "Connections",
          iconClass: "fas fa-search",
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
    ConnectionList
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
      console.log('saving editors')
      this.$emit("save-editors");
    }
  },
});
</script>

<style scoped>
.sidebar-container {
  display: flex;
  height: 100vh;
  /* background-color: #f4f4f5; */
}

.sidebar-icons {
  background-color: #2c2f3e;
  color: white;
  padding-top: 20px;
  width: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.sidebar-icon {
  margin: 20px 0;
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
  background-color: #3e4c59;
  border-radius: 50%;
}

.sidebar-content {
  flex-grow: 1;
  /* background-color: white; */
  padding: 20px;
  overflow-y: auto;
}
</style>