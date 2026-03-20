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
          <label for="model-import">Assign To Connection</label>
          <select
            v-model="modelDetails.connection"
            class="sidebar-control-select"
            id="model-connection"
            placeholder="Models must have a connection."
            data-testid="model-creator-connection"
            required
            @change="validateForm"
          >
            <option
              v-for="connection in connections"
              :key="connection.name"
              :value="connection.name"
            >
              {{ connection.name }}
            </option>
            <option value="new-duckdb">New DuckDB</option>
            <option value="new-motherduck">New MotherDuck</option>
            <option value="new-bigquery-oauth">New Bigquery Oauth</option>
            <option value="new-snowflake">New Snowflake</option>
            <!-- <option value="new-bigquery">New Bigquery Oauth</option> -->
          </select>
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
import { defineComponent, ref, inject } from 'vue'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import { ModelImportService } from '../../models/helpers'
import Tooltip from '../Tooltip.vue'
import LoadingButton from '../LoadingButton.vue'
import type { DashboardStoreType } from '../../stores/dashboardStore'

export default defineComponent({
  name: 'ModelCreator',
  components: {
    Tooltip,
    LoadingButton,
  },
  props: {
    formDefaults: {
      type: Object,
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
      options: {
        mdToken: '',
        projectId: '',
        username: '',
        password: '',
        account: '',
        sshPrivateKey: '',
      },
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
      modelDetails.value.options = {
        mdToken: '',
        projectId: '',
        username: '',
        password: '',
        account: '',
        sshPrivateKey: '',
      } // Reset options
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
          })
        }
      }

      // Set the model in the connection
      connectionStore.connections[connectionName].setModel(modelDetails.value.name)

      // Import model from URL if specified
      if (modelDetails.value.importAddress) {
        try {
          await modelImportService.importModel(
            modelDetails.value.name,
            modelDetails.value.importAddress,
            connectionName,
            modelDetails.value.importToken || undefined,
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
