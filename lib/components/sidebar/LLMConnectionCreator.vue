<template>
  <div v-if="visible" class="creator-container">
    <form @submit.prevent="submitConnectionCreation">
      <div class="form-row">
        <label for="llm-connection-name">Name</label>
        <input
          type="text"
          v-model="connectionDetails.name"
          id="llm-connection-name"
          required
          data-testid="llm-connection-creator-name"
          placeholder="Connection Name"
        />
      </div>

      <div class="form-row">
        <label for="llm-provider-type">Provider</label>
        <select
          v-model="connectionDetails.type"
          id="llm-provider-type"
          required
          data-testid="llm-connection-creator-type"
        >
          <option value="openai" data-testid="llm-connection-creator-openai">OpenAI</option>
          <option value="anthropic" data-testid="llm-connection-creator-anthropic">
            Anthropic
          </option>
          <option value="google" data-testid="llm-connection-creator-google">Google</option>
        </select>
      </div>

      <div class="form-row">
        <label for="llm-api-key">API Key</label>
        <input
          type="password"
          v-model="connectionDetails.options.apiKey"
          id="llm-api-key"
          placeholder="API Key"
          required
          data-testid="llm-connection-creator-api-key"
        />
      </div>
      <div class="form-row">
        <label for="save-credential">Save Credential?</label>
        <input
          type="checkbox"
          id="save-credential"
          v-model="connectionDetails.options.saveCredential"
          data-testid="llm-connection-creator-save-credential"
        />
      </div>

      <div class="button-row">
        <loading-button
          data-testid="llm-connection-creator-submit"
          :action="handleSubmitConnection"
          class="submit-button"
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
</style>

<script lang="ts">
import { defineComponent, ref, inject } from 'vue'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import LoadingButton from '../LoadingButton.vue'
import { OpenAIProvider } from '../../llm/openai'
import { AnthropicProvider } from '../../llm/anthropic'
import { GoogleProvider } from '../../llm/googlev2'

// Hardcoded fallback models for when the API hasn't been validated yet
const FALLBACK_MODELS = {
  openai: ['gpt-5.2', 'gpt-5.2-mini', 'gpt-5.1'],
  anthropic: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20240620'],
  google: ['models/gemini-2.5-pro', 'models/gemini-2.5-flash'],
}

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
  components: {
    LoadingButton,
  },
  setup(_, { emit }) {
    const connectionDetails = ref({
      name: '',
      type: 'openai',
      options: {
        apiKey: '',
        model: OpenAIProvider.getDefaultModel(FALLBACK_MODELS.openai),
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
        model: '',
        saveCredential: false,
      }

      // Set default model based on provider type
      updateDefaultModel('openai')
    }

    const updateDefaultModel = (providerType: string) => {
      // Use provider static methods to get the default model from fallback lists
      switch (providerType) {
        case 'openai':
          connectionDetails.value.options.model = OpenAIProvider.getDefaultModel(
            FALLBACK_MODELS.openai,
          )
          break
        case 'anthropic':
          connectionDetails.value.options.model = AnthropicProvider.getDefaultModel(
            FALLBACK_MODELS.anthropic,
          )
          break
        case 'google':
          connectionDetails.value.options.model = GoogleProvider.getDefaultModel(
            FALLBACK_MODELS.google,
          )
          break
        default:
          connectionDetails.value.options.model = ''
      }
    }

    const submitConnectionCreation = async () => {
      await handleSubmitConnection()
    }
    const handleSubmitConnection = async () => {
      if (!connectionDetails.value.name) {
        throw new Error('Connection name is required')
      }

      if (!connectionDetails.value.type) {
        throw new Error('Provider type is required')
      }

      if (!connectionDetails.value.options.apiKey) {
        throw new Error('API key is required')
      }

      // Add the new LLM connection to the store using the existing method
      await connectionStore.newConnection(
        connectionDetails.value.name,
        connectionDetails.value.type,
        connectionDetails.value.options,
      )

      // Close the form on success
      emit('close')

      // Return success message
      return 'Connection created successfully'
    }
    return {
      connectionDetails,
      connections,
      createConnection,
      handleSubmitConnection,
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
