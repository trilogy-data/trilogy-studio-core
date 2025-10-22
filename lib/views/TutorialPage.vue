<template>
  <div v-if="currentData" class="section-header">{{ currentData.title }}</div>
  <div v-if="currentData" class="tutorial-container">
    <section id="navigation" class="tutorial-section">
      <template v-for="paragraph in currentData.paragraphs">
        <highlight-component v-if="paragraph.type === 'tip'" type="tip">
          {{ paragraph.content }}</highlight-component
        >
        <highlight-component v-else-if="paragraph.type === 'warning'" type="warning">
          {{ paragraph.content }}</highlight-component
        >
        <code-block
          v-else-if="paragraph.type === 'code'"
          language="trilogy"
          :content="paragraph.content"
        ></code-block>
        <connection-list
          v-else-if="paragraph.type === 'connections'"
          :connections="connectionStore.connections"
          testTag="tutorial"
        />
        <div v-else-if="paragraph.type === 'llm-connections'" class="llm-connections">
          <LLMConnectionList :connections="llmConnectionStore.connections" />
        </div>
        <editor-list
          v-else-if="paragraph.type === 'editors'"
          :connections="editorStore.editors"
          testTag="tutorial"
        />
        <tutorial-prompt
          v-else-if="paragraph.type === 'tutorial-prompts' && demoEditorCorrect"
          :prompts="paragraph.data.prompts || []"
          :context="paragraph.data.context || 'main-trilogy'"
          editorId="my-first-editor"
        />
        <tutorial-function
          v-else-if="paragraph.type === 'function' && paragraph.data.function"
          :name="paragraph.title"
          :description="paragraph.content"
          :func="paragraph.data.function"
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
                : `Almost there! "my-first-editor" not found under ${demoConnectionName} and is required to continue. The
            Welcome and Query Tutorial will show you how to create it.`
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
        <div v-else-if="paragraph.type === 'demo-editor' && demoEditorCorrect">
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
              :containerHeight="500"
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
        <community-models
          v-else-if="paragraph.type === 'community-models'"
          activeCommunityModelKey="trilogy-data-trilogy-public-models-main"
          initialSearch="demo"
        />
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
import TutorialFunction from '../components/tutorial/TutorialFunction.vue'
import LoadingButton from '../components/LoadingButton.vue'

import HighlightComponent from '../components/HighlightComponent.vue'
import ModelCard from '../components/model/ModelCard.vue'
import ConnectionList from '../components/sidebar/ConnectionList.vue'
import EditorList from '../components/sidebar/EditorList.vue'
import setupDemo from '../data/tutorial/demoSetup'
import Editor from '../components/editor/Editor.vue'
import { documentation } from '../data/tutorial/documentation'
import { KeySeparator } from '../data/constants'

import { type DashboardStoreType } from '../stores/dashboardStore'

import ResultsView from '../components/editor/ResultComponent.vue'
import CommunityModels from '../components/community/CommunityModels.vue'
import LLMConnectionList from '../components/sidebar/LLMConnectionList.vue'
import Dashboard from '../components/dashboard/Dashboard.vue'
import CodeBlock from '../components/CodeBlock.vue'
import TutorialPrompt from '../components/tutorial/TutorialPrompt.vue'

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
    TutorialFunction,
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
      return fromUrl
    },
    currentData() {
      if (!this.currentTopic) {
        return documentation.find((topic) => topic.title === this.currentNode)?.articles[0]
      }
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
.tutorial-container {
  padding: 5px 20px;
  color: var(--text-color);
  overflow-y: auto;
}

.tutorial-section {
  margin-bottom: 2rem;
}

.editor {
  border: 1px solid var(--border-color);
}

.dashboard {
  height: 800px;
  border: 1px solid var(--border-color);
}

.editor-top {
  height: 500px;
}

.llm-connections {
  height: 150px;
}

.editor-bottom {
  height: 800px;
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

@media screen and (max-width: 768px) {
  .editor-top {
    height: 700px;
  }

  .editor {
    height: 900px;
  }
}
</style>
