<template>
  <div v-if="currentData" class="tutorial-container">
    <section id="navigation" class="tutorial-section">
      <h2>{{ currentData.title }}</h2>
      <template v-for="paragraph in currentData.paragraphs">
        <highlight-component v-if="paragraph.type === 'tip'" type="tip">
          {{ paragraph.content }}</highlight-component>

        <pre
          v-else-if="paragraph.type === 'code'"><code ref="codeBlock" class="language-sql">{{ paragraph.content }}</code></pre>
        <connection-list v-else-if="paragraph.type === 'connections'" :connections="connectionStore.connections" />
        <div v-else-if="paragraph.type === 'llm-connections'" class="editor-top">
          <LLMConnectionList :connections="llmConnectionStore.connections" />
        </div>
        <editor-list v-else-if="paragraph.type === 'editors'" :connections="editorStore.editors" />
        <div v-else-if="paragraph.type === 'connection-validator'">
          <div :class="['test-result', demoConnectionCorrect ? 'passed' : 'failed']">
            State: {{ demoConnectionCorrect ? '"demo-connection" found and connected with right model ✓' :
              '"demo-connection" not found, wrong model, or not connected ✗' }}
          </div>
        </div>
        <div v-else-if="paragraph.type === 'editor-validator'">
          <div :class="['test-result', demoEditorCorrect ? 'passed' : 'failed']">
            State: {{ demoEditorCorrect ? '"my-first-editor" found and connected with right model ✓' :
              '"my-first-editor" not found under demo-connection' }}
          </div>
        </div>
        <div v-else-if="paragraph.type === 'model-validator'">
          <div :class="['test-result', demoModelCorrect ? 'passed' : 'failed']">
            State: {{ demoModelCorrect ? '"demo-model" found ✓' :
              '"demo-model" not found under local models' }}
          </div>
        </div>
        <div v-else-if="paragraph.type === 'demo-editor' && demoEditorCorrect" class="editor">
          <div class="editor-top">
            <editor context="main-trilogy" editorName="my-first-editor" @save-editors="saveEditorsCall" />
          </div>
          <div class="editor-bottom">
            <results-view :editorData="editorStore.editors['my-first-editor']" :containerHeight="300" />
          </div>
        </div>
        <community-models v-else-if="paragraph.type === 'community-models'" />
        <p v-else v-html="paragraph.content"></p>

      </template>
    </section>
    <section id="navigation" class="tutorial-section" v-if="currentTopic === 'Models'">
      <model-card :config="demoConfig" />
    </section>
    <section id="navigation" class="tutorial-section" v-if="currentTopic === 'Overview' && currentNode === 'Demo'">
      <loading-button :action="setupDemo">Reset Demo</loading-button>
    </section>

  </div>
</template>

<script lang="ts">
import { inject, ref, onMounted, onUpdated } from 'vue'
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
import Prism from 'prismjs'
import ResultsView from './ResultsView.vue'
import CommunityModels from './CommunityModels.vue'
import LLMConnectionList from './LLMConnectionList.vue'

const defaultDocumentationKey = 'Studio'
const defaultDocumentationTopic = 'Welcome'

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
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const saveEditors = inject<Function>('saveEditors')
    const saveConnections = inject<Function>('saveConnections')
    const saveModels = inject<Function>('saveModels')
    const codeBlock = ref<HTMLElement | null>(null)
    const updateRefs = () => {
      if (codeBlock.value) {
        if (Array.isArray(codeBlock.value)) {
          codeBlock.value.forEach((block) => {
            if (block) Prism.highlightElement(block)
          })
        } else if (codeBlock.value) {
          Prism.highlightElement(codeBlock.value)
        }
      }
    }
    onMounted(() => {
      updateRefs()
    })
    onUpdated(() => {
      updateRefs()
    })
    if (
      !editorStore ||
      !connectionStore ||
      !modelStore ||
      !llmConnectionStore ||
      !saveEditors ||
      !saveConnections ||
      !saveModels
    ) {
      throw new Error('Editor store is not provided!')
    }
    return {
      editorStore,
      connectionStore,
      llmConnectionStore,
      modelStore,
      saveEditors,
      saveConnections,
      saveModels,
      codeBlock,
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
  },
  computed: {
    demoConfig() {
      return this.modelStore.models['demo-model']
    },
    demoModelCorrect() {
      return this.modelStore.models['demo-model']?.name === 'demo-model'
    },
    demoConnectionCorrect() {
      return this.connectionStore.connections['demo-connection']?.connected && this.connectionStore.connections['demo-connection']?.model === 'demo-model'
    },
    demoEditorCorrect() {
      return this.editorStore.editors['my-first-editor'] && this.editorStore.editors['my-first-editor']?.connection === 'demo-connection'
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
      console.log(this.currentNode, this.currentTopic)
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
        this.saveEditors,
        this.saveConnections,
        this.saveModels,
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
  height: 600px;
  border: 1px solid var(--border-color);
}

.editor-top {
  height: 300px;
}

.editor-bottom {
  height: 300px;
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
  background-color: rgba(244, 67, 54, 0.1);
  color: #c62828;
}
</style>
