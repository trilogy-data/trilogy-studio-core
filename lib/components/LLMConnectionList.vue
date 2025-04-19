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

        <loading-button :action="saveConnections" :key-combination="['control', 's']"
          >Save</loading-button
        >
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
    />
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import SidebarList from './SidebarList.vue'
import LoadingButton from './LoadingButton.vue'
import StatusIcon from './StatusIcon.vue'
import Tooltip from './Tooltip.vue'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import { KeySeparator } from '../data/constants'
import { LLMProvider } from '../llm/base'
import LLMConnectionListItem from './LLMConnectionListItem.vue'
import LLMConnectionCreator from './LLMConnectionCreator.vue'

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
  setup(_, { emit }) {
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const saveConnections = inject<Function>('saveLLMConnections')
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
        // Replace the old connection
        llmConnectionStore.connections[connection.name].model = model
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

    const toggleCollapse = async (id: string, connectionName: string, type: string) => {
      // Emit selection event for connections
      if (['connection', 'model'].includes(type)) {
        emit('connection-key-selected', id)
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

    const contentList = computed(() => {
      const list: Array<{
        id: string
        name: string
        indent: number
        count: number
        type: string
        connection: any | undefined
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
