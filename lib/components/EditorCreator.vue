<template>
  <div>
    <!-- Button to trigger the creation of the editor -->
    <button @click="createEditor">Create Editor</button>

    <!-- Form for editor details if editor is being created -->
    <div v-if="visible">
      <form @submit.prevent="submitEditorCreation">
        <div>
          <label for="editor-name">Editor Name:</label>
          <input type="text" v-model="editorDetails.name" id="editor-name" required />
        </div>

        <div>
          <label for="editor-type">Editor Type:</label>
          <select v-model="editorDetails.type" id="editor-type" required>
            <option value="preql">Trilogy</option>
            <option value="sql">SQL</option>
          </select>
        </div>

        <div>
          <label for="connection-name">Connection:</label>
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

    <!-- Displaying the editor details after creation -->
    <div v-if="submittedEditor">
      <p>Editor created with the following details:</p>
      <p>Name: {{ submittedEditor.name }}</p>
      <p>Type: {{ submittedEditor.type }}</p>
      <p>Connection: {{ submittedEditor.connection }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import type { ConnectionStoreType } from '../stores/connectionStore';
export default defineComponent({
  name: 'EditorCreator',
  setup() {
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

    // Ref to store the submitted editor's details
    const submittedEditor = ref<{
      name: string;
      type: string;
      connection: string;
    } | null>(null);

    // Function to create the editor by collecting details from the form
    const createEditor = () => {
      console.log('form!')
      visible.value = true;
      editorDetails.value.name = ''; // Reset name field
      editorDetails.value.type = 'preql'; // Reset type dropdown
      editorDetails.value.connection = ''; // Reset connection selection
    };

    // Function to submit the editor details
    const submitEditorCreation = () => {
      if (editorDetails.value.name && editorDetails.value.type && editorDetails.value.connection) {
        submittedEditor.value = { ...editorDetails.value }; // Save the submitted editor
        visible.value = false;
        editorStore.newEditor(editorDetails.value.name, editorDetails.value.type, editorDetails.value.connection);
      }
    };

    return {
      visible,
      editorDetails,
      connections,
      createEditor,
      submitEditorCreation,
      submittedEditor
    };
  }
});
</script>

<style scoped>
/* General button and form styling */
button {
  padding: 12px 20px;
  background-color: #4b4b4b;
  /* Dark gray background */
  color: #fff;
  /* White text */
  border: 1px solid #333;
  /* Dark border */
  cursor: pointer;
  font-size: 16px;
  border-radius: 0;
  /* Sharp corners */
  transition: background-color 0.3s ease;
}

button:hover {
  background-color: #6c6c6c;
  /* Lighter gray when hovered */
}

form {
  margin-top: 20px;
  padding: 20px;
  background-color: #e0e0e0;
  /* Gray background for form */
  border: 1px solid #ddd;
  /* Light gray border */
  border-radius: 0;
  /* Sharp corners */
}

form div {
  margin-bottom: 15px;
}

input,
select {
  padding: 10px;
  font-size: 16px;
  margin-top: 5px;
  border: 1px solid #ccc;
  /* Light gray border for inputs */
  border-radius: 0;
  /* Sharp corners */
  width: 100%;
  /* Full width of the container */
}

input:focus,
select:focus {
  border-color: #4b4b4b;
  /* Dark gray border on focus */
  outline: none;
}

label {
  font-weight: bold;
  color: #333;
  /* Dark gray text */
}
</style>