<template>
  <div v-if="currentData" class="tutorial-container">
    <section id="navigation" class="tutorial-section">
      <h2>{{ currentData.title }}</h2>
      <template v-for="paragraph in currentData.paragraphs">
        <highlight-component v-if="paragraph.type === 'tip'" type="tip">
          {{ paragraph.content }}</highlight-component
        >

        <code-block
          v-else-if="paragraph.type === 'code'"
          language="sql"
          :content="paragraph.content"
        ></code-block>
        <connection-list
          v-else-if="paragraph.type === 'connections'"
          :connections="connectionStore.connections"
        />
        <div v-else-if="paragraph.type === 'llm-connections'" class="editor-top">
          <LLMConnectionList :connections="llmConnectionStore.connections" />
        </div>
        <editor-list
          v-else-if="paragraph.type === 'editors' && demoEditorCorrect"
          :connections="editorStore.editors"
          testTag="tutorial"
        />
        <tutorial-prompt
          v-else-if="paragraph.type === 'tutorial-prompts'"
          :prompts="paragraph.data.prompts || []"
          :context="paragraph.data.context || 'main-trilogy'"
          editorId="my-first-editor"
        />

        <div v-else-if="paragraph.type === 'connection-validator'">
          <div
            :class="['test-result', demoConnectionCorrect ? 'passed' : 'failed']"
            data-testid="demo-connection-validator"
          >
            {{
              demoConnectionCorrect
                ? `Great work: "${demoConnectionName}" found and connected with right model ✓`
                : `Almost there! "${demoConnectionName}" not found, wrong model, or not connected ✗`
            }}
          </div>
        </div>
        <div v-else-if="paragraph.type === 'editor-validator'">
          <div
            :class="['test-result', demoEditorCorrect ? 'passed' : 'failed']"
            data-testid="editor-validator"
          >
            {{
              demoEditorCorrect
                ? 'Great work: "my-first-editor" found and connected with right model ✓'
                : `Almost there! "my-first-editor" not found under ${demoConnectionName}`
            }}
          </div>
        </div>
        <div v-else-if="paragraph.type === 'model-validator'">
          <div
            :class="['test-result', demoModelCorrect ? 'passed' : 'failed']"
            data-testid="model-validator"
          >
            {{
              demoModelCorrect
                ? `Great work: "${demoModelName}" found ✓`
                : `Almost there! "${demoModelName}" not found under local models`
            }}
          </div>
        </div>
        <div v-else-if="paragraph.type === 'demo-editor' && demoEditorCorrect" class="editor">
          <div class="editor-top">
            <editor
              context="main-trilogy"
              editorId="my-first-editor"
              @save-editors="saveEditorsCall"
            />
          </div>
          <div class="editor-bottom">
            <results-view
              :editorData="editorStore.editors['my-first-editor']"
              :containerHeight="200"
            />
          </div>
        </div>
        <div
          v-else-if="paragraph.type === 'dashboard' && demoModelCorrect && demoDashboardID"
          class="dashboard"
        >
          <dashboard
            :name="demoDashboardID"
            connectionId="demo-model-connection"
            :viewMode="true"
          />
        </div>
        <community-models v-else-if="paragraph.type === 'community-models'" initialSearch="demo" />
        <p v-else v-html="paragraph.content"></p>
      </template>
    </section>
    <section id="navigation" class="tutorial-section" v-if="currentTopic === 'Models'">
      <model-card :config="demoConfig" />
    </section>
    <section
      id="navigation"
      class="tutorial-section"
      v-if="currentTopic === 'Overview' && currentNode === 'Demo'"
    >
      <loading-button :action="setupDemo">Reset Demo</loading-button>
    </section>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import LoadingButton from './LoadingButton.vue'

import HighlightComponent from './HighlightComponent.vue'
import ModelCard from './ModelCard.vue'
import ConnectionList from './ConnectionList.vue'
import EditorList from './EditorList.vue'
import setupDemo from '../data/tutorial/demoSetup'
import Editor from './Editor.vue'
import { documentation } from '../data/tutorial/documentation'
import { KeySeparator } from '../data/constants'

import { type DashboardStoreType } from '../stores/dashboardStore'

import ResultsView from './ResultsView.vue'
import CommunityModels from './CommunityModels.vue'
import LLMConnectionList from './LLMConnectionList.vue'
import Dashboard from './Dashboard.vue'
import CodeBlock from './CodeBlock.vue'
import TutorialPrompt from './TutorialPrompt.vue'

const defaultDocumentationKey = 'Studio'
const defaultDocumentationTopic = 'Welcome'

const demoConnectionName = 'demo-model-connection'
const demoModelName = 'demo-model'

export default {
  name: 'TutorialComponent',
  props: {
    activeDocumentationKey: {
      type: String,
      default: '',
      optional: true,
    },
  },

  setup() {
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const saveEditors = inject<Function>('saveEditors')
    const saveConnections = inject<Function>('saveConnections')
    const saveModels = inject<Function>('saveModels')
    const saveDashboards = inject<Function>('saveDashboards')

    if (!editorStore || !connectionStore || !modelStore || !dashboardStore || !llmConnectionStore) {
      throw new Error('Demo requires more stores!')
    }

    const demoDashboardID = Object.values(dashboardStore?.dashboards).find(
      (d) => d.name === 'example-dashboard' && d.connection === 'demo-model-connection',
    )?.id

    if (
      !editorStore ||
      !connectionStore ||
      !modelStore ||
      !dashboardStore ||
      !llmConnectionStore ||
      !saveEditors ||
      !saveConnections ||
      !saveModels ||
      !saveDashboards
    ) {
      throw new Error('Editor store is not provided!')
    }
    return {
      editorStore,
      connectionStore,
      dashboardStore,
      llmConnectionStore,
      modelStore,
      saveEditors,
      saveConnections,
      saveModels,
      saveDashboards,
      demoConnectionName,
      demoModelName,
      demoDashboardID,
    }
  },
  components: {
    LoadingButton,
    ConnectionList,
    LLMConnectionList,
    EditorList,
    ModelCard,
    HighlightComponent,
    Editor,
    ResultsView,
    CommunityModels,
    CodeBlock,
    TutorialPrompt,
    Dashboard,
  },
  computed: {
    demoConfig() {
      return this.modelStore.models[demoModelName]
    },
    demoModelCorrect() {
      return this.modelStore.models[demoModelName]?.name === demoModelName
    },
    demoConnectionCorrect() {
      return (
        this.connectionStore.connections[demoConnectionName]?.connected &&
        this.connectionStore.connections[demoConnectionName]?.model === demoModelName
      )
    },
    demoEditorCorrect() {
      return (
        this.editorStore.editors['my-first-editor'] &&
        this.editorStore.editors['my-first-editor']?.connection === demoConnectionName
      )
    },
    currentNode() {
      if (!this.activeDocumentationKey) {
        return defaultDocumentationKey
      }
      return this.activeDocumentationKey.split(KeySeparator)[1]
    },
    currentTopic() {
      if (!this.activeDocumentationKey) {
        return defaultDocumentationTopic
      }
      let fromUrl = this.activeDocumentationKey.split(KeySeparator)[2]
      return fromUrl || defaultDocumentationTopic
    },
    currentData() {
      return documentation
        .find((topic) => topic.title === this.currentNode)
        ?.articles.find((article) => article.title === this.currentTopic)
    },
  },
  methods: {
    setupDemo() {
      setupDemo(
        this.editorStore,
        this.connectionStore,
        this.modelStore,
        this.dashboardStore,
        this.saveEditors,
        this.saveConnections,
        this.saveModels,
        this.saveDashboards,
      )
    },
    saveEditorsCall() {
      this.saveEditors()
    },
  },
}
</script>

<style scoped>
.sidebar-tutorial-container {
  max-width: 450px;
}

.tutorial-container {
  padding: 1rem;
  color: var(--text-color);
  overflow-y: scroll;
  max-width: 800px;
}

.tutorial-section {
  margin-bottom: 2rem;
}

.editor {
  height: 500px;
  border: 1px solid var(--border-color);
}

.dashboard {
  height: 800px;
  border: 1px solid var(--border-color);
}

.editor-top {
  height: 300px;
}

.editor-bottom {
  height: 200px;
}

.test-result {
  margin-top: 8px;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.9em;
  font-weight: bold;
}

.test-result.passed {
  background-color: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
}

.test-result.failed {
  background-color: #ffd580;
  color: hsl(210, 100%, 50%, 0.75);
}
</style>
