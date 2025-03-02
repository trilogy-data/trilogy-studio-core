<template>
  <div v-if="currentData" class="tutorial-container">
    <section id="navigation" class="tutorial-section">
      <h2>{{ currentData.title }}</h2>
      <template v-for="paragraph in currentData.paragraphs">
        <highlight-component v-if="paragraph.type === 'tip'" type="tip">
          {{ paragraph.content }}</highlight-component
        >
        <pre v-else-if="paragraph.type === 'code'">{{ paragraph.content }}</pre>
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
    <section id="navigation" class="tutorial-section" v-if="currentTopic === 'Connections'">
      <connection-list :connections="connectionStore.connections" />
    </section>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ModelConfigStoreType } from '../stores/modelStore'
import LoadingButton from './LoadingButton.vue'

import HighlightComponent from './HighlightComponent.vue'
import ModelCard from './ModelCard.vue'
import ConnectionList from './ConnectionList.vue'
import setupDemo from '../data/tutorial/demoSetup'
import { documentation } from '../data/tutorial/documentation'
import { KeySeparator } from '../data/constants'
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
    const saveEditors = inject<Function>('saveEditors')
    const saveConnections = inject<Function>('saveConnections')
    const saveModels = inject<Function>('saveModels')
    if (
      !editorStore ||
      !connectionStore ||
      !modelStore ||
      !saveEditors ||
      !saveConnections ||
      !saveModels
    ) {
      throw new Error('Editor store is not provided!')
    }
    return { editorStore, connectionStore, modelStore, saveEditors, saveConnections, saveModels }
  },
  components: {
    LoadingButton,
    ConnectionList,
    ModelCard,
    HighlightComponent,
  },
  computed: {
    demoConfig() {
      return this.modelStore.models['demo-model']
    },
    currentNode() {
      if (!this.activeDocumentationKey) {
        return 'Studio'
      }
      return this.activeDocumentationKey.split(KeySeparator)[1]
    },
    currentTopic() {
      if (!this.activeDocumentationKey) {
        return 'Navigation'
      }
      return this.activeDocumentationKey.split(KeySeparator)[2]
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
        this.saveEditors,
        this.saveConnections,
        this.saveModels,
      )
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
</style>
