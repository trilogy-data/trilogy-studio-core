<template>
  <div class="main">
    <sidebar-layout>
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
            />
            <editor
              v-else
              context="main-sql"
              :editorId="activeEditor"
              @save-editors="saveEditorsCall"
            />
          </template>
          <template #results="{ containerHeight }" v-if="activeEditorData">
            <ResultsView
              :editorData="activeEditorData"
              :containerHeight="containerHeight"
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
        <dashboard :name="activeDashboard" />
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
import SidebarLayout from '../components/SidebarLayout.vue'
import Sidebar from '../components/Sidebar.vue'
import Editor from '../components/Editor.vue'
import DataTable from '../components/DataTable.vue'
import VerticalSplitLayout from '../components/VerticalSplitLayout.vue'
import ErrorMessage from '../components/ErrorMessage.vue'
import LoadingButton from '../components/LoadingButton.vue'
import TutorialPage from '../components/TutorialPage.vue'
import ModelView from '../components/ModelView.vue'
import UserSettings from '../components/UserSettings.vue'
import UserProfile from '../components/UserProfile.vue'
import WelcomePage from '../components/WelcomePage.vue'
import Dashboard from '../components/Dashboard.vue'
import CommunityModels from '../components/CommunityModels.vue'
import LLMView from '../components/LLMView.vue'
import ConnectionView from '../components/ConnectionView.vue'
import ResultsView from '../components/ResultsView.vue'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import AxiosResolver from '../stores/resolver.ts'
import { getDefaultValueFromHash, pushHashToUrl } from '../stores/urlStore'
import { inject } from 'vue'
import useScreenNavigation from './useScreenNavigation'

import setupDemo from '../data/tutorial/demoSetup'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import type { DashboardStoreType } from '../stores/dashboardStore.ts'

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
  },
  setup() {
    type ResolverType = typeof AxiosResolver
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
      !saveDashboards ||
      !saveEditors ||
      !saveModels
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
    const {
      activeScreen,
      activeEditor,
      activeDashboard,
      setActiveScreen,
      setActiveEditor,
      setActiveDashboard,
    } = useScreenNavigation()
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
      activeScreen,
      setActiveScreen,
      activeEditor,
      setActiveEditor,
      activeDashboard,
      setActiveDashboard,
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
      this.saveEditors()
    },
    async startDemo() {
      await setupDemo(
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
      this.setActiveEditor('tutorial_one_basic_1')
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
