<template>
  <div v-if="visible" class="creator-container">
    <form @submit.prevent="submitConnectionCreation">
      <div class="form-row">
        <label for="connection-name">Name</label>
        <input
          data-testid="connection-creator-name"
          type="text"
          v-model="connectionDetails.name"
          id="connection-name"
          required
        />
      </div>

      <div class="form-row">
        <label for="connection-type">Type</label>
        <select v-model="connectionDetails.type" id="connection-type" required>
          <option value="duckdb">DuckDB</option>
          <!-- Need to figure out CORS to support this and bigquery-->
          <!-- <option value="motherduck">MotherDuck</option> -->
          <option value="bigquery">Bigquery Oauth</option>
          <option value="snowflake">Snowflake</option>
          <!-- CORS blocks this in a browser -->
          <!-- <option value="snowflake-basic">Snowflake Username/PW</option> -->
        </select>
      </div>
      <!-- Dynamic Fields Based on Type -->
      <div v-if="connectionDetails.type === 'motherduck'" class="form-row">
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

      <div v-if="connectionDetails.type === 'bigquery'" class="form-row">
        <label for="project-id">BigQuery Project ID</label>
        <input
          type="text"
          v-model="connectionDetails.options.projectId"
          id="project-id"
          placeholder="Billing Project ID"
          required
        />
      </div>
      <div v-if="connectionDetails.type === 'sqlserver'" class="form-row">
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
      <!-- <div v-if="connectionDetails.type === 'snowflake-basic'" class="form-row">
        <label for="account">Account</label>
        <input type="text" v-model="connectionDetails.options.account" id="account" required />
        <label for="username">Username</label>
        <input type="text" v-model="connectionDetails.options.username" id="username" required />
        <label for="password">Password</label>
        <input
          type="password"
          v-model="connectionDetails.options.password"
          id="username"
          required
        />
      </div> -->
      <template v-if="connectionDetails.type === 'snowflake'">
        <div class="form-row">
          <label for="account">Account</label>
          <input type="text" v-model="connectionDetails.options.account" id="account" required />
        </div>
        <div class="form-row">
          <label for="username">Username</label>
          <input type="text" v-model="connectionDetails.options.username" id="username" required />
        </div>
        <div class="form-row">
          <label for="privateKey">Private Key</label>
          <input
            type="password"
            v-model="connectionDetails.options.privateKey"
            id="privateKey"
            required
          />
        </div>
      </template>
      <div class="button-row">
        <button data-testid="connection-creator-submit" type="submit">Submit</button>
        <button type="button" @click="close()">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.form-row label {
  flex: 0 0 80px;
  /* Fixed width for labels */
  font-size: var(--small-font-size);
  margin-right: 10px;
}

.form-row input,
.form-row select {
  flex: 1;
  font-size: var(--small-font-size);
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
</style>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { ConnectionStoreType } from '../stores/connectionStore'

export default defineComponent({
  name: 'ConnectionCreator',
  props: {
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
  methods: {
    close() {
      this.$emit('close')
    },
  },
  setup(_, { emit }) {
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
    const saveConnections = inject<CallableFunction>('saveConnections')
    if (!connectionStore || !saveConnections) {
      throw new Error('must inject connectionStore to ConnectionCreator')
    }

    const connections = connectionStore.connections
    const createConnection = () => {
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

    const submitConnectionCreation = async () => {
      if (connectionDetails.value.name && connectionDetails.value.type) {
        await connectionStore.newConnection(
          connectionDetails.value.name,
          connectionDetails.value.type,
          connectionDetails.value.options,
        )
        await saveConnections()

        emit('close')
      }
    }

    return {
      connectionDetails,
      connections,
      createConnection,
      submitConnectionCreation,
    }
  },
})
</script>
