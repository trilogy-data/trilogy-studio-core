<template>
  <div @click.stop class="relative-parent">
    <slot :onClick="createEditor">
      <button @click.stop="createEditor" data-testid="editor-creator-add">New</button>
    </slot>

    <div v-if="visible" class="absolute-form" :class="{ 'offset-right': offsetRight }">
      <form @submit.prevent="submitEditorCreation">
        <div>
          <label for="editor-name">Name</label>
          <input data-testid="editor-creator-name" type="text" v-model="editorDetails.name" id="editor-name" required />
        </div>

        <div>
          <tooltip position="bottom" content="Use SQL editors to run raw SQL."
            ><label for="editor-type">Type</label>
          </tooltip>
          <select data-testid="editor-creator-type" v-model="editorDetails.type" id="editor-type" required>
            <option value="preql">Trilogy</option>
            <option value="sql">SQL</option>
          </select>
        </div>

        <div>
          <label for="connection-name">Connection</label>
          <select data-testid="editor-creator-connection-select" v-model="editorDetails.connection" id="connection-name" required>
            <option
              v-for="connection in connections"
              :key="connection.name"
              :value="connection.name"
            >
              {{ connection.name }}
            </option>
          </select>
        </div>

        <button data-testid="editor-creator-submit" type="submit">Submit</button>
        <button type="button" @click="visible = !visible">Cancel</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.offset-right {
  right: 100%;
}
.button {
  flex: 1;
}
.relative-parent {
  position: relative;
}
input,
select {
  font-size: 12px;
  border: 1px solid #ccc;
  /* Light gray border for inputs */
  border-radius: 0;
  /* Sharp corners */
  width: 95%;
  /* Full width of the container */
}

input:focus,
select:focus {
  border-color: #4b4b4b;
  /* Dark gray border on focus */
  outline: none;
}

option {
  font-size: 12px;
  font-weight: 300;
}

label {
  font-weight: 300;
  /* Dark gray text */
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
    offsetRight: {
      type: Boolean,
      required: false,
      default: false,
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

    let visible = ref(false)

    // Function to create the editor by collecting details from the form
    const createEditor = () => {
      visible.value = !visible.value
      editorDetails.value.name = '' // Reset name field
      editorDetails.value.type = 'preql' // Reset type dropdown
      editorDetails.value.connection = props.connection // Reset connection selection
    }

    // Function to submit the editor details
    const submitEditorCreation = () => {
      if (editorDetails.value.name && editorDetails.value.type && editorDetails.value.connection) {
        visible.value = false
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

    return {
      visible,
      editorDetails,
      connections,
      createEditor,
      submitEditorCreation,
    }
  },
})
</script>
