<template>
  <div class="main">
    <PopupModal
      v-if="tipsExpanded && expandedTips.length > 0"
      title="Tips"
      :showModal="tipsExpanded"
      :activeItems="expandedTips"
      @mark-item-read="handleTipRead"
      @close-modal="closeTipModal"
    />
    <TipsCTA
      v-if="hasUnreadTips && !tipsExpanded"
      :pulsing="showTipModal"
      :count="unreadTipCount"
      @expand="expandTips"
    />
    <ChatCreatorModal
      :visible="showChatCreatorModal"
      :preselectedConnection="chatCreatorPreselectedConnection"
      :activeDataConnection="activeConnectionKey"
      @close="showChatCreatorModal = false"
      @chat-created="handleChatCreated"
    />
    <connection-error-popup />
    <!-- Full screen mode - no sidebar -->
    <div v-if="fullScreen" class="full-screen-container">
      <template v-if="activeScreen === 'dashboard'">
        <dashboard :name="activeDashboard" @full-screen="toggleFullScreen" />
      </template>
      <template v-else-if="activeScreen === 'dashboard-import'">
        <dashboard-auto-importer
          @import-complete="handleImportComplete"
          @full-screen="toggleFullScreen"
        />
      </template>
      <template v-else-if="activeScreen === 'asset-import'">
        <asset-auto-importer
          @import-complete="handleAssetImportComplete"
          @full-screen="toggleFullScreen"
        />
      </template>
    </div>

    <!-- Normal mode with sidebar -->
    <sidebar-layout v-else :sidebar-collapsed="sidebarCollapsed">
      <template #sidebar="{ containerWidth }">
        <sidebar
          @editor-selected="setActiveEditor"
          @screen-selected="setActiveSidebarScreen"
          @content-collapsed="sidebarCollapsed = $event"
          @save-editors="saveEditorsCall"
          @model-key-selected="setActiveModelKey"
          @jobs-key-selected="setActiveJobsKey"
          @documentation-key-selected="setActiveDocumentationKey"
          @connection-key-selected="setActiveConnectionKey"
          @llm-key-selected="setActiveLLMConnectionKey"
          @llm-open-view="handleLLMOpenView"
          @create-new-chat="handleCreateNewChat"
          @dashboard-key-selected="setActiveDashboard"
          :active="activeSidebarScreen"
          :activeEditor="activeEditor"
          :activeDocumentationKey="activeDocumentationKey"
          :activeModelKey="activeModelKey"
          :activeJobsKey="activeJobsKey"
          :activeConnectionKey="activeConnectionKey"
          :activeLLMKey="activeLLMConnectionKey"
          :containerWidth="containerWidth"
          :activeDashboardKey="activeDashboard"
        />
      </template>
      <template v-if="showingCredentialPrompt">
        <CredentialBackgroundPage />
      </template>
      <TabbedBrowser v-else>
        <template v-if="activeScreen && ['editors'].includes(activeScreen)">
          <vertical-split-layout>
            <template #editor="{ containerHeight }" v-if="activeEditor && activeEditorData">
              <editor
                v-if="activeEditorData.type == 'preql'"
                context="main-trilogy"
                :editorId="activeEditor"
                :containerHeight="containerHeight"
                @save-editors="saveEditorsCall"
                @save-models="saveModelsCall"
                ref="editorRef"
              />
              <editor
                v-else
                context="main-sql"
                :containerHeight="containerHeight"
                :editorId="activeEditor"
                @save-editors="saveEditorsCall"
                ref="editorRef"
              />
            </template>
            <template #results="{ containerHeight }" v-if="activeEditorData">
              <results-view
                :editorData="activeEditorData"
                :containerHeight="containerHeight"
                :canOpenChat="canOpenChat"
                :runEditorQuery="runQuery"
                @llm-query-accepted="runQuery"
                @refresh-click="runQuery"
                @drilldown-click="drilldownClick"
                @content-change="handleEditorContentChange"
                @open-chat="handleOpenChat"
              >
              </results-view>
            </template>
          </vertical-split-layout>
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
          <dashboard :name="activeDashboard" @full-screen="toggleFullScreen" />
        </template>
        <template v-else-if="activeScreen === 'dashboard-import'">
          <dashboard-auto-importer
            @import-complete="handleImportComplete"
            @full-screen="toggleFullScreen"
          />
        </template>
        <template v-else-if="activeScreen === 'asset-import'">
          <asset-auto-importer
            @import-complete="handleAssetImportComplete"
            @full-screen="toggleFullScreen"
          />
        </template>
        <template v-else-if="activeScreen === 'community-models'">
          <community-models :activeCommunityModelKey="activeCommunityModelKey" />
        </template>
        <template v-else-if="activeScreen === 'jobs'">
          <jobs-view :activeJobsKey="activeJobsKey" />
        </template>
        <template v-else-if="activeScreen === 'llms'">
          <llm-view :initialTab="llmInitialTab" />
        </template>
        <template v-else>
          <welcome-page
            @screen-selected="setActiveScreen"
            @sidebar-screen-selected="setActiveSidebarScreen"
            @demo-started="startDemo"
            @documentation-key-selected="setActiveDocumentationKey"
          />
        </template>
      </TabbedBrowser>
    </sidebar-layout>
  </div>
</template>

<style scoped src="../components/layout/ideViewport.css"></style>
<style scoped>
.ide-context-manager {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  flex-shrink: 0;
}

.full-screen-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.full-screen-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.75rem 1rem;
  background: var(--query-window-bg, #fff);
  border-bottom: 1px solid var(--border-light, #e0e0e0);
  flex-shrink: 0;
}

.exit-fullscreen-btn {
  padding: 0.5rem 1rem;
  background: var(--primary-color, #0ea5e9);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.exit-fullscreen-btn:hover {
  background: var(--primary-color-hover, #0284c7);
}

aside {
  flex-shrink: 0;
}
</style>

<script lang="ts">
// Keep only essential layout components as synchronous
import SidebarLayout from '../components/layout/SidebarLayout.vue'
import TabbedBrowser from '../components/layout/TabbedBrowser.vue'
import VerticalSplitLayout from '../components/layout/VerticalSplitLayout.vue'
import CredentialBackgroundPage from './CredentialBackgroundPage.vue'
import PopupModal from '../components/PopupModal.vue'
import TipsCTA from '../components/TipsCTA.vue'
import Sidebar from '../components/sidebar/Sidebar.vue'

import type { EditorStoreType } from '../stores/editorStore.ts'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import TrilogyResolver from '../stores/resolver.ts'
import type QueryExecutionService from '../stores/queryExecutionService.ts'
import {
  inject,
  ref,
  computed,
  defineAsyncComponent,
  provide,
  onBeforeUnmount,
  onMounted,
  watch,
} from 'vue'
import type { Ref } from 'vue'
import { preloadAllScreensWhenIdle } from '../utility/screenPreloader'
import useScreenNavigation from '../stores/useScreenNavigation.ts'
import { getDefaultValueFromHash, removeHashFromUrl, URL_HASH_KEYS } from '../stores/urlStore.ts'
import type { ModalItem } from '../data/tips.ts'

import setupDemo from '../data/tutorial/demoSetup'
import { KeySeparator } from '../data/constants'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import type { DashboardStoreType } from '../stores/dashboardStore.ts'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'
import type { DrillDownEvent } from '../events/display.ts'
import UserSettings from '../components/user/UserSettings.vue'
import UserProfile from '../components/user/UserProfile.vue'
import { defineComponent, type Component } from 'vue'
import PageLoading from '../components/PageLoading.vue'

const asyncPage = (loader: () => Promise<any>) =>
  defineAsyncComponent({
    loader,
    loadingComponent: PageLoading,
    delay: 150,
  })

// Lazy load all page components
const TutorialPage = asyncPage(() => import('./TutorialPage.vue'))
const Editor = asyncPage(() => import('../components/editor/Editor.vue'))
const WelcomePage = asyncPage(() => import('./WelcomePage.vue'))
const Dashboard = asyncPage(() => import('../components/dashboard/Dashboard.vue'))
const ResultsView = defineAsyncComponent(() => import('../components/editor/ResultComponent.vue'))

// Lazy load all view components
const ModelView = asyncPage(() => import('./ModelView.vue'))
const CommunityModels = asyncPage(() => import('../components/community/CommunityModels.vue'))
const JobsView = asyncPage(() => import('../components/jobs/JobsView.vue'))
const ConnectionView = asyncPage(() => import('./ConnectionView.vue'))
const LLMView = asyncPage(() => import('./LLMView.vue'))
const AssetAutoImporter = defineAsyncComponent(() => import('../components/AssetAutoImporter.vue'))
const ChatCreatorModal = defineAsyncComponent(
  () => import('../components/llm/ChatCreatorModal.vue'),
)
const ConnectionErrorPopup = defineAsyncComponent(
  () => import('../components/ConnectionErrorPopup.vue'),
)

// Lazy load utility components
const ErrorMessage = defineAsyncComponent(() => import('../components/ErrorMessage.vue'))
const LoadingButton = defineAsyncComponent(() => import('../components/LoadingButton.vue'))
const DataTable = defineAsyncComponent(() => import('../components/DataTable.vue'))

export interface IDEProps {
  showingCredentialPrompt?: boolean
}

const IDEComponent: Component = defineComponent({
  name: 'IDEComponent',
  data() {
    return {
      activeTab: 'results',
    }
  },
  props: {
    showingCredentialPrompt: {
      type: Boolean,
      default: false,
    },
  } as const,
  components: {
    // Synchronous components (always needed)
    SidebarLayout,
    TabbedBrowser,
    VerticalSplitLayout,
    CredentialBackgroundPage,
    PopupModal,
    TipsCTA,

    // Lazy loaded components (kebab-case for template usage)
    sidebar: Sidebar,
    editor: Editor,
    'tutorial-page': TutorialPage,
    'model-view': ModelView,
    'user-settings': UserSettings,
    'user-profile': UserProfile,
    'welcome-page': WelcomePage,
    dashboard: Dashboard,
    'community-models': CommunityModels,
    'jobs-view': JobsView,
    'llm-view': LLMView,
    'connection-view': ConnectionView,
    'results-view': ResultsView,
    'dashboard-auto-importer': AssetAutoImporter,
    'asset-auto-importer': AssetAutoImporter,
    ChatCreatorModal,
    'connection-error-popup': ConnectionErrorPopup,

    // Utility components (may not be used in template but included for completeness)
    'error-message': ErrorMessage,
    'loading-button': LoadingButton,
    'data-table': DataTable,
  },
  setup() {
    // Create a ref for the editor component
    const editorRef = ref<typeof Editor | null>(null)
    type ResolverType = typeof TrilogyResolver
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const userSettingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    const llmConnectionStore = inject<any>('llmConnectionStore', null)
    // Hydration flag from Manager; the demo deep link waits on it so it doesn't
    // race persisted state loading and get clobbered by loadConnections.
    const storesLoaded = inject<Ref<boolean>>('storesLoaded', ref(true))

    let modelStore = inject<ModelConfigStoreType>('modelStore')
    let dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const trilogyResolver = inject<ResolverType>('trilogyResolver')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
    let saveEditors = inject<Function>('saveEditors')
    let saveConnections = inject<Function>('saveConnections')
    let saveModels = inject<Function>('saveModels')
    let saveDashboards = inject<Function>('saveDashboards')
    let saveAll = inject<Function>('saveAll')

    if (
      !editorStore ||
      !connectionStore ||
      !dashboardStore ||
      !userSettingsStore ||
      !trilogyResolver ||
      !modelStore ||
      !saveConnections ||
      !saveDashboards ||
      !saveEditors ||
      !saveModels ||
      !saveAll
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
      activeModelKey,
      activeDocumentationKey,
      activeConnectionKey,
      activeLLMConnectionKey,
      activeCommunityModelKey,
      activeJobsKey,
      activeDashboard,
      setActiveScreen,
      setActiveSidebarScreen,
      activeSidebarScreen,
      setActiveEditor,
      setActiveModelKey,
      setActiveCommunityModelKey,
      setActiveJobsKey,
      setActiveDocumentationKey,
      setActiveConnectionKey,
      setActiveLLMConnectionKey,
      setActiveDashboard,
      onInitialLoad,
      showTipModal,
      displayedTips,
      fullScreen,
      toggleFullScreen,
      addBackListeners,
      removeBacklisteners,
    } = screenNavigation

    onInitialLoad()
    addBackListeners()

    // Warm the remaining screen chunks once the initial screen has settled,
    // so navigation doesn't flash a blank pane while a chunk downloads.
    onMounted(() => {
      preloadAllScreensWhenIdle()
    })

    // on unmount, remove back listeners
    onBeforeUnmount(() => {
      removeBacklisteners()
    })

    provide('navigationStore', screenNavigation)

    const markTipRead = userSettingsStore.markTipRead
    const handleTipRead = (id: string) => {
      markTipRead(id)
    }

    // Tips surface as a bottom-right CTA instead of an auto-opening modal.
    // showTipModal (set by tab navigation when unread tips exist) now drives
    // the CTA's pulse; the popup itself only opens on click.
    const tipsExpanded = ref(false)
    const expandedTips = ref<ModalItem[]>([])
    const unreadDisplayedTips = computed(() => {
      if (userSettingsStore.settings.skipAllTips) {
        return []
      }
      const read = userSettingsStore.settings.tipsRead || []
      return displayedTips.value.filter((tip) => !read.includes(tip.id))
    })
    const hasUnreadTips = computed(() => unreadDisplayedTips.value.length > 0)
    const unreadTipCount = computed(() => unreadDisplayedTips.value.length)
    const expandTips = () => {
      // Snapshot so marking tips read mid-sequence doesn't reshuffle the popup
      expandedTips.value = unreadDisplayedTips.value
      tipsExpanded.value = true
      showTipModal.value = false
    }
    const closeTipModal = () => {
      tipsExpanded.value = false
    }

    // LLM view tab management
    const llmInitialTab = ref<'chat' | 'validation' | ''>('')

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
      // Reset the tab after a short delay so subsequent navigations work correctly
      setTimeout(() => {
        llmInitialTab.value = ''
      }, 100)
    }

    // Chat creator modal management
    const showChatCreatorModal = ref(false)
    const chatCreatorPreselectedConnection = ref('')

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
      saveAll,
      modelStore,
      activeScreen,
      activeModelKey,
      setActiveModelKey,
      activeCommunityModelKey,
      activeJobsKey,
      setActiveCommunityModelKey,
      setActiveJobsKey,
      activeDocumentationKey,
      setActiveDocumentationKey,
      activeConnectionKey,
      setActiveConnectionKey,
      activeLLMConnectionKey,
      setActiveLLMConnectionKey,
      setActiveScreen,
      activeSidebarScreen,
      setActiveSidebarScreen,
      activeEditor,
      setActiveEditor,
      activeDashboard,
      setActiveDashboard,
      editorRef,
      llmConnectionStore,
      displayedTips,
      fullScreen,
      markTipRead,
      handleTipRead,
      closeTipModal,
      showTipModal,
      tipsExpanded,
      expandedTips,
      hasUnreadTips,
      unreadTipCount,
      expandTips,
      toggleFullScreen,
      llmInitialTab,
      handleLLMOpenView,
      showChatCreatorModal,
      chatCreatorPreselectedConnection,
      handleCreateNewChat,
      handleChatCreated,
      storesLoaded,
      sidebarCollapsed: ref(false),
    }
  },
  async mounted() {
    // #demo=true deep link: land directly in the demo editor, connected.
    if (getDefaultValueFromHash(URL_HASH_KEYS.DEMO, '') === 'true') {
      // Wait for persisted state to hydrate first; running the demo setup
      // before loadConnections finishes would let hydration overwrite the
      // freshly-created (and connecting) demo connection, leaving it
      // disconnected. It also lets setupDemo's idempotency check see any
      // existing demo editor and reuse it instead of recreating it.
      await this.waitForStoresLoaded()
      await this.startDemo()
      removeHashFromUrl(URL_HASH_KEYS.DEMO)
    }
  },
  methods: {
    saveEditorsCall() {
      this.saveAll()
    },
    saveModelsCall() {
      this.saveModels()
    },
    async runQuery() {
      if (this.editorRef) {
        return await this.editorRef.runQuery()
      }
    },
    drilldownClick(e: DrillDownEvent) {
      if (this.editorRef) {
        this.editorRef.drilldownQuery(e.remove, e.add, e.filter)
      }
    },
    handleEditorContentChange(content: string) {
      // Update the Monaco editor directly when content changes from refinement
      if (this.editorRef) {
        this.editorRef.setContent(content)
      }
    },
    handleOpenChat() {
      // Open LLM refinement chat on the editor
      if (this.editorRef) {
        this.editorRef.openLLMRefinement()
      }
    },
    waitForStoresLoaded(): Promise<void> {
      if (this.storesLoaded) return Promise.resolve()
      return new Promise((resolve) => {
        const stop = watch(
          () => this.storesLoaded,
          (loaded) => {
            if (loaded) {
              stop()
              resolve()
            }
          },
        )
      })
    },
    async startDemo() {
      let editor = await setupDemo(
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
      this.setActiveEditor(editor)
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
    canOpenChat(): boolean {
      // Check if LLM connections are available
      return !!(
        this.llmConnectionStore && Object.keys(this.llmConnectionStore.connections || {}).length > 0
      )
    },
    editorList() {
      return Object.keys(this.editors).map((editor) => this.editors[editor])
    },
    editors() {
      return this.editorStore.editors
    },
  },
})

export default IDEComponent
</script>
