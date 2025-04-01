<template>
  <div
    class="sidebar-item"
    @click="handleItemClick"
    :class="{ 'sidebar-item-selected': isSelected }"
  >
    <!-- Indentation -->
    <div v-for="_ in item.indent" :key="`indent-${_}`" class="sidebar-padding"></div>
    <!-- Expandable Item Icons -->
    <template v-if="isExpandable">
      <i v-if="isCollapsed === false" class="mdi mdi-menu-down"></i>
      <i v-else class="mdi mdi-menu-right"></i>
    </template>
    <!-- Connection Type Icons -->
    <LLMProviderIcon
      v-if="item.type === 'connection'"
      :provider-type="getProviderType(item.connection)"
    />
    <i v-else-if="item.type === 'error'" class="mdi mdi-alert-circle"></i>
    <!-- Item Name -->
    <div
      class="refresh title-pad-left truncate-text sidebar-sub-item"
      v-if="item.type === 'refresh-connection'"
      @click="handleRefreshConnectionClick"
    >
      {{ item.name }}
    </div>
    <div v-else-if="item.type === 'api-key'" class="api-key-container" @click.stop>
      <form @submit.prevent="updateApiKey(item.connection, apiKeyInput)">
        <button type="submit" class="customize-button">Update API Key</button>
        <input
          type="password"
          id="api-key"
          v-model="apiKeyInput"
          placeholder="API Key"
          class="connection-customize"
        />
      </form>
    </div>
    <div v-else-if="item.type === 'model'" class="api-key-container" @click.stop>
      <form @submit.prevent="updateModel(item.connection, modelInput)">
        <button type="submit" class="customize-button">Update Model</button>
        <select v-model="modelInput" id="connection-type" required class="connection-customize">
          <option v-for="model in item.connection.models" :value="model">{{ model }}</option>
        </select>
      </form>
    </div>
    <div v-else-if="item.type === 'toggle-save-credential'" class="md-token-container" @click.stop>
      <label class="save-credential-toggle">
        <input
          type="checkbox"
          :checked="item.connection.saveCredential"
          @change="toggleSaveCredential(item.connection)"
        />
        <span class="checkbox-label">Save Credentials</span>
      </label>
    </div>
    <span
      v-else
      class="title-pad-left truncate-text"
      :class="{ 'error-indicator': item.type === 'error' }"
    >
      {{ item.name }}
      <span v-if="item.count !== undefined && item.count > 0"> ({{ item.count }}) </span>
    </span>
    <!-- Connection-specific Actions -->
    <div class="connection-actions" v-if="item.type === 'connection'">
      <!-- Set Active Button for Connection -->
      <i v-if="item.connection.isDefault" class="mdi mdi-star loading-button is-active"></i>
      <LoadingButton
        v-else
        class="loading-button"
        @click.stop
        :action="() => setAsActive(item.id)"
        title="Set as default"
      >
        <i class="mdi mdi-star-outline"></i>
      </LoadingButton>
      <!-- Refresh Button for Connection -->
      <connection-refresh
        :connection="item.connection"
        type="llm"
        :is-connected="isConnected(item.connection)"
      />
      <!-- Status Indicator -->
      <connection-status-icon :connection="item.connection" />
    </div>
  </div>
</template>

<script lang="ts">
import { ref, computed, defineComponent } from 'vue'
import type { PropType } from 'vue'
import { AnthropicProvider, OpenAIProvider, MistralProvider } from '../llm'
import LLMProviderIcon from './LLMProviderIcon.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import LoadingButton from './LoadingButton.vue'

export default defineComponent({
  name: 'LLMConnectionListItem',
  components: {
    LLMProviderIcon,
    ConnectionRefresh,
    ConnectionStatusIcon,
    LoadingButton,
  },
  props: {
    item: {
      type: Object as PropType<{
        id: string
        name: string
        indent: number
        count: number
        type: string
        connection: any
      }>,
      required: true,
    },
    isCollapsed: {
      type: Boolean,
      default: true,
    },
    isSelected: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['toggle', 'setActive', 'refresh', 'updateApiKey', 'updateModel', 'toggleSaveCredential'],
  setup(props, { emit }) {
    const apiKeyInput = ref('')
    const modelInput = ref('')

    // Determine if item is expandable
    const isExpandable = computed(() => {
      return ['connection', 'models-category'].includes(props.item.type)
    })

    // Handle item click (toggle collapse)
    const handleItemClick = () => {
      if (isExpandable.value) {
        emit('toggle', props.item.id, props.item.connection?.name || '', props.item.type)
      }
    }

    // Handle refresh connection
    const handleRefreshConnectionClick = (event: Event) => {
      event.stopPropagation()
      emit('refresh', props.item.id, props.item.connection?.name || '', 'connection')
    }

    const toggleSaveCredential = (connection: any) => {
      emit('toggleSaveCredential', connection)
    }

    // Get provider type for icon
    const getProviderType = (connection: any): string => {
      if (connection instanceof AnthropicProvider) {
        return 'anthropic'
      } else if (connection instanceof OpenAIProvider) {
        return 'openai'
      } else if (connection instanceof MistralProvider) {
        return 'mistral'
      }
      return 'unknown'
    }

    // Check if connection is connected
    const isConnected = (connection: any): boolean => {
      return connection && connection.connected === true
    }

    // Set as active connection
    const setAsActive = (id: string) => {
      // This could emit an event that the parent component would handle
      emit('setActive', id, props.item.connection?.name || '', 'connection')
    }

    // Update API key
    const updateApiKey = (connection: any, apiKey: string) => {
      emit('updateApiKey', connection, apiKey)
      apiKeyInput.value = ''
    }
    const updateModel = (connection: any, model: string) => {
      emit('updateModel', connection, model)
      modelInput.value = ''
    }

    return {
      apiKeyInput,
      modelInput,
      isExpandable,
      handleItemClick,
      handleRefreshConnectionClick,
      getProviderType,
      isConnected,
      setAsActive,
      updateApiKey,
      updateModel,
      toggleSaveCredential,
    }
  },
})
</script>

<style scoped>
.loading-button {
  height: var(--sidebar-list-item-height);
  min-height: var(--sidebar-list-item-height);
  background-color: transparent;
  padding: 0px;
}

.is-active {
  color: var(--primary-color);
}

.sidebar-padding {
  width: 12px;
  height: 1px;
}

.truncate-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}

.title-pad-left {
  padding-left: 8px;
}

.sidebar-sub-item {
  font-size: 0.9em;
  opacity: 0.8;
}

.refresh:hover {
  text-decoration: underline;
}

.connection-actions {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.api-key-container {
  display: flex;
  flex-grow: 1;
  padding-left: 8px;
}

.api-key-container form {
  display: flex;
  width: 100%;
  align-items: center;
}

.connection-customize {
  flex-grow: 1;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  /* padding: 4px 8px; */
  color: var(--text-color);
  margin-left: 8px;
  font-size: 0.8em;
}

.customize-button {
  background-color: var(--primary-color);
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 0.6em;
  border: 1px solid var(--border-color);
}

.customize-button:hover {
  background-color: var(--primary-color-dark);
}

.error-indicator {
  color: var(--error-color);
}

.set-active-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  margin-right: 4px;
  padding: 2px;
}

.set-active-btn:hover {
  color: var(--primary-color);
}
</style>
