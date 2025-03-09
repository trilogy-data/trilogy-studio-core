<template>
  <div class="llm-chat-container">
    <div class="connection-controls">
      <div class="provider-selector">
        <label for="provider-select">Provider:</label>
        <select id="provider-select" v-model="selectedProvider">
          <option v-for="provider in availableProviders" :key="provider" :value="provider">
            {{ provider }} 
            <span v-if="getConnectionStatus(provider)">
              ({{ getConnectionStatus(provider) }})
            </span>
          </option>
        </select>
        <span class="status-indicator" :class="getConnectionStatus(selectedProvider)"></span>
      </div>

      <div class="model-selector">
        <label for="model-select">Model:</label>
        <select id="model-select" v-model="selectedModel">
          <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
        </select>
      </div>
    </div>

    <div class="parameters-container" v-if="showAdvancedOptions">
      <div class="parameter">
        <label for="temperature">Temperature:</label>
        <input 
          id="temperature" 
          type="range" 
          v-model.number="temperature" 
          min="0" 
          max="1" 
          step="0.1"
        />
        <span>{{ temperature }}</span>
      </div>
      
      <div class="parameter">
        <label for="max-tokens">Max Tokens:</label>
        <input 
          id="max-tokens" 
          type="number" 
          v-model.number="maxTokens" 
          min="1" 
          max="4096"
        />
      </div>
      
      <div class="parameter">
        <label for="top-p">Top P:</label>
        <input 
          id="top-p" 
          type="range" 
          v-model.number="topP" 
          min="0" 
          max="1" 
          step="0.1"
        />
        <span>{{ topP }}</span>
      </div>
    </div>

    <div class="toggle-options">
      <button @click="showAdvancedOptions = !showAdvancedOptions">
        {{ showAdvancedOptions ? 'Hide' : 'Show' }} Advanced Options
      </button>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
        <div class="message-header">
          <strong>{{ message.role === 'user' ? 'You' : 'AI' }}</strong>
          <span v-if="message.role === 'assistant' && message.modelInfo" class="model-info">
            {{ message.modelInfo.model }} ({{ message.modelInfo.totalTokens }} tokens)
          </span>
        </div>
        <div class="message-content">{{ message.content }}</div>
      </div>
    </div>

    <div class="input-container">
      <textarea 
        v-model="userInput" 
        @keydown.enter.ctrl="sendPrompt"
        placeholder="Type your message here... (Ctrl+Enter to send)"
        :disabled="isLoading || !isProviderSelected"
      ></textarea>
      <button 
        @click="sendPrompt" 
        :disabled="isLoading || !userInput.trim() || !isProviderSelected"
      >
        {{ isLoading ? 'Sending...' : 'Send' }}
      </button>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, nextTick, watch, inject } from 'vue';
import type { LLMRequestOptions, LLMResponse } from '../llm'; // Adjust path as needed
import type { LLMConnectionStoreType } from '../stores/llmStore'; // Adjust path as needed

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  modelInfo?: {
    model: string;
    totalTokens: number;
  };
}

// Provider model mapping - could be moved to a configuration file
const providerModels: Record<string, string[]> = {
  'AnthropicProvider': ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
  'OpenAIProvider': ['gpt-4', 'gpt-3.5-turbo'],
  'MistralProvider': ['mistral-large', 'mistral-medium', 'mistral-small']
};

export default defineComponent({
  name: 'LLMChatComponent',
  
  props: {
    initialProvider: {
      type: String,
      default: ''
    },
    initialModel: {
      type: String,
      default: ''
    }
  },
  
  setup(props, ) {
    // Inject the store
    const llmConnectionStore = inject('llmConnectionStore') as LLMConnectionStoreType;
    
    // Chat state
    const messages = ref<ChatMessage[]>([]);
    const userInput = ref('');
    const isLoading = ref(false);
    const error = ref('');
    const messagesContainer = ref<HTMLElement | null>(null);
    
    // Connection state
    const selectedProvider = ref(props.initialProvider || '');
    const selectedModel = ref(props.initialModel || '');
    
    // Advanced options
    const showAdvancedOptions = ref(false);
    const temperature = ref(0.7);
    const maxTokens = ref(1024);
    const topP = ref(1.0);
    
    // Computed properties
    const availableProviders = computed(() => {
      return Object.keys(llmConnectionStore.connections);
    });
    
    const availableModels = computed(() => {
      if (!selectedProvider.value) return [];
      return providerModels[selectedProvider.value] || [];
    });
    
    const isProviderSelected = computed(() => {
      return !!selectedProvider.value && llmConnectionStore.getConnection(selectedProvider.value) !== null;
    });
    
    // When provider changes, select the first model in that provider's list
    watch(selectedProvider, (newProvider) => {
      if (newProvider && providerModels[newProvider] && providerModels[newProvider].length > 0) {
        selectedModel.value = providerModels[newProvider][0];
      } else {
        selectedModel.value = '';
      }
      
      // Reset error when changing providers
      error.value = '';
    });
    
    // Scroll to bottom when messages are updated
    watch(messages, () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
      });
    });
    
    // Get the connection status for display
    const getConnectionStatus = (providerName: string) => {
      if (!providerName) return 'disabled';
      return llmConnectionStore.getConnectionStatus(providerName);
    };
    
    const sendPrompt = async () => {
      if (!userInput.value.trim() || isLoading.value || !selectedProvider.value) return;
      
      // Add user message
      messages.value.push({
        role: 'user',
        content: userInput.value
      });
      
      const prompt = userInput.value;
      userInput.value = ''; // Clear input field
      isLoading.value = true;
      error.value = '';
      
      try {
        const options: LLMRequestOptions = {
          prompt,
          model: selectedModel.value,
          maxTokens: maxTokens.value,
          temperature: temperature.value,
          topP: topP.value
        };
        
        const response: LLMResponse = await llmConnectionStore.generateCompletion(
          selectedProvider.value, 
          options
        );
        
        // Add AI response
        messages.value.push({
          role: 'assistant',
          content: response.text,
          modelInfo: {
            model: response.model,
            totalTokens: response.usage.totalTokens
          }
        });
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'An unknown error occurred';
      } finally {
        isLoading.value = false;
      }
    };
    
    // Initialize providers list on mount if none are available
    onMounted(() => {
      if (availableProviders.value.length === 0) {
        error.value = 'No LLM providers available. Please configure providers in settings.';
      }
    });
    
    return {
      messages,
      userInput,
      isLoading,
      error,
      selectedProvider,
      selectedModel,
      availableProviders,
      availableModels,
      isProviderSelected,
      showAdvancedOptions,
      temperature,
      maxTokens,
      topP,
      messagesContainer,
      getConnectionStatus,
      sendPrompt
    };
  }
});
</script>

<style scoped>
.llm-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.connection-controls {
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  gap: 15px;
}

.provider-selector, .model-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-selector label, .model-selector label {
  font-weight: bold;
}

.provider-selector select, .model-selector select {
  padding: 5px;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.status-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-left: 5px;
}

.status-indicator.connected {
  background-color: #4caf50;
}

.status-indicator.running {
  background-color: #2196f3;
}

.status-indicator.failed {
  background-color: #f44336;
}

.status-indicator.disabled {
  background-color: #9e9e9e;
}

.parameters-container {
  padding: 10px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.parameter {
  display: flex;
  align-items: center;
  gap: 5px;
}

.toggle-options {
  padding: 5px 10px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.toggle-options button {
  background: none;
  border: none;
  color: #2c3e50;
  cursor: pointer;
  font-size: 0.9em;
  text-decoration: underline;
}

.chat-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  background-color: #f9f9f9;
}

.message {
  padding: 10px 15px;
  border-radius: 8px;
  max-width: 80%;
  word-break: break-word;
}

.message.user {
  align-self: flex-end;
  background-color: #e3f2fd;
  border: 1px solid #bbdefb;
}

.message.assistant {
  align-self: flex-start;
  background-color: #ffffff;
  border: 1px solid #e0e0e0;
}

.message-header {
  margin-bottom: 5px;
  font-size: 0.9em;
  display: flex;
  justify-content: space-between;
}

.model-info {
  font-size: 0.8em;
  color: #757575;
}

.input-container {
  display: flex;
  padding: 10px;
  border-top: 1px solid #e0e0e0;
  background-color: #ffffff;
}

.input-container textarea {
  flex-grow: 1;
  min-height: 60px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
  font-family: inherit;
}

.input-container button {
  margin-left: 10px;
  padding: 0 15px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.input-container button:hover:not(:disabled) {
  background-color: #0d8aee;
}

.input-container button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error-message {
  color: #f44336;
  padding: 10px;
  text-align: center;
  background-color: #ffebee;
  border-top: 1px solid #ffcdd2;
}
</style>