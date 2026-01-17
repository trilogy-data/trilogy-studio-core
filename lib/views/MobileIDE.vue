<template>
  <div class="main">
    <mobile-sidebar-layout
      @menu-toggled="mobileMenuOpen = !mobileMenuOpen"
      @tab-selected="tabSelected"
      :menuOpen="mobileMenuOpen"
      :activeScreen="activeScreen"
      :tabs="tabs"
      :activeTab="activeTab"
      @tab-closed="(tab) => closeTab(tab, null)"
      @close-other-tabs="(tab) => closeOtherTabsExcept(tab)"
    >
      <template #sidebar>
        <sidebar
          @editor-selected="setActiveEditor"
          @screen-selected="setActiveSidebarScreen"
          @save-editors="saveEditorsCall"
          @model-key-selected="setActiveModelKey"
          @documentation-key-selected="setActiveDocumentationKey"
          @dashboard-key-selected="setActiveDashboard"
          @toggle-mobile-menu="toggleMobileMenu"
          @connection-key-selected="setActiveConnectionKey"
          @llm-key-selected="setActiveLLMConnectionKey"
          @llm-open-view="handleLLMOpenView"
          :active="activeSidebarScreen"
          :activeEditor="activeEditor"
          :activeDocumentationKey="activeDocumentationKey"
          :activeConnectionKey="activeConnectionKey"
          :activeModelKey="activeModelKey"
          :activeDashboardKey="activeDashboard"
          :activeLLMKey="activeLLMConnectionKey"
        />
      </template>
      <template v-if="activeScreen && activeScreen !== '' && ['editors'].includes(activeScreen)">
        <tabbed-layout>
          <template #editor="slotProps" v-if="activeEditor && activeEditorData">
            <editor
              v-if="activeEditorData.type == 'preql'"
              context="main-trilogy"
              :editorId="activeEditor"
              @query-started="slotProps.onQueryStarted"
              @save-editors="saveEditorsCall"
            />
            <editor
              @query-started="slotProps.onQueryStarted"
              v-else
              context="main-sql"
              :editorId="activeEditor"
              @save-editors="saveEditorsCall"
            />
          </template>
          <template #results v-if="activeEditorData">
            <ResultsView :editorData="activeEditorData"></ResultsView>
          </template>
        </tabbed-layout>
      </template>
      <template v-else-if="activeScreen === 'connections'">
        <connection-view
          :activeConnectionKey="activeConnectionKey"
          @save-editors="saveEditorsCall"
        />
      </template>
      <template v-else-if="activeScreen === 'tutorial'">
        <tutorial-page :activeDocumentationKey="activeDocumentationKey" />
      </template>
      <template v-else-if="activeScreen === 'models'">
        <model-view :activeModelKey="activeModelKey" @save-editors="saveEditorsCall" />
      </template>
      <template v-else-if="activeScreen === 'profile'">
        <user-profile />
      </template>
      <template v-else-if="activeScreen === 'settings'">
        <user-settings />
      </template>
      <template v-else-if="activeScreen === 'dashboard'">
        <mobile-dashboard :name="activeDashboard" />
      </template>
      <template v-else-if="activeScreen === 'dashboard-import'">
        <dashboard-auto-importer @import-complete="handleImportComplete" />
      </template>
      <template v-else-if="activeScreen === 'asset-import'">
        <asset-auto-importer @import-complete="handleAssetImportComplete" />
      </template>
      <template v-else-if="activeScreen === 'community-models'">
        <community-models :activeCommunityModelKey="activeCommunityModelKey" />
      </template>
      <template v-else-if="activeScreen === 'llms'">
        <LLMView :initialTab="llmInitialTab" />
      </template>
      <template v-else>
        <welcome-page @screen-selected="setActiveScreen" @demo-started="startDemo" />
      </template>
    </mobile-sidebar-layout>
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

.results-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  background: var(--sidebar-bg);
}

.tab-button {
  /* padding: 0.5rem 1rem; */
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  border-bottom: 2px solid transparent;
}

.tab-button:hover {
  color: #0ea5e9;
}

.tab-button.active {
  color: #0ea5e9;
  border-bottom: 2px solid #0ea5e9;
}

.tab-content {
  flex: 1;
  overflow: auto;
}

.sql-view {
  padding: 1rem;
  height: 100%;
}

.sql-view pre {
  margin: 0;
  background: var(--bg-light);
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>

<script lang="ts">
import MobileSidebarLayout from '../components/layout/MobileSidebarLayout.vue'
import CommunityModels from '../components/community/CommunityModels.vue'
import ConnectionView from './ConnectionView.vue'
import AssetAutoImporter from '../components/AssetAutoImporter.vue'
import TabbedLayout from '../components/layout/TabbedLayout.vue'
import ErrorMessage from '../components/ErrorMessage.vue'
import LoadingView from '../components/LoadingView.vue'
import LoadingButton from '../components/LoadingButton.vue'
import ModelView from './ModelView.vue'
import UserSettings from '../components/user/UserSettings.vue'
import UserProfile from '../components/user/UserProfile.vue'
import HintComponent from '../components/HintComponent.vue'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import TrilogyResolver from '../stores/resolver.ts'
import { inject, defineAsyncComponent, provide, onBeforeUnmount, ref } from 'vue'

import setupDemo from '../data/tutorial/demoSetup'
import { KeySeparator } from '../data/constants'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import useScreenNavigation, { type Tab } from '../stores/useScreenNavigation.ts'
import { type DashboardStoreType } from '../stores/dashboardStore.ts'

const TutorialPage = defineAsyncComponent(() => import('./TutorialPage.vue'))
const Sidebar = defineAsyncComponent(() => import('../components/sidebar/Sidebar.vue'))
const Editor = defineAsyncComponent(() => import('../components/editor/Editor.vue'))
const DataTable = defineAsyncComponent(() => import('../components/DataTable.vue'))
const WelcomePage = defineAsyncComponent(() => import('./WelcomePage.vue'))
const MobileDashboard = defineAsyncComponent(
  () => import('../components/dashboard/DashboardMobile.vue'),
)
const ResultsView = defineAsyncComponent(() => import('../components/editor/ResultComponent.vue'))
const LLMView = defineAsyncComponent(() => import('./LLMView.vue'))

export interface MobileIDEProps {}

export default {
  name: 'MobileIDEComponent',
  data() {},
  components: {
    Sidebar,
    Editor,
    DataTable,
    ErrorMessage,
    TutorialPage,
    ModelView,
    UserSettings,
    UserProfile,
    LoadingView,
    HintComponent,
    WelcomePage,
    MobileDashboard,
    DashboardAutoImporter: AssetAutoImporter,
    AssetAutoImporter,
    LoadingButton,
    TabbedLayout,
    MobileSidebarLayout,
    CommunityModels,
    ConnectionView,
    ResultsView,
    LLMView,
  },
  setup() {
    type ResolverType = typeof TrilogyResolver
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    let modelStore = inject<ModelConfigStoreType>('modelStore')
    let dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const trilogyResolver = inject<ResolverType>('trilogyResolver')
    let saveEditors = inject<Function>('saveEditors')
    let saveConnections = inject<Function>('saveConnections')
    let saveModels = inject<Function>('saveModels')
    let saveDashboards = inject<Function>('saveDashboards')
    if (
      !editorStore ||
      !connectionStore ||
      !dashboardStore ||
      !trilogyResolver ||
      !modelStore ||
      !saveConnections ||
      !saveModels ||
      !saveDashboards
    ) {
      throw new Error(
        'Requires injection of connection store, editor store, model store, editors, connections, and models saving.',
      )
    }
    if (!saveEditors) {
      saveEditors = () => {}
    }
    const screenNavigation = useScreenNavigation()
    const {
      activeScreen,
      activeEditor,
      activeTab,
      activeDashboard,
      activeSidebarScreen,
      setActiveScreen,
      setActiveSidebarScreen,
      setActiveEditor,
      setActiveDashboard,
      activeConnectionKey,
      activeModelKey,
      activeDocumentationKey,
      setActiveConnectionKey,
      setActiveModelKey,
      setActiveDocumentationKey,
      activeLLMConnectionKey,
      setActiveLLMConnectionKey,
      activeCommunityModelKey,
      mobileMenuOpen,
      toggleMobileMenu,
      tabs,
      closeTab,
      closeOtherTabsExcept,
      openTab,
      addBackListeners,
      removeBacklisteners,
      onInitialLoad,
    } = screenNavigation
    const tabSelected = (e: Tab) => {
      openTab(e.screen, null, e.address)
    }
    onInitialLoad()
    addBackListeners()

    // on unmount, remove back listeners
    onBeforeUnmount(() => {
      removeBacklisteners()
    })
    provide('navigationStore', screenNavigation)

    // LLM view tab management
    const llmInitialTab = ref<'chat' | 'validation' | ''>('')

    const handleLLMOpenView = (connectionName: string, tab: 'chat' | 'validation', chatId?: string) => {
      // Build the address with optional chat ID
      const address = chatId ? `${connectionName}${KeySeparator}${chatId}` : connectionName
      // Set the active connection (with chat ID if present)
      setActiveLLMConnectionKey(address)
      // Set the initial tab
      llmInitialTab.value = tab
      // Navigate to the LLMs screen
      setActiveScreen('llms')
      // Close the mobile menu
      if (mobileMenuOpen.value) {
        toggleMobileMenu()
      }
      // Reset the tab after a short delay so subsequent navigations work correctly
      setTimeout(() => {
        llmInitialTab.value = ''
      }, 100)
    }

    return {
      connectionStore,
      editorStore,
      dashboardStore,
      trilogyResolver,
      saveEditors,
      saveConnections,
      saveModels,
      saveDashboards,
      modelStore,
      activeCommunityModelKey,
      activeTab,
      activeScreen,
      activeSidebarScreen,
      activeEditor,
      activeDashboard,
      activeConnectionKey,
      activeModelKey,
      activeDocumentationKey,
      setActiveScreen,
      setActiveSidebarScreen,
      setActiveEditor,
      setActiveDashboard,
      setActiveConnectionKey,
      setActiveModelKey,
      setActiveDocumentationKey,
      activeLLMConnectionKey,
      setActiveLLMConnectionKey,
      mobileMenuOpen,
      toggleMobileMenu,
      tabs,
      openTab,
      closeTab,
      closeOtherTabsExcept,
      tabSelected,
      llmInitialTab,
      handleLLMOpenView,
    }
  },
  methods: {
    saveEditorsCall() {
      this.saveEditors()
    },
    async startDemo() {
      let editorId = await setupDemo(
        this.editorStore,
        this.connectionStore,
        this.modelStore,
        this.dashboardStore,
        this.saveEditors,
        this.saveConnections,
        this.saveModels,
        this.saveDashboards,
      )
      this.setActiveScreen('editors')
      this.setActiveEditor(editorId)
    },
    handleImportComplete(dashboardId: string) {
      console.log(`Dashboard import completed: ${dashboardId}`)
    },
    handleAssetImportComplete(assetId: string, assetType: string) {
      console.log(`Asset import completed: ${assetType} ${assetId}`)
    },
  },
  computed: {
    activeEditorData() {
      if (!this.activeEditor) return null
      let r = this.editorStore.editors[this.activeEditor]
      return r
    },
    editorList() {
      return Object.keys(this.editors).map((editor) => this.editors[editor])
    },
    editors() {
      return this.editorStore.editors
    },
  },
}
</script>
