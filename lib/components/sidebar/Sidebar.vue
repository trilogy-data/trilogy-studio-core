<template>
  <div class="sidebar-container">
    <div class="sidebar-icons">
      <div class="trilogy-icon">
        <div class="trilogy-icon-wrapper">
          <tooltip
            :content="
              unSaved
                ? `Save ${unSaved} ${(unSaved?.valueOf() || 0) > 1 ? 'changes' : 'change'}`
                : 'All changes saved!'
            "
          >
            <img
              class="trilogy-icon"
              :class="{ spinning: isSaving }"
              @click="handleSave"
              :src="trilogyIcon"
              data-testid="trilogy-icon"
            />
          </tooltip>
          <div
            v-if="(unSaved?.valueOf() || 0) > 0"
            class="unsaved-badge"
            :title="`${unSaved} unsaved ${(unSaved?.valueOf() || 0) > 1 ? 'changes' : 'change'}`"
          >
            {{ unSaved }}
          </div>
        </div>
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
          <tooltip :content="item.tooltip">
            <a
              @click.prevent="selectItem(item.screen)"
              :href="getUrl(item.screen)"
              target="_blank"
              :data-testid="`sidebar-link-${item.screen}`"
            >
              <i :class="item.icon"></i>
            </a>
          </tooltip>
        </template>
        <template v-else>
          <i :class="item.icon" :data-testid="`sidebar-link-${item.screen}`"></i>
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
          <tooltip :content="item.tooltip">
            <a
              @click.prevent="selectItem(item.screen)"
              :href="getUrl(item.screen)"
              target="_blank"
              :data-testid="`sidebar-link-${item.screen}`"
            >
              <i :class="item.icon"></i>
            </a>
          </tooltip>
        </template>
        <template v-else>
          <i :class="item.icon" :data-testid="`sidebar-link-${item.screen}`"></i>
          <div>{{ item.tooltip }}</div>
        </template>
      </div>
      <div class="sidebar-bottom-icons" :class="{ 'sidebar-bottom-icons-mobile': isMobile }">
        <div
          class="sidebar-icon"
          :class="{ selected: active == 'settings', 'sidebar-icon-margin': !isMobile }"
          @click="selectItem('settings')"
          data-testid="sidebar-icon-settings"
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
          data-testid="sidebar-icon-profile"
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

    <div class="sidebar-content" :style="{ width: containerWidth - 40 + 'px' }">
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
      <DashboardList
        v-show="active === 'dashboard'"
        @dashboard-key-selected="dashboardKeySelected"
        @save-editors="saveDashboards"
        :activeDashboardKey="activeDashboardKey"
        @toggle-mobile-menu="toggleMobileMenu"
      />
      <CommunityModelList v-show="active === 'community-models'" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, ref } from 'vue'
import EditorList from '../sidebar/EditorList.vue'
import ConnectionList from '../sidebar/ConnectionList.vue'
import TutorialSidebar from '../sidebar/TutorialSidebar.vue'
import ModelSidebar from './ModelSidebar.vue'
import LLMConnectionList from './LLMConnectionList.vue'
import DashboardList from './DashboardList.vue'
import CommunityModelList from './CommunityModelList.vue'
import trilogyIcon from '../../static/trilogy.png'
import Tooltip from '../Tooltip.vue'
import { getDefaultValueFromHash } from '../../stores/urlStore'

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
    activeDashboardKey: {
      type: String,
      default: getDefaultValueFromHash('dashboard'),
      optional: true,
    },
    containerWidth: {
      type: Number,
      default: 200,
      optional: true,
    },
  },
  setup() {
    const isSaving = ref(false)
    const previousUnSaved = ref(null)

    return {
      isSaving,
      previousUnSaved,
    }
  },
  data() {
    let sidebarFeatureItems = [
      {
        name: 'dashboard',
        tooltip: 'Chart',
        icon: 'mdi mdi-chart-multiple',
        screen: 'dashboard',
      },
      {
        name: 'models',
        tooltip: 'Model',
        icon: 'mdi mdi-set-center',
        screen: 'models',
      },
      {
        name: 'community-models',
        tooltip: 'Share & Explore',
        icon: 'mdi mdi-library-outline',
        screen: 'community-models',
      },
      {
        name: 'help',
        tooltip: 'Help',
        icon: 'mdi mdi-help',
        screen: 'tutorial',
      },
    ]
    let sideBarItems = [
      {
        name: 'edit',
        tooltip: 'Query',
        icon: 'mdi mdi-file-document-edit-outline',
        screen: 'editors',
      },
      {
        name: 'database',
        tooltip: 'Connect',
        icon: 'mdi mdi-database-outline',
        screen: 'connections',
      },
      {
        name: 'llm',
        tooltip: 'AI',
        icon: 'mdi mdi-creation-outline',
        screen: 'llms',
      },

      //   {
      //     name: "Extensions",
      //     iconClass: "fas fa-puzzle-piece",
      //     component: "Extensions", // Replace with your actual component
      //   },
    ]
    let isMobile = inject<CallableFunction>('isMobile')
    let saveAll = inject<CallableFunction>('saveAll')
    let unSaved = inject<Number>('unSaved') || 0
    if (!isMobile || !saveAll) {
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
      unSaved,
      saveAll,
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
    DashboardList,
    CommunityModelList,
  },

  watch: {
    unSaved: {
      handler(newValue, oldValue) {
        // If unSaved count goes to 0 from a positive number, trigger spin animation
        if (oldValue > 0 && newValue === 0 && !this.isSaving) {
          this.triggerSaveAnimation()
        }
        this.previousUnSaved = newValue
      },
      immediate: true,
    },
  },

  methods: {
    triggerSaveAnimation() {
      this.isSaving = true
      // Ensure minimum 500ms spin duration
      setTimeout(() => {
        this.isSaving = false
      }, 500)
    },
    async handleSave() {
      this.isSaving = true

      // Call the original saveAll function
      await this.saveAll()

      // Ensure minimum 500ms spin duration
      setTimeout(() => {
        this.isSaving = false
      }, 500)
    },
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
    dashboardKeySelected(key: string) {
      this.$emit('dashboard-key-selected', key)
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
    saveDashboards() {
      this.$emit('save-dashboards')
    },
    openSettings() {
      console.log('Settings clicked')
      // Implement settings navigation
    },
    openProfile() {
      console.log('Profile clicked')
      // Implement profile navigation
    },
    getUrl(screen: string): string {
      // Create a URL with the appropriate parameters for this screen
      const params = new URLSearchParams(window.location.search)
      params.set('screen', screen)
      return `?${params.toString()}`
    },
  },
})
</script>

<style scoped>
@keyframes spin-and-return {
  0% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(360deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.trilogy-icon {
  width: 30px;
  height: 30px;
  display: flex;
  text-align: center;
  cursor: pointer;
  transition: transform 0.3s ease;
  /* justify-content: flex-start; */
}

.trilogy-icon.spinning {
  animation: spin-and-return 1s ease-in-out;
}

.trilogy-icon-wrapper {
  position: relative;
  display: inline-block;
}

.unsaved-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: #2196f3;
  color: white;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: bold;
  min-width: 12px;
  padding: 0 2px;
  box-sizing: border-box;
  z-index: 1;
}

.sidebar-container {
  display: flex;
  height: 100vh;
  background-color: var(--sidebar-bg-color);
  color: var(--sidebar-font);
}

.sidebar-icons {
  background-color: var(--sidebar-selector-bg);
  color: var(--sidebar-selector-font);
  padding-top: 10px;
  width: var(--sidebar-icon-width);
  min-width: var(--sidebar-icon-width);
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

.sidebar-icon a {
  display: inline-block;
  color: inherit;
  text-decoration: none;
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
    min-width: 55px;
    max-width: 55px;
    font-size: var(--small-font-size);
  }

  .sidebar-container {
    height: calc(100vh - 40px);
  }
}
</style>
