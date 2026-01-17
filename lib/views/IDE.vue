<template>
  <div class="main">
    <PopupModal
      v-if="showTipModal"
      title="Tips"
      :showModal="showTipModal"
      :activeItems="displayedTips"
      @mark-item-read="
        (id) => {
          markTipRead(id)
        }
      "
      @close-modal="
        () => {
          showTipModal = false
        }
      "
    />
    <ChatCreatorModal
      :visible="showChatCreatorModal"
      :preselectedConnection="chatCreatorPreselectedConnection"
      :activeDataConnection="activeConnectionKey"
      @close="showChatCreatorModal = false"
      @chat-created="handleChatCreated"
    />
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
    <sidebar-layout v-else>
      <template #sidebar="{ containerWidth }">
        <sidebar
          @editor-selected="setActiveEditor"
          @screen-selected="setActiveSidebarScreen"
          @save-editors="saveEditorsCall"
          @model-key-selected="setActiveModelKey"
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
          :activeConnectionKey="activeConnectionKey"
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
                @llm-query-accepted="runQuery"
                @refresh-click="runQuery"
                @drilldown-click="drilldownClick"
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

.full-screen-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.full-screen-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem 1rem;
  background: var(--bg-light, #f8f9fa);
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
// Keep only essential layout components as synchronous
import SidebarLayout from '../components/layout/SidebarLayout.vue'
import TabbedBrowser from '../components/layout/TabbedBrowser.vue'
import VerticalSplitLayout from '../components/layout/VerticalSplitLayout.vue'
import CredentialBackgroundPage from './CredentialBackgroundPage.vue'
import PopupModal from '../components/PopupModal.vue'

import type { EditorStoreType } from '../stores/editorStore.ts'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import TrilogyResolver from '../stores/resolver.ts'
import { inject, ref, defineAsyncComponent, provide, onBeforeUnmount } from 'vue'
import useScreenNavigation from '../stores/useScreenNavigation.ts'

import setupDemo from '../data/tutorial/demoSetup'
import { KeySeparator } from '../data/constants'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import type { DashboardStoreType } from '../stores/dashboardStore.ts'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'
import type { DrillDownEvent } from '../events/display.ts'
import UserSettings from '../components/user/UserSettings.vue'
import UserProfile from '../components/user/UserProfile.vue'
// Lazy load all page components
const TutorialPage = defineAsyncComponent(() => import('./TutorialPage.vue'))
const Sidebar = defineAsyncComponent(() => import('../components/sidebar/Sidebar.vue'))
const Editor = defineAsyncComponent(() => import('../components/editor/Editor.vue'))
const WelcomePage = defineAsyncComponent(() => import('./WelcomePage.vue'))
const Dashboard = defineAsyncComponent(() => import('../components/dashboard/Dashboard.vue'))
const ResultsView = defineAsyncComponent(() => import('../components/editor/ResultComponent.vue'))

// Lazy load all view components
const ModelView = defineAsyncComponent(() => import('./ModelView.vue'))
const CommunityModels = defineAsyncComponent(
  () => import('../components/community/CommunityModels.vue'),
)
const ConnectionView = defineAsyncComponent(() => import('./ConnectionView.vue'))
const LLMView = defineAsyncComponent(() => import('./LLMView.vue'))
const AssetAutoImporter = defineAsyncComponent(() => import('../components/AssetAutoImporter.vue'))
const ChatCreatorModal = defineAsyncComponent(
  () => import('../components/llm/ChatCreatorModal.vue'),
)

// Lazy load utility components
const ErrorMessage = defineAsyncComponent(() => import('../components/ErrorMessage.vue'))
const LoadingButton = defineAsyncComponent(() => import('../components/LoadingButton.vue'))
const DataTable = defineAsyncComponent(() => import('../components/DataTable.vue'))

export default {
  name: 'IDEComponent',
  data() {
    return {
      activeTab: 'results',
    }
  },
  //add an argument for if the credential prompt is up
  props: {
    showingCredentialPrompt: {
      type: Boolean,
      default: false,
    },
  },
  components: {
    // Synchronous components (always needed)
    SidebarLayout,
    TabbedBrowser,
    VerticalSplitLayout,
    CredentialBackgroundPage,
    PopupModal,

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
    'llm-view': LLMView,
    'connection-view': ConnectionView,
    'results-view': ResultsView,
    'dashboard-auto-importer': AssetAutoImporter,
    'asset-auto-importer': AssetAutoImporter,
    ChatCreatorModal,

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

    let modelStore = inject<ModelConfigStoreType>('modelStore')
    let dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const trilogyResolver = inject<ResolverType>('trilogyResolver')
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
      activeDashboard,
      setActiveScreen,
      setActiveSidebarScreen,
      activeSidebarScreen,
      setActiveEditor,
      setActiveModelKey,
      setActiveCommunityModelKey,
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

    // on unmount, remove back listeners
    onBeforeUnmount(() => {
      removeBacklisteners()
    })

    provide('navigationStore', screenNavigation)

    const markTipRead = userSettingsStore.markTipRead

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
      setActiveCommunityModelKey,
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
      displayedTips,
      fullScreen,
      markTipRead,
      showTipModal,
      toggleFullScreen,
      llmInitialTab,
      handleLLMOpenView,
      showChatCreatorModal,
      chatCreatorPreselectedConnection,
      handleCreateNewChat,
      handleChatCreated,
    }
  },
  methods: {
    saveEditorsCall() {
      this.saveAll()
    },
    saveModelsCall() {
      this.saveModels()
    },
    runQuery() {
      if (this.editorRef) {
        this.editorRef.runQuery()
      }
    },
    drilldownClick(e: DrillDownEvent) {
      if (this.editorRef) {
        this.editorRef.drilldownQuery(e.remove, e.add, e.filter)
      }
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
    editorList() {
      return Object.keys(this.editors).map((editor) => this.editors[editor])
    },
    editors() {
      return this.editorStore.editors
    },
  },
}
</script>
