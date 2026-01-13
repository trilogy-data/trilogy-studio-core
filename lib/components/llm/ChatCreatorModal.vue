<template>
  <div v-if="visible" class="confirmation-overlay" @click="$emit('close')">
    <div class="confirmation-dialog" data-testid="chat-creator-modal" @click.stop>
      <h3>Create New Chat</h3>
      <div class="chat-creator-form">
        <div class="form-group">
          <label for="llm-connection">LLM Connection: <span class="required">*</span></label>
          <div class="select-with-status">
            <select
              id="llm-connection"
              v-model="selectedLLMConnection"
              required
              :disabled="!!preselectedConnection"
              data-testid="llm-connection-select"
            >
              <option value="" disabled>Select an LLM connection...</option>
              <option
                v-for="conn in sortedLLMConnections"
                :key="conn.name"
                :value="conn.name"
                :disabled="!conn.connected"
              >
                {{ conn.name }} ({{ conn.model }})
              </option>
            </select>
            <status-icon
              v-if="selectedConnectionStatus"
              :status="selectedConnectionStatus.status"
              :message="selectedConnectionStatus.message"
              :testName="selectedLLMConnection"
            />
          </div>
          <small v-if="!selectedLLMConnection">
            Required - Select which LLM to use for this chat
          </small>
        </div>

        <div class="form-group">
          <label for="data-connection">Data Connection:</label>
          <div class="select-with-status">
            <select
              id="data-connection"
              v-model="selectedDataConnection"
              data-testid="data-connection-select"
            >
              <option value="">None - Select later</option>
              <option
                v-for="conn in sortedDataConnections"
                :key="conn.name"
                :value="conn.name"
              >
                {{ conn.name }}
              </option>
            </select>
            <status-icon
              v-if="selectedDataConnectionStatus"
              :status="selectedDataConnectionStatus.status"
              :message="selectedDataConnectionStatus.message"
              :testName="'data-' + selectedDataConnection"
            />
          </div>
          <small> Optional - Select a data source for running queries </small>
        </div>

        <div class="form-group">
          <label for="chat-name">Chat Name:</label>
          <input
            id="chat-name"
            v-model="chatName"
            placeholder="Auto-generated if empty"
            maxlength="100"
            data-testid="chat-name-input"
          />
        </div>

        <div class="button-container">
          <button class="cancel-btn" @click="$emit('close')" data-testid="cancel-chat-create">
            Cancel
          </button>
          <button
            class="primary-button"
            @click="createChat"
            :disabled="!selectedLLMConnection"
            data-testid="create-chat-btn"
          >
            Create Chat
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, inject, watch } from 'vue'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ChatStoreType } from '../../stores/chatStore'
import StatusIcon from '../StatusIcon.vue'
import type { Status } from '../StatusIcon.vue'

export default defineComponent({
  name: 'ChatCreatorModal',
  components: {
    StatusIcon,
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    preselectedConnection: {
      type: String,
      default: '',
    },
  },
  emits: ['close', 'chat-created'],
  setup(props, { emit }) {
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore', null as any)
    const chatStore = inject<ChatStoreType>('chatStore', null as any)

    const selectedLLMConnection = ref(props.preselectedConnection || '')
    const selectedDataConnection = ref('')
    const chatName = ref('')

    // Watch for preselectedConnection changes
    watch(
      () => props.preselectedConnection,
      (newVal) => {
        if (newVal) {
          selectedLLMConnection.value = newVal
        }
      },
      { immediate: true },
    )

    // Reset form when modal opens
    watch(
      () => props.visible,
      (isVisible) => {
        if (isVisible) {
          if (props.preselectedConnection) {
            selectedLLMConnection.value = props.preselectedConnection
          }
          selectedDataConnection.value = ''
          chatName.value = ''
        }
      },
    )

    const availableLLMConnections = computed(() => {
      if (!llmConnectionStore) return []
      return Object.values(llmConnectionStore.connections)
        .filter((conn: any) => !conn.deleted)
        .map((conn: any) => ({
          name: conn.name,
          model: conn.model || 'Unknown',
          connected: conn.connected === true,
          running: conn.running === true,
          error: conn.error || null,
        }))
    })

    // Sort connections with connected ones at the top
    const sortedLLMConnections = computed(() => {
      return [...availableLLMConnections.value].sort((a, b) => {
        // Connected first, then not connected
        if (a.connected && !b.connected) return -1
        if (!a.connected && b.connected) return 1
        // Within same connection status, sort alphabetically
        return a.name.localeCompare(b.name)
      })
    })

    // Get status for the selected connection
    const selectedConnectionStatus = computed((): { status: Status; message: string } | null => {
      if (!selectedLLMConnection.value) return null
      const conn = availableLLMConnections.value.find(
        (c) => c.name === selectedLLMConnection.value,
      )
      if (!conn) return null

      if (!conn.connected) {
        return { status: 'disabled', message: 'Disconnected' }
      }
      if (conn.running) {
        return { status: 'running', message: 'Running' }
      }
      if (conn.error) {
        return { status: 'failed', message: conn.error }
      }
      return { status: 'connected', message: 'Connected' }
    })

    const availableDataConnections = computed(() => {
      if (!connectionStore) return []
      return Object.values(connectionStore.connections)
        .filter((conn: any) => !conn.deleted)
        .map((conn: any) => ({
          name: conn.name,
          connected: conn.connected === true,
          running: conn.running === true,
          error: conn.error || null,
        }))
    })

    // Sort data connections with connected ones at the top
    const sortedDataConnections = computed(() => {
      return [...availableDataConnections.value].sort((a, b) => {
        // Connected first, then not connected
        if (a.connected && !b.connected) return -1
        if (!a.connected && b.connected) return 1
        // Within same connection status, sort alphabetically
        return a.name.localeCompare(b.name)
      })
    })

    // Get status for the selected data connection
    const selectedDataConnectionStatus = computed((): { status: Status; message: string } | null => {
      if (!selectedDataConnection.value) return null
      const conn = availableDataConnections.value.find(
        (c) => c.name === selectedDataConnection.value,
      )
      if (!conn) return null

      if (!conn.connected) {
        return { status: 'disabled', message: 'Disconnected' }
      }
      if (conn.running) {
        return { status: 'running', message: 'Running' }
      }
      if (conn.error) {
        return { status: 'failed', message: conn.error }
      }
      return { status: 'connected', message: 'Connected' }
    })

    const createChat = () => {
      if (!selectedLLMConnection.value || !chatStore) return

      // Set the LLM connection as active
      if (llmConnectionStore) {
        llmConnectionStore.activeConnection = selectedLLMConnection.value
      }

      // Create the new chat
      const chat = chatStore.newChat(
        selectedLLMConnection.value,
        selectedDataConnection.value,
        chatName.value || undefined,
      )

      emit('chat-created', chat)
      emit('close')
    }

    return {
      selectedLLMConnection,
      selectedDataConnection,
      chatName,
      availableLLMConnections,
      sortedLLMConnections,
      selectedConnectionStatus,
      availableDataConnections,
      sortedDataConnections,
      selectedDataConnectionStatus,
      createChat,
    }
  },
})
</script>

<style scoped>
.confirmation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.confirmation-dialog {
  background-color: var(--bg-color);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

h3 {
  margin: 0 0 20px 0;
  color: var(--text-color);
  font-size: var(--big-font-size);
}

.chat-creator-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-weight: 600;
  font-size: var(--font-size);
  color: var(--text-color);
}

.required {
  color: var(--error-color);
}

.select-with-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-with-status select {
  flex: 1;
}

.form-group select,
.form-group input {
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: var(--font-size);
}

.form-group select:focus,
.form-group input:focus {
  outline: none;
  border-color: var(--special-text);
}

.form-group select:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.form-group option:disabled {
  color: var(--text-faint);
}

.form-group small {
  font-size: var(--small-font-size);
  color: var(--text-faint);
}

.button-container {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.cancel-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-light);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 4px;
  font-size: var(--font-size);
}

.cancel-btn:hover {
  background-color: var(--button-mouseover);
}

.primary-button {
  padding: 8px 16px;
  border: none;
  background-color: var(--special-text);
  color: white;
  cursor: pointer;
  border-radius: 4px;
  font-size: var(--font-size);
}

.primary-button:hover:not(:disabled) {
  opacity: 0.9;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
