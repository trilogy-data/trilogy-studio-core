<template>
  <div class="sidebar-container">
    <div class="sidebar-icons">
      <tooltip content="Trilogy Studio (Alpha)"><img class="trilogy-icon" :src="trilogyIcon" /></tooltip>
      <div class="sidebar-divider"></div>
      <div v-for="(item, _) in sidebarItems" :key="item.name" class="sidebar-icon" @click="selectItem(item.screen)"
        :class="{ selected: active == item.screen }">
        <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
      </div>
      <div class="sidebar-divider"></div>
      <div v-for="(item, _) in sidebarFeatureItems" :key="item.name" class="sidebar-icon" @click="selectItem(item.screen)"
        :class="{ selected: active == item.screen }">
        <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
      </div>
      <div class="sidebar-bottom-icons">
        <div class="sidebar-icon" @click="selectItem('settings')">
          <tooltip content="Settings"><i class="mdi mdi-cog"></i></tooltip>
        </div>
        <div class="sidebar-icon" @click="selectItem('profile')">
          <tooltip content="Profile"><i class="mdi mdi-account"></i></tooltip>
        </div>
      </div>
    </div>

    <div class="sidebar-content">
      <EditorList v-if="active === 'editors'" @editor-selected="editorSelected" @save-editors="saveEditors" />
      <ConnectionList v-else-if="active === 'connections'" />
      <ModelSidebar v-else-if="active === 'models'" />
      <TutorialSidebar v-else-if="active === 'tutorial'" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import EditorList from "./EditorList.vue";
import ConnectionList from "./ConnectionList.vue";
import TutorialSidebar from "./TutorialSidebar.vue";
import ModelSidebar from "./ModelSidebar.vue";
import trilogyIcon from "../static/trilogy.png";
import Tooltip from "./Tooltip.vue";
import { getDefaultValueFromHash } from '../stores/urlStore';
export default defineComponent({
  name: "Sidebar",
  data() {
    let active = getDefaultValueFromHash('screen');
    let sidebarFeatureItems = [
      {
        name: "models",
        tooltip: 'Models',
        icon: "mdi mdi-set-center",
        screen: 'models',
      },
      {
        name: "help",
        tooltip: 'Help/Guide',
        icon: "mdi mdi-help",
        screen: 'tutorial',
      },
    ];
    let sideBarItems = [
      {
        name: "edit",
        tooltip: 'Editors',
        icon: "mdi mdi-file-document-edit",
        screen: 'editors',
      },
      {
        name: "database",
        tooltip: 'Editor Connections',
        icon: "mdi mdi-database",
        screen: 'connections',
      },


      //   {
      //     name: "Extensions",
      //     iconClass: "fas fa-puzzle-piece",
      //     component: "Extensions", // Replace with your actual component
      //   },
    ]
    return {
      // index of the sidebarItem where the screen == active
      // selectedIndex: sideBarItems.findIndex((item) => item.screen === active) || 0,
      active:active,
      trilogyIcon: trilogyIcon,
      sidebarItems: sideBarItems,
      sidebarFeatureItems: sidebarFeatureItems,
    };
  },
  components: {
    EditorList,
    ConnectionList,
    Tooltip,
    TutorialSidebar,
    ModelSidebar,

  },
  computed: {
  },
  methods: {
    selectItem(index: string) {
      this.active = index;
      this.$emit("screen-selected", index);
    },
    editorSelected(editor: string) {
      this.$emit("editor-selected", editor);
    },
    saveEditors() {
      this.$emit("save-editors");
    },
    openSettings() {
      this
      console.log("Settings clicked");
      // Implement settings navigation
    },
    openProfile() {
      console.log("Profile clicked");
      // Implement profile navigation
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

.sidebar-icon.selected {
  background-color: var(--sidebar-selector-selected-bg);
  /* border-radius: 50%; */
}

.sidebar-content {
  flex-grow: 1;
  /* background-color: white; */
  padding: 5px;
  overflow-y: auto;
}

.sidebar-divider {
  width: 60%;
  height: 1px;
  background-color: var(--sidebar-selector-selected-bg, #ccc);
  margin: 10px 0;
}

/* Bottom icons container */
.sidebar-bottom-icons {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
  margin-top: auto;
}
</style>