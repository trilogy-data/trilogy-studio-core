<template>
  <IDE v-if="currentLayout === 'Desktop'" />
  <MobileIDE v-else />

</template>

<script lang="ts">
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import type { ModelConfigStoreType } from './modelStore'
import type { UserSettingsStoreType } from './userSettingsStore'
import QueryResolver from './resolver'
import { provide } from 'vue'
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
    for (let source of props.storageSources) {
      let editors = source.loadEditors()
      for (let editor of Object.values(editors)) {
        props.editorStore.addEditor(editor)
      }
    }
    for (let source of props.storageSources) {
      source.loadConnections().then((connections) => {
        for (let connection of Object.values(connections)) {
          props.connectionStore.addConnection(connection)
        }
      })
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
  data() {
    return {
      windowWidth: window.innerWidth,
    };
  },
  computed: {
    currentLayout() {
      return this.windowWidth > 768 ? 'Desktop' : 'Mobile';
    },
  },
  mounted() {
    window.addEventListener('resize', this.handleResize);
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.handleResize);
  },
  methods: {
    handleResize() {
      this.windowWidth = window.innerWidth;
    },
  },
}
</script>
