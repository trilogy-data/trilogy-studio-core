<template>
  <div>
    <div
      class="sidebar-item"
      @click="handleItemClick"
      @contextmenu.prevent="showContextMenu"
      :class="{ 'sidebar-item-selected': isSelected }"
      :data-testid="`llm-connection-list-item-${item.id}`"
    >
      <!-- Context Menu -->
      <context-menu
        :items="contextMenuItems"
        :position="contextMenuPosition"
        :is-visible="contextMenuVisible"
        @item-click="handleContextMenuItemClick"
        @close="contextMenuVisible = false"
      />
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
          <div class="api-key-input-wrapper">
            <input
              :type="showApiKey ? 'text' : 'password'"
              id="api-key"
              v-model="apiKeyInput"
              placeholder="API Key"
              class="connection-customize"
              :data-testid="`api-key-input-${item.connection.name}`"
            />
            <button
              type="button"
              class="visibility-toggle"
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
        <form
          @submit.prevent="updateModel(item.connection, selectedModel)"
          :data-testid="`model-update-form-${item.connection.name}`"
        >
          <button
            type="submit"
            class="customize-button"
            :data-testid="`update-model-${item.connection.name}`"
          >
            Update Model
          </button>
          <select
            v-model="selectedModel"
            id="connection-type"
            required
            class="connection-customize"
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
      <div
        v-else-if="item.type === 'toggle-save-credential'"
        class="md-token-container"
        @click.stop
      >
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
        <i
          v-if="item.connection && item.connection.isDefault"
          class="mdi mdi-star loading-button is-active"
        ></i>
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
          v-if="item.connection"
          :connection="item.connection"
          type="llm"
          :is-connected="isConnected(item.connection)"
          :data-testid="`refresh-llm-connection-${item.connection.name}`"
        />

        <tooltip class="tacticle-button" content="Delete Connection" position="left">
          <span class="remove-btn" @click.stop="deleteConnection(item.id)">
            <i class="mdi mdi-trash-can tactile-button"></i>
          </span>
        </tooltip>
        <!-- Status Indicator -->
        <connection-status-icon v-if="item.connection" :connection="item.connection" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, computed, defineComponent, onMounted, watch } from 'vue'
import type { PropType } from 'vue'
import { AnthropicProvider, OpenAIProvider, MistralProvider, GoogleProvider } from '../../llm'
import LLMProviderIcon from './LLMProviderIcon.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import LoadingButton from '../LoadingButton.vue'
import ContextMenu from '../ContextMenu.vue'
import type { LLMProvider } from '../../llm/base'
import Tooltip from '../Tooltip.vue'
interface ListItem {
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
    | 'toggle-save-credential'
    | 'loading'
  connection: LLMProvider
}

interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
}

interface Position {
  x: number
  y: number
}

export default defineComponent({
  name: 'LLMConnectionListItem',
  components: {
    LLMProviderIcon,
    ConnectionRefresh,
    ConnectionStatusIcon,
    LoadingButton,
    ContextMenu,
    Tooltip,
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
    'toggleSaveCredential',
    'deleteConnection',
  ],
  setup(props, { emit }) {
    const apiKeyInput = ref<string>('')
    const showApiKey = ref<boolean>(false)
    const selectedModel = ref<string>('')

    // Initialize values on mount
    onMounted(() => {
      if (props.item.type === 'api-key' && props.item.connection?.getApiKey()) {
        apiKeyInput.value = props.item.connection.getApiKey()
      }

      if (props.item.type === 'model' && props.item.connection?.model) {
        selectedModel.value = props.item.connection.model
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

    // Context Menu
    const contextMenuVisible = ref<boolean>(false)
    const contextMenuPosition = ref<Position>({ x: 0, y: 0 })

    const contextMenuItems = computed<ContextMenuItem[]>(() => {
      const items: ContextMenuItem[] = []

      if (props.item.type === 'connection') {
        // Add connection-specific menu items
        items.push(
          { id: 'set-default', label: 'Set as Default', icon: 'mdi-star-outline' },
          { id: 'refresh', label: 'Refresh Connection', icon: 'mdi-refresh' },
          // { id: 'edit-api-key', label: 'Edit API Key', icon: 'mdi-key-outline' },
          { id: 'delete', label: 'Delete Connection', icon: 'mdi-delete-outline', danger: true },
        )
      }

      return items
    })

    const showContextMenu = (event: MouseEvent) => {
      // Only show context menu for connections
      console.log(event)
      console.log(props.item)
      if (props.item.type === 'connection') {
        contextMenuPosition.value = {
          x: event.clientX,
          y: event.clientY,
        }
        contextMenuVisible.value = true
      }
    }

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
        case 'edit-api-key':
          toggleCollapse(props.item.id)
          break
      }
    }

    // Determine if item is expandable
    const isExpandable = computed<boolean>(() => {
      return ['connection'].includes(props.item.type)
    })

    // Handle item click (toggle collapse)
    const handleItemClick = () => {
      if (isExpandable.value) {
        toggleCollapse(props.item.id)
      }
    }

    const toggleCollapse = (id: string) => {
      emit('toggle', id, props.item.connection?.name || '', props.item.type)
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
      } else if (connection instanceof MistralProvider) {
        return 'mistral'
      } else if (connection instanceof GoogleProvider) {
        return 'google'
      }
      return 'unknown'
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

    // Update API key
    const updateApiKey = (connection: LLMProvider, apiKey: string) => {
      emit('updateApiKey', connection, apiKey)
    }

    // Update model
    const updateModel = (connection: LLMProvider, model: string) => {
      emit('updateModel', connection, model)
    }

    const toggleApiKeyVisibility = () => {
      showApiKey.value = !showApiKey.value
    }

    return {
      apiKeyInput,
      selectedModel,
      isExpandable,
      handleItemClick,
      handleRefreshConnectionClick,
      getProviderType,
      isConnected,
      setAsActive,
      updateApiKey,
      updateModel,
      toggleSaveCredential,
      deleteConnection,
      // Context menu
      contextMenuVisible,
      contextMenuPosition,
      contextMenuItems,
      showContextMenu,
      handleContextMenuItemClick,
      toggleCollapse,
      // API key visibility
      showApiKey,
      toggleApiKeyVisibility,
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

.delete-button:hover {
  color: var(--error-color);
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
  color: var(--text-color);
  margin-left: 8px;
  font-size: 0.8em;
  padding: 4px 8px;
}

.api-key-input-wrapper {
  flex-grow: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.api-key-input-wrapper input {
  padding-right: 30px;
}

.visibility-toggle {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}

.visibility-toggle:hover {
  color: var(--text-color);
}

.visibility-toggle i {
  font-size: 16px;
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
