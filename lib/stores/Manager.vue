<template>
  <IDE v-if="currentLayout === 'Desktop'" />
  <MobileIDE v-else />
</template>

<script lang="ts">
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import type { ModelConfigStoreType } from './modelStore'
import type { UserSettingsStoreType } from './userSettingsStore'
import type { LLMConnectionStoreType } from './llmStore'
import QueryResolver from './resolver'
import { provide, computed } from 'vue'
import type { PropType } from 'vue'
import { Storage } from '../data'
import { IDE, MobileIDE } from '../views'
export default {
  name: 'ContextManager',
  components: {
    IDE,
    MobileIDE,
  },
  props: {
    connectionStore: {
      type: Object as PropType<ConnectionStoreType>,
      required: true,
    },
    editorStore: {
      type: Object as PropType<EditorStoreType>,
      required: true,
    },
    modelStore: {
      type: Object as PropType<ModelConfigStoreType>,
      required: true,
    },
    userSettingsStore: {
      type: Object as PropType<UserSettingsStoreType>,
      required: true,
    },
    llmConnectionStore: {
      type: Object as PropType<LLMConnectionStoreType>,
      required: true,
    },
    trilogyResolver: {
      type: QueryResolver,
      required: true,
    },
    storageSources: {
      type: Array<Storage>,
      required: false,
      default: () => [],
    },
  },
  setup(props) {
    // provide('connections', props.connections);
    provide('editorStore', props.editorStore)
    provide('connectionStore', props.connectionStore)
    provide('modelStore', props.modelStore)
    provide('trilogyResolver', props.trilogyResolver)
    provide('storageSources', props.storageSources)
    provide('userSettingsStore', props.userSettingsStore)
    provide('llmConnectionStore', props.llmConnectionStore)
    for (let source of props.storageSources) {
      let editors = source.loadEditors()
      for (let editor of Object.values(editors)) {
        props.editorStore.addEditor(editor)
      }
      source.loadConnections().then((connections) => {
        for (let connection of Object.values(connections)) {
          props.connectionStore.addConnection(connection)
        }
      })
      source.loadModelConfig().then((models) => {
        for (let modelConfig of Object.values(models)) {
          props.modelStore.addModelConfig(modelConfig)
        }
      })
      source.loadLLMConnections().then((llmConnections) => {
        for (let llmConnection of Object.values(llmConnections)) {
          props.llmConnectionStore.addConnection(llmConnection)
        }
      })
    }

    const saveEditors = () => {
      for (let source of props.storageSources) {
        source.saveEditors(
          Object.values(props.editorStore.editors).filter(
            (editor) => editor.storage == source.type,
          ),
        )
      }
      console.log('Editors saved')
    }
    const saveConnections = () => {
      for (let source of props.storageSources) {
        source.saveConnections(
          // @ts-ignore
          Object.values(props.connectionStore.connections).filter(
            (connection) => (connection.storage = source.type),
          ),
        )
      }
      console.log('Connections saved')
    }
    const saveModels = () => {
      for (let source of props.storageSources) {
        source.saveModelConfig(
          Object.values(props.modelStore.models).filter((model) => model.storage == source.type),
        )
      }
      console.log('Models saved')
    }
    const saveLLMConnections = async () => {
      console.log('saving connections')
      for (let source of props.storageSources) {
        await source.saveLLMConnections(
          Object.values(props.llmConnectionStore.connections).filter(
            (llmConnection) => llmConnection.storage == source.type,
          ),
        )
      }
    }
    const saveAll = async () => {
      await saveEditors()
      await saveConnections()
      await saveModels()
      await saveLLMConnections()
    }
    provide('saveEditors', saveEditors)
    provide('saveConnections', saveConnections)
    provide('saveModels', saveModels)
    provide('saveLLMConnections', saveLLMConnections)
    provide('saveAll', saveAll)
    const isMobile = computed(() => window.innerWidth <= 768)
    provide('isMobile', isMobile)
  },
  data() {
    return {
      windowWidth: window.innerWidth,
    }
  },
  computed: {
    currentLayout(): string {
      return this.windowWidth > 768 ? 'Desktop' : 'Mobile'
    },
  },
  mounted() {
    window.addEventListener('resize', this.handleResize)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    handleResize() {
      this.windowWidth = window.innerWidth
    },
  },
}
</script>
