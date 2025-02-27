<template>
  <div class="sidebar-container">
    <div class="sidebar-icons">
      <div>
        <tooltip content="Trilogy Studio (Alpha)" class="trilogy-icon"><img @click="selectItem('')"
            :src="trilogyIcon" />
          <template v-if="isMobile"></template>
        </tooltip>
      </div>
      <div>Home</div>
      <div class="sidebar-divider"></div>
      <div v-for="(item, _) in sidebarItems" :key="item.name" class="sidebar-icon" @click="selectItem(item.screen)"
        :class="{ selected: active == item.screen }">
        <template v-if="!isMobile">
          <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
        </template>
        <template v-else>
          <i :class="item.icon"></i>
          <div> {{ item.tooltip }}</div>
        </template>

      </div>
      <div class="sidebar-divider"></div>
      <div v-for="(item, _) in sidebarFeatureItems" :key="item.name" class="sidebar-icon"
        @click="selectItem(item.screen)" :class="{ selected: active == item.screen }">
        <template v-if="!isMobile">
          <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
        </template>
        <template v-else>
          <i :class="item.icon"></i>
          <div> {{ item.tooltip }} </div>
        </template>
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
      <EditorList :activeEditor="activeEditor" v-if="active === 'editors'" @editor-selected="editorSelected"
        @save-editors="saveEditors" />
      <ConnectionList v-else-if="active === 'connections'" />
      <ModelSidebar v-else-if="active === 'models'" @model-key-selected="modelKeySelected" />
      <TutorialSidebar v-else-if="active === 'tutorial'" @documentation-key-selected="documentationKeySelected"
        :activeDocumentationKey="activeDocumentationKey" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject } from 'vue'
import EditorList from './EditorList.vue'
import ConnectionList from './ConnectionList.vue'
import TutorialSidebar from './TutorialSidebar.vue'
import ModelSidebar from './ModelSidebar.vue'
import trilogyIcon from '../static/trilogy.png'
import Tooltip from './Tooltip.vue'
import { getDefaultValueFromHash } from '../stores/urlStore'
export default defineComponent({
  name: 'Sidebar',
  props: {
    active: {
      type: String,
      default: getDefaultValueFromHash('screen'),
      optional: true,
    },
    activeEditor: {
      type: String,
      default: getDefaultValueFromHash('editor'),
      optional: true,
    },
    activeDocumentationKey: {
      type: String,
      default: getDefaultValueFromHash('documentationKey'),
      optional: true,
    }
  },
  data() {
    let sidebarFeatureItems = [
      // {
      //     name: 'dashboard',
      //     tooltip: 'Dashboard',
      //     icon: 'mdi mdi-chart-areaspline',
      //     screen: 'dashboard',
      //   },
      {
        name: 'models',
        tooltip: 'Models',
        icon: 'mdi mdi-set-center',
        screen: 'models',
      },
      {
        name: 'help',
        tooltip: 'Docs',
        icon: 'mdi mdi-help',
        screen: 'tutorial',
      },
    ]
    let sideBarItems = [
      {
        name: 'edit',
        tooltip: 'Editors',
        icon: 'mdi mdi-file-document-edit',
        screen: 'editors',
      },
      {
        name: 'database',
        tooltip: 'Connections',
        icon: 'mdi mdi-database',
        screen: 'connections',
      },

      //   {
      //     name: "Extensions",
      //     iconClass: "fas fa-puzzle-piece",
      //     component: "Extensions", // Replace with your actual component
      //   },
    ]
    let isMobile = inject('isMobile')
    return {
      // index of the sidebarItem where the screen == active
      // selectedIndex: sideBarItems.findIndex((item) => item.screen === active) || 0,
      trilogyIcon: trilogyIcon,
      sidebarItems: sideBarItems,
      sidebarFeatureItems: sidebarFeatureItems,
      isMobile,
    }
  },
  components: {
    EditorList,
    ConnectionList,
    Tooltip,
    TutorialSidebar,
    ModelSidebar,
  },

  methods: {
    selectItem(index: string) {
      this.$emit('screen-selected', index)
    },
    editorSelected(editor: string) {
      this.$emit('editor-selected', editor)
    },
    modelKeySelected(key: string) {
      this.$emit('model-key-selected', key)
    },
    documentationKeySelected(key: string) {
      this.$emit('documentation-key-selected', key)
    },
    saveEditors() {
      this.$emit('save-editors')
    },
    openSettings() {
      console.log('Settings clicked')
      // Implement settings navigation
    },
    openProfile() {
      console.log('Profile clicked')
      // Implement profile navigation
    },
  },
})
</script>

<style scoped>
.trilogy-icon {
  width: 30px;
  height: 30px;
  display: flex;
  text-align: center;
  /* justify-content: flex-start; */
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
  width: var(--sidebar-icon-width);
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
