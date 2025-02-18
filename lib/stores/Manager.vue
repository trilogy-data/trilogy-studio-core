<template>
  <slot></slot>
</template>

<script lang="ts">
import IDE from '../views/IDE.vue'
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import type { ModelConfigStoreType } from './modelStore'
import QueryResolver from './resolver'
import { provide } from 'vue'
import type { PropType } from 'vue'
import { Storage } from '../data'
export default {
  name: 'ContextManager',
  components: {
    IDE,
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
    for (let source of props.storageSources) {
      let editors = source.loadEditors()
      for (let editor of Object.values(editors)) {
        props.editorStore.addEditor(editor)
      }
    }
    for (let source of props.storageSources) {
      let connections = source.loadConnections()
      for (let connection of Object.values(connections)) {
        props.connectionStore.addConnection(connection)
      }
    }
    for (let source of props.storageSources) {
      let connections = source.loadModelConfig()
      for (let modelConfig of Object.values(connections)) {
        props.modelStore.addModelConfig(modelConfig)
      }
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
    provide('saveEditors', saveEditors)
    provide('saveConnections', saveConnections)
    provide('saveModels', saveModels)
  },
  computed: {},
  data() {
    return {}
  },
  methods: {},
}
</script>
