<template>
  <sidebar-list title="LLM Connections">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="
            testTag ? `llm-connection-creator-add-${testTag}` : 'llm-connection-creator-add'
          "
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
      </div>
      <LLMConnectionCreator :visible="creatorVisible" @close="creatorVisible = !creatorVisible" />
    </template>
    <LLMConnectionListItem
      v-for="item in contentList"
      :key="item.id"
      :item="item"
      :is-collapsed="collapsed[item.id]"
      :isSelected="item.id === llmConnectionStore.activeConnection"
      @toggle="toggleCollapse"
      @refresh="refreshId"
      @updateApiKey="updateApiKey"
      @updateModel="updateModel"
      @setActive="setActiveConnection"
      @deleteConnection="deleteConnection"
      @deleteChat="deleteChat"
      @toggleSaveCredential="toggleSaveCredential"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import SidebarList from './SidebarList.vue'
import LoadingButton from '../LoadingButton.vue'
import StatusIcon from '../StatusIcon.vue'
import Tooltip from '../Tooltip.vue'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ChatStoreType } from '../../stores/chatStore'
import { KeySeparator } from '../../data/constants'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import { LLMProvider } from '../../llm/base'
import LLMConnectionListItem from './LLMConnectionListItem.vue'
import LLMConnectionCreator from './LLMConnectionCreator.vue'
import type { Chat } from '../../chats/chat'

export default {
  name: 'LLMConnectionList',
  props: {
    activeLLMKey: {
      type: String,
      default: '',
      optional: true,
    },
    testTag: {
      type: String,
      default: '',
      optional: true,
    },
  },
  emits: ['llm-open-view', 'create-new-chat', 'open-chat'],
  setup(_, { emit }) {
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const saveConnections = inject<Function>('saveLLMConnections')
    const chatStore = inject<ChatStoreType>('chatStore', null as any)
    if (!llmConnectionStore || !saveConnections) {
      throw new Error('LLM connection store is not provided!')
    }
    const isLoading = ref<Record<string, boolean>>({})
    const isErrored = ref<Record<string, string>>({})
    const creatorVisible = ref(false)
    const updateApiKey = async (connection: LLMProvider, apiKey: string) => {
      if (apiKey) {
        // Replace the old connection
        await llmConnectionStore.connections[connection.name].setApiKey(apiKey)
        // Reset/test the connection
        llmConnectionStore.resetConnection(connection.name)
        await saveConnections()
      }
    }

    const updateModel = (connection: LLMProvider, model: string) => {
      // This would need to be implemented based on your provider structure
      if (model) {
        llmConnectionStore.connections[connection.name].setModel(model)

        // Reset/test the connection
        llmConnectionStore.resetConnection(connection.name)
        // save our new model
        saveConnections()
      }
    }

    const collapsed = ref<Record<string, boolean>>({})

    const refreshId = async (id: string, connectionName: string, type: string) => {
      if (!llmConnectionStore.connections[connectionName]) {
        isErrored.value[id] = `Connection not found`
        return
      }

      try {
        isLoading.value[id] = true
        if (type === 'connection') {
          // Test the connection
          const connection = llmConnectionStore.connections[connectionName] as any
          if (connection.testConnection) {
            await connection.testConnection()
          }
        }

        delete isErrored.value[id]
      } catch (error) {
        if (error instanceof Error) {
          isErrored.value[id] = error.message
        } else {
          isErrored.value[id] = 'An error occurred'
        }
      }
      delete isLoading.value[id]
    }

    const toggleCollapse = async (id: string, connectionName: string, type: string, extraData?: any) => {
      // Handle new chat creation
      if (type === 'new-chat') {
        emit('create-new-chat', connectionName)
        return
      }

      // Handle existing chat selection
      if (type === 'chat-item') {
        if (chatStore && extraData?.chatId) {
          chatStore.setActiveChat(extraData.chatId)
          // Set this LLM connection as active
          llmConnectionStore.activeConnection = connectionName
        }
        // Include chatId in the event so it can be stored in URL
        emit('llm-open-view', connectionName, 'chat', extraData?.chatId)
        return
      }

      // Handle chat/validation item clicks - these navigate to the LLM view with specific tab
      if (type === 'open-chat') {
        emit('llm-open-view', connectionName, 'chat')
        return
      }
      if (type === 'open-validation') {
        emit('llm-open-view', connectionName, 'validation')
        return
      }

      // If expanding a connection, fetch its details
      if (
        type === 'connection' &&
        (collapsed.value[id] === undefined || collapsed.value[id] === true)
      ) {
        const connection = llmConnectionStore.connections[connectionName] as any
        if (!connection) {
          console.log(`Connection not found ${connection}`)
          return
        }
        if (!connection.models || connection.models.length === 0) {
          await refreshId(id, connectionName, 'models')
        }
      }

      // Toggle collapsed state
      if (collapsed.value[id] === undefined) {
        collapsed.value[id] = false
      } else {
        collapsed.value[id] = !collapsed.value[id]
      }
    }

    // Initialize collapse state for existing connections
    Object.entries(llmConnectionStore.connections).forEach(([name, _]) => {
      let connectionKey = name
      collapsed.value[connectionKey] = true
    })

    // On mount, expand to the active LLM connection/chat from URL
    onMounted(() => {
      const currentLLMKey = getDefaultValueFromHash('llm-key', '')
      if (currentLLMKey) {
        // The key may contain a chat ID after KeySeparator (e.g., "connectionName+chatId")
        const connectionName = currentLLMKey.split(KeySeparator)[0]

        // Expand the connection
        if (connectionName && llmConnectionStore.connections[connectionName]) {
          collapsed.value[connectionName] = false
        }
      }
    })

    const contentList = computed(() => {
      const list: Array<{
        id: string
        name: string
        indent: number
        count: number
        type:
          | 'model'
          | 'connection'
          | 'toggle-save-credential'
          | 'refresh-connection'
          | 'error'
          | 'api-key'
          | 'loading'
          | 'open-chat'
          | 'open-validation'
          | 'new-chat'
          | 'chat-item'
          | 'chats-header'
        connection: any | undefined
        chat?: Chat
        chatId?: string
      }> = []

      // Sort connections by status and name
      const sorted = Object.entries(llmConnectionStore.connections).sort(
        ([nameA, a], [nameB, b]) => {
          const providerA = a as any
          const providerB = b as any

          if (providerA.connected && !providerB.connected) {
            return -1
          } else if (!providerA.connected && providerB.connected) {
            return 1
          } else {
            return nameA.localeCompare(nameB)
          }
        },
      )

      sorted.forEach(([name, provider]) => {
        const connection = provider as any
        const modelCount = connection.availableModels?.length || 0
        if (connection.deleted) return // Skip deleted connections

        // Add the connection itself
        list.push({
          id: name,
          name: name,
          indent: 0,
          count: modelCount,
          type: 'connection',
          connection,
        })

        // If expanded, show connection details
        if (collapsed.value[name] === false) {
          // Get chats for this connection
          const connectionChats = chatStore ? chatStore.getConnectionChats(name) : []

          // Chats section header with new chat button
          list.push({
            id: `${name}-new-chat`,
            name: '+ New Chat',
            indent: 1,
            count: connectionChats.length,
            type: 'new-chat',
            connection,
          })

          // Add existing chats for this connection
          connectionChats.forEach((chat) => {
            list.push({
              id: `${name}-chat-${chat.id}`,
              name: chat.name,
              indent: 2,
              count: chat.messages.length,
              type: 'chat-item',
              connection,
              chat,
              chatId: chat.id,
            })
          })

          // Validation Tests navigation
          list.push({
            id: `${name}-open-validation`,
            name: 'Validation Tests',
            indent: 1,
            count: 0,
            type: 'open-validation',
            connection,
          })
          // API Key setting
          list.push({
            id: `${name}-api-key`,
            name: 'API Key',
            indent: 1,
            count: 0,
            type: 'api-key',
            connection,
          })
          list.push({
            id: `${name}-model`,
            name: 'Model',
            indent: 1,
            count: 0,
            type: 'model',
            connection,
          })
          list.push({
            id: `${name}-toggle-save-credential`,
            name: 'Toggle Save Credential',
            indent: 1,
            count: 0,
            type: 'toggle-save-credential',
            connection,
          })

          // Loading indicator
          if (isLoading.value[name]) {
            list.push({
              id: `${name}-loading`,
              name: 'Loading...',
              indent: 1,
              count: 0,
              type: 'loading',
              connection,
            })
          }

          // Error message
          if (isErrored.value[name]) {
            list.push({
              id: `${name}-error`,
              name: isErrored.value[name],
              indent: 1,
              count: 0,
              type: 'error',
              connection,
            })
          }
        }
      })

      return list
    })

    const rightSplit = (str: string) => {
      const index = str.lastIndexOf(KeySeparator)
      return index !== -1 ? str.substring(0, index) : str
    }

    return {
      llmConnectionStore,
      chatStore,
      contentList,
      toggleCollapse,
      collapsed,
      saveConnections,
      updateApiKey,
      updateModel,
      refreshId,
      rightSplit,
      creatorVisible,
    }
  },
  components: {
    SidebarList,
    LLMConnectionListItem,
    LLMConnectionCreator,
    LoadingButton,
    StatusIcon,
    Tooltip,
  },
  methods: {
    resetConnection(connection: LLMProvider) {
      return this.llmConnectionStore.resetConnection(connection.name)
    },

    setActiveConnection(connectionName: string) {
      this.llmConnectionStore.activeConnection = connectionName
      this.llmConnectionStore.connections[connectionName].isDefault = true
      // for all other connections, set isDefault to false
      Object.keys(this.llmConnectionStore.connections).forEach((key) => {
        if (key !== connectionName) {
          this.llmConnectionStore.connections[key].isDefault = false
        }
      })
      this.saveConnections()
    },

    deleteConnection(id: string, connectionName: string) {
      // Ask for confirmation before deleting
      if (confirm(`Are you sure you want to delete the connection "${connectionName}"?`)) {
        // Remove the connection from the store
        this.llmConnectionStore.connections[connectionName].delete()

        // If this was the active connection, reset active connection
        if (this.llmConnectionStore.activeConnection === id) {
          this.llmConnectionStore.activeConnection = ''
        }
      }
    },

    deleteChat(chatId: string, _connectionName: string) {
      // Ask for confirmation before deleting
      if (confirm('Are you sure you want to delete this chat?')) {
        if (this.chatStore) {
          this.chatStore.removeChat(chatId)
        }
      }
    },

    toggleSaveCredential(connection: LLMProvider) {
      connection.saveCredential = !connection.saveCredential
      this.saveConnections()
    },
  },
  computed: {
    connections() {
      return Object.values(this.llmConnectionStore.connections)
    },
  },
}
</script>

<style scoped>
.error-indicator {
  color: red;
  font-size: 12px;
  overflow-y: hidden;
  white-space: nowrap;
}

.loading-indicator {
  display: block;
  width: 100%;
  line-height: var(--sidebar-list-item-height);
  height: var(--sidebar-list-item-height);
  min-height: var(--sidebar-list-item-height);
  background: linear-gradient(
    to left,
    var(--sidebar-bg) 0%,
    var(--query-window-bg) 50%,
    var(--sidebar-bg) 100%
  );
  background-size: 200% 100%;
  animation: loading-gradient 2s infinite linear;
}

@keyframes loading-gradient {
  0% {
    background-position: -100% 0;
  }

  100% {
    background-position: 100% 0;
  }
}

.provider-icon {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
</style>
