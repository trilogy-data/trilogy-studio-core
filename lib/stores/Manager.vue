<template>
  <template v-if="loaded">
    <IDE v-if="!isMobile" />
    <MobileIDE v-else />
  </template>
</template>

<script lang="ts">
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import type { ModelConfigStoreType } from './modelStore'
import type { UserSettingsStoreType } from './userSettingsStore'
import type { LLMConnectionStoreType } from './llmStore'
import QueryExecutionService from './queryExecutionService'

import QueryResolver from './resolver'
import { provide, computed, ref } from 'vue'
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
    provide(
      'queryExecutionService',
      new QueryExecutionService(props.trilogyResolver, props.connectionStore, props.modelStore, props.editorStore),
    )
    const windowWidth = ref(window.innerWidth)
    const loaded = ref(false)
    const loadingPromises = []

    for (let source of props.storageSources) {
      // Add each promise to our array
      loadingPromises.push(
        source.loadEditors().then((editors) => {
          for (let editor of Object.values(editors)) {
            props.editorStore.addEditor(editor)
          }
        }),
      )

      loadingPromises.push(
        source.loadConnections().then((connections) => {
          for (let connection of Object.values(connections)) {
            props.connectionStore.addConnection(connection)
          }
        }),
      )

      loadingPromises.push(
        source.loadModelConfig().then((models) => {
          for (let modelConfig of Object.values(models)) {
            props.modelStore.addModelConfig(modelConfig)
          }
        }),
      )

      loadingPromises.push(
        source.loadLLMConnections().then((llmConnections) => {
          for (let llmConnection of Object.values(llmConnections)) {
            props.llmConnectionStore.addConnection(llmConnection)
          }
        }),
      )
    }

    // Wait for all promises to resolve, then set loaded to true
    Promise.all(loadingPromises)
      .then(() => {
        loaded.value = true
      })
      .catch((error) => {
        console.error('Error loading editor data:', error)
        // You might want to handle the error state appropriately
      })

    const saveEditors = async () => {
      for (let source of props.storageSources) {
        await source.saveEditors(
          Object.values(props.editorStore.editors).filter(
            (editor) => editor.storage == source.type,
          ),
        )
      }
      console.log('Editors saved')
    }
    const saveConnections = async () => {
      for (let source of props.storageSources) {
        await source.saveConnections(
          // @ts-ignore
          Object.values(props.connectionStore.connections).filter(
            (connection) => (connection.storage = source.type),
          ),
        )
      }
      console.log('Connections saved')
    }
    const saveModels = async () => {
      for (let source of props.storageSources) {
        await source.saveModelConfig(
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
    const isMobile = computed(() => windowWidth.value <= 768)
    const handleResize = () => {
      windowWidth.value = window.innerWidth
    }
    provide('isMobile', isMobile)
    return {
      loaded,
      isMobile,
      handleResize,
    }
  },
  mounted() {
    window.addEventListener('resize', this.handleResize)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.handleResize)
  },
}
</script>
