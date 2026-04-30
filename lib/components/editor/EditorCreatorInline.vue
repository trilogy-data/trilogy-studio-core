<template>
  <div v-if="visible" class="creator-container">
    <form @submit.prevent="submitEditorCreation">
      <div class="form-row">
        <label for="editor-name">Name</label>
        <input
          :data-testid="testTag ? `editor-creator-name-${testTag}` : 'editor-creator-name'"
          type="text"
          v-model="editorDetails.name"
          class="sidebar-control-input"
          id="editor-name"
          required
        />
      </div>
      <div class="form-row">
        <label for="editor-type">Type</label>

        <select
          :data-testid="testTag ? `editor-creator-type-${testTag}` : 'editor-creator-type'"
          v-model="editorDetails.type"
          class="sidebar-control-select"
          id="editor-type"
          required
        >
          <option value="preql">Trilogy</option>
          <option value="sql">SQL</option>
        </select>
      </div>
      <div v-if="!connection" class="form-row">
        <label for="connection-name">Connection</label>
        <select
          :data-testid="
            testTag
              ? `editor-creator-connection-select-${testTag}`
              : 'editor-creator-connection-select'
          "
          v-model="editorDetails.connectionId"
          class="sidebar-control-select"
          id="connection-name"
          required
        >
          <option v-for="connection in connections" :key="connection.id" :value="connection.id">
            {{ connection.name }}
          </option>
        </select>
      </div>
      <div v-if="error">
        <inline-error-message>{{ error }}</inline-error-message>
      </div>
      <div class="button-row">
        <button
          :data-testid="testTag ? `editor-creator-submit-${testTag}` : 'editor-creator-submit'"
          type="submit"
        >
          Submit
        </button>
        <button type="button" @click="close()">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped src="../creatorForm.css"></style>
<style scoped>
.creator-container {
  --creator-label-width: 80px;
}
</style>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import Tooltip from '../Tooltip.vue'
import InlineErrorMessage from '../InlineErrorMessage.vue'

export default defineComponent({
  name: 'EditorCreator',
  components: {
    Tooltip,
    InlineErrorMessage,
  },
  props: {
    connection: {
      type: String,
      required: false,
      default: '',
    },
    visible: {
      type: Boolean,
      required: true,
    },
    testTag: {
      type: String,
      required: false,
      default: '',
    },
  },
  setup(props, { emit }) {
    // Placeholder for editor details
    const error = ref('')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveEditors = inject<Function>('saveEditors')

    if (!connectionStore || !editorStore || !saveEditors) {
      throw 'must inject connectionStore, editorStore, save to EditorCreator'
    }

    const initialConnectionId = props.connection
      ? connectionStore.connectionByName(props.connection)?.id || ''
      : ''

    const editorDetails = ref({
      name: '',
      type: 'preql', // Default value
      connectionId: initialConnectionId,
    })

    let connections = connectionStore.connections

    // Function to create the editor by collecting details from the form
    const createEditor = () => {
      editorDetails.value.name = '' // Reset name field
      editorDetails.value.type = 'preql' // Reset type dropdown
      editorDetails.value.connectionId = initialConnectionId // Reset connection selection
      error.value = ''
    }

    // Function to submit the editor details
    const submitEditorCreation = () => {
      if (
        editorDetails.value.name &&
        editorDetails.value.type &&
        editorDetails.value.connectionId
      ) {
        try {
          const conn = connectionStore.connections[editorDetails.value.connectionId]
          if (!conn) {
            error.value = 'Selected connection no longer exists'
            return
          }
          editorStore.newEditor(
            editorDetails.value.name,
            // @ts-ignore
            editorDetails.value.type,
            conn.name,
            '',
          )
          saveEditors()
          emit('close', editorDetails.value.name)
          emit('editor-selected', editorDetails.value.name)
        } catch (e) {
          if (e instanceof Error) {
            error.value = e.message
          } else {
            error.value = 'Unknown error'
          }
        }
      }
    }

    const close = () => {
      emit('close', editorDetails.value.name)
    }

    return {
      editorDetails,
      connections,
      createEditor,
      submitEditorCreation,
      close,
      error,
    }
  },
})
</script>
