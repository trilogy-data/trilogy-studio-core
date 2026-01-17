<template>
  <div class="llm-view-container">
    <!-- View Tabs -->
    <div class="view-tabs">
      <button
        class="view-tab"
        :class="{ active: activeView === 'chat' }"
        @click="activeView = 'chat'"
        data-testid="llm-view-tab-chat"
      >
        Chat
      </button>
      <button
        class="view-tab"
        :class="{ active: activeView === 'validation' }"
        @click="activeView = 'validation'"
        data-testid="llm-view-tab-validation"
      >
        Validation Tests
      </button>
    </div>

    <!-- Chat View with Split Layout -->
    <div v-if="activeView === 'chat'" class="chat-view">
      <l-l-m-chat-split-view
        ref="chatSplitView"
        :title="activeChatTitle"
        :editableTitle="true"
        placeholder="Ask about your data... (Enter to send)"
        :systemPrompt="chatSystemPrompt"
        :connectionInfo="chatConnectionInfo"
        :availableImports="availableImportsForChat"
        :activeImports="activeImportsForChat"
        :symbols="chatSymbols"
        :initialMessages="activeChatMessages"
        :initialArtifacts="activeChatArtifacts"
        :initialActiveArtifactIndex="activeChatArtifactIndex"
        :externalLoading="isChatLoading"
        :activeToolName="activeToolName"
        :onSendMessage="handleChatMessageWithTools"
        @update:messages="handleMessagesUpdate"
        @update:artifacts="handleArtifactsUpdate"
        @update:activeArtifactIndex="handleActiveArtifactUpdate"
        @import-change="handleImportChange"
        @title-update="handleTitleUpdate"
      >
        <template #header-prefix>
          <button
            class="auto-name-btn"
            :class="{ 'is-loading': isGeneratingName }"
            @click="generateChatName"
            :disabled="isGeneratingName || activeChatMessages.length === 0"
            title="Auto-generate chat name"
            data-testid="auto-name-chat-btn"
          >
            <i v-if="!isGeneratingName" class="mdi mdi-auto-fix"></i>
            <span v-else class="spinner"></span>
          </button>
        </template>
        <template #header-actions>
          <div class="chat-header-controls">
            <dashboard-import-selector
              v-if="availableImportsForChat.length > 0"
              :available-imports="availableImportsForChat"
              :active-imports="activeImportsForChat"
              @update:imports="handleImportChange"
            />
            <span v-if="chatConnectionInfo" class="connection-info">
              {{ chatConnectionInfo }}
            </span>
          </div>
        </template>
      </l-l-m-chat-split-view>
    </div>

    <!-- Validation View -->
    <l-l-m-validation-view v-else :initialProvider="initialProvider" />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, inject, type PropType } from 'vue'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { NavigationStore } from '../stores/useScreenNavigation'
import LLMChatSplitView from '../components/llm/LLMChatSplitView.vue'
import LLMValidationView from '../components/llm/LLMValidationView.vue'
import DashboardImportSelector from '../components/dashboard/DashboardImportSelector.vue'
import { useChatWithTools } from '../composables/useChatWithTools'

export default defineComponent({
  name: 'LLMChatDebugComponent',
  components: {
    LLMChatSplitView,
    LLMValidationView,
    DashboardImportSelector,
  },
  props: {
    initialProvider: {
      type: String,
      default: '',
    },
    initialModel: {
      type: String,
      default: '',
    },
    initialTab: {
      type: String as PropType<'chat' | 'validation' | ''>,
      default: '',
    },
  },

  setup(props) {
    // Inject stores and services
    const llmConnectionStore = inject('llmConnectionStore') as LLMConnectionStoreType
    const connectionStore = inject('connectionStore') as ConnectionStoreType | null
    const queryExecutionService = inject('queryExecutionService') as QueryExecutionService | null
    const chatStore = inject('chatStore') as ChatStoreType | null
    const editorStore = inject('editorStore') as EditorStoreType | null
    const navigationStore = inject('navigationStore') as NavigationStore | null

    // View state - use initialTab if provided, otherwise default to 'chat'
    const activeView = ref<'chat' | 'validation'>(
      props.initialTab === 'chat' || props.initialTab === 'validation' ? props.initialTab : 'chat',
    )
    const chatSplitView = ref<InstanceType<typeof LLMChatSplitView> | null>(null)

    // Use the chat with tools composable
    const chat = useChatWithTools({
      llmConnectionStore,
      connectionStore,
      queryExecutionService,
      chatStore,
      editorStore,
      navigationStore,
    })

    // Watch for changes to initialTab prop
    watch(
      () => props.initialTab,
      (newTab) => {
        if (newTab === 'chat' || newTab === 'validation') {
          activeView.value = newTab
        }
      },
    )

    // Auto-connect the LLM connection when opening chat view if it's idle
    // Uses the chat's LLM connection, falling back to global active connection
    const autoConnectLLMIfNeeded = async () => {
      // Prefer the chat's stored LLM connection over the global active connection
      const llmConnName =
        chatStore?.activeChat?.llmConnectionName || llmConnectionStore.activeConnection
      if (llmConnName) {
        const status = llmConnectionStore.getConnectionStatus(llmConnName)
        if (status === 'disabled') {
          try {
            await llmConnectionStore.resetConnection(llmConnName)
          } catch (err) {
            console.error('Failed to auto-connect LLM:', err)
          }
        }
      }
    }

    // Auto-connect the DB connection associated with the active chat if it's idle
    const autoConnectDBIfNeeded = async () => {
      if (!connectionStore || !chatStore?.activeChat) return

      const dataConnectionName = chatStore.activeChat.dataConnectionName
      if (!dataConnectionName) return

      const connection = connectionStore.connections[dataConnectionName]
      if (!connection) return

      const status = connectionStore.connectionStateToStatus(connection)
      if (status === 'disabled') {
        try {
          await connectionStore.resetConnection(dataConnectionName)
        } catch (err) {
          console.error('Failed to auto-connect DB:', err)
        }
      }
    }

    // Watch for chat view becoming active
    watch(
      () => activeView.value,
      (newView) => {
        if (newView === 'chat') {
          autoConnectLLMIfNeeded()
          autoConnectDBIfNeeded()
        }
      },
      { immediate: true },
    )

    // Also watch for active chat changes to auto-connect its DB and LLM connections
    if (chatStore) {
      watch(
        () => chatStore?.activeChat?.dataConnectionName,
        (dataConnectionName) => {
          if (activeView.value === 'chat' && dataConnectionName) {
            autoConnectDBIfNeeded()
          }
        },
      )

      watch(
        () => chatStore?.activeChat?.llmConnectionName,
        (llmConnectionName) => {
          if (activeView.value === 'chat' && llmConnectionName) {
            autoConnectLLMIfNeeded()
          }
        },
      )
    }

    return {
      activeView,
      chatSplitView,
      // Spread all chat composable returns
      ...chat,
    }
  },
})
</script>
<style scoped>
.llm-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.view-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  background: var(--sidebar-bg);
  min-height: 30px;
  z-index: 99;
}

.view-tab {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  border-bottom: 2px solid transparent;
  padding-left: 20px;
  padding-right: 20px;
  color: var(--text-color);
  border-radius: 0px;
}

.view-tab:hover {
  color: #0ea5e9;
}

.view-tab.active {
  color: #0ea5e9;
  border-bottom: 2px solid #0ea5e9;
  border-radius: 0px;
}

.chat-view {
  flex: 1;
  overflow: hidden;
}

.chat-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-name-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.auto-name-btn:hover:not(:disabled) {
  background-color: var(--button-mouseover);
  color: var(--special-text);
}

.auto-name-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auto-name-btn i {
  font-size: 16px;
}

.auto-name-btn.is-loading {
  cursor: wait;
}

.auto-name-btn .spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-light);
  border-top-color: var(--special-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.connection-info {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  padding: 2px 8px;
  background-color: var(--bg-color);
  border-radius: 4px;
}
</style>
