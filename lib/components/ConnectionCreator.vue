<template>
  <div class="relative-parent">
    <button @click="createConnection" data-testid="connection-creator-add">Add</button>

    <div v-if="visible" class="absolute-form">
      <form @submit.prevent="submitConnectionCreation">
        <div>
          <label for="connection-name">Name</label>
          <input
            data-testid="connection-creator-name"
            type="text"
            v-model="connectionDetails.name"
            id="connection-name"
            required
          />
        </div>

        <div>
          <label for="connection-type">Type</label>
          <select v-model="connectionDetails.type" id="connection-type" required>
            <option value="duckdb">DuckDB</option>
            <!-- Need to figure out CORS to support this and bigquery-->
            <!-- <option value="motherduck">MotherDuck</option> -->
            <option value="bigquery">Bigquery Oauth</option>
            <option value="snowflake">Snowflake</option>
          </select>
        </div>
        <!-- Dynamic Fields Based on Type -->
        <div v-if="connectionDetails.type === 'motherduck'">
          <label for="md-token">MotherDuck Token</label>
          <input
            type="password"
            v-model="connectionDetails.options.mdToken"
            id="md-token"
            placeholder="MotherDuck Token"
            required
          />
          <label for="save-credential">Save Credential?</label>
          <input
            type="checkbox"
            id="save-credential"
            v-model="connectionDetails.options.saveCredential"
            label="Save Credential?"
          />
        </div>

        <div v-if="connectionDetails.type === 'bigquery'">
          <label for="project-id">BigQuery Project ID</label>
          <input
            type="text"
            v-model="connectionDetails.options.projectId"
            id="project-id"
            placeholder="Billing Project ID"
            required
          />
        </div>
        <div v-if="connectionDetails.type === 'sqlserver'">
          <label for="username">Username</label>
          <input type="text" v-model="connectionDetails.options.username" id="username" required />
          <label for="password">Password</label>
          <input
            type="password"
            v-model="connectionDetails.options.password"
            id="username"
            required
          />
        </div>
        <div v-if="connectionDetails.type === 'snowflake'">
          <label for="account">Account</label>
          <input type="text" v-model="connectionDetails.options.account" id="account" required />
          <label for="username">Username</label>
          <input type="text" v-model="connectionDetails.options.username" id="username" required />
          <label for="privateKey">Private Key</label>
          <input
            type="password"
            v-model="connectionDetails.options.privateKey"
            id="privateKey"
            required
          />
        </div>
        <button data-testid="connection-creator-submit" type="submit">Submit</button>
        <button type="button" @click="visible = !visible">Cancel</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.relative-parent {
  position: relative;
}
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
  font-weight: 300;
  /* Dark gray text */
}
</style>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { ConnectionStoreType } from '../stores/connectionStore'

export default defineComponent({
  name: 'ConnectionCreator',
  setup() {
    const connectionDetails = ref({
      name: '',
      type: 'duckdb',
      options: {
        mdToken: '',
        account: '',
        projectId: '',
        username: '',
        password: '',
        privateKey: '',
        saveCredential: false,
      },
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    if (!connectionStore) {
      throw new Error('must inject connectionStore to ConnectionCreator')
    }

    const connections = connectionStore.connections
    const visible = ref(false)

    const createConnection = () => {
      visible.value = !visible.value
      connectionDetails.value.name = ''
      connectionDetails.value.type = 'duckdb'
      connectionDetails.value.options = {
        mdToken: '',
        account: '',
        projectId: '',
        username: '',
        password: '',
        privateKey: '',
        saveCredential: false,
      } // Reset options
    }

    const submitConnectionCreation = () => {
      if (connectionDetails.value.name && connectionDetails.value.type) {
        visible.value = false
        connectionStore.newConnection(
          connectionDetails.value.name,
          connectionDetails.value.type,
          connectionDetails.value.options,
        )
      }
    }

    return {
      visible,
      connectionDetails,
      connections,
      createConnection,
      submitConnectionCreation,
    }
  },
})
</script>
