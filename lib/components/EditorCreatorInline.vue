<template>
  <div v-if="visible" class = 'creator-container'>
    <form @submit.prevent="submitEditorCreation">
      <div class="form-row">
        <label for="editor-name">Name</label>
        <input data-testid="editor-creator-name" type="text" v-model="editorDetails.name" id="editor-name" required />
      </div>
      <div class="form-row">
        <tooltip position="bottom" content="Use SQL editors to run raw SQL.">
          <label for="editor-type">Type</label>
        </tooltip>
        <select data-testid="editor-creator-type" v-model="editorDetails.type" id="editor-type" required>
          <option value="preql">Trilogy</option>
          <option value="sql">SQL</option>
        </select>
      </div>
      <div v-if="!connection" class="form-row">
        <label for="connection-name">Connection</label>
        <select data-testid="editor-creator-connection-select" v-model="editorDetails.connection" id="connection-name"
          required>
          <option v-for="connection in connections" :key="connection.name" :value="connection.name">
            {{ connection.name }}
          </option>
        </select>
      </div>
      <div class="button-row">
        <button data-testid="editor-creator-submit" type="submit">Submit</button>
        <button type="button" @click="close()">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.creator-container {
  border: 1px solid var(--border-color);
  padding: 5px;
  margin-top: 5px;

}
.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.form-row label {
  flex: 0 0 80px;
  /* Fixed width for labels */
  font-size: var(--button-font-size);
  margin-right: 10px;
}

.form-row input,
.form-row select {
  flex: 1;
  font-size: var(--button-font-size);
  border: 1px solid var(--border-color);
  border-radius: 0;
  height: var(--sidebar-sub-item-height);  
}

.form-row input:focus,
.form-row select:focus {
  border-color: var(--border-color);
  outline: none;
}

.button-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

option {
  font-size: 12px;
  font-weight: 300;
}

.relative-parent {
  position: relative;
}
</style>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import Tooltip from './Tooltip.vue'

export default defineComponent({
  name: 'EditorCreator',
  components: {
    Tooltip,
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
  },
  setup(props, { emit }) {
    // Placeholder for editor details
    const editorDetails = ref({
      name: '',
      type: 'preql', // Default value
      connection: props.connection,
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveEditors = inject<Function>('saveEditors')

    if (!connectionStore || !editorStore || !saveEditors) {
      throw 'must inject connectionStore, editorStore, save to EditorCreator'
    }

    let connections = connectionStore.connections

    // Function to create the editor by collecting details from the form
    const createEditor = () => {
      editorDetails.value.name = '' // Reset name field
      editorDetails.value.type = 'preql' // Reset type dropdown
      editorDetails.value.connection = props.connection // Reset connection selection
    }

    // Function to submit the editor details
    const submitEditorCreation = () => {
      if (editorDetails.value.name && editorDetails.value.type && editorDetails.value.connection) {
        emit('close', editorDetails.value.name)
        editorStore.newEditor(
          editorDetails.value.name,
          editorDetails.value.type,
          editorDetails.value.connection,
          '',
        )
        saveEditors()
        emit('editor-selected', editorDetails.value.name)
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
    }
  },
})
</script>