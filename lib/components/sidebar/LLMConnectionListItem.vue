<template>
  <div>
    <sidebar-item
      :item-id="item.id"
      :name="getItemName()"
      :indent="item.indent"
      :is-selected="isSelected"
      :is-collapsible="isExpandable"
      :is-collapsed="isCollapsed"
      itemType="llm-connection"
      @click="handleItemClick"
      @toggle="toggleCollapse"
    >
      <!-- Custom icon slot for different item types -->
      <template #icon>
        <LLMProviderIcon
          v-if="item.type === 'connection'"
          :provider-type="getProviderType(item.connection)"
        />
        <i v-else-if="item.type === 'settings-group'" class="mdi mdi-tune-vertical node-icon"></i>
        <i v-else-if="item.type === 'error'" class="mdi mdi-alert-circle node-icon"></i>
        <i v-else-if="item.type === 'open-chat'" class="mdi mdi-chat-outline node-icon"></i>
        <i v-else-if="item.type === 'open-validation'" class="mdi mdi-test-tube node-icon"></i>
        <i v-else-if="item.type === 'new-chat'" class="mdi mdi-chat-plus-outline node-icon"></i>
        <i v-else-if="item.type === 'chat-item'" class="mdi mdi-chat node-icon"></i>
        <i v-else-if="item.type === 'chats-header'" class="mdi mdi-folder-outline node-icon"></i>
      </template>

      <!-- Custom name slot for complex content -->
      <template #name>
        <!-- Special handling for different item types -->
        <div
          v-if="item.type === 'refresh-connection'"
          class="refresh title-pad-left truncate-text sidebar-sub-item"
          @click="handleRefreshConnectionClick"
        >
          {{ item.name }}
        </div>

        <div v-else-if="item.type === 'api-key'" class="api-key-container" @click.stop>
          <form @submit.prevent>
            <div class="api-key-input-wrapper">
              <input
                :type="showApiKey ? 'text' : 'password'"
                id="api-key"
                v-model="apiKeyInput"
                @input="handleApiKeyInput"
                placeholder="API Key"
                class="connection-customize sidebar-control-input"
                :data-testid="`api-key-input-${item.connection.name}`"
              />
              <button
                type="button"
                class="visibility-toggle sidebar-icon-button"
                @click="toggleApiKeyVisibility"
                :data-testid="`toggle-api-key-visibility-${item.connection.name}`"
                :title="showApiKey ? 'Hide API Key' : 'Show API Key'"
              >
                <i :class="showApiKey ? 'mdi mdi-eye-off' : 'mdi mdi-eye'"></i>
              </button>
            </div>
          </form>
        </div>

        <div v-else-if="item.type === 'model'" class="api-key-container" @click.stop>
          <form @submit.prevent :data-testid="`model-update-form-${item.connection.name}`">
            <select
              v-model="selectedModel"
              @change="handleModelChange"
              id="connection-type"
              required
              class="connection-customize sidebar-control-select"
              :data-testid="`model-select-${item.connection.name}`"
            >
              <option
                v-for="model in item.connection.models"
                :value="model"
                :key="model"
                :data-testid="`model-option-${model}`"
              >
                {{ model }}
              </option>
            </select>
          </form>
        </div>

        <div v-else-if="item.type === 'fast-model'" class="api-key-container" @click.stop>
          <form @submit.prevent :data-testid="`fast-model-update-form-${item.connection.name}`">
            <select
              v-model="selectedFastModel"
              @change="handleFastModelChange"
              class="connection-customize sidebar-control-select"
              :data-testid="`fast-model-select-${item.connection.name}`"
            >
              <option value="" :data-testid="`fast-model-option-none`">(Use primary model)</option>
              <option
                v-for="model in item.connection.models"
                :value="model"
                :key="model"
                :data-testid="`fast-model-option-${model}`"
              >
                {{ model }}
              </option>
            </select>
          </form>
        </div>

        <div
          v-else-if="item.type === 'toggle-save-credential'"
          class="md-token-container"
          @click.stop
        >
          <label class="save-credential-toggle sidebar-toggle-row">
            <input
              type="checkbox"
              :checked="item.connection.saveCredential"
              @change="toggleSaveCredential(item.connection)"
            />
            <span class="checkbox-label">Save credentials</span>
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
      </template>

      <!-- Custom extra content slot for connection actions -->
      <template #extra-content>
        <!-- Delete button for chat items -->
        <div class="connection-actions chat-actions" v-if="item.type === 'chat-item'">
          <tooltip class="tactile-button" content="Delete Chat" position="left">
            <span
              class="remove-btn hover-icon sidebar-icon-button danger"
              @click.stop="deleteChat(item.chatId)"
            >
              <i class="mdi mdi-trash-can-outline"></i>
            </span>
          </tooltip>
        </div>

        <div class="connection-actions" v-if="item.type === 'connection'">
          <connection-status-icon v-if="item.connection" :connection="item.connection" />
          <sidebar-overflow-menu
            :items="contextMenuItems"
            tooltip="Connection actions"
            :test-id-base="`llm-connection-actions-${item.id}`"
            @select="handleContextMenuItemClick"
          />
        </div>
      </template>
    </sidebar-item>
  </div>
</template>

<script lang="ts">
import { ref, computed, defineComponent, onMounted, watch } from 'vue'
import type { PropType } from 'vue'
import { AnthropicProvider, OpenAIProvider, GoogleProvider } from '../../llm'
import SidebarItem from './GenericSidebarItem.vue'
import LLMProviderIcon from './LLMProviderIcon.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import SidebarOverflowMenu from './SidebarOverflowMenu.vue'
import type { ContextMenuItem } from '../ContextMenu.vue'
import type { LLMProvider } from '../../llm/base'
import Tooltip from '../Tooltip.vue'

export interface ListItem {
  id: string
  name: string
  indent: number
  count?: number
  type:
    | 'connection'
    | 'error'
    | 'refresh-connection'
    | 'api-key'
    | 'model'
    | 'fast-model'
    | 'settings-group'
    | 'toggle-save-credential'
    | 'loading'
    | 'open-chat'
    | 'open-validation'
    | 'new-chat'
    | 'chat-item'
    | 'chats-header'
  connection: LLMProvider
  chat?: any
  chatId?: string
}

export default defineComponent({
  name: 'LLMConnectionListItem',
  components: {
    SidebarItem,
    LLMProviderIcon,
    ConnectionStatusIcon,
    Tooltip,
    SidebarOverflowMenu,
  },
  props: {
    item: {
      type: Object as PropType<ListItem>,
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
  emits: [
    'toggle',
    'setActive',
    'refresh',
    'updateApiKey',
    'updateModel',
    'updateFastModel',
    'toggleSaveCredential',
    'deleteConnection',
    'deleteChat',
  ],
  setup(props, { emit }) {
    const apiKeyInput = ref<string>('')
    const showApiKey = ref<boolean>(false)
    const selectedModel = ref<string>('')
    const selectedFastModel = ref<string>('')
    let apiKeySaveTimeout: ReturnType<typeof setTimeout> | null = null

    // Initialize values on mount
    onMounted(() => {
      if (props.item.type === 'api-key' && props.item.connection?.getApiKey()) {
        apiKeyInput.value = props.item.connection.getApiKey()
      }

      if (props.item.type === 'model' && props.item.connection?.model) {
        selectedModel.value = props.item.connection.model
      }

      if (props.item.type === 'fast-model') {
        selectedFastModel.value = props.item.connection?.fastModel || ''
      }
    })

    // Watch for changes in the connection's API key
    watch(
      // @ts-ignore
      () => props.item.connection?.apiKey,
      (newApiKey) => {
        if (props.item.type === 'api-key' && newApiKey) {
          apiKeyInput.value = newApiKey
        }
      },
    )

    // Watch for external model changes
    watch(
      () => props.item.connection?.model,
      (newModel) => {
        if (props.item.type === 'model' && newModel) {
          selectedModel.value = newModel
        }
      },
      { immediate: true },
    )

    // Watch for external fast model changes
    watch(
      () => props.item.connection?.fastModel,
      (newFastModel) => {
        if (props.item.type === 'fast-model') {
          selectedFastModel.value = newFastModel || ''
        }
      },
      { immediate: true },
    )

    const contextMenuItems = computed<ContextMenuItem[]>(() => {
      const items: ContextMenuItem[] = []

      if (props.item.type === 'connection') {
        if (!props.item.connection?.isDefault) {
          items.push({
            id: 'set-default',
            label: 'Set as default',
            icon: 'mdi-star-outline',
          })
        }

        items.push(
          { id: 'refresh', label: 'Refresh Connection', icon: 'mdi-refresh' },
          { id: 'delete-separator', kind: 'separator' },
          { id: 'delete', label: 'Delete connection', icon: 'mdi-trash-can-outline', danger: true },
        )
      }

      return items
    })

    const handleContextMenuItemClick = (item: ContextMenuItem) => {
      switch (item.id) {
        case 'delete':
          deleteConnection(props.item.id)
          break
        case 'set-default':
          setAsActive(props.item.id)
          break
        case 'refresh':
          emit('refresh', props.item.id, props.item.connection?.name || '', 'connection')
          break
      }
    }

    // Determine if item is expandable
    const isExpandable = computed<boolean>(() => {
      return ['connection', 'settings-group'].includes(props.item.type)
    })

    // Get item name (for simple cases where name slot isn't needed)
    const getItemName = () => {
      // Return empty string for complex items that use the name slot
      if (
        [
          'api-key',
          'model',
          'fast-model',
          'settings-group',
          'toggle-save-credential',
          'refresh-connection',
        ].includes(props.item.type)
      ) {
        return ''
      }
      return props.item.name
    }

    // Handle item click (toggle collapse or navigate)
    const handleItemClick = () => {
      if (isExpandable.value) {
        toggleCollapse(props.item.id)
      } else if (
        props.item.type === 'open-chat' ||
        props.item.type === 'open-validation' ||
        props.item.type === 'new-chat' ||
        props.item.type === 'chat-item'
      ) {
        // These items navigate to the LLM view with a specific tab
        toggleCollapse(props.item.id)
      }
    }

    const toggleCollapse = (id: string) => {
      // Pass extra data for chat items
      const extraData = props.item.type === 'chat-item' ? { chatId: props.item.chatId } : undefined
      emit('toggle', id, props.item.connection?.name || '', props.item.type, extraData)
    }

    // Handle refresh connection
    const handleRefreshConnectionClick = (event: Event) => {
      event.stopPropagation()
      emit('refresh', props.item.id, props.item.connection?.name || '', 'connection')
    }

    const toggleSaveCredential = (connection: LLMProvider) => {
      emit('toggleSaveCredential', connection)
    }

    // Get provider type for icon
    const getProviderType = (connection: LLMProvider): string => {
      if (connection instanceof AnthropicProvider) {
        return 'anthropic'
      } else if (connection instanceof OpenAIProvider) {
        return 'openai'
      } else if (connection instanceof GoogleProvider) {
        return 'google'
      }
      // For openrouter/demo and any future providers, fall back to the type property
      return (connection as any).type || 'unknown'
    }

    // Check if connection is connected
    const isConnected = (connection: LLMProvider): boolean => {
      return connection && connection.connected === true
    }

    // Set as active connection
    const setAsActive = (id: string) => {
      emit('setActive', id, props.item.connection?.name || '', 'connection')
    }

    // Delete a connection
    const deleteConnection = (id: string) => {
      emit('deleteConnection', id, props.item.connection?.name || '')
    }

    // Delete a chat
    const deleteChat = (chatId: string | undefined) => {
      if (chatId) {
        emit('deleteChat', chatId, props.item.connection?.name || '')
      }
    }

    // Update API key
    const updateApiKey = (connection: LLMProvider, apiKey: string) => {
      emit('updateApiKey', connection, apiKey)
    }

    // Update model
    const updateModel = (connection: LLMProvider, model: string) => {
      emit('updateModel', connection, model)
    }

    // Update fast model
    const updateFastModel = (connection: LLMProvider, fastModel: string | null) => {
      emit('updateFastModel', connection, fastModel)
    }

    const handleApiKeyInput = () => {
      if (props.item.type !== 'api-key' || !props.item.connection) {
        return
      }

      if (apiKeyInput.value === (props.item.connection.getApiKey() || '')) {
        return
      }

      if (apiKeySaveTimeout) {
        clearTimeout(apiKeySaveTimeout)
      }

      apiKeySaveTimeout = setTimeout(() => {
        updateApiKey(props.item.connection, apiKeyInput.value)
      }, 500)
    }

    const handleModelChange = () => {
      if (props.item.type !== 'model' || !props.item.connection) {
        return
      }

      if (!selectedModel.value || selectedModel.value === props.item.connection.model) {
        return
      }

      updateModel(props.item.connection, selectedModel.value)
    }

    const handleFastModelChange = () => {
      if (props.item.type !== 'fast-model' || !props.item.connection) {
        return
      }

      const fastModelValue = selectedFastModel.value || null
      if (fastModelValue === (props.item.connection.fastModel || null)) {
        return
      }

      updateFastModel(props.item.connection, fastModelValue)
    }

    const toggleApiKeyVisibility = () => {
      showApiKey.value = !showApiKey.value
    }

    return {
      apiKeyInput,
      selectedModel,
      selectedFastModel,
      isExpandable,
      getItemName,
      handleItemClick,
      handleRefreshConnectionClick,
      getProviderType,
      isConnected,
      setAsActive,
      updateApiKey,
      updateModel,
      updateFastModel,
      handleApiKeyInput,
      handleModelChange,
      handleFastModelChange,
      toggleSaveCredential,
      deleteConnection,
      deleteChat,
      contextMenuItems,
      handleContextMenuItemClick,
      toggleCollapse,
      // API key visibility
      showApiKey,
      toggleApiKeyVisibility,
    }
  },
})
</script>

<style scoped src="./sidebarItemChrome.css"></style>
<style scoped>
.delete-button:hover {
  color: var(--error-color);
}

.is-active {
  color: var(--special-text);
}

.title-pad-left {
  --sidebar-title-pad-left: 8px;
}

.sidebar-sub-item {
  --sidebar-sub-item-font-size-local: 0.9em;
  --sidebar-sub-item-opacity: 0.8;
}

.refresh:hover {
  text-decoration: underline;
}

.connection-actions {
  --sidebar-actions-gap: 2px;
  --sidebar-actions-pad-right: 2px;
}

.api-key-container {
  display: flex;
  flex-grow: 1;
  padding: 1px 0 1px 4px;
}

.api-key-container form {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}

.connection-customize {
  flex-grow: 1;
  max-width: 100%;
  width: 100%;
  min-width: 0;
  align-self: center;
  min-height: 30px;
  height: 30px;
  border-radius: 12px;
  font-size: 13px;
}

.api-key-input-wrapper {
  flex-grow: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.api-key-input-wrapper input {
  padding-right: 28px;
}

.visibility-toggle {
  position: absolute;
  right: 2px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.visibility-toggle i {
  font-size: 14px;
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
  color: var(--special-text);
}

.save-credential-toggle {
  padding: 2px 0 4px 6px;
  gap: 8px;
  font-size: 13px;
  color: var(--text-faint);
}

.save-credential-toggle input[type='checkbox'] {
  margin: 0;
}

.checkbox-label {
  white-space: nowrap;
}

.md-token-container {
  display: flex;
  flex-grow: 1;
}

.chat-actions {
  --sidebar-actions-gap: 0;
  --sidebar-actions-pad-right: 0;
}
</style>
