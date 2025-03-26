<template>
  <div v-if="visible" class="creator-container">
    <form @submit.prevent="submitModelCreation">
      <div>
        <div class="form-row">
          <label for="model-name">Name</label>
          <input type="text" v-model="modelDetails.name" id="model-name" required />
        </div>
        <div class="form-row">
          <label for="model-import">Assign To Connection</label>
          <select
            v-model="modelDetails.connection"
            id="model-connection"
            placeholder="Models must have a connection."
            data-testid="model-creator-connection"
            required
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
          </select>
        </div>
        <div v-if="modelDetails.connection === 'new-motherduck'" class="form-row">
          <label for="md-token">MotherDuck Token</label>
          <input
            type="text"
            v-model="modelDetails.options.mdToken"
            id="md-token"
            placeholder="MotherDuck Token"
            required
          />
        </div>

        <div v-if="modelDetails.connection === 'new-bigquery-oauth'" class="form-row">
          <label for="project-id">BigQuery Project ID</label>
          <input
            type="text"
            v-model="modelDetails.options.projectId"
            id="project-id"
            placeholder="Billing Project ID"
            required
          />
        </div>
        <div class="form-row">
          <label for="model-import">Import From Address</label>
          <input
            placeholder="Optional. Import github definition."
            type="text"
            v-model="modelDetails.importAddress"
            id="model-import"
          />
        </div>
      </div>
      <div class="button-row">
        <button data-testid="model-creation-submit" type="submit">Submit</button>
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

export async function fetchModelImports(
  modelImport: ModelImport,
): Promise<{ name: string; alias: string; purpose: EditorTag | null; content: string }[]> {
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
          purpose: component.purpose == 'source' ? EditorTag.SOURCE : null,
          content,
        }
      } catch (error) {
        console.error(error)
        return {
          name: component.name,
          alias: component.alias,
          purpose: component.purpose == 'source' ? EditorTag.SOURCE : null,
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

    // Function to create the editor by collecting details from the form
    const createModel = () => {
      modelDetails.value.name = props.formDefaults.name || ''
      modelDetails.value.importAddress = props.formDefaults.importAddress
      modelDetails.value.connection = props.formDefaults.connection || ''
      modelDetails.value.options = { mdToken: '', projectId: '', username: '', password: '' } // Reset options
    }

    // Function to submit the editor details
    const submitModelCreation = async () => {
      if (modelDetails.value.name) {
        // check if it already exists
        if (!modelStore.models[modelDetails.value.name]) {
          modelStore.newModelConfig(modelDetails.value.name)
        }
        let connectionName = modelDetails.value.connection

        if (connectionName.startsWith('new-')) {
          let typeName = connectionName.replace('new-', '')
          connectionName = `${modelDetails.value.name}-connection`
          connectionStore.newConnection(connectionName, typeName, {
            mdToken: modelDetails.value.options.mdToken,
            projectId: modelDetails.value.options.projectId,
            username: modelDetails.value.options.username,
            password: modelDetails.value.options.password,
          })
        }

        connectionStore.connections[connectionName].setModel(modelDetails.value.name)
        if (modelDetails.value.importAddress) {
          const data = await fetchModelImports(
            await fetchModelImportBase(modelDetails.value.importAddress),
          )
          modelStore.models[modelDetails.value.name].sources = data.map((response) => {
            if (!editorStore.editors[response.name]) {
              editorStore.newEditor(response.name, 'trilogy', connectionName, response.content)
            } else {
              editorStore.editors[response.name].contents = response.content
            }
            // add source as a tag
            if (
              response.purpose &&
              !editorStore.editors[response.name].tags.includes(response.purpose)
            ) {
              editorStore.editors[response.name].tags.push(response.purpose)
            }
            return new ModelSource(response.name, response.alias || response.name, [], [])
          })
        }
        await saveAll()
        emit('close')
      }
    }

    return {
      modelDetails,
      connections,
      createModel,
      submitModelCreation,
      text,
      isPopupControl,
    }
  },
})
</script>
