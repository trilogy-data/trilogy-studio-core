<template>
  <div class="llm-chat-container" data-testid="llm-chat-container">
    <div class="chat-header" v-if="showHeader">
      <div class="chat-header-left">
        <slot name="header-prefix"></slot>
        <editable-title
          v-if="editableTitle"
          :modelValue="title"
          @update:modelValue="$emit('title-update', $event)"
          testId="chat-title"
          class="chat-title"
        />
        <div v-else class="chat-title" :title="title">{{ title }}</div>
      </div>
      <div class="chat-header-actions">
        <slot name="header-actions"></slot>
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer" data-testid="messages-container">
      <div
        v-for="(message, index) in visibleMessages"
        :key="index"
        class="message"
        :class="[
          message.role,
          { 'has-artifact': message.artifact, 'tool-only': isToolOnlyAssistantMessage(message) },
        ]"
        :data-testid="`message-${message.role}-${index}`"
      >
        <span
          v-if="message.role === 'assistant' && !isToolOnlyAssistantMessage(message)"
          class="message-avatar assistant-avatar"
        >
          <i class="mdi mdi-robot-outline"></i>
        </span>
        <div class="message-content">
          <!-- Render artifacts inline if renderArtifacts is enabled -->
          <template v-if="message.artifact && renderArtifacts">
            <div class="message-text" v-if="getMessageTextWithoutArtifact(message)">
              <markdown-renderer
                v-if="message.role === 'assistant'"
                :markdown="getMessageTextWithoutArtifact(message)"
              />
              <pre v-else>{{ getMessageTextWithoutArtifact(message) }}</pre>
            </div>
            <slot name="artifact" :artifact="message.artifact" :message="message">
              <div class="artifact-placeholder">[Artifact: {{ message.artifact.type }}]</div>
            </slot>
          </template>
          <!-- Assistant message with markdown (also handles artifact messages when renderArtifacts is false) -->
          <template v-else-if="message.role === 'assistant'">
            <markdown-renderer :markdown="message.content" />
          </template>
          <!-- User messages rendered as plain text -->
          <pre v-else>{{ message.content }}</pre>

          <!-- Tool calls display (uses executedToolCalls which has result info for UI) -->
          <div
            v-if="message.executedToolCalls && message.executedToolCalls.length > 0"
            class="tool-calls"
          >
            <div
              v-for="toolCall in getCondensedToolCalls(message.executedToolCalls)"
              :key="toolCall.key"
              class="tool-call"
              :class="{ success: toolCall.success, error: !toolCall.success }"
              :title="toolCall.error || toolCall.label"
            >
              <span class="tool-icon">
                <i :class="toolCall.success ? 'mdi mdi-check-circle' : 'mdi mdi-alert-circle'"></i>
              </span>
              <span class="tool-name">
                {{ toolCall.label }}
                <span v-if="toolCall.count > 1" class="tool-count">(x{{ toolCall.count }})</span>
              </span>
              <span v-if="toolCall.error" class="tool-error">{{ toolCall.error }}</span>
            </div>
          </div>
        </div>
        <div v-if="message.modelInfo" class="message-meta">
          {{ message.modelInfo.totalTokens }} tokens
        </div>
      </div>

      <div v-if="isLoading" class="loading-indicator" data-testid="loading-indicator">
        <span class="loading-spinner"></span>
        <span class="loading-message">
          {{ activeToolName ? getToolDisplayText(activeToolName) : loadingText }}
        </span>
      </div>
    </div>

    <div class="input-container">
      <div class="input-wrapper">
        <div class="textarea-wrapper">
          <textarea
            v-model="userInput"
            @keydown="handleKeyDown"
            :disabled="isLoading || disabled"
            ref="inputTextarea"
            data-testid="input-textarea"
          ></textarea>
          <span
            v-if="!userInput"
            class="animated-placeholder"
            :class="{ 'fade-transition': isPlaceholderTransitioning }"
          >
            {{ currentPlaceholder }}
          </span>
        </div>
        <button
          v-if="isLoading && stopHandler"
          @click="handleStop"
          data-testid="stop-button"
          class="send-button stop-button"
        >
          {{ stopButtonText }}
        </button>
        <button
          v-else
          @click="sendMessage"
          :disabled="isLoading || disabled || !userInput.trim()"
          data-testid="send-button"
          class="send-button"
        >
          {{ sendButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  nextTick,
  watch,
  onMounted,
  onUnmounted,
  type PropType,
  computed,
} from 'vue'
import type { ChatMessage, ChatArtifact, ChatToolCall } from '../../chats/chat'
import EditableTitle from '../EditableTitle.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import {
  condenseToolCalls,
  getToolDisplayName,
  mergeContiguousToolCallMessages,
  isToolOnlyAssistantMessage,
} from './toolCallDisplay'

// Re-export for backwards compatibility
export type { ChatMessage, ChatArtifact, ChatToolCall }

export default defineComponent({
  name: 'LLMChatComponent',
  components: {
    EditableTitle,
    MarkdownRenderer,
  },
  props: {
    messages: {
      type: Array as PropType<ChatMessage[]>,
      default: () => [],
    },
    title: {
      type: String,
      default: 'Chat',
    },
    editableTitle: {
      type: Boolean,
      default: false,
    },
    showHeader: {
      type: Boolean,
      default: true,
    },
    placeholder: {
      type: [String, Array] as PropType<string | string[]>,
      default: 'Type your message... (Enter to send)',
    },
    sendButtonText: {
      type: String,
      default: 'Send',
    },
    loadingText: {
      type: String,
      default: 'Thinking...',
    },
    // Current tool being executed (for inline indicator)
    activeToolName: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    codeLanguage: {
      type: String as PropType<'sql' | 'trilogy'>,
      default: 'sql',
    },
    systemPrompt: {
      type: String,
      default: '',
    },
    // Allow external control of loading state
    externalLoading: {
      type: Boolean,
      default: false,
    },
    // Handler for sending messages - called with message content and current messages
    sendHandler: {
      type: Function as PropType<(message: string, messages: ChatMessage[]) => Promise<void>>,
      required: true,
    },
    // Stop handler - called when user clicks stop during loading
    stopHandler: {
      type: [Function, null] as PropType<(() => void) | null>,
      default: null,
    },
    // Text to show on stop button
    stopButtonText: {
      type: String,
      default: 'Stop',
    },
    // Whether to render artifacts inline in chat messages
    renderArtifacts: {
      type: Boolean,
      default: true,
    },
  },

  emits: [
    'message-sent',
    'response-received',
    'artifact-created',
    'update:messages',
    'title-update',
  ],

  setup(props, { emit }) {
    const internalMessages = ref<ChatMessage[]>([...props.messages])
    const userInput = ref('')
    const messagesContainer = ref<HTMLElement | null>(null)
    const inputTextarea = ref<HTMLTextAreaElement | null>(null)

    // Placeholder cycling logic
    const placeholderIndex = ref(0)
    const isPlaceholderTransitioning = ref(false)
    let placeholderInterval: ReturnType<typeof setInterval> | null = null

    const currentPlaceholder = computed(() => {
      if (Array.isArray(props.placeholder)) {
        return props.placeholder[placeholderIndex.value] || ''
      }
      return props.placeholder
    })

    const startPlaceholderCycle = () => {
      if (Array.isArray(props.placeholder) && props.placeholder.length > 1) {
        placeholderInterval = setInterval(() => {
          // Start fade out
          isPlaceholderTransitioning.value = true
          // After fade out, change text and fade in
          setTimeout(() => {
            placeholderIndex.value =
              (placeholderIndex.value + 1) % (props.placeholder as string[]).length
            isPlaceholderTransitioning.value = false
          }, 300)
        }, 3500)
      }
    }

    const stopPlaceholderCycle = () => {
      if (placeholderInterval) {
        clearInterval(placeholderInterval)
        placeholderInterval = null
      }
    }

    const isLoading = computed(() => props.externalLoading)

    const visibleMessages = computed(() => {
      return mergeContiguousToolCallMessages(internalMessages.value.filter((m) => !m.hidden))
    })

    // Sync with external messages prop
    watch(
      () => props.messages,
      (newMessages) => {
        internalMessages.value = [...newMessages]
      },
      { deep: true },
    )

    // Scroll to bottom when messages are updated
    watch(
      internalMessages,
      () => {
        scrollToBottom()
      },
      { deep: true },
    )

    const scrollToBottom = () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
        }
      })
    }

    const focusInput = () => {
      nextTick(() => {
        if (inputTextarea.value) {
          inputTextarea.value.focus()
        }
      })
    }

    onMounted(() => {
      scrollToBottom()
      focusInput()
      startPlaceholderCycle()

      // Add system prompt as hidden message if provided
      if (props.systemPrompt && internalMessages.value.length === 0) {
        internalMessages.value.push({
          role: 'system',
          content: props.systemPrompt,
          hidden: true,
        })
      }
    })

    onUnmounted(() => {
      stopPlaceholderCycle()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
      }
    }

    const getMessageTextWithoutArtifact = (message: ChatMessage) => {
      // Return message content without artifact data reference
      return message.content
    }

    // Handle stop button click
    const handleStop = () => {
      if (props.stopHandler) {
        props.stopHandler()
      }
    }

    // Get display text for tool indicator (loading state)
    const getToolDisplayText = (toolName: string): string => {
      const toolLabels: Record<string, string> = {
        run_trilogy_query: 'Running query...',
        chart_trilogy_query: 'Running query for chart...',
        add_import: 'Adding import...',
        remove_import: 'Removing import...',
        list_available_imports: 'Listing imports...',
        connect_data_connection: 'Connecting...',
        create_markdown: 'Creating markdown...',
        list_artifacts: 'Listing artifacts...',
        get_artifact: 'Getting artifact...',
        update_artifact: 'Updating artifact...',
        remove_artifact: 'Removing artifact...',
        reorder_artifacts: 'Reordering artifacts...',
      }
      return toolLabels[toolName] || `Using ${toolName}...`
    }

    const getCondensedToolCalls = (toolCalls: ChatToolCall[]) => condenseToolCalls(toolCalls)

    const sendMessage = async () => {
      if (isLoading.value || !userInput.value.trim()) return

      const content = userInput.value.trim()
      userInput.value = ''

      // The sendHandler manages messages (via store/runToolLoop)
      // Don't add the message here - the handler will add it and sync back via props.messages
      scrollToBottom()
      await props.sendHandler(content, internalMessages.value)
    }

    const addMessage = (message: ChatMessage) => {
      internalMessages.value.push(message)
      emit('update:messages', internalMessages.value)
      scrollToBottom()
    }

    const addArtifact = (artifact: ChatArtifact, text: string = '') => {
      const message: ChatMessage = {
        role: 'assistant',
        content: text,
        artifact,
      }
      internalMessages.value.push(message)
      emit('update:messages', internalMessages.value)
      emit('artifact-created', artifact)
      scrollToBottom()
    }

    const clearMessages = () => {
      internalMessages.value = []
      if (props.systemPrompt) {
        internalMessages.value.push({
          role: 'system',
          content: props.systemPrompt,
          hidden: true,
        })
      }
      emit('update:messages', internalMessages.value)
    }

    return {
      internalMessages,
      visibleMessages,
      userInput,
      isLoading,
      messagesContainer,
      inputTextarea,
      currentPlaceholder,
      isPlaceholderTransitioning,
      handleKeyDown,
      sendMessage,
      handleStop,
      getMessageTextWithoutArtifact,
      getToolDisplayText,
      getToolDisplayName,
      getCondensedToolCalls,
      isToolOnlyAssistantMessage,
      addMessage,
      addArtifact,
      clearMessages,
      scrollToBottom,
      focusInput,
    }
  },
})
</script>

<style scoped>
.llm-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: var(--query-window-bg);
  overflow: hidden;
  color: var(--text-color);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 48px;
  min-height: 48px;
  background-color: var(--query-window-bg);
  border-bottom: 1px solid var(--border-light);
  overflow: hidden;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 112px;
  overflow: hidden;
}

.chat-header-actions {
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

.chat-title {
  font-size: var(--font-size);
  font-weight: 600;
  color: var(--text-color);
  flex: 1 1 auto;
  min-width: 112px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 768px) {
  .chat-header {
    gap: 6px;
    padding: 0 8px;
  }

  .chat-header-left {
    min-width: 96px;
  }

  .chat-title {
    min-width: 96px;
  }
}

.chat-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: var(--result-window-bg);
}

.message {
  position: relative;
  padding: 8px;
  max-width: 85%;
  word-break: break-word;
}

.message.user {
  align-self: flex-end;
  background-color: rgba(148, 163, 184, 0.1);
  color: var(--text-color);
  border-radius: 18px;
  padding: 4px 8px;
}

.message.assistant {
  align-self: flex-start;
  background-color: var(--query-window-bg);
  color: var(--sidebar-font);
  margin-left: 26px;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
}

.message.system {
  display: none;
}

/* Messages with artifacts should be centered and wider */
.message.has-artifact {
  align-self: center;
  max-width: 95%;
  width: 100%;
  background-color: transparent;
  padding: 0;
}

.message.tool-only {
  max-width: 100%;
  width: fit-content;
}

/* Messages with only tool calls should be minimal (no bg, less padding) */
.message.assistant:has(.tool-calls):not(:has(p)):not(:has(pre)):not(:has(.markdown-renderer)) {
  background-color: transparent;
  padding: 2px 0;
}

.message-content pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: var(--font-size);
}

.message-avatar {
  position: absolute;
  top: 8px;
  left: -22px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: rgba(100, 116, 139, 0.5);
  pointer-events: none;
}

.assistant-avatar i {
  font-size: 14px;
}

.message-meta {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  margin-top: 4px;
  text-align: right;
}

.loading-indicator {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background-color: var(--sidebar-bg);
  border-radius: 4px;
  font-size: var(--font-size);
  color: var(--text-color);
  max-width: 85%;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-light);
  border-top-color: var(--special-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.loading-message {
  color: var(--text-faint);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.input-container {
  display: flex;
  padding: 12px;
  border-top: 1px solid var(--border-light);
  background-color: var(--query-window-bg);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  width: 100%;
  border: 1px solid var(--border-light);
  background-color: var(--query-window-bg);
  padding: 8px;
  gap: 8px;
  border-radius: 14px;
}

.textarea-wrapper {
  flex-grow: 1;
  position: relative;
}

.textarea-wrapper textarea {
  width: 100%;
  min-height: 36px;
  max-height: 150px;
  padding: 8px;
  border: none;
  resize: none;
  font-family: inherit;
  background-color: transparent;
  color: var(--query-window-font);
  font-size: var(--font-size);
  outline: none;
}

.animated-placeholder {
  position: absolute;
  top: 8px;
  left: 9px;
  color: var(--text-faint);
  font-size: var(--font-size);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.3s ease-in-out;
}

.animated-placeholder.fade-transition {
  opacity: 0;
}

.send-button {
  padding: 0 15px;
  cursor: pointer;
  height: 34px;
  background-color: var(--special-text);
  color: white;
  font-weight: 600;
  font-size: 12px;
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
  flex-shrink: 0;
  border-color: var(--special-text);
  box-shadow: none;
}

.send-button:hover:not(:disabled) {
  opacity: 0.9;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-button.stop-button {
  background-color: var(--delete-color, #dc3545);
}

.artifact-placeholder {
  padding: 8px;
  background-color: var(--query-window-bg);
  border: 1px dashed var(--border);
  text-align: center;
  color: var(--text-faint);
}

.message-text {
  margin-bottom: 8px;
}

/* Tool calls display */
.tool-calls {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
}

.tool-call {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.tool-call.success {
  background-color: rgba(40, 167, 69, 0.08);
  color: var(--text-faint);
}

.tool-call.error {
  background-color: rgba(220, 53, 69, 0.08);
  color: var(--text-faint);
}

.tool-icon {
  display: flex;
  align-items: center;
}

.tool-call.success .tool-icon {
  color: #28a745;
}

.tool-call.error .tool-icon {
  color: #dc3545;
}

.tool-name {
  font-weight: 500;
}

.tool-count {
  margin-left: 4px;
}

.tool-error {
  color: #dc3545;
  font-size: var(--small-font-size);
  margin-left: auto;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media screen and (max-width: 768px) {
  .textarea-wrapper textarea {
    font-size: var(--font-size);
  }

  .send-button {
    font-size: var(--button-font-size);
  }
}
</style>
