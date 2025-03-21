<template>
  <div v-if="visible" class="creator-container">
    <form @submit.prevent="submitConnectionCreation">
      <div class="form-row">
        <label for="llm-connection-name">Name</label>
        <input type="text" v-model="connectionDetails.name" id="llm-connection-name" required />
      </div>

      <div class="form-row">
        <label for="llm-provider-type">Provider</label>
        <select v-model="connectionDetails.type" id="llm-provider-type" required>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <!-- <option value="cohere">Cohere</option> -->
          <!-- <option value="mistral">Mistral AI</option> -->
        </select>
      </div>

      <div class="form-row">
        <label for="llm-api-key">API Key</label>
        <input type="password" v-model="connectionDetails.options.apiKey" id="llm-api-key" placeholder="API Key"
          required />
      </div>
      <div class="form-row">
        <label for="save-credential">Save Credential?</label>
        <input type="checkbox" id="save-credential" v-model="connectionDetails.options.saveCredential" />
      </div>

      <div class="button-row">
        <button data-testid="llm-connection-creator-submit" type="submit">Submit</button>
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
import type { LLMConnectionStoreType } from '../stores/llmStore'
// Define the expected store type

export default defineComponent({
  name: 'LLMConnectionCreator',
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
      type: 'openai',
      options: {
        apiKey: '',
        model: 'gpt-4o',
        saveCredential: false,
      },
    })

    // Using injection instead of Pinia
    const connectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    if (!connectionStore) {
      throw new Error('must inject llmConnectionStore to LLMConnectionCreator')
    }

    const connections = connectionStore.connections

    const createConnection = () => {
      // Reset form
      connectionDetails.value.name = ''
      connectionDetails.value.type = 'openai'
      connectionDetails.value.options = {
        apiKey: '',
        model: 'gpt-4o',
        saveCredential: false,
      }

      // Set default model based on provider type
      updateDefaultModel('openai')
    }

    const updateDefaultModel = (providerType: string) => {
      switch (providerType) {
        case 'openai':
          connectionDetails.value.options.model = 'gpt-3o-mini'
          break
        case 'anthropic':
          connectionDetails.value.options.model = 'claude-3-sonnet-20240229'
          break
        case 'cohere':
          connectionDetails.value.options.model = 'command'
          break
        case 'mistral':
          connectionDetails.value.options.model = 'mistral-large-latest'
          break
        default:
          connectionDetails.value.options.model = ''
      }
    }

    const submitConnectionCreation = () => {
      if (connectionDetails.value.name && connectionDetails.value.type) {

        // Add the new LLM connection to the store using the existing method
        connectionStore.newConnection(
          connectionDetails.value.name,
          connectionDetails.value.type,
          connectionDetails.value.options,
        )
        emit('close')
      }
    }

    return {
      connectionDetails,
      connections,
      createConnection,
      submitConnectionCreation,
      updateDefaultModel,
    }
  },
  watch: {
    'connectionDetails.type': {
      handler(newType) {
        this.updateDefaultModel(newType)
      },
    },
  },
})
</script>
