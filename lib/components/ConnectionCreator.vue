<template>
  <div>
    <!-- Button to trigger the creation of the editor -->
    <button @click="createConnection">Add</button>

    <!-- Form for editor details if editor is being created -->
    <div v-if="visible">
      <form @submit.prevent="submitConnectionCreation">
        <div>
          <label for="connection-name">Connection Name:</label>
          <input type="text" v-model="connectionDetails.name" id="connection-name" required />
        </div>

        <div>
          <label for="connection-type">Connection Type:</label>
          <select v-model="connectionDetails.type" id="connection-type" required>
            <option value="duckdb">DuckDB</option>
            <option value="motherduck">MotherDuck</option>
            <option value="bigquery ">Bigquery</option>
          </select>
        </div>
        <button type="submit">Submit</button>
      </form>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue';;
import type { ConnectionStoreType } from '../stores/connectionStore';
export default defineComponent({
  name: 'ConnectionCreator',
  setup() {
    // Placeholder for editor details
    const connectionDetails = ref({
      name: '',
      type: 'duckdb', // Default value
    });

    // Array of available connection names
    const connectionStore = inject<ConnectionStoreType>('connectionStore');
    if (!connectionStore) {
      throw ("must inject connectionStore to ConnectionCreator")
    }



    let connections = connectionStore.connections;
    //visible
    let visible = ref(false);

    // Ref to store the submitted editor's details
    const submittedConnection = ref<{
      name: string;
      type: string;
    } | null>(null);

    // Function to create the editor by collecting details from the form
    const createConnection = () => {
      visible.value = true;
      connectionDetails.value.name = ''; // Reset name field
      connectionDetails.value.type = 'duckdb'; // Reset type dropdown
    };

    // Function to submit the editor details
    const submitConnectionCreation = () => {
      if (connectionDetails.value.name && connectionDetails.value.type) {
        submittedConnection.value = { ...connectionDetails.value }; // Save the submitted editor
        visible.value = false;
        connectionStore.newConnection(connectionDetails.value.name, connectionDetails.value.type,);
      }
    };

    return {
      visible,
      connectionDetails,
      connections,
      createConnection,
      submitConnectionCreation,
      submittedConnection
    };
  }
});
</script>

<style scoped>
/* General button and form styling */
button {
  /* Dark border */
  cursor: pointer;
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