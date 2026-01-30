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
        <div v-else class="chat-title">{{ title }}</div>
      </div>
      <slot name="header-actions"></slot>
    </div>

    <div class="chat-messages" ref="messagesContainer" data-testid="messages-container">
      <div
        v-for="(message, index) in visibleMessages"
        :key="index"
        class="message"
        :class="[message.role, { 'has-artifact': message.artifact }]"
        :data-testid="`message-${message.role}-${index}`"
      >
        <div class="message-content">
          <!-- Render artifacts if present -->
          <template v-if="message.artifact">
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
          <!-- Assistant message with markdown -->
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
              v-for="(toolCall, toolIndex) in message.executedToolCalls"
              :key="toolIndex"
              class="tool-call"
              :class="{ success: toolCall.result?.success, error: !toolCall.result?.success }"
            >
              <span class="tool-icon">
                <i
                  :class="
                    toolCall.result?.success ? 'mdi mdi-check-circle' : 'mdi mdi-alert-circle'
                  "
                ></i>
              </span>
              <span class="tool-name">{{ getToolDisplayName(toolCall.name) }}</span>
              <span v-if="toolCall.result?.error" class="tool-error">{{
                toolCall.result.error
              }}</span>
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
          v-if="isLoading && customStopHandler"
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
  inject,
  type PropType,
  computed,
} from 'vue'
import { type LLMConnectionStoreType } from '../../stores/llmStore'
import type { ChatMessage, ChatArtifact, ChatToolCall } from '../../chats/chat'
import EditableTitle from '../EditableTitle.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'

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
    // Custom send handler - if provided, component won't use llmStore
    customSendHandler: {
      type: [Function, null] as PropType<
        ((message: string, messages: ChatMessage[]) => Promise<void>) | null
      >,
      default: undefined,
    },
    // Custom stop handler - called when user clicks stop during loading
    customStopHandler: {
      type: [Function, null] as PropType<(() => void) | null>,
      default: undefined,
    },
    // Text to show on stop button
    stopButtonText: {
      type: String,
      default: 'Stop',
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
    const internalLoading = ref(false)
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

    // Try to inject llmStore, but don't require it
    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore', null as any)

    const isLoading = computed(() => props.externalLoading || internalLoading.value)

    const visibleMessages = computed(() => {
      return internalMessages.value.filter((m) => !m.hidden)
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
      if (props.customStopHandler) {
        props.customStopHandler()
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
      }
      return toolLabels[toolName] || `Using ${toolName}...`
    }

    // Get display name for completed tool calls
    const getToolDisplayName = (toolName: string): string => {
      const toolLabels: Record<string, string> = {
        validate_query: 'Validated query',
        run_query: 'Ran query',
        run_active_editor_query: 'Ran editor query',
        format_query: 'Formatted query',
        edit_chart_config: 'Updated chart',
        edit_editor: 'Updated editor',
        request_close: 'Requested close',
        close_session: 'Closed session',
        connect_data_connection: 'Connected',
        run_trilogy_query: 'Ran query',
        chart_trilogy_query: 'Ran chart query',
        add_import: 'Added import',
        remove_import: 'Removed import',
        list_available_imports: 'Listed imports',
      }
      return toolLabels[toolName] || toolName.replace(/_/g, ' ')
    }

    const sendMessage = async () => {
      if (isLoading.value || !userInput.value.trim()) return

      const content = userInput.value.trim()
      userInput.value = ''

      // When customSendHandler is provided, it manages messages (via store/runToolLoop)
      // Don't add the message here - the handler will add it and sync back via props.messages
      if (props.customSendHandler) {
        scrollToBottom()
        await props.customSendHandler(content, internalMessages.value)
        return
      }

      // Default flow: add user message locally
      const userMessage: ChatMessage = {
        role: 'user',
        content: content,
      }
      internalMessages.value.push(userMessage)
      emit('update:messages', internalMessages.value)
      emit('message-sent', userMessage)
      scrollToBottom()

      // Otherwise use the llmStore
      if (!llmStore) {
        internalMessages.value.push({
          role: 'assistant',
          content: 'Error: No LLM connection available. Please configure an LLM provider.',
        })
        emit('update:messages', internalMessages.value)
        return
      }

      internalLoading.value = true

      try {
        await llmStore.generateValidatedCompletion(
          content,
          () => true, // No validation
          3,
          llmStore.activeConnection,
          internalMessages.value,
          false,
        )

        const lastMessage = internalMessages.value[internalMessages.value.length - 1]
        emit('update:messages', internalMessages.value)
        emit('response-received', lastMessage)
      } catch (error) {
        internalMessages.value.push({
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        })
        emit('update:messages', internalMessages.value)
      } finally {
        internalLoading.value = false
        focusInput()
        scrollToBottom()
      }
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
  background-color: var(--bg-color);
  overflow: hidden;
  color: var(--text-color);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  height: 30px;
  min-height: 30px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-light);
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-title {
  font-size: var(--font-size);
  font-weight: 600;
  color: var(--text-color);
}

.chat-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--result-window-bg);
}

.message {
  padding: 8px;
  max-width: 85%;
  word-break: break-word;
}

.message.user {
  align-self: flex-end;
  background-color: var(--sidebar-selector-selected-bg);
  color: var(--sidebar-selector-font);
}

.message.assistant {
  align-self: flex-start;
  background-color: var(--sidebar-bg);
  color: var(--sidebar-font);
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
  padding: 5px;
  border-top: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  width: 100%;
  border: 1px solid var(--border);
  background-color: var(--query-window-bg);
  padding: 6px;
  gap: 8px;
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
  height: 28px;
  border: none;
  background-color: var(--special-text);
  color: white;
  font-weight: 300;
  font-size: 12px;
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
  flex-shrink: 0;
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
