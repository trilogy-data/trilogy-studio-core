<template>
    <div class="relative-parent">
      <button @click="createConnection">Add LLM Provider</button>
  
      <div v-if="visible" class="absolute-form">
        <form @submit.prevent="submitConnectionCreation">
          <div>
            <label for="connection-name">Name</label>
            <input type="text" v-model="connectionDetails.name" id="connection-name" required />
          </div>
  
          <div>
            <label for="provider-type">Provider</label>
            <select v-model="connectionDetails.type" id="provider-type" required>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="cohere">Cohere</option>
              <option value="mistral">Mistral AI</option>
            </select>
          </div>
  
          <!-- Dynamic Fields Based on Provider Type -->
          <div>
            <label for="api-key">API Key</label>
            <input
              type="password"
              v-model="connectionDetails.options.apiKey"
              id="api-key"
              placeholder="API Key"
              required
            />
          </div>
  
          <!-- OpenAI specific options -->
          <div v-if="connectionDetails.type === 'openai'">
            <label for="openai-model">Model</label>
            <select v-model="connectionDetails.options.defaultModel" id="openai-model">
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="gpt-3o-mini">GPT-3o Mini</option>
            </select>
          </div>
  
          <!-- Anthropic specific options -->
          <div v-if="connectionDetails.type === 'anthropic'">
            <label for="anthropic-model">Model</label>
            <select v-model="connectionDetails.options.defaultModel" id="anthropic-model">
              <option value="claude-3-opus-20240229">Claude 3 Opus</option>
              <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
              <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
            </select>
          </div>
  
          <!-- Cohere specific options -->
          <div v-if="connectionDetails.type === 'cohere'">
            <label for="cohere-model">Model</label>
            <select v-model="connectionDetails.options.defaultModel" id="cohere-model">
              <option value="command">Command</option>
              <option value="command-light">Command Light</option>
              <option value="command-r">Command R</option>
            </select>
          </div>
  
          <!-- Mistral AI specific options -->
          <div v-if="connectionDetails.type === 'mistral'">
            <label for="mistral-model">Model</label>
            <select v-model="connectionDetails.options.defaultModel" id="mistral-model">
              <option value="mistral-large-latest">Mistral Large</option>
              <option value="mistral-medium-latest">Mistral Medium</option>
              <option value="mistral-small-latest">Mistral Small</option>
            </select>
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