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
        @click="sendMessage"
        :disabled="isLoading || disabled || !userInput.trim()"
        data-testid="send-button"
        class="send-button"
      >
        {{ sendButtonText }}
      </button>
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
import { type LLMMessage } from '../../llm'
import EditableTitle from '../EditableTitle.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'

export interface ChatArtifact {
  type: 'results' | 'chart' | 'code' | 'custom'
  data: any
  config?: any
}

export interface ChatMessage extends LLMMessage {
  artifact?: ChatArtifact
  modelInfo?: {
    totalTokens: number
  }
}

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

    // Get display text for tool indicator
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

    const sendMessage = async () => {
      if (isLoading.value || !userInput.value.trim()) return

      const content = userInput.value.trim()

      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: content,
      }
      internalMessages.value.push(userMessage)
      emit('update:messages', internalMessages.value)
      emit('message-sent', userMessage)

      const messageContent = content
      userInput.value = ''
      scrollToBottom()

      // Use custom handler if provided
      if (props.customSendHandler) {
        await props.customSendHandler(messageContent, internalMessages.value)
        return
      }

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
          messageContent,
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
      getMessageTextWithoutArtifact,
      getToolDisplayText,
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
  gap: 12px;
  background-color: var(--result-window-bg);
}

.message {
  padding: 10px 12px;
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
  padding: 10px;
  border-top: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
  gap: 10px;
}

.textarea-wrapper {
  flex-grow: 1;
  position: relative;
}

.textarea-wrapper textarea {
  width: 100%;
  min-height: 50px;
  max-height: 150px;
  padding: 8px;
  border: 1px solid var(--border);
  resize: vertical;
  font-family: inherit;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
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
  align-self: flex-end;
  height: 36px;
  border: 1px solid var(--border);
  background-color: var(--button-bg);
  color: var(--button-text);
}

.send-button:hover:not(:disabled) {
  background-color: var(--button-mouseover);
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

@media screen and (max-width: 768px) {
  .textarea-wrapper textarea {
    font-size: var(--font-size);
  }

  .send-button {
    font-size: var(--button-font-size);
  }
}
</style>
