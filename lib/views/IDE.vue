<template>
  <div class="main">
    <!-- Full screen mode - no sidebar -->
    <div v-if="isFullScreen" class="full-screen-container">
      <template v-if="activeScreen === 'dashboard'">
        <dashboard :name="activeDashboardComputed" @full-screen="toggleFullScreen" />
      </template>
      <template v-else-if="activeScreen === 'dashboard-import'">
        <dashboard-auto-importer
          @import-complete="handleImportComplete"
          @full-screen="toggleFullScreen"
        />
      </template>
    </div>

    <!-- Normal mode with sidebar -->
    <sidebar-layout v-else>
      <template #sidebar>
        <sidebar
          @editor-selected="setActiveEditor"
          @screen-selected="setActiveScreen"
          @save-editors="saveEditorsCall"
          @model-key-selected="setActiveModelKey"
          @documentation-key-selected="setActiveDocumentationKey"
          @connection-key-selected="setActiveConnectionKey"
          @llm-key-selected="setActiveLLMConnectionKey"
          @dashboard-key-selected="setActiveDashboard"
          :active="activeScreen"
          :activeEditor="activeEditor"
          :activeDocumentationKey="activeDocumentationKey"
          :activeModelKey="activeModelKey"
          :activeConnectionKey="activeConnectionKey"
          :activeDashboardKey="activeDashboard"
        />
      </template>

      <template v-if="activeScreen && ['editors'].includes(activeScreen)">
        <vertical-split-layout>
          <template #editor v-if="activeEditor && activeEditorData">
            <editor
              v-if="activeEditorData.type == 'preql'"
              context="main-trilogy"
              :editorId="activeEditor"
              @save-editors="saveEditorsCall"
              @save-models="saveModelsCall"
              ref="editorRef"
            />
            <editor
              v-else
              context="main-sql"
              :editorId="activeEditor"
              @save-editors="saveEditorsCall"
              ref="editorRef"
            />
          </template>
          <template #results="{ containerHeight }" v-if="activeEditorData">
            <ResultsView
              :editorData="activeEditorData"
              :containerHeight="containerHeight"
              @llm-query-accepted="runQuery"
              @refresh-click="runQuery"
            ></ResultsView>
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
        <dashboard :name="activeDashboardComputed" @full-screen="toggleFullScreen" />
      </template>
      <template v-else-if="activeScreen === 'dashboard-import'">
        <dashboard-auto-importer
          @import-complete="handleImportComplete"
          @full-screen="toggleFullScreen"
        />
      </template>
      <template v-else-if="activeScreen === 'community-models'">
        <community-models />
      </template>
      <template v-else-if="activeScreen === 'llms'">
        <LLMView />
      </template>
      <template v-else>
        <welcome-page
          @screen-selected="setActiveScreen"
          @demo-started="startDemo"
          @documentation-key-selected="setActiveDocumentationKey"
        />
      </template>
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
import SidebarLayout from '../components/layout/SidebarLayout.vue'
import VerticalSplitLayout from '../components/layout/VerticalSplitLayout.vue'
import ErrorMessage from '../components/ErrorMessage.vue'
import LoadingButton from '../components/LoadingButton.vue'
import ModelView from './ModelView.vue'
import UserSettings from '../components/user/UserSettings.vue'
import UserProfile from '../components/user/UserProfile.vue'
import CommunityModels from '../components/community/CommunityModels.vue'
import ConnectionView from './ConnectionView.vue'
import DashboardAutoImporter from '../components/dashboard/DashboardAutoImporter.vue'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import TrilogyResolver from '../stores/resolver.ts'
import { getDefaultValueFromHash, pushHashToUrl } from '../stores/urlStore'
import { inject, ref, defineAsyncComponent, onMounted } from 'vue'
import useScreenNavigation from '../stores/useScreenNavigation.ts'

import setupDemo from '../data/tutorial/demoSetup'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import type { DashboardStoreType } from '../stores/dashboardStore.ts'

const TutorialPage = defineAsyncComponent(() => import('./TutorialPage.vue'))
const Sidebar = defineAsyncComponent(() => import('../components/sidebar/Sidebar.vue'))
const Editor = defineAsyncComponent(() => import('../components/editor/Editor.vue'))
const DataTable = defineAsyncComponent(() => import('../components/DataTable.vue'))
const WelcomePage = defineAsyncComponent(() => import('./WelcomePage.vue'))
const Dashboard = defineAsyncComponent(() => import('../components/dashboard/Dashboard.vue'))
const ResultsView = defineAsyncComponent(() => import('../components/editor/ResultComponent.vue'))
const LLMView = defineAsyncComponent(() => import('./LLMView.vue'))

export default {
  name: 'IDEComponent',
  data() {
    let activeModelKey = getDefaultValueFromHash('modelKey')
    let activeDocumentationKey = getDefaultValueFromHash('documentationKey')
    let activeConnectionKey = getDefaultValueFromHash('connection')
    return {
      activeModelKey: activeModelKey ? activeModelKey : '',
      activeDocumentationKey: activeDocumentationKey ? activeDocumentationKey : '',
      activeConnectionKey: activeConnectionKey ? activeConnectionKey : '',
      activeTab: 'results',
      isFullScreen: false,
    }
  },
  components: {
    Sidebar,
    Editor,
    DataTable,
    SidebarLayout,
    VerticalSplitLayout,
    ErrorMessage,
    TutorialPage,
    ModelView,
    UserSettings,
    UserProfile,
    WelcomePage,
    Dashboard,
    LoadingButton,
    CommunityModels,
    LLMView,
    ConnectionView,
    ResultsView,
    DashboardAutoImporter,
  },
  setup() {
    // Create a ref for the editor component
    const editorRef = ref<typeof Editor | null>(null)
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
    let saveAll = inject<Function>('saveAll')

    if (
      !editorStore ||
      !connectionStore ||
      !dashboardStore ||
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
    let editor = getDefaultValueFromHash('editor')
    if (editor) {
      editorStore.activeEditorId = editor
    }
    const screenNavigation = useScreenNavigation()
    const {
      activeScreen,
      activeEditor,
      activeDashboard,
      setActiveScreen,
      setActiveEditor,
      setActiveDashboard,
    } = screenNavigation

    // Check for auto-import parameters on mount
    onMounted(() => {
      const importUrl = getDefaultValueFromHash('import', '')
      const connectionType = getDefaultValueFromHash('connection', '')

      // If we have import parameters, trigger auto-import mode
      if (importUrl && connectionType) {
        setActiveScreen('dashboard-import')
      }
    })

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
      setActiveScreen,
      activeEditor,
      setActiveEditor,
      activeDashboard,
      setActiveDashboard,
      editorRef,
    }
  },
  methods: {
    setActiveModelKey(modelKey: string) {
      pushHashToUrl('modelKey', modelKey)
      this.activeModelKey = modelKey
    },
    setActiveDocumentationKey(documentationKey: string) {
      pushHashToUrl('documentationKey', documentationKey)
      this.activeDocumentationKey = documentationKey
    },
    setActiveConnectionKey(connectionKey: string) {
      pushHashToUrl('connection', connectionKey)
      this.activeConnectionKey = connectionKey
    },
    setActiveLLMConnectionKey(connectionKey: string) {
      pushHashToUrl('llm', connectionKey)
      this.activeConnectionKey = connectionKey
    },
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
    toggleFullScreen(status: boolean) {
      this.isFullScreen = status
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
    activeDashboardComputed() {
      return this.activeDashboard
    },
  },
}
</script>
