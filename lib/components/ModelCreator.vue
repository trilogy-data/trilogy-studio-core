<template>
  <div v-if="visible" class="creator-container">
    <form>
      <div>
        <div class="form-row">
          <label for="model-name">Name</label>
          <input
            type="text"
            v-model.trim="modelDetails.name"
            id="model-name"
            required
            @input="validateForm"
          />
        </div>
        <div class="form-row">
          <label for="model-import">Assign To Connection</label>
          <select
            v-model="modelDetails.connection"
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
            <option value="new-bigquery">New Bigquery Oauth</option>
          </select>
        </div>
        <div v-if="modelDetails.connection === 'new-motherduck'" class="form-row">
          <label for="md-token">MotherDuck Token</label>
          <input
            type="text"
            v-model.trim="modelDetails.options.mdToken"
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
            id="project-id"
            placeholder="Billing Project ID"
            required
            @input="validateForm"
          />
        </div>
        <div class="form-row">
          <label for="model-import">Import From Address</label>
          <input
            placeholder="Optional. Import github definition."
            type="text"
            v-model.trim="modelDetails.importAddress"
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
          Submit
        </loading-button>
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

.submit-button {
  /* Ensure consistent styling with button */
  border: 1px solid var(--border-color);
  background-color: var(--bg-color);
  color: var(--color);
  cursor: pointer;
  font-size: var(--small-font-size);
  height: var(--sidebar-sub-item-height);
  padding: 0 10px;
}
</style>
<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import { ModelImport } from '../models'
import type { EditorStoreType } from '../stores/editorStore'
import { EditorTag } from '../editors'
import { ModelSource } from '../models'
import Tooltip from './Tooltip.vue'
import LoadingButton from './LoadingButton.vue'

export async function fetchModelImportBase(url: string): Promise<ModelImport> {
  const response = await fetch(url)
  const content = await response.text()
  return JSON.parse(content)
}

function purposeToTag(purpose: string): EditorTag | null {
  switch (purpose) {
    case 'source':
      return EditorTag.SOURCE
    case 'setup':
      return EditorTag.STARTUP_SCRIPT
    default:
      return null
  }
}

export async function fetchModelImports(modelImport: ModelImport): Promise<
  {
    name: string
    alias: string
    purpose: EditorTag | null
    content: string
    type?: string | undefined
  }[]
> {
  return Promise.all(
    modelImport.components.map(async (component) => {
      try {
        const response = await fetch(component.url)
        if (!response.ok) {
          throw new Error(`Failed to fetch ${component.url}: ${response.statusText}`)
        }
        const content = await response.text()
        return {
          name: component.name,
          alias: component.alias,
          purpose: purposeToTag(component.purpose),
          content,
          type: component.type,
        }
      } catch (error) {
        console.error(error)
        return {
          name: component.name,
          alias: component.alias,
          purpose: purposeToTag(component.purpose),
          content: '', // Return empty content on failure
        }
      }
    }),
  )
}

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
      connection: props.formDefaults.connection || '',
      options: { mdToken: '', projectId: '', username: '', password: '' },
    })

    // Array of available connection names
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveAll = inject<Function>('saveAll')
    if (!connectionStore || !modelStore || !editorStore || !saveAll) {
      throw 'must inject modelStore to ModelCreator'
    }

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

      // If we made it here, the form is valid
      isFormValid.value = true
    }

    // Initial validation
    validateForm()

    // Function to create the editor by collecting details from the form
    const createModel = () => {
      modelDetails.value.name = props.formDefaults.name || ''
      modelDetails.value.importAddress = props.formDefaults.importAddress
      modelDetails.value.connection = props.formDefaults.connection || ''
      modelDetails.value.options = { mdToken: '', projectId: '', username: '', password: '' } // Reset options
    }

    // Function to submit the editor details - now wrapped in a function that will be passed to LoadingButton
    const performSubmit = async () => {
      if (!modelDetails.value.name) {
        throw new Error('Model name is required')
      }

      if (!modelStore.models[modelDetails.value.name]) {
        modelStore.newModelConfig(modelDetails.value.name)
      }
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
          })
        }
      }

      connectionStore.connections[connectionName].setModel(modelDetails.value.name)
      if (modelDetails.value.importAddress) {
        try {
          const modelImportBase = await fetchModelImportBase(modelDetails.value.importAddress)
          const data = await fetchModelImports(modelImportBase)
          // @ts-ignore
          modelStore.models[modelDetails.value.name].sources = data
            .map((response) => {
              let editorName = response.name

              // Handle name collisions by appending a suffix if needed
              if (
                editorStore.editors[editorName] &&
                editorStore.editors[editorName].connection !== connectionName
              ) {
                let suffix = 1
                while (editorStore.editors[`${response.name}_${suffix}`]) {
                  // If the editor with suffix exists but has the same connection, we can use it
                  if (
                    editorStore.editors[`${response.name}_${suffix}`].connection === connectionName
                  ) {
                    editorName = `${response.name}_${suffix}`
                    break
                  }
                  // Otherwise, keep incrementing the suffix
                  suffix++
                }
                // If we exited the loop without finding a matching connection, use the latest suffix
                if (editorStore.editors[editorName]?.connection !== connectionName) {
                  editorName = `${response.name}_${suffix}`
                }
              }

              // Create or update the editor based on editorName
              if (!editorStore.editors[editorName]) {
                if (response.type === 'sql') {
                  editorStore.newEditor(editorName, 'sql', connectionName, response.content)
                } else {
                  editorStore.newEditor(editorName, 'trilogy', connectionName, response.content)
                }
              } else if (editorStore.editors[editorName].connection === connectionName) {
                editorStore.editors[editorName].contents = response.content
              }

              // Add source as a tag
              if (
                response.purpose &&
                !editorStore.editors[editorName].tags.includes(response.purpose)
              ) {
                editorStore.editors[editorName].tags.push(response.purpose)
              }
              if (response.type === 'sql') {
                return null
              }

              return new ModelSource(editorName, response.alias || response.name, [], [])
            })
            .filter((source) => source)
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
