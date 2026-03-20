<template>
  <div v-if="visible" class="creator-container">
    <form @submit.prevent="submitConnectionCreation">
      <div class="form-row">
        <label for="connection-name">Name</label>
        <input
          data-testid="connection-creator-name"
          type="text"
          v-model="connectionDetails.name"
          class="sidebar-control-input"
          id="connection-name"
          required
        />
      </div>

      <div class="form-row">
        <label for="connection-type">Type</label>
        <select
          v-model="connectionDetails.type"
          class="sidebar-control-select"
          id="connection-type"
          required
        >
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
          class="sidebar-control-input"
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
          class="sidebar-control-input"
          id="project-id"
          placeholder="Billing Project ID"
          required
        />
      </div>
      <div v-if="connectionDetails.type === 'sqlserver'" class="form-row">
        <label for="username">Username</label>
        <input
          type="text"
          v-model="connectionDetails.options.username"
          class="sidebar-control-input"
          id="username"
          required
        />
        <label for="password">Password</label>
        <input
          type="password"
          v-model="connectionDetails.options.password"
          class="sidebar-control-input"
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
          <input
            type="text"
            v-model="connectionDetails.options.account"
            class="sidebar-control-input"
            id="account"
            required
          />
        </div>
        <div class="form-row">
          <label for="username">Username</label>
          <input
            type="text"
            v-model="connectionDetails.options.username"
            class="sidebar-control-input"
            id="username"
            required
          />
        </div>
        <div class="form-row">
          <label for="privateKey">Private Key</label>
          <input
            type="password"
            v-model="connectionDetails.options.privateKey"
            class="sidebar-control-input"
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

<style scoped src="../creatorForm.css"></style>
<style scoped>
.creator-container {
  --creator-label-width: 88px;
}
</style>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'

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
    const saveAll = inject<CallableFunction>('saveAll')
    if (!connectionStore || !saveConnections || !saveAll) {
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
        // we may have created a model, so save that too
        await saveAll()

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
