<template>
  <div class="flex relative-container">
    <slot  :onClick="createEditor">
      <button @click="createEditor">Add</button>
    </slot>

    <div v-if="visible" class="absolute-form">
      <form @submit.prevent="submitEditorCreation">
        <div>
          <label for="editor-name">Name</label>
          <input type="text" v-model="editorDetails.name" id="editor-name" required />
        </div>

        <div>
          <tooltip position="bottom" content="Use SQL editors to run raw SQL."><label for="editor-type">Type</label>
          </tooltip>
          <select v-model="editorDetails.type" id="editor-type" required>
            <option value="preql">Trilogy</option>
            <option value="sql">SQL</option>
          </select>
        </div>

        <div>
          <label for="connection-name">Connection</label>
          <select v-model="editorDetails.connection" id="connection-name" required>
            <option v-for="connection in connections" :key="connection.name" :value="connection.name">
              {{ connection.name }}
            </option>
          </select>
        </div>

        <button type="submit">Submit</button>
        <button type="button" @click="visible = !visible">Cancel</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.button {
  flex: 1;
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
  font-weight: 300
    /* Dark gray text */
}
</style>
<script lang="ts">
import { defineComponent, ref, inject, } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import type { ConnectionStoreType } from '../stores/connectionStore';
import Tooltip from './Tooltip.vue';
export default defineComponent({
  name: 'EditorCreator',
  components: {
    Tooltip
  },
  setup(_, { emit }) {
    // Placeholder for editor details
    const editorDetails = ref({
      name: '',
      type: 'preql', // Default value
      connection: ''
    });

    // Array of available connection names
    const connectionStore = inject<ConnectionStoreType>('connectionStore');
    const editorStore = inject<EditorStoreType>('editorStore');
    if (!connectionStore || !editorStore) {
      throw ("must inject connectionStore to EditorCreator")
    }



    let connections = connectionStore.connections;
    //visible
    let visible = ref(false);



    // Function to create the editor by collecting details from the form
    const createEditor = () => {
      console.log('new editor')
      visible.value = !visible.value;
      editorDetails.value.name = ''; // Reset name field
      editorDetails.value.type = 'preql'; // Reset type dropdown
      editorDetails.value.connection = ''; // Reset connection selection
    };

    // Function to submit the editor details
    const submitEditorCreation = () => {
      if (editorDetails.value.name && editorDetails.value.type && editorDetails.value.connection) {
        visible.value = false;
        editorStore.newEditor(editorDetails.value.name, editorDetails.value.type, editorDetails.value.connection, '');
        emit("editor-selected", (editorDetails.value.name));
      }
    };

    return {
      visible,
      editorDetails,
      connections,
      createEditor,
      submitEditorCreation,
    };
  }
});
</script>
