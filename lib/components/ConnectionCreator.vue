<template>
  <div class="flex relative-container">
    <button @click="createConnection">Add</button>

    <div v-if="visible" class="absolute-form">
      <form @submit.prevent="submitConnectionCreation">
        <div>
          <label for="connection-name">Name</label>
          <input type="text" v-model="connectionDetails.name" id="connection-name" required />
        </div>

        <div>
          <label for="connection-type">Type</label>
          <select v-model="connectionDetails.type" id="connection-type" required>
            <option value="duckdb">DuckDB</option>
            <option value="motherduck">MotherDuck</option>
            <option value="bigquery">Bigquery Oauth</option>
          </select>
        </div>
        <button type="submit">Submit</button>
        <button type="button" @click="visible = !visible">Cancel</button>
      </form>
    </div>
  </div>
</template>

<style scoped>

.relative-container {
  position: relative; /* Ensures the absolute positioning is relative to this container */
}

.absolute-form {
  position: absolute;
  top: 100%; /* Position below the button */
  left: 0; /* Align with the button horizontally */
  background-color: white; /* For contrast and visibility */
  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1); /* Optional: Add a subtle shadow */
  border: 1px solid #ccc; /* Optional: Border for better separation */
  z-index: 1000; /* Ensure it appears in front of other content */
  width: 250px;
  font-size: 15px;
  text-align: center;
}


.button {
  flex: 1;
}

form {
  /* margin-top: 20px; */
  /* padding: 20px; */
  background-color: #e0e0e0;
  /* Gray background for form */
  border: 1px solid #ddd;
  /* Light gray border */
  border-radius: 0;
  /* Sharp corners */
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
      visible.value = !visible.value;
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
