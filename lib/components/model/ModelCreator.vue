<template>
  <div v-if="visible" class="creator-container">
    <form>
      <div>
        <div class="form-row">
          <label for="model-name">Name</label>
          <input
            type="text"
            v-model.trim="modelDetails.name"
            class="sidebar-control-input"
            id="model-name"
            required
            @input="validateForm"
          />
        </div>
        <div class="form-row">
          <label for="model-connection">Assign To Connection</label>
          <connection-picker
            id="model-connection"
            test-id="model-creator-connection"
            placeholder="Models must have a connection."
            :options="connectionOptions"
            :model-value="modelDetails.connection"
            @update:model-value="selectConnection"
          />
        </div>
        <div v-if="modelDetails.connection === 'new-motherduck'" class="form-row">
          <label for="md-token">MotherDuck Token</label>
          <input
            type="text"
            v-model.trim="modelDetails.options.mdToken"
            class="sidebar-control-input"
            id="md-token"
            placeholder="MotherDuck Token"
            required
            @input="validateForm"
          />
        </div>

        <div v-if="modelDetails.connection === 'new-bigquery-oauth'" class="form-row">
          <label for="project-id">BigQuery Project ID</label>
          <input
            type="text"
            v-model.trim="modelDetails.options.projectId"
            class="sidebar-control-input"
            id="project-id"
            placeholder="Billing Project ID"
            required
            @input="validateForm"
          />
        </div>
        <template v-if="modelDetails.connection === 'new-snowflake'">
          <div class="form-row">
            <label for="snowflake-username">Username</label>
            <input
              type="text"
              v-model.trim="modelDetails.options.username"
              class="sidebar-control-input"
              id="snowflake-username"
              placeholder="Snowflake Username"
              required
              @input="validateForm"
            />
          </div>
          <div class="form-row">
            <label for="snowflake-account">Account</label>
            <input
              type="text"
              v-model.trim="modelDetails.options.account"
              class="sidebar-control-input"
              id="snowflake-account"
              placeholder="Snowflake Account"
              required
              @input="validateForm"
            />
          </div>
          <div class="form-row">
            <label for="snowflake-ssh-private-key">Private Key</label>
            <input
              type="text"
              v-model.trim="modelDetails.options.sshPrivateKey"
              class="sidebar-control-input"
              id="snowflake-ssh-private-key"
              placeholder="Private Key"
              required
              @input="validateForm"
            />
          </div>
        </template>
        <template v-if="modelDetails.connection === 'new-databricks'">
          <p class="form-hint" data-testid="model-creator-databricks-hint">
            Beta. Queries and their results pass through a remote engine, which needs an engine key.
            Leave Host, HTTP Path and Token empty to use the engine's own warehouse, or fill in all
            three for your own.
          </p>
          <div class="form-row">
            <label for="model-dbx-engine-key">Engine Key</label>
            <input
              type="password"
              v-model.trim="modelDetails.options.engineKey"
              class="sidebar-control-input"
              id="model-dbx-engine-key"
              data-testid="model-creator-databricks-engine-key"
              placeholder="Remote engine API key"
              required
              @input="validateForm"
            />
          </div>
          <div class="form-row">
            <label for="model-dbx-host">Host</label>
            <input
              type="text"
              v-model.trim="modelDetails.options.host"
              class="sidebar-control-input"
              id="model-dbx-host"
              placeholder="Optional: dbc-1234.cloud.databricks.com"
              @input="validateForm"
            />
          </div>
          <div class="form-row">
            <label for="model-dbx-http-path">HTTP Path</label>
            <input
              type="text"
              v-model.trim="modelDetails.options.httpPath"
              class="sidebar-control-input"
              id="model-dbx-http-path"
              placeholder="Optional: /sql/1.0/warehouses/<id>"
              @input="validateForm"
            />
          </div>
          <div class="form-row">
            <label for="model-dbx-token">Token</label>
            <input
              type="password"
              v-model.trim="modelDetails.options.token"
              class="sidebar-control-input"
              id="model-dbx-token"
              placeholder="Optional: personal access token"
              @input="validateForm"
            />
          </div>
          <div class="form-row">
            <label for="model-dbx-engine-url">Engine URL</label>
            <input
              type="text"
              v-model.trim="modelDetails.options.engineUrl"
              class="sidebar-control-input"
              id="model-dbx-engine-url"
              placeholder="Optional: defaults to the hosted engine"
            />
          </div>
          <div class="form-row">
            <label for="model-dbx-save-credential">Save Credential?</label>
            <input
              type="checkbox"
              id="model-dbx-save-credential"
              v-model="modelDetails.options.saveCredential"
            />
          </div>
          <p
            v-if="partialWorkspace"
            class="form-hint"
            data-testid="model-creator-databricks-partial"
          >
            Host, HTTP Path and Token go together: fill in all three or none.
          </p>
        </template>
        <div class="form-row">
          <label for="model-import">Import From Address</label>
          <input
            placeholder="Optional. Import github definition."
            type="text"
            v-model.trim="modelDetails.importAddress"
            class="sidebar-control-input"
            id="model-import"
            @input="validateForm"
          />
        </div>
      </div>
      <div class="button-row">
        <loading-button
          data-testid="model-creation-submit"
          :action="performSubmit"
          class="submit-button"
          :disabled="!isFormValid"
        >
          {{ modelDetails.importAddress ? 'Import' : 'Create' }}
        </loading-button>
        <button type="button" @click="close()">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped src="../creatorForm.css"></style>
<style scoped>
.creator-container {
  --creator-label-width: 124px;
}
</style>
<script lang="ts">
import { computed, defineComponent, ref, inject, type PropType } from 'vue'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import { ModelImportService } from '../../models/helpers'
import Tooltip from '../Tooltip.vue'
import LoadingButton from '../LoadingButton.vue'
import ConnectionPicker, { type ConnectionPickerOption } from './ConnectionPicker.vue'
import { connectionTypes } from '../../stores/connectionStore'
import type { DashboardStoreType } from '../../stores/dashboardStore'

export interface ModelCreatorFormDefaults {
  name?: string
  importAddress?: string
  importToken?: string
  connection?: string
}

/** Connection types the import form can create, as `new-<type>` values. */
export const NEW_CONNECTION_TYPES: { type: string; label: string; icon: string }[] = [
  { type: 'duckdb', label: 'New DuckDB', icon: 'duckdb' },
  { type: 'motherduck', label: 'New MotherDuck', icon: 'motherduck' },
  { type: 'bigquery-oauth', label: 'New BigQuery (OAuth)', icon: 'bigquery-oauth' },
  { type: 'snowflake', label: 'New Snowflake (Key Pair Auth)', icon: 'snowflake' },
  { type: 'databricks', label: 'New Databricks (Beta)', icon: 'remote-worker:databricks' },
]

function emptyOptions() {
  return {
    mdToken: '',
    projectId: '',
    username: '',
    password: '',
    account: '',
    sshPrivateKey: '',
    engineKey: '',
    engineUrl: '',
    host: '',
    httpPath: '',
    token: '',
    saveCredential: false,
  }
}

function typeLabel(type: string | undefined): string | undefined {
  if (!type) return undefined
  const key = type.startsWith('remote-worker:') ? type.slice('remote-worker:'.length) : type
  return connectionTypes.find((t) => t.value === key)?.label ?? type
}

export default defineComponent({
  name: 'ModelCreator',
  components: {
    Tooltip,
    LoadingButton,
    ConnectionPicker,
  },
  props: {
    // Typed rather than a bare Object: as `Object` every field read off it is
    // `any`, which is how `importToken` came to be passed into importModel's
    // options-object parameter without vue-tsc noticing.
    formDefaults: {
      type: Object as PropType<ModelCreatorFormDefaults>,
      required: false,
      default: () => ({}),
    },
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
  setup(props, { emit }) {
    // display text
    const text = props.formDefaults.importAddress ? 'Import' : 'New'
    const isPopupControl = props.formDefaults.importAddress ? false : true

    // Form validation state
    const isFormValid = ref(false)

    // Placeholder for editor details
    const modelDetails = ref({
      name: props.formDefaults.name || '',
      importAddress: props.formDefaults.importAddress,
      importToken: props.formDefaults.importToken || '',
      connection: props.formDefaults.connection || '',
      options: emptyOptions(),
    })

    // Get required services
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const saveAll = inject<Function>('saveAll')

    if (!connectionStore || !modelStore || !editorStore || !saveAll || !dashboardStore) {
      throw 'must inject modelStore to ModelCreator'
    }

    // Create the model import service
    const modelImportService = new ModelImportService(editorStore, modelStore, dashboardStore)

    // Array of available connection names
    let connections = connectionStore.connections

    const connectionOptions = computed<ConnectionPickerOption[]>(() => [
      ...Object.values(connectionStore.connections)
        .map((connection) => ({
          value: connection.name,
          label: connection.name,
          type: connection.type,
          detail: typeLabel(connection.type),
          group: 'existing' as const,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      ...NEW_CONNECTION_TYPES.map(({ type, label, icon }) => ({
        value: `new-${type}`,
        label,
        type: icon,
        group: 'new' as const,
      })),
    ])

    function selectConnection(value: string) {
      modelDetails.value.connection = value
      validateForm()
    }

    // Workspace fields for a new Databricks connection are all-or-none: the
    // engine never mixes a caller's workspace with its own credentials.
    const partialWorkspace = computed(() => {
      if (modelDetails.value.connection !== 'new-databricks') return false
      const { host, httpPath, token } = modelDetails.value.options
      const filled = [host, httpPath, token].filter(Boolean).length
      return filled > 0 && filled < 3
    })

    // Function to validate the form
    function validateForm() {
      if (!modelDetails.value.name || !modelDetails.value.connection) {
        isFormValid.value = false
        return
      }

      // Check for required fields based on connection type
      if (
        modelDetails.value.connection === 'new-motherduck' &&
        !modelDetails.value.options.mdToken
      ) {
        isFormValid.value = false
        return
      }

      if (
        modelDetails.value.connection === 'new-bigquery-oauth' &&
        !modelDetails.value.options.projectId
      ) {
        isFormValid.value = false
        return
      }

      if (
        modelDetails.value.connection === 'new-snowflake' &&
        (!modelDetails.value.options.username ||
          !modelDetails.value.options.account ||
          !modelDetails.value.options.sshPrivateKey)
      ) {
        isFormValid.value = false
        return
      }

      if (
        modelDetails.value.connection === 'new-databricks' &&
        (!modelDetails.value.options.engineKey || partialWorkspace.value)
      ) {
        isFormValid.value = false
        return
      }

      // If we made it here, the form is valid
      isFormValid.value = true
    }

    // Initial validation
    validateForm()

    // Function to create the editor by collecting details from the form
    const createModel = () => {
      modelDetails.value.name = props.formDefaults.name || ''
      modelDetails.value.importAddress = props.formDefaults.importAddress
      modelDetails.value.importToken = props.formDefaults.importToken || ''
      modelDetails.value.connection = props.formDefaults.connection || ''
      modelDetails.value.options = emptyOptions()
    }

    // Function to submit the editor details
    const performSubmit = async () => {
      if (!modelDetails.value.name) {
        throw new Error('Model name is required')
      }

      // Create or get the model
      if (!modelStore.models[modelDetails.value.name]) {
        modelStore.newModelConfig(modelDetails.value.name)
      }

      // Create or use existing connection
      let connectionName = modelDetails.value.connection

      if (connectionName.startsWith('new-')) {
        let typeName = connectionName.replace('new-', '')
        connectionName = `${modelDetails.value.name}-connection`
        if (!connections[connectionName]) {
          connectionStore.newConnection(connectionName, typeName, {
            mdToken: modelDetails.value.options.mdToken,
            projectId: modelDetails.value.options.projectId,
            username: modelDetails.value.options.username,
            password: modelDetails.value.options.password,
            account: modelDetails.value.options.account,
            privateKey: modelDetails.value.options.sshPrivateKey,
            engineKey: modelDetails.value.options.engineKey,
            engineUrl: modelDetails.value.options.engineUrl,
            host: modelDetails.value.options.host,
            httpPath: modelDetails.value.options.httpPath,
            token: modelDetails.value.options.token,
            saveCredential: modelDetails.value.options.saveCredential,
          })
        }
      }

      // Set the model in the connection
      connectionStore.connectionByName(connectionName)?.setModel(modelDetails.value.name)

      // Import model from URL if specified
      if (modelDetails.value.importAddress) {
        try {
          await modelImportService.importModel(
            modelDetails.value.name,
            modelDetails.value.importAddress,
            connectionName,
            { token: modelDetails.value.importToken || undefined },
          )
        } catch (error) {
          console.error('Error importing model:', error)
          throw new Error('Failed to import model definition')
        }
      }

      // Save all changes
      await saveAll()

      // Wait a moment to show success state before closing
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Close the modal after successful submission
      emit('close')
    }

    return {
      modelDetails,
      connections,
      connectionOptions,
      selectConnection,
      partialWorkspace,
      createModel,
      performSubmit,
      validateForm,
      isFormValid,
      text,
      isPopupControl,
    }
  },
})
</script>
