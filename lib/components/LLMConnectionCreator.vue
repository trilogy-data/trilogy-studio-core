<template>
    <div class="relative-parent">
      <button @click="createConnection">Add LLM Provider</button>
  
      <div v-if="visible" class="absolute-form">
        <form @submit.prevent="submitConnectionCreation">
          <div>
            <label for="llm-connection-name">Name</label>
            <input type="text" v-model="connectionDetails.name" id="llm-connection-name" required />
          </div>
  
          <div>
            <label for="llm-provider-type">Provider</label>
            <select v-model="connectionDetails.type" id="llm-provider-type" required>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="cohere">Cohere</option>
              <option value="mistral">Mistral AI</option>
            </select>
          </div>
  
          <!-- Dynamic Fields Based on Provider Type -->
          <div>
            <label for="llm-api-key">API Key</label>
            <input
              type="password"
              v-model="connectionDetails.options.apiKey"
              id="llm-api-key"
              placeholder="API Key"
              required
            />
          </div>
          <div>
            <label for="save-credential">Save Credential?</label>
            <input
              type="checkbox"
              id="save-credential"
              v-model="connectionDetails.options.saveCredential"
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
  .button {
    flex: 1;
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
 import type { LLMConnectionStoreType } from '../stores/llmStore';
  // Define the expected store type

  
  export default defineComponent({
    name: 'LLMConnectionCreator',
    setup() {
      const connectionDetails = ref({
        name: '',
        type: 'openai',
        options: {
          apiKey: '',
          model: 'gpt-4o',
          saveCredential: false
        },
      })
  
      // Using injection instead of Pinia
      const connectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
      if (!connectionStore) {
        throw new Error('must inject llmConnectionStore to LLMConnectionCreator')
      }
  
      const connections = connectionStore.connections
      const visible = ref(false)
  
      const createConnection = () => {
        visible.value = !visible.value
        // Reset form
        connectionDetails.value.name = ''
        connectionDetails.value.type = 'openai'
        connectionDetails.value.options = {
          apiKey: '',
           model: 'gpt-4o',
          saveCredential: false
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
          visible.value = false
          
          // Add the new LLM connection to the store using the existing method
          connectionStore.newConnection(
            connectionDetails.value.name,
            connectionDetails.value.type,
            connectionDetails.value.options
          )
        }
      }
  
      return {
        visible,
        connectionDetails,
        connections,
        createConnection,
        submitConnectionCreation,
        updateDefaultModel
      }
    },
    watch: {
      'connectionDetails.type': {
        handler(newType) {
          this.updateDefaultModel(newType)
        }
      }
    }
  })
  </script>