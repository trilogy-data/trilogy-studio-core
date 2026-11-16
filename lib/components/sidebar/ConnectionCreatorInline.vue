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
          <option value="sqlite">SQLite</option>
          <!-- Need to figure out CORS to support this and bigquery-->
          <!-- <option value="motherduck">MotherDuck</option> -->
          <option value="bigquery">Bigquery Oauth</option>
          <option value="snowflake">Snowflake (Key Pair)</option>
          <option value="snowflake-pat">Snowflake (Access Token)</option>
          <option value="databricks">Databricks (Remote Engine)</option>
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
      <template v-if="connectionDetails.type === 'snowflake-pat'">
        <div class="form-row">
          <label for="pat-account">Account</label>
          <input
            type="text"
            v-model="connectionDetails.options.account"
            class="sidebar-control-input"
            id="pat-account"
            data-testid="connection-creator-snowflake-pat-account"
            required
          />
        </div>
        <div class="form-row">
          <label for="pat-token">Access Token</label>
          <input
            type="password"
            v-model="connectionDetails.options.token"
            class="sidebar-control-input"
            id="pat-token"
            data-testid="connection-creator-snowflake-pat-token"
            placeholder="Programmatic access token"
            required
          />
        </div>
        <div class="form-row">
          <label for="pat-warehouse">Warehouse</label>
          <input
            type="text"
            v-model="connectionDetails.options.warehouse"
            class="sidebar-control-input"
            id="pat-warehouse"
            placeholder="Optional (user default)"
          />
        </div>
        <div class="form-row">
          <label for="pat-role">Role</label>
          <input
            type="text"
            v-model="connectionDetails.options.role"
            class="sidebar-control-input"
            id="pat-role"
            placeholder="Optional (user default)"
          />
        </div>
      </template>
      <template v-if="connectionDetails.type === 'databricks'">
        <p class="form-hint" data-testid="connection-creator-databricks-hint">
          Databricks can't be queried from a browser directly, so queries run on a private remote
          engine (the hosted Trilogy engine unless you set an engine URL). Leave the workspace
          fields empty to use the engine's own warehouse. A token you enter is sent to the engine
          with each query and never stored there.
        </p>
        <div class="form-row">
          <label for="dbx-engine-key">Engine Key</label>
          <input
            type="password"
            v-model="connectionDetails.options.engineKey"
            class="sidebar-control-input"
            id="dbx-engine-key"
            data-testid="connection-creator-databricks-engine-key"
            placeholder="Remote engine API key"
            required
          />
        </div>
        <div class="form-row">
          <label for="dbx-host">Host</label>
          <input
            type="text"
            v-model="connectionDetails.options.host"
            class="sidebar-control-input"
            id="dbx-host"
            data-testid="connection-creator-databricks-host"
            placeholder="Optional: dbc-1234.cloud.databricks.com"
          />
        </div>
        <div class="form-row">
          <label for="dbx-http-path">HTTP Path</label>
          <input
            type="text"
            v-model="connectionDetails.options.httpPath"
            class="sidebar-control-input"
            id="dbx-http-path"
            data-testid="connection-creator-databricks-http-path"
            placeholder="Optional: /sql/1.0/warehouses/<id>"
          />
        </div>
        <div class="form-row">
          <label for="dbx-token">Token</label>
          <input
            type="password"
            v-model="connectionDetails.options.token"
            class="sidebar-control-input"
            id="dbx-token"
            data-testid="connection-creator-databricks-token"
            placeholder="Optional: personal access token"
          />
        </div>
        <div class="form-row">
          <label for="dbx-catalog">Catalog</label>
          <input
            type="text"
            v-model="connectionDetails.options.catalog"
            class="sidebar-control-input"
            id="dbx-catalog"
            placeholder="Optional"
          />
        </div>
        <div class="form-row">
          <label for="dbx-schema">Schema</label>
          <input
            type="text"
            v-model="connectionDetails.options.schema"
            class="sidebar-control-input"
            id="dbx-schema"
            placeholder="Optional"
          />
        </div>
        <div class="form-row">
          <label for="dbx-engine-url">Engine URL</label>
          <input
            type="text"
            v-model="connectionDetails.options.engineUrl"
            class="sidebar-control-input"
            id="dbx-engine-url"
            data-testid="connection-creator-databricks-engine-url"
            placeholder="Optional: defaults to the hosted engine"
          />
        </div>
        <div class="form-row">
          <label for="dbx-save-credential">Save Credential?</label>
          <input
            type="checkbox"
            id="dbx-save-credential"
            v-model="connectionDetails.options.saveCredential"
          />
        </div>
      </template>
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
.form-hint {
  margin: 4px 0 8px;
  font-size: 0.8em;
  opacity: 0.8;
  line-height: 1.35;
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
        token: '',
        warehouse: '',
        role: '',
        engineKey: '',
        engineUrl: '',
        host: '',
        httpPath: '',
        catalog: '',
        schema: '',
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
        token: '',
        warehouse: '',
        role: '',
        engineKey: '',
        engineUrl: '',
        host: '',
        httpPath: '',
        catalog: '',
        schema: '',
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
