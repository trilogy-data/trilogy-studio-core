<template>
  <div class="relative-parent">
    <button @click="createModel" v-if="isPopupControl">New</button>
    <loading-button v-else :action="createModel">{{ text }}</loading-button>
    <div v-if="visible" :class="{ 'absolute-form': absolute, 'fixed-form': !absolute }">
      <form @submit.prevent="submitModelCreation">
        <div>
          <label for="model-name">Name</label>
          <input type="text" v-model="modelDetails.name" id="model-name" required />
          <label for="model-import">Assign To Connection</label>
          <select
            v-model="modelDetails.connection"
            id="model-connection"
            placeholder="Models must have a connection."
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
          <div v-if="modelDetails.connection === 'new-motherduck'">
            <label for="md-token">MotherDuck Token</label>
            <input
              type="text"
              v-model="modelDetails.options.mdToken"
              id="md-token"
              placeholder="MotherDuck Token"
              required
            />
          </div>

          <div v-if="modelDetails.connection === 'new-bigquery-oauth'">
            <label for="project-id">BigQuery Project ID</label>
            <input
              type="text"
              v-model="modelDetails.options.projectId"
              id="project-id"
              placeholder="Billing Project ID"
              required
            />
          </div>
          <label for="model-import">Import From Address</label>
          <input
            placeholder="Optional. Import github definition."
            type="text"
            v-model="modelDetails.importAddress"
            id="model-import"
          />
        </div>
        <button type="submit">Submit</button>
        <button type="button" @click="visible = !visible">Cancel</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.relative-parent {
  position: relative;
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
    absolute: {
      type: Boolean,
      required: false,
      default: true,
    },
  },
  setup(props) {
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
    if (!connectionStore || !modelStore || !editorStore) {
      throw 'must inject modelStore to ModelCreator'
    }

    let connections = connectionStore.connections
    //visible
    let visible = ref(false)

    // Function to create the editor by collecting details from the form
    const createModel = () => {
      visible.value = !visible.value
      ;(modelDetails.value.name = props.formDefaults.name || ''),
        (modelDetails.value.importAddress = props.formDefaults.importAddress),
        (modelDetails.value.connection = props.formDefaults.connection || ''),
        (modelDetails.value.options = { mdToken: '', projectId: '', username: '', password: '' }) // Reset options
    }

    // Function to submit the editor details
    const submitModelCreation = async () => {
      if (modelDetails.value.name) {
        // check if it already exists
        if (!modelStore.models[modelDetails.value.name]) {
          modelStore.newModelConfig(modelDetails.value.name)
        }
        let typeName = modelDetails.value.connection
        if (typeName.startsWith('new-')) {
          typeName = typeName.replace('new-', '')
          connectionStore.newConnection(
            modelDetails.value.name,
            typeName,
            {
              mdToken: modelDetails.value.options.mdToken,
              projectId: modelDetails.value.options.projectId,
              username: modelDetails.value.options.username,
              password: modelDetails.value.options.password,
            },
          )
        }
        connectionStore.connections[modelDetails.value.name].setModel(modelDetails.value.name)
        if (modelDetails.value.importAddress) {
          const data = await fetchModelImports(
            await fetchModelImportBase(modelDetails.value.importAddress),
          )
          modelStore.models[modelDetails.value.name].sources = data.map((response) => {
            if (!editorStore.editors[response.name]) {
              editorStore.newEditor(
                response.name,
                'trilogy',
                modelDetails.value.name,
                response.content,
              )
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
        visible.value = false
      }
    }

    return {
      visible,
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
