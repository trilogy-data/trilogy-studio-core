<template>
  <div class="main mobile-ide-root" :style="{ '--mobile-viewport-height': mobileViewportHeight }">
    <ChatCreatorModal
      :visible="showChatCreatorModal"
      :preselectedConnection="chatCreatorPreselectedConnection"
      :activeDataConnection="activeConnectionKey"
      @close="showChatCreatorModal = false"
      @chat-created="handleChatCreated"
    />
    <mobile-sidebar-layout
      @menu-toggled="mobileMenuOpen = !mobileMenuOpen"
      @menu-back="handleMobileMenuBack"
      @menu-home="handleMobileMenuHome"
      @tab-selected="tabSelected"
      :menuOpen="mobileMenuOpen"
      :mobileNavigationLevel="mobileNavigationLevel"
      :mobileNavigationTitle="mobileNavigationTitle"
      :activeScreen="activeScreen"
      :tabs="tabs"
      :activeTab="activeTab"
      @tab-closed="handleTabClosed"
      @close-other-tabs="handleCloseOtherTabs"
      @active-title-updated="updateActiveEditorName"
    >
      <template #sidebar>
        <sidebar
          @editor-selected="setActiveEditor"
          @screen-selected="setActiveSidebarScreen"
          @save-editors="saveEditorsCall"
          @model-key-selected="setActiveModelKey"
          @jobs-key-selected="setActiveJobsKey"
          @documentation-key-selected="setActiveDocumentationKey"
          @dashboard-key-selected="setActiveDashboard"
          @toggle-mobile-menu="toggleMobileMenu"
          @connection-key-selected="setActiveConnectionKey"
          @llm-key-selected="setActiveLLMConnectionKey"
          @llm-open-view="handleLLMOpenView"
          @create-new-chat="handleCreateNewChat"
          :active="activeSidebarScreen"
          :activeEditor="activeEditor"
          :activeDocumentationKey="activeDocumentationKey"
          :activeConnectionKey="activeConnectionKey"
          :activeModelKey="activeModelKey"
          :activeJobsKey="activeJobsKey"
          :activeDashboardKey="activeDashboard"
          :activeLLMKey="activeLLMConnectionKey"
        />
      </template>
      <template v-if="activeScreen && activeScreen !== '' && ['editors'].includes(activeScreen)">
        <tabbed-layout :show-chat="hasActiveEditorChat">
          <template #editor="slotProps" v-if="activeEditor && activeEditorData">
            <editor
              v-if="activeEditorData.type == 'preql'"
              ref="editorRef"
              context="main-trilogy"
              :editorId="activeEditor"
              @query-started="slotProps.onQueryStarted"
              @save-editors="saveEditorsCall"
            />
            <editor
              @query-started="slotProps.onQueryStarted"
              v-else
              ref="editorRef"
              context="main-sql"
              :editorId="activeEditor"
              @save-editors="saveEditorsCall"
            />
          </template>
          <template #results="{ containerHeight }" v-if="activeEditorData">
            <ResultsView
              :editorData="activeEditorData"
              :containerHeight="containerHeight"
              :runEditorQuery="runQuery"
              display-mode="results"
              @content-change="handleEditorContentChange"
            ></ResultsView>
          </template>
          <template #chat v-if="activeEditorData && hasActiveEditorChat">
            <ResultsView
              :editorData="activeEditorData"
              :runEditorQuery="runQuery"
              display-mode="chat"
              @content-change="handleEditorContentChange"
            ></ResultsView>
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
      <template v-else-if="activeScreen === 'jobs'">
        <jobs-view :activeJobsKey="activeJobsKey" />
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

<style scoped src="../components/layout/ideViewport.css"></style>
<style scoped>
.ide-context-manager {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

header {
  flex-shrink: 0;
}

aside {
  flex-shrink: 0;
}
</style>

<style>
@media screen and (max-width: 768px) {
  /* iOS Safari zooms the page when a focused form control renders below 16px. */
  .mobile-ide-root input,
  .mobile-ide-root textarea,
  .mobile-ide-root select {
    font-size: 16px !important;
  }
}
</style>

<script lang="ts">
import MobileSidebarLayout from '../components/layout/MobileSidebarLayout.vue'
import Sidebar from '../components/sidebar/Sidebar.vue'
import CommunityModels from '../components/community/CommunityModels.vue'
import JobsView from '../components/jobs/JobsView.vue'
import ConnectionView from './ConnectionView.vue'
import AssetAutoImporter from '../components/AssetAutoImporter.vue'
import TabbedLayout from '../components/layout/TabbedLayout.vue'
import ErrorMessage from '../components/ErrorMessage.vue'
import LoadingView from '../components/LoadingView.vue'
import LoadingButton from '../components/LoadingButton.vue'
import ModelView from './ModelView.vue'
import UserSettings from '../components/user/UserSettings.vue'
import UserProfile from '../components/user/UserProfile.vue'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type EditorModel from '../editors/editor.ts'
import { EditorTag } from '../editors'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import TrilogyResolver from '../stores/resolver.ts'
import type QueryExecutionService from '../stores/queryExecutionService.ts'
import { inject, defineAsyncComponent, provide, onBeforeUnmount, onMounted, ref } from 'vue'

import setupDemo from '../data/tutorial/demoSetup'
import { getDefaultValueFromHash, removeHashFromUrl, URL_HASH_KEYS } from '../stores/urlStore.ts'
import { KeySeparator } from '../data/constants'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import useScreenNavigation, { type Tab } from '../stores/useScreenNavigation.ts'
import useMobileSidebarNavigation from '../stores/useMobileSidebarNavigation'
import { type DashboardStoreType } from '../stores/dashboardStore.ts'
import { defineComponent, type Component } from 'vue'
import PageLoading from '../components/PageLoading.vue'

const asyncPage = (loader: () => Promise<any>) =>
  defineAsyncComponent({
    loader,
    loadingComponent: PageLoading,
    delay: 150,
  })

const TutorialPage = asyncPage(() => import('./TutorialPage.vue'))
const Editor = asyncPage(() => import('../components/editor/Editor.vue'))
const DataTable = defineAsyncComponent(() => import('../components/DataTable.vue'))
const WelcomePage = asyncPage(() => import('./WelcomePage.vue'))
const MobileDashboard = asyncPage(() => import('../components/dashboard/DashboardMobile.vue'))
const ResultsView = defineAsyncComponent(() => import('../components/editor/ResultComponent.vue'))
const LLMView = asyncPage(() => import('./LLMView.vue'))
const ChatCreatorModal = defineAsyncComponent(
  () => import('../components/llm/ChatCreatorModal.vue'),
)

export interface MobileIDEProps {}

const MobileIDEComponent: Component = defineComponent({
  name: 'MobileIDEComponent',
  data() {
    return {}
  },
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
    WelcomePage,
    MobileDashboard,
    DashboardAutoImporter: AssetAutoImporter,
    AssetAutoImporter,
    LoadingButton,
    TabbedLayout,
    MobileSidebarLayout,
    CommunityModels,
    JobsView,
    ConnectionView,
    ResultsView,
    LLMView,
    ChatCreatorModal,
  },
  setup() {
    type ResolverType = typeof TrilogyResolver
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    let modelStore = inject<ModelConfigStoreType>('modelStore')
    let dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const trilogyResolver = inject<ResolverType>('trilogyResolver')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
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
    const editorRef = ref<any>(null)
    const mobileNavigation = useMobileSidebarNavigation()
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
      activeJobsKey,
      setActiveJobsKey,
      mobileMenuOpen,
      toggleMobileMenu,
      tabs,
      closeTab,
      closeOtherTabsExcept,
      openTab,
      addBackListeners,
      removeBacklisteners,
      onInitialLoad,
      updateTabName,
    } = screenNavigation
    const tabSelected = (e: Tab) => {
      openTab(e.screen, null, e.address)
    }
    const handleTabClosed = (tab: Tab) => {
      closeTab(tab.id, null)
    }
    const handleCloseOtherTabs = (tab: Tab) => {
      closeOtherTabsExcept(tab.id)
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

    // Chat creator modal management
    const showChatCreatorModal = ref(false)
    const chatCreatorPreselectedConnection = ref('')
    const mobileViewportHeight = ref('100dvh')
    const updateMobileViewportHeight = () => {
      mobileViewportHeight.value = window.visualViewport
        ? `${window.visualViewport.height}px`
        : `${window.innerHeight}px`
    }

    onMounted(() => {
      updateMobileViewportHeight()
      window.visualViewport?.addEventListener('resize', updateMobileViewportHeight)
    })

    onBeforeUnmount(() => {
      window.visualViewport?.removeEventListener('resize', updateMobileViewportHeight)
    })

    const handleCreateNewChat = (connectionName: string) => {
      chatCreatorPreselectedConnection.value = connectionName
      showChatCreatorModal.value = true
    }

    const handleChatCreated = (chat: any) => {
      // Navigate to the LLMs screen to show the new chat with chat ID in URL
      const address = `${chat.llmConnectionName}${KeySeparator}${chat.id}`
      setActiveLLMConnectionKey(address)
      llmInitialTab.value = 'chat'
      setActiveScreen('llms')
      // Close the mobile menu if open
      if (mobileMenuOpen.value) {
        toggleMobileMenu()
      }
      // Reset the tab after a short delay
      setTimeout(() => {
        llmInitialTab.value = ''
      }, 100)
      // Close the modal
      showChatCreatorModal.value = false
    }

    const handleLLMOpenView = (
      connectionName: string,
      tab: 'chat' | 'validation',
      chatId?: string,
    ) => {
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
      queryExecutionService,
      saveEditors,
      saveConnections,
      saveModels,
      saveDashboards,
      modelStore,
      activeCommunityModelKey,
      activeJobsKey,
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
      setActiveJobsKey,
      mobileMenuOpen,
      toggleMobileMenu,
      tabs,
      openTab,
      closeTab,
      closeOtherTabsExcept,
      tabSelected,
      handleTabClosed,
      handleCloseOtherTabs,
      updateTabName,
      llmInitialTab,
      handleLLMOpenView,
      showChatCreatorModal,
      chatCreatorPreselectedConnection,
      handleCreateNewChat,
      handleChatCreated,
      mobileViewportHeight,
      editorRef,
      mobileNavigationLevel: mobileNavigation.level,
      mobileNavigationTitle: mobileNavigation.title,
      handleMobileMenuBack: mobileNavigation.back,
      handleMobileMenuHome: mobileNavigation.home,
    }
  },
  async mounted() {
    // #demo=true deep link: land directly in the demo editor, connected.
    if (getDefaultValueFromHash(URL_HASH_KEYS.DEMO, '') === 'true') {
      await this.startDemo()
      removeHashFromUrl(URL_HASH_KEYS.DEMO)
    }
  },
  methods: {
    async runQuery() {
      // Agent tool runs should stay in Chat; direct toolbar runs still emit
      // query-started from Editor and switch to Results.
      return await this.editorRef?.runQuery(false)
    },
    handleEditorContentChange(content: string) {
      this.editorRef?.setContent(content)
    },
    updateActiveEditorName(newName: string) {
      const editorId = this.activeEditor
      if (!editorId) return
      const editor = (this.editorStore.editors as Record<string, EditorModel>)[editorId]
      if (!editor) return
      this.editorStore.updateEditorName(editorId, newName)

      if (editor.tags.includes(EditorTag.SOURCE)) {
        const connection = editor.connectionId
          ? this.connectionStore.connections[editor.connectionId]
          : this.connectionStore.connectionByName(editor.connection)
        if (connection?.model) {
          this.modelStore.models[connection.model].updateModelSourceName(editor.id, newName)
          this.saveModels()
        }
      }

      this.updateTabName('editors', null, editorId)
    },
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
        this.queryExecutionService,
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
    activeEditorData(): EditorModel | null {
      if (!this.activeEditor) return null
      let r = this.editorStore.editors[this.activeEditor]
      return r
    },
    hasActiveEditorChat(): boolean {
      if (!this.activeEditor) return false
      const editor = (this.editorStore.editors as Record<string, EditorModel>)[this.activeEditor]
      return Boolean(editor?.hasActiveRefinement())
    },
    editorList() {
      return Object.keys(this.editors).map((editor) => this.editors[editor])
    },
    editors() {
      return this.editorStore.editors
    },
  },
})

export default MobileIDEComponent
</script>
