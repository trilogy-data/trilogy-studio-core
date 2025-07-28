<template>
  <div class="chat-refinement-container" data-testid="chat-refinement-container">
    <div class="chat-header">
      <div>Refine Response</div>
      <button class="close-button" @click="handleClose" data-testid="close-header-button">×</button>
    </div>

    <div class="chat-messages" ref="messagesContainer" data-testid="messages-container">
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="message"
        :class="message.role"
        :data-testid="`message-${message.role}-${index}`"
      >
        <div class="message-content">
          <!-- Special rendering for assistant messages that contain extracted content -->
          <template v-if="message.role === 'assistant' && containsExtractedContent(message)">
            <!-- Display the message with extracted content replaced by placeholder -->
            <div v-html="formatMessageWithPlaceholder(message)"></div>

            <!-- Display the extracted content in a code block -->
            <div class="extracted-content">
              <div class="extracted-label">Generated Query:</div>
              <code-block
                language="trilogy"
                :content="getExtractedContent(message) || ''"
              ></code-block>
            </div>
          </template>
          <!-- Regular message rendering for other messages -->
          <pre v-else>{{ message.content }}</pre>
        </div>
      </div>

      <div v-if="isLoading" class="loading-indicator" data-testid="loading-indicator">
        <span>Generating response...</span>
      </div>
    </div>

    <div class="input-container">
      <textarea
        v-model="userInput"
        @keydown="handleKeyDown"
        placeholder="Respond to refine. (Enter to respond, Ctrl+Shift+Enter to accept and run query)"
        :disabled="isLoading"
        ref="inputTextarea"
        data-testid="input-textarea"
      ></textarea>
      <button
        @click="sendMessage"
        :disabled="isLoading || !userInput.trim()"
        data-testid="send-button"
      >
        Send
      </button>
    </div>

    <!-- Action buttons -->
    <div class="action-buttons">
      <button
        class="accept-button"
        @click="acceptResult"
        :disabled="isLoading"
        data-testid="accept-button"
      >
        Accept
      </button>
      <button
        class="discard-button"
        @click="handleClose"
        :disabled="isLoading"
        data-testid="discard-button"
      >
        Discard
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, nextTick, watch, onMounted, inject, type PropType } from 'vue'
import { type LLMConnectionStoreType, replaceTripleQuotedText } from '../../stores/llmStore'
import { type LLMMessage } from '../../llm'
import CodeBlock from './CodeBlock.vue'
export default defineComponent({
  name: 'LLMChatRefinementComponent',
  components: {
    CodeBlock,
  },
  props: {
    messages: {
      type: Array as PropType<LLMMessage[]>,
      default: () => [],
    },
    validateFn: {
      type: Function,
      default: () => true,
    },
    extractionFn: {
      type: Function,
      default: () => null,
    },
    mutationFn: {
      type: Function,
      default: () => null,
    },
    closeFn: {
      type: Function,
      default: () => {},
    },
    autoActivate: {
      type: Boolean,
      default: true,
    },
  },

  setup(props, { emit }) {
    // Chat state
    const messages = ref<LLMMessage[]>(props.messages)
    const userInput = ref('')
    const isLoading = ref(false)
    const messagesContainer = ref<HTMLElement | null>(null)
    const inputTextarea = ref<HTMLTextAreaElement | null>(null)
    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    // Track extracted content per message using a Map
    const extractedContentMap = ref(new Map<string, string>())

    if (!llmStore) {
      throw new Error('LLMConnectionStore not found')
    }

    // Try to extract content from all assistant messages
    const updateExtractedContent = async () => {
      // Process all assistant messages
      for (const message of messages.value.filter((m) => m.role === 'assistant')) {
        // Skip if we've already processed this message content
        const messageId = `${message.role}-${message.content}`
        if (extractedContentMap.value.has(messageId)) continue

        try {
          const value = await props.extractionFn(message.content)
          if (value) {
            extractedContentMap.value.set(
              messageId,
              typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            )
          }
        } catch (error) {
          console.error('Error extracting content:', error)
        }
      }
    }

    // Get extracted content for a specific message
    const getExtractedContent = (message: LLMMessage) => {
      const messageId = `${message.role}-${message.content}`
      return extractedContentMap.value.get(messageId) || null
    }

    const containsExtractedContent = (message: LLMMessage) => {
      const extracted = getExtractedContent(message)
      return extracted !== null && message.content.includes(extracted)
    }

    const formatMessageWithPlaceholder = (message: LLMMessage) => {
      return replaceTripleQuotedText(message.content, '<query>')
    }

    // Scroll to bottom when messages are updated
    watch(messages, () => {
      scrollToBottom()
      updateExtractedContent()
    })

    // Helper to scroll to bottom of chat
    const scrollToBottom = () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
        }
      })
    }

    // Activate the chat by focusing on the input and initializing if needed
    const activateChat = () => {
      nextTick(() => {
        // Focus on the input textarea
        if (inputTextarea.value) {
          inputTextarea.value.focus()
        }

        // Scroll to bottom to show the latest messages
        scrollToBottom()

        // If no messages yet and autoActivate is true, you could send an initial greeting
        if (props.autoActivate && messages.value.length === 0) {
          // Optional: Add an initial assistant message
          messages.value.push({
            role: 'assistant',
            content: 'How would you like to refine this response?',
          })
        }
      })
    }

    // Ensure the initial message is visible and activate the chat
    onMounted(() => {
      scrollToBottom()
      activateChat()
      updateExtractedContent()
    })

    // Handle key press events
    const handleKeyDown = (event: KeyboardEvent) => {
      // Enter without modifiers - send message
      if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        sendMessage()
        activateChat()
      }
      // Ctrl+Shift+Enter - accept result
      else if (event.key === 'Enter' && event.ctrlKey && event.shiftKey) {
        event.preventDefault()
        acceptResult()
      }
    }

    // Handle sending a new message
    const sendMessage = async () => {
      if (!userInput.value.trim() || isLoading.value) return

      // Add user message
      messages.value.push({
        role: 'user',
        content: userInput.value,
      })

      const userPrompt = userInput.value
      userInput.value = '' // Clear input
      isLoading.value = true
      scrollToBottom()
      try {
        await llmStore.generateValidatedCompletion(
          userPrompt,
          props.validateFn,
          3,
          llmStore.activeConnection,
          messages.value,
          false, // don't add user message again
        )
      } catch (error) {
        // Handle errors
        messages.value.push({
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        })
      } finally {
        scrollToBottom()
        isLoading.value = false
        activateChat()
        updateExtractedContent()
      }
    }

    const acceptResult = async () => {
      if (isLoading.value) return
      const latestResponse = messages.value.filter((m) => m.role === 'assistant').pop()?.content

      const value = await props.extractionFn(latestResponse)
      await props.mutationFn(value)
      emit('accepted')
      await props.closeFn()
    }

    // Close without saving
    const handleClose = async () => {
      await props.closeFn(null, false)
    }

    return {
      messages,
      userInput,
      isLoading,
      messagesContainer,
      inputTextarea,
      getExtractedContent,
      containsExtractedContent,
      formatMessageWithPlaceholder,
      handleKeyDown,
      sendMessage,
      acceptResult,
      handleClose,
      activateChat,
    }
  },
})
</script>

<style scoped>
.chat-refinement-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  border: 1px solid var(--border-light);
  background-color: var(--bg-color);
  overflow: hidden;
  color: var(--text-color);
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-light);
}

.chat-header h3 {
  margin: 0;
  font-size: var(--big-font-size);
  font-weight: 600;
  color: var(--text-color);
}

.close-button {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0 5px;
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
  /* border-radius: 6px; */
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

.message-content pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: var(--font-size);
}

.loading-indicator {
  align-self: center;
  padding: 8px 12px;
  background-color: var(--bg-loading);
  border-radius: 12px;
  font-size: var(--small-font-size);
  color: var(--text-faint);
}

.input-container {
  display: flex;
  padding: 10px;
  border-top: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
}

.input-container textarea {
  flex-grow: 1;
  min-height: 60px;
  padding: 8px;
  border: 1px solid var(--border);
  resize: vertical;
  font-family: inherit;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
}

.input-container button {
  margin-left: 10px;
  padding: 0 15px;
  background-color: var(--button-bg);
  border: none;
  color: var(--text-color);
  cursor: pointer;
  align-self: flex-end;
  height: 32px;
}

.input-container button:hover:not(:disabled) {
  background-color: var(--button-mouseover);
}

.input-container button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  padding: 10px;
  gap: 10px;
  background-color: var(--sidebar-bg);
  border-top: 1px solid var(--border-light);
}

.accept-button {
  padding: 8px 16px;
  background-color: transparent;
  border: none;
  border: 1px solid #4caf50;
  cursor: pointer;
  font-size: var(--button-font-size);
}

.accept-button:hover:not(:disabled) {
  background-color: #3d8b40;
  color: white;
}

.discard-button {
  padding: 8px 16px;
  background-color: transparent;
  border: 1px solid var(--delete-color);
  cursor: pointer;
  font-size: var(--button-font-size);
}

.discard-button:hover:not(:disabled) {
  background-color: #d32f2f;
  color: white;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* New styles for extracted content display */
.extracted-content {
  margin-top: 10px;
  border-top: 1px dashed var(--border);
  padding-top: 8px;
}

.extracted-label {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  margin-bottom: 4px;
}

.code-block {
  background-color: var(--query-window-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  overflow-x: auto;
  font-family: monospace;
  font-size: var(--font-size);
}

.query-placeholder {
  background-color: rgba(255, 255, 0, 0.2);
  padding: 2px 4px;
  border-radius: 3px;
  font-weight: bold;
  color: var(--text-highlight);
}

@media screen and (max-width: 768px) {
  .input-container textarea {
    font-size: var(--font-size);
  }

  .input-container button,
  .action-buttons button {
    font-size: var(--button-font-size);
  }
}
</style>
