<template>
  <div class="llm-chat-demo">
    <!-- Provider Selection (if no provider is pre-configured) -->
    <div v-if="showProviderSelector && !hasActiveConnection" class="provider-setup">
      <div class="setup-header">
        <h2>Configure LLM Connection</h2>
        <p>Select a provider and configure your API key to start chatting.</p>
      </div>

      <div class="setup-form">
        <div class="form-group">
          <label for="provider-select">Provider</label>
          <select id="provider-select" v-model="selectedProvider">
            <option value="">Select a provider...</option>
            <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </div>

        <div class="form-group" v-if="selectedProvider">
          <label for="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            v-model="apiKey"
            placeholder="Enter your API key"
          />
        </div>

        <div class="form-group" v-if="selectedProvider && providerModels.length > 0">
          <label for="model-select">Model</label>
          <select id="model-select" v-model="selectedModel">
            <option v-for="model in providerModels" :key="model.id" :value="model.id">
              {{ model.name }}
            </option>
          </select>
        </div>

        <button
          class="connect-btn"
          @click="connectProvider"
          :disabled="!canConnect"
        >
          Connect
        </button>

        <div v-if="connectionError" class="error-message">
          {{ connectionError }}
        </div>
      </div>
    </div>

    <!-- Chat Interface -->
    <div v-else class="chat-interface">
      <l-l-m-chat-with-artifacts
        ref="chatWithArtifacts"
        :title="title"
        :showHeader="true"
        :placeholder="placeholder"
        :systemPrompt="effectiveSystemPrompt"
        :onSendMessage="customMessageHandler || undefined"
      >
        <template #header-actions>
          <div class="demo-header-actions">
            <span v-if="connectionName" class="connection-badge">
              <i class="mdi mdi-check-circle"></i>
              {{ connectionName }}
            </span>
            <button
              v-if="showProviderSelector"
              class="header-btn"
              @click="disconnect"
              title="Change provider"
            >
              <i class="mdi mdi-cog-outline"></i>
            </button>
          </div>
        </template>
      </l-l-m-chat-with-artifacts>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, inject, onMounted, type PropType } from 'vue'
import LLMChatWithArtifacts from './LLMChatWithArtifacts.vue'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ChatArtifact, ChatMessage } from './LLMChat.vue'

interface ProviderOption {
  id: string
  name: string
}

interface ModelOption {
  id: string
  name: string
}

export default defineComponent({
  name: 'LLMChatDemoComponent',
  components: {
    LLMChatWithArtifacts,
  },
  props: {
    title: {
      type: String,
      default: 'AI Chat',
    },
    placeholder: {
      type: String,
      default: 'Ask me anything...',
    },
    systemPrompt: {
      type: String,
      default: '',
    },
    // Pre-configured provider (skips provider selection)
    provider: {
      type: String,
      default: '',
    },
    // Pre-configured API key
    providerApiKey: {
      type: String,
      default: '',
    },
    // Pre-configured model
    model: {
      type: String,
      default: '',
    },
    // Show provider selector UI
    showProviderSelector: {
      type: Boolean,
      default: true,
    },
    // Custom message handler for full control over responses
    customMessageHandler: {
      type: [Function, null] as PropType<
        ((message: string, messages: ChatMessage[]) => Promise<{ response?: string; artifact?: ChatArtifact } | void>) | null
      >,
      default: undefined,
    },
    // Default system prompt for data analysis
    enableDataAnalysis: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const chatWithArtifacts = ref<InstanceType<typeof LLMChatWithArtifacts> | null>(null)
    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore', null as any)

    const selectedProvider = ref(props.provider)
    const apiKey = ref(props.providerApiKey)
    const selectedModel = ref(props.model)
    const connectionError = ref('')
    const isConnected = ref(false)
    const connectionName = ref('')

    const availableProviders = computed<ProviderOption[]>(() => {
      return [
        { id: 'anthropic', name: 'Anthropic (Claude)' },
        { id: 'openai', name: 'OpenAI' },
        { id: 'google', name: 'Google (Gemini)' },
        { id: 'mistral', name: 'Mistral' },
      ]
    })

    const providerModels = computed<ModelOption[]>(() => {
      switch (selectedProvider.value) {
        case 'anthropic':
          return [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
          ]
        case 'openai':
          return [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
          ]
        case 'google':
          return [
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
          ]
        case 'mistral':
          return [
            { id: 'mistral-large-latest', name: 'Mistral Large' },
            { id: 'mistral-medium-latest', name: 'Mistral Medium' },
          ]
        default:
          return []
      }
    })

    const hasActiveConnection = computed(() => {
      if (props.customMessageHandler) return true
      if (!llmStore) return false
      return llmStore.activeConnection !== null && isConnected.value
    })

    const canConnect = computed(() => {
      return selectedProvider.value && apiKey.value
    })

    const effectiveSystemPrompt = computed(() => {
      if (props.systemPrompt) return props.systemPrompt

      if (props.enableDataAnalysis) {
        return `You are a helpful data analysis assistant. When you analyze data and generate results:
1. If you produce tabular data, format it clearly
2. Explain your analysis steps
3. Highlight key insights and patterns
4. Suggest follow-up questions or analyses

Be concise but thorough in your explanations.`
      }

      return 'You are a helpful AI assistant. Be concise and helpful in your responses.'
    })

    const connectProvider = async () => {
      if (!llmStore) {
        connectionError.value = 'LLM store not available'
        return
      }

      connectionError.value = ''

      try {
        const model = selectedModel.value || providerModels.value[0]?.id
        const connName = `${selectedProvider.value}-${Date.now()}`

        // Create connection using the store's newConnection method
        llmStore.newConnection(connName, selectedProvider.value, {
          apiKey: apiKey.value,
          model: model,
          saveCredential: false,
        })

        llmStore.activeConnection = connName
        isConnected.value = true
        connectionName.value = `${selectedProvider.value} (${model})`
      } catch (error) {
        connectionError.value = error instanceof Error ? error.message : 'Failed to connect'
      }
    }

    const disconnect = () => {
      isConnected.value = false
      connectionName.value = ''
      selectedProvider.value = ''
      apiKey.value = ''
      selectedModel.value = ''
    }

    // Auto-connect if provider info is pre-configured
    onMounted(async () => {
      if (props.provider && props.providerApiKey) {
        selectedProvider.value = props.provider
        apiKey.value = props.providerApiKey
        if (props.model) {
          selectedModel.value = props.model
        } else if (providerModels.value.length > 0) {
          selectedModel.value = providerModels.value[0].id
        }
        await connectProvider()
      } else if (llmStore?.activeConnection) {
        // Use existing connection
        isConnected.value = true
        connectionName.value = llmStore.activeConnection
      }
    })

    // Public API for external control
    const addArtifact = (artifact: ChatArtifact, message?: string) => {
      chatWithArtifacts.value?.addArtifact(artifact, message)
    }

    const addMessage = (message: ChatMessage) => {
      chatWithArtifacts.value?.addMessage(message)
    }

    const clearChat = () => {
      chatWithArtifacts.value?.clearChat()
    }

    return {
      chatWithArtifacts,
      selectedProvider,
      apiKey,
      selectedModel,
      connectionError,
      connectionName,
      availableProviders,
      providerModels,
      hasActiveConnection,
      canConnect,
      effectiveSystemPrompt,
      connectProvider,
      disconnect,
      addArtifact,
      addMessage,
      clearChat,
    }
  },
})
</script>

<style scoped>
.llm-chat-demo {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.provider-setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
}

.setup-header {
  text-align: center;
  margin-bottom: 30px;
}

.setup-header h2 {
  margin: 0 0 10px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
}

.setup-header p {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--font-size);
}

.setup-form {
  width: 100%;
  max-width: 400px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: var(--font-size);
  color: var(--text-color);
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
}

.form-group select:focus,
.form-group input:focus {
  outline: none;
  border-color: var(--special-text);
}

.connect-btn {
  width: 100%;
  padding: 12px;
  background-color: var(--special-text);
  color: white;
  border: none;
  font-size: var(--font-size);
  font-weight: 500;
  cursor: pointer;
  margin-top: 10px;
}

.connect-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  margin-top: 16px;
  padding: 10px;
  background-color: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  color: #f44336;
  font-size: var(--small-font-size);
}

.chat-interface {
  height: 100%;
  width: 100%;
}

.demo-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background-color: rgba(76, 175, 80, 0.1);
  color: #4caf50;
  font-size: var(--small-font-size);
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.connection-badge i {
  font-size: 12px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.header-btn:hover {
  background-color: var(--button-mouseover);
}
</style>
