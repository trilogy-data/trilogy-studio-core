<template>
  <div class="sidebar-container" :class="{ 'mobile-navigation': isMobile }">
    <div
      v-if="isMobile && mobileNavigationLevel === 'root'"
      class="mobile-menu-root"
      data-testid="mobile-menu-root"
    >
      <button
        type="button"
        class="mobile-menu-brand"
        :aria-label="unSaved ? `Save ${unSaved} unsaved changes` : 'All changes saved'"
        @click="handleSave"
      >
        <img
          class="mobile-menu-logo"
          :class="{ spinning: isSaving }"
          :src="trilogyIcon"
          alt=""
          aria-hidden="true"
          data-testid="trilogy-icon"
        />
        <div>
          <div class="mobile-menu-title">Trilogy Studio</div>
          <div class="mobile-menu-save-state">
            {{ unSaved ? `${unSaved} unsaved — tap to save` : 'All changes saved' }}
          </div>
        </div>
      </button>

      <nav class="mobile-menu-destinations" aria-label="Main navigation">
        <button
          v-for="item in [...sidebarItems, ...sidebarFeatureItems]"
          :key="item.screen"
          type="button"
          class="mobile-menu-destination"
          :class="{ selected: active === item.screen }"
          :aria-current="active === item.screen ? 'page' : undefined"
          :data-testid="`sidebar-icon-${item.screen}`"
          @click="selectMobileDestination(item.screen)"
          @mouseenter="preloadScreen(item.screen)"
        >
          <i :class="item.icon" aria-hidden="true"></i>
          <span>{{ item.tooltip }}</span>
          <i class="mdi mdi-chevron-right mobile-menu-chevron" aria-hidden="true"></i>
        </button>
      </nav>

      <div class="mobile-menu-bottom">
        <button
          type="button"
          class="mobile-menu-destination"
          data-testid="sidebar-icon-settings"
          @click="selectItem('settings')"
        >
          <i class="mdi mdi-cog-outline" aria-hidden="true"></i>
          <span>Settings</span>
        </button>
        <button
          type="button"
          class="mobile-menu-destination"
          data-testid="sidebar-icon-profile"
          @click="selectItem('profile')"
        >
          <i class="mdi mdi-account-outline" aria-hidden="true"></i>
          <span>Profile</span>
        </button>
      </div>
    </div>

    <div v-if="!isMobile" class="sidebar-icons" data-testid="sidebar-icons">
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
      <div class="trilogy-icon-padding"></div>
      <div
        class="sidebar-collapse-btn"
        @click="toggleCollapse"
        :title="contentCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <i :class="contentCollapsed ? 'mdi mdi-chevron-right' : 'mdi mdi-chevron-left'"></i>
      </div>
      <div class="sidebar-divider"></div>
      <div
        v-for="(item, _) in sidebarItems"
        :key="item.name"
        class="sidebar-icon sidebar-icon-margin"
        @click="selectItem(item.screen)"
        @mouseenter="preloadScreen(item.screen)"
        :class="{ selected: active == item.screen }"
        :data-testid="`sidebar-icon-${item.screen}`"
      >
        <tooltip :content="item.tooltip">
          <a
            @click.prevent.stop="selectItem(item.screen)"
            :href="getUrl(item.screen)"
            target="_blank"
            :data-testid="`sidebar-link-${item.screen}`"
          >
            <i :class="item.icon"></i>
          </a>
        </tooltip>
      </div>
      <div class="sidebar-divider"></div>
      <div
        v-for="(item, _) in sidebarFeatureItems"
        :key="item.name"
        class="sidebar-icon sidebar-icon-margin"
        @click="selectItem(item.screen)"
        @mouseenter="preloadScreen(item.screen)"
        :class="{ selected: active == item.screen }"
        :data-testid="`sidebar-icon-${item.screen}`"
      >
        <tooltip :content="item.tooltip">
          <a
            @click.prevent.stop="selectItem(item.screen)"
            :href="getUrl(item.screen)"
            target="_blank"
            :data-testid="`sidebar-link-${item.screen}`"
          >
            <i :class="item.icon"></i>
          </a>
        </tooltip>
      </div>
      <div class="sidebar-bottom-icons">
        <div
          class="sidebar-icon sidebar-icon-margin"
          :class="{ selected: active == 'settings' }"
          @click="selectItem('settings')"
          data-testid="sidebar-icon-settings"
        >
          <tooltip content="Settings"><i class="mdi mdi-cog-outline"></i></tooltip>
        </div>
        <div
          class="sidebar-icon sidebar-icon-margin"
          :class="{ selected: active == 'profile' }"
          data-testid="sidebar-icon-profile"
          @click="selectItem('profile')"
        >
          <tooltip content="Profile"><i class="mdi mdi-account-outline"></i></tooltip>
        </div>
      </div>
    </div>

    <div
      v-show="!isMobile || mobileNavigationLevel === 'detail'"
      ref="mobileDetailMenu"
      class="sidebar-content"
      :class="{ 'sidebar-content-collapsed': contentCollapsed && !isMobile }"
      :style="isMobile || contentCollapsed ? {} : { width: containerWidth - 40 + 'px' }"
    >
      <label
        v-if="isMobile && activeMobileDestination?.searchLabel"
        class="mobile-subsection-search"
      >
        <i class="mdi mdi-magnify" aria-hidden="true"></i>
        <input
          v-model="mobileSearchQuery"
          type="search"
          :placeholder="`Search ${activeMobileDestination.searchLabel}`"
          :aria-label="`Search ${activeMobileDestination.searchLabel}`"
          data-testid="mobile-sidebar-search"
        />
        <button
          v-if="mobileSearchQuery"
          type="button"
          aria-label="Clear search"
          @click="mobileSearchQuery = ''"
        >
          <i class="mdi mdi-close" aria-hidden="true"></i>
        </button>
      </label>
      <EditorList
        :activeEditor="activeEditor"
        :mobileSearchQuery="mobileSearchQuery"
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
        @llm-connection-key-selected="llmKeySelected"
        @llm-open-view="llmOpenView"
        @create-new-chat="createNewChat"
        :activeLLMKey="activeLLMKey"
      />
      <ModelSidebar
        v-show="active === 'models'"
        @model-key-selected="modelKeySelected"
        :activeModelKey="activeModelKey"
        :mobileSearchQuery="mobileSearchQuery"
      />
      <JobsList
        v-show="active === 'jobs'"
        @jobs-key-selected="jobsKeySelected"
        :activeJobsKey="activeJobsKey"
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
import JobsList from './JobsList.vue'
import LLMConnectionList from './LLMConnectionList.vue'
import DashboardList from './DashboardList.vue'
import CommunityModelList from './CommunityModelList.vue'
import trilogyIcon from '../../static/trilogy.png'
import Tooltip from '../Tooltip.vue'
import { preloadScreen } from '../../utility/screenPreloader'
import { useIsMobile } from '../useIsMobile'
import useMobileSidebarNavigation from '../../stores/useMobileSidebarNavigation'

interface SidebarDestination {
  name: string
  tooltip: string
  icon: string
  screen: string
  /** When set, mobile shows a search field for this destination. */
  searchLabel?: string
}

export interface SidebarProps {
  active?: string
  activeEditor?: string
  activeModelKey?: string
  activeDocumentationKey?: string
  activeConnectionKey?: string
  activeLLMKey?: string
  activeJobsKey?: string
  activeDashboardKey?: string
  containerWidth?: number
}

export default defineComponent({
  name: 'Sidebar',
  props: {
    active: { type: String, default: '' },
    activeEditor: { type: String, default: '' },
    activeModelKey: { type: String, default: '' },
    activeDocumentationKey: { type: String, default: '' },
    activeConnectionKey: { type: String, default: '' },
    activeJobsKey: { type: String, default: '' },
    activeLLMKey: { type: String, default: '' },
    activeDashboardKey: { type: String, default: '' },
    containerWidth: { type: Number, default: 200 },
  } as const,
  setup() {
    const isSaving = ref(false)
    const previousUnSaved = ref(null)
    const isMobile = useIsMobile()
    const mobileNavigation = useMobileSidebarNavigation()

    return {
      isSaving,
      previousUnSaved,
      isMobile,
      mobileNavigation,
    }
  },
  data() {
    // `searchLabel` opts a destination into the mobile search field and names
    // the thing being searched — the rail `tooltip` is not a usable noun here.
    let sidebarFeatureItems: SidebarDestination[] = [
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
        searchLabel: 'concepts',
      },
      {
        name: 'community-models',
        tooltip: 'Share & Explore',
        icon: 'mdi mdi-library-outline',
        screen: 'community-models',
      },
      {
        name: 'jobs',
        tooltip: 'Jobs',
        icon: 'mdi mdi-playlist-play',
        screen: 'jobs',
      },
      {
        name: 'help',
        tooltip: 'Help',
        icon: 'mdi mdi-help',
        screen: 'tutorial',
      },
    ]
    let sideBarItems: SidebarDestination[] = [
      {
        name: 'edit',
        tooltip: 'Query',
        icon: 'mdi mdi-file-document-edit-outline',
        screen: 'editors',
        searchLabel: 'queries',
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
    let saveAll = inject<CallableFunction>('saveAll')
    let unSaved = inject<Number>('unSaved') || 0
    if (!saveAll) {
      throw new Error('saveAll is not provided')
    }
    return {
      // index of the sidebarItem where the screen == active
      // selectedIndex: sideBarItems.findIndex((item) => item.screen === active) || 0,
      trilogyIcon: trilogyIcon,
      sidebarItems: sideBarItems,
      sidebarFeatureItems: sidebarFeatureItems,
      unSaved,
      saveAll,
      contentCollapsed: false,
      mobileDetailScrollPositions: {} as Record<string, number>,
      mobileSearchQueries: {} as Record<string, string>,
      mobileSearchQuery: '',
    }
  },
  components: {
    EditorList,
    ConnectionList,
    Tooltip,
    TutorialSidebar,
    ModelSidebar,
    JobsList,
    LLMConnectionList,
    DashboardList,
    CommunityModelList,
  },

  watch: {
    contentCollapsed(val: boolean) {
      this.$emit('content-collapsed', val)
    },
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
    // The header title depends on whether search is filtering the list, since
    // search results are flat rather than a slice of the drilled-into node.
    mobileSearchQuery(value: string) {
      this.mobileNavigation.searchActive.value = !!value.trim()
    },
  },

  computed: {
    activeMobileDestination() {
      return [...this.sidebarItems, ...this.sidebarFeatureItems].find(
        (item) => item.screen === this.active,
      )
    },
    // `mobileNavigation` is a plain object of refs returned from setup(), so
    // only the object itself is unwrapped — the refs inside need `.value`.
    mobileNavigationLevel(): 'root' | 'detail' {
      return this.mobileNavigation.level.value
    },
  },

  methods: {
    preloadScreen,
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
      if (this.isMobile) {
        this.$emit('screen-selected', index)
        return
      }
      if (index === this.active) {
        this.contentCollapsed = !this.contentCollapsed
      } else {
        this.contentCollapsed = false
        this.$emit('screen-selected', index)
      }
    },
    rememberMobileDetailScroll() {
      // Only meaningful while the detail pane is actually laid out — a v-show
      // hidden element reports scrollTop 0, which would clobber the real value.
      if (this.mobileNavigationLevel !== 'detail') return
      const detail = this.$refs.mobileDetailMenu as HTMLElement | undefined
      if (detail && this.active) {
        this.mobileDetailScrollPositions[this.active] = detail.scrollTop
        this.mobileSearchQueries[this.active] = this.mobileSearchQuery
      }
    },
    selectMobileDestination(screen: string) {
      this.rememberMobileDetailScroll()
      this.$emit('screen-selected', screen)
      const destination = [...this.sidebarItems, ...this.sidebarFeatureItems].find(
        (item) => item.screen === screen,
      )
      this.mobileNavigation.enterDestination(destination?.tooltip || '')
      this.mobileSearchQuery = this.mobileSearchQueries[screen] || ''
      this.$nextTick(() => {
        const detail = this.$refs.mobileDetailMenu as HTMLElement | undefined
        if (detail) detail.scrollTop = this.mobileDetailScrollPositions[screen] || 0
      })
    },
    toggleCollapse() {
      this.contentCollapsed = !this.contentCollapsed
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
    jobsKeySelected(key: string) {
      this.$emit('jobs-key-selected', key)
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
    llmOpenView(connectionName: string, tab: string, chatId?: string) {
      this.$emit('llm-open-view', connectionName, tab, chatId)
    },
    createNewChat(connectionName: string) {
      this.$emit('create-new-chat', connectionName)
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
      params.set('sidebarScreen', screen)
      return `#${params.toString()}`
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

.trilogy-icon-padding {
  margin-top: 8px;
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
  background-color: var(--special-text);
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
  padding: 8px 0 6px;
  width: var(--sidebar-icon-width);
  min-width: var(--sidebar-icon-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  font-weight: 500;
  gap: 2px;
  border-right: 1px solid var(--border-light);
}

.sidebar-icon {
  width: calc(100% - 8px);
  margin: 0 4px;
  cursor: pointer;
  text-align: center;
  border-radius: 0;
  color: inherit;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.sidebar-icon-margin {
  margin: 0;
}

.sidebar-icon span {
  font-size: 12px;
  display: block;
}

.sidebar-icon:hover {
  background-color: rgba(148, 163, 184, 0.12);
}

.sidebar-icon a {
  display: inline-block;
  color: inherit;
  text-decoration: none;
}

.sidebar-icon i {
  font-size: 19px;
  opacity: 0.92;
}

.sidebar-icon i::before {
  transform: translateY(-3px);
}

.sidebar-icon.selected {
  background-color: transparent;
  color: #e5edf8;
  box-shadow: inset 0 -2px 0 var(--special-text);
}

.sidebar-content {
  flex-grow: 1;
  background-color: var(--sidebar-bg);
  padding: 8px 0;
  overflow-y: auto;
}

.sidebar-content-collapsed {
  width: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  flex-grow: 0 !important;
}

.sidebar-collapse-btn {
  cursor: pointer;
  width: calc(100% - 8px);
  text-align: center;
  padding: 2px 0;
  opacity: 0.62;
  font-size: 13px;
  border-radius: 0;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.sidebar-collapse-btn:hover {
  opacity: 1;
  background-color: rgba(148, 163, 184, 0.12);
}

.sidebar-divider {
  width: 28px;
  height: 1px;
  background-color: rgba(148, 163, 184, 0.18);
  margin: 6px 0;
}

/* Bottom icons container */
.sidebar-bottom-icons {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
  margin-top: auto;
  width: 100%;
}

@media screen and (max-width: 768px) {
  .mobile-navigation {
    display: block;
    width: 100%;
    background: var(--sidebar-bg);
  }

  .mobile-menu-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--sidebar-bg);
    color: var(--text-color);
    -webkit-overflow-scrolling: touch;
    padding: 12px max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    box-sizing: border-box;
  }

  .mobile-menu-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 8px 18px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .mobile-menu-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .mobile-menu-title {
    color: var(--text-color);
    font-size: 18px;
    font-weight: 650;
  }

  .mobile-menu-save-state {
    margin-top: 2px;
    color: var(--text-faint);
    font-size: 12px;
  }

  .mobile-menu-destinations {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mobile-menu-destination {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text-color);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .mobile-menu-destination:hover,
  .mobile-menu-destination:focus-visible,
  .mobile-menu-destination.selected {
    background: var(--button-mouseover);
  }

  .mobile-menu-destination > i:first-child {
    color: var(--sidebar-selector-font, var(--text-faint));
    font-size: 22px;
    text-align: center;
  }

  .mobile-menu-destination > span {
    font-size: 16px;
    font-weight: 550;
  }

  .mobile-menu-chevron {
    color: var(--text-faint);
    font-size: 20px;
    text-align: right;
  }

  .mobile-menu-bottom {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid var(--border-light);
  }

  .mobile-menu-bottom .mobile-menu-destination {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .mobile-subsection-search {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    margin: 10px 12px 4px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    /* --query-window-bg equals --sidebar-bg in the dark theme, leaving the
       field with no surface of its own. */
    background: var(--button-mouseover);
    color: var(--text-faint);
  }

  .mobile-subsection-search > i {
    flex: 0 0 auto;
    font-size: 19px;
  }

  /* WebKit renders its own clear affordance for type=search; we supply one. */
  .mobile-subsection-search input::-webkit-search-cancel-button {
    display: none;
  }

  .mobile-subsection-search input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 42px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-color);
    font: inherit;
    font-size: 16px;
  }

  .mobile-subsection-search button {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    /* Pull back the extra width so the 44px hit area doesn't inflate the row. */
    margin-right: -10px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-faint);
    font-size: 18px;
    cursor: pointer;
  }

  .sidebar-container {
    /* --mobile-header-height is set by MobileSidebarLayout on the shell above. */
    height: calc(100vh - var(--mobile-header-height, 35px));
    height: calc(var(--mobile-viewport-height, 100dvh) - var(--mobile-header-height, 35px));
  }

  .sidebar-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
