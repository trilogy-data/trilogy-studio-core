<template>
  <sidebar-list title="AI & Agents">
    <template #header>
      <div class="llm-header">
        <h3 class="font-sans sidebar-header">AI & Agents</h3>
        <button
          class="sidebar-control-button sidebar-header-action llm-new-button"
          @click="creatorVisible = !creatorVisible"
          :data-testid="
            testTag ? `llm-connection-creator-add-${testTag}` : 'llm-connection-creator-add'
          "
        >
          <i class="mdi mdi-plus"></i>
          {{ creatorVisible ? 'Close' : 'New' }}
        </button>
      </div>
    </template>
    <template #actions>
      <LLMConnectionCreator :visible="creatorVisible" @close="creatorVisible = !creatorVisible" />
    </template>
    <LLMConnectionListItem
      v-for="item in contentList"
      :key="item.id"
      :item="item"
      :is-collapsed="collapsed[item.id]"
      :isSelected="isItemSelected(item)"
      @toggle="toggleCollapse"
      @refresh="refreshId"
      @updateApiKey="updateApiKey"
      @updateModel="updateModel"
      @updateFastModel="updateFastModel"
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
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ChatStoreType } from '../../stores/chatStore'
import { KeySeparator } from '../../data/constants'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import { LLMProvider } from '../../llm/base'
import LLMConnectionListItem from './LLMConnectionListItem.vue'
import LLMConnectionCreator from './LLMConnectionCreator.vue'
import type { Chat } from '../../chats/chat'
import useScreenNavigation from '../../stores/useScreenNavigation'

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

    const screenNavigation = useScreenNavigation()
    const isLoading = ref<Record<string, boolean>>({})
    const isErrored = ref<Record<string, string>>({})
    const creatorVisible = ref(false)
    const collapsed = ref<Record<string, boolean>>({})

    const settingsId = (connectionName: string) => `${connectionName}-settings`

    const updateApiKey = async (connection: LLMProvider, apiKey: string) => {
      if (!apiKey) {
        return
      }

      await llmConnectionStore.connections[connection.name].setApiKey(apiKey)
      llmConnectionStore.resetConnection(connection.name)
      await saveConnections()
    }

    const updateModel = (connection: LLMProvider, model: string) => {
      if (!model) {
        return
      }

      llmConnectionStore.connections[connection.name].setModel(model)
      llmConnectionStore.resetConnection(connection.name)
      saveConnections()
    }

    const updateFastModel = (connection: LLMProvider, fastModel: string | null) => {
      llmConnectionStore.connections[connection.name].setFastModel(fastModel)
      saveConnections()
    }

    const refreshId = async (id: string, connectionName: string, type: string) => {
      if (!llmConnectionStore.connections[connectionName]) {
        isErrored.value[id] = 'Connection not found'
        return
      }

      try {
        isLoading.value[id] = true
        if (type === 'connection') {
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

    const toggleCollapse = async (
      id: string,
      connectionName: string,
      type: string,
      extraData?: any,
    ) => {
      if (type === 'new-chat') {
        emit('create-new-chat', connectionName)
        return
      }

      if (type === 'chat-item') {
        if (chatStore && extraData?.chatId) {
          chatStore.setActiveChat(extraData.chatId)
          llmConnectionStore.activeConnection = connectionName
        }
        emit('llm-open-view', connectionName, 'chat', extraData?.chatId)
        return
      }

      if (type === 'open-chat') {
        emit('llm-open-view', connectionName, 'chat')
        return
      }

      if (type === 'open-validation') {
        emit('llm-open-view', connectionName, 'validation')
        return
      }

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

      if (collapsed.value[id] === undefined) {
        collapsed.value[id] = false
      } else {
        collapsed.value[id] = !collapsed.value[id]
      }
    }

    Object.entries(llmConnectionStore.connections).forEach(([name]) => {
      collapsed.value[name] = true
      collapsed.value[settingsId(name)] = true
    })

    onMounted(() => {
      const currentLLMKey = getDefaultValueFromHash('llm-key', '')
      if (!currentLLMKey) {
        return
      }

      const parts = currentLLMKey.split(KeySeparator)
      const connectionName = parts[0]
      const chatId = parts[1]

      if (connectionName && llmConnectionStore.connections[connectionName]) {
        collapsed.value[connectionName] = false
        llmConnectionStore.activeConnection = connectionName

        if (chatId && chatStore) {
          chatStore.setActiveChat(chatId)
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
          | 'fast-model'
          | 'connection'
          | 'settings-group'
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

      const sorted = Object.entries(llmConnectionStore.connections).sort(
        ([nameA, a], [nameB, b]) => {
          const providerA = a as any
          const providerB = b as any

          if (providerA.connected && !providerB.connected) {
            return -1
          }
          if (!providerA.connected && providerB.connected) {
            return 1
          }
          return nameA.localeCompare(nameB)
        },
      )

      sorted.forEach(([name, provider]) => {
        const connection = provider as any
        const modelCount = connection.availableModels?.length || 0
        if (connection.deleted) {
          return
        }

        list.push({
          id: name,
          name,
          indent: 0,
          count: modelCount,
          type: 'connection',
          connection,
        })

        if (collapsed.value[name] !== false) {
          return
        }

        const connectionChats = chatStore ? chatStore.getConnectionChats(name) : []

        list.push({
          id: `${name}-new-chat`,
          name: 'New Chat',
          indent: 1,
          count: connectionChats.length,
          type: 'new-chat',
          connection,
        })

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

        list.push({
          id: `${name}-open-validation`,
          name: 'Validation Tests',
          indent: 1,
          count: 0,
          type: 'open-validation',
          connection,
        })

        list.push({
          id: settingsId(name),
          name: 'Settings',
          indent: 1,
          count: 0,
          type: 'settings-group',
          connection,
        })

        if (collapsed.value[settingsId(name)] === false) {
          if (connection.type !== 'demo') {
            list.push({
              id: `${name}-api-key`,
              name: 'API Key',
              indent: 2,
              count: 0,
              type: 'api-key',
              connection,
            })
          }

          list.push({
            id: `${name}-model`,
            name: 'Model',
            indent: 2,
            count: 0,
            type: 'model',
            connection,
          })

          list.push({
            id: `${name}-fast-model`,
            name: 'Fast Model',
            indent: 2,
            count: 0,
            type: 'fast-model',
            connection,
          })

          if (connection.type !== 'demo') {
            list.push({
              id: `${name}-toggle-save-credential`,
              name: 'Toggle Save Credential',
              indent: 2,
              count: 0,
              type: 'toggle-save-credential',
              connection,
            })
          }
        }

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
      })

      return list
    })

    const isItemSelected = (item: any): boolean => {
      if (item.type === 'chat-item' && item.chatId && chatStore) {
        return item.chatId === chatStore.activeChatId
      }
      if (item.type === 'connection') {
        return item.id === llmConnectionStore.activeConnection
      }
      return false
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
      updateFastModel,
      refreshId,
      creatorVisible,
      isItemSelected,
      screenNavigation,
    }
  },
  components: {
    SidebarList,
    LLMConnectionListItem,
    LLMConnectionCreator,
  },
  methods: {
    resetConnection(connection: LLMProvider) {
      return this.llmConnectionStore.resetConnection(connection.name)
    },

    setActiveConnection(connectionName: string) {
      this.llmConnectionStore.activeConnection = connectionName
      this.llmConnectionStore.connections[connectionName].isDefault = true
      this.llmConnectionStore.connections[connectionName].changed = true
      Object.keys(this.llmConnectionStore.connections).forEach((key) => {
        if (key !== connectionName && this.llmConnectionStore.connections[key].isDefault) {
          this.llmConnectionStore.connections[key].isDefault = false
          this.llmConnectionStore.connections[key].changed = true
        }
      })
      this.saveConnections()
    },

    deleteConnection(id: string, connectionName: string) {
      if (confirm(`Are you sure you want to delete the connection "${connectionName}"?`)) {
        if (this.chatStore) {
          const chats = this.chatStore.getConnectionChats(connectionName)
          chats.forEach((chat) => {
            this.screenNavigation.closeTab(null, `${connectionName}${KeySeparator}${chat.id}`)
            this.chatStore.removeChat(chat.id)
          })
        }

        this.screenNavigation.closeTab(null, connectionName)
        this.llmConnectionStore.connections[connectionName].delete()

        if (this.llmConnectionStore.activeConnection === id) {
          this.llmConnectionStore.activeConnection = ''
        }
      }
    },

    deleteChat(chatId: string, _connectionName: string) {
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
.llm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.llm-header .sidebar-header {
  margin: 0;
}

.llm-new-button {
  min-height: 30px;
  height: 30px;
  padding: 0 10px;
  gap: 5px;
  font-size: 13px;
}

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
