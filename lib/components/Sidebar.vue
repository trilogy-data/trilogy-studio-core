<template>
  <div class="sidebar-container">
    <div class="sidebar-icons">
      <div class="trilogy-icon">
        <img @click="selectItem('welcome')" :src="trilogyIcon" title="Trilogy Studio (Alpha)" />
      </div>
      <div v-if="isMobile">Home</div>
      <div class="sidebar-divider" v-if="!isMobile"></div>
      <div
        v-for="(item, _) in sidebarItems"
        :key="item.name"
        class="sidebar-icon"
        @click="selectItem(item.screen)"
        :class="{ selected: active == item.screen, 'sidebar-icon-margin': !isMobile }"
        :data-testid="`sidebar-icon-${item.screen}`"
      >
        <template v-if="!isMobile">
          <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
        </template>
        <template v-else>
          <i :class="item.icon"></i>
          <div>{{ item.tooltip }}</div>
        </template>
      </div>
      <div class="sidebar-divider" v-if="!isMobile"></div>
      <div
        v-for="(item, _) in sidebarFeatureItems"
        :key="item.name"
        class="sidebar-icon"
        @click="selectItem(item.screen)"
        :class="{ selected: active == item.screen, 'sidebar-icon-margin': !isMobile }"
        :data-testid="`sidebar-icon-${item.screen}`"
      >
        <template v-if="!isMobile">
          <tooltip :content="item.tooltip"><i :class="item.icon"></i></tooltip>
        </template>
        <template v-else>
          <i :class="item.icon"></i>
          <div>{{ item.tooltip }}</div>
        </template>
      </div>
      <div class="sidebar-bottom-icons" :class="{ 'sidebar-bottom-icons-mobile': isMobile }">
        <div
          class="sidebar-icon"
          :class="{ selected: active == 'settings', 'sidebar-icon-margin': !isMobile }"
          @click="selectItem('settings')"
        >
          <template v-if="!isMobile">
            <tooltip content="Settings"><i class="mdi mdi-cog"></i></tooltip>
          </template>
          <template v-else>
            <i class="mdi mdi-cog"></i>
            <div>Settings</div>
          </template>
        </div>
        <div
          class="sidebar-icon"
          :class="{ selected: active == 'profile', 'sidebar-icon-margin': !isMobile }"
          @click="selectItem('profile')"
        >
          <template v-if="!isMobile">
            <tooltip content="Profile"><i class="mdi mdi-account"></i></tooltip>
          </template>
          <template v-else>
            <i class="mdi mdi-account"></i>
            <div>Profile</div>
          </template>
        </div>
      </div>
    </div>

    <div class="sidebar-content">
      <EditorList
        :activeEditor="activeEditor"
        v-show="active === 'editors'"
        @editor-selected="editorSelected"
        @save-editors="saveEditors"
      />
      <ConnectionList
        v-show="active === 'connections'"
        @connection-key-selected="connectionKeySelected"
        @toggle-mobile-menu="toggleMobileMenu"
        :activeConnectionKey="activeConnectionKey"
      />
      <LLMConnectionList
        v-show="active === 'llms'"
        @llm-connection-key-selected="connectionKeySelected"
        :activeLLMKey="activeLLMKey"
      />
      <ModelSidebar
        v-show="active === 'models'"
        @model-key-selected="modelKeySelected"
        :activeModelKey="activeModelKey"
      />
      <TutorialSidebar
        v-show="active === 'tutorial'"
        @documentation-key-selected="documentationKeySelected"
        :activeDocumentationKey="activeDocumentationKey"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject } from 'vue'
import EditorList from './EditorList.vue'
import ConnectionList from './ConnectionList.vue'
import TutorialSidebar from './TutorialSidebar.vue'
import ModelSidebar from './ModelSidebar.vue'
import LLMConnectionList from './LLMConnectionList.vue'
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
    activeModelKey: {
      type: String,
      default: getDefaultValueFromHash('model'),
      optional: true,
    },
    activeDocumentationKey: {
      type: String,
      default: getDefaultValueFromHash('documentationKey'),
      optional: true,
    },
    activeConnectionKey: {
      type: String,
      default: getDefaultValueFromHash('connection'),
      optional: true,
    },
    activeLLMKey: {
      type: String,
      default: getDefaultValueFromHash('llm'),
      optional: true,
    },
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
        name: 'community-models',
        tooltip: 'Community',
        icon: 'mdi mdi-library',
        screen: 'community-models',
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
      {
        name: 'llm',
        tooltip: 'LLMs',
        icon: 'mdi mdi-creation',
        screen: 'llms',
      },

      //   {
      //     name: "Extensions",
      //     iconClass: "fas fa-puzzle-piece",
      //     component: "Extensions", // Replace with your actual component
      //   },
    ]
    let isMobile = inject<CallableFunction>('isMobile')
    if (!isMobile) {
      throw new Error('isMobile is not provided')
    }
    const notMobile = !isMobile
    return {
      // index of the sidebarItem where the screen == active
      // selectedIndex: sideBarItems.findIndex((item) => item.screen === active) || 0,
      trilogyIcon: trilogyIcon,
      sidebarItems: sideBarItems,
      sidebarFeatureItems: sidebarFeatureItems,
      isMobile,
      notMobile,
    }
  },
  components: {
    EditorList,
    ConnectionList,
    Tooltip,
    TutorialSidebar,
    ModelSidebar,
    LLMConnectionList,
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
    connectionKeySelected(key: string) {
      this.$emit('connection-key-selected', key)
    },
    toggleMobileMenu() {
      this.$emit('toggle-mobile-menu')
    },
    llmKeySelected(key: string) {
      this.$emit('llm-key-selected', key)
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
  cursor: pointer;
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
  width: 100%;
  cursor: pointer;
  text-align: center;
}

.sidebar-icon-margin {
  margin: 10px 0;
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
  width: 100%;
}

.sidebar-bottom-icons-mobile {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
  margin-top: auto;
  min-height: 150px;
}

@media screen and (max-width: 768px) {
  .sidebar-icons {
    overflow-y: scroll;
  }
}
</style>
