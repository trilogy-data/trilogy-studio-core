<template>
    <div class="chat-refinement-container">
      <!-- Header with close button -->
      <div class="chat-header">
        <h3>Refine Response</h3>
        <button class="close-button" @click="handleClose">×</button>
      </div>
      
      <!-- Chat messages area -->
      <div class="chat-messages" ref="messagesContainer">
        <!-- Initial response -->
        <div class="message assistant">
          <div class="message-content">
            <pre>{{ initialResponse }}</pre>
          </div>
        </div>
        
        <!-- Conversation messages -->
        <div v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <div class="message-content">
            <pre>{{ message.content }}</pre>
          </div>
        </div>
        
        <!-- Loading indicator -->
        <div v-if="isLoading" class="loading-indicator">
          <span>Generating response...</span>
        </div>
      </div>
      
      <!-- Input area -->
      <div class="input-container">
        <textarea
          v-model="userInput"
          @keydown.enter.ctrl="sendMessage"
          placeholder="Refine your query... (Ctrl+Enter to send)"
          :disabled="isLoading"
        ></textarea>
        <button @click="sendMessage" :disabled="isLoading || !userInput.trim()">
          Send
        </button>
      </div>
      
      <!-- Action buttons -->
      <div class="action-buttons">
        <button 
          class="accept-button" 
          @click="acceptResult" 
          :disabled="isLoading">
          Accept
        </button>
        <button 
          class="discard-button" 
          @click="handleClose" 
          :disabled="isLoading">
          Discard
        </button>
      </div>
    </div>
  </template>
  
  <script>
  import { defineComponent, ref, nextTick, watch, onMounted } from 'vue'
  
  export default defineComponent({
    name: 'LLMChatRefinementComponent',
    
    props: {
      initialResponse: {
        type: String,
        required: true
      },
      validateFn: {
        type: Function,
        default: () => true
      },
      closeFn: {
        type: Function,
        default: () => {}
      }
    },
    
    setup(props) {
      // Chat state
      const messages = ref([])
      const userInput = ref('')
      const isLoading = ref(false)
      const messagesContainer = ref(null)
      
      // Scroll to bottom when messages are updated
      watch(messages, () => {
        scrollToBottom()
      })
      
      // Ensure the initial message is visible
      onMounted(() => {
        scrollToBottom()
      })
      
      // Helper to scroll to bottom of chat
      const scrollToBottom = () => {
        nextTick(() => {
          if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
          }
        })
      }
      
      // Handle sending a new message
      const sendMessage = async () => {
        if (!userInput.value.trim() || isLoading.value) return
        
        // Add user message
        messages.value.push({
          role: 'user',
          content: userInput.value
        })
        
        const userPrompt = userInput.value
        userInput.value = '' // Clear input
        isLoading.value = true
        
        try {
          // This would typically be an API call to your LLM service
          // For this example, we're simulating a response
          await simulateLLMResponse(userPrompt)
        } catch (error) {
          // Handle errors
          messages.value.push({
            role: 'assistant',
            content: 'Sorry, there was an error processing your request.'
          })
        } finally {
          isLoading.value = false
        }
      }
      
      // Simulate an LLM response (replace with actual API call)
      const simulateLLMResponse = async (prompt) => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Simulate a response based on the prompt
        let response
        if (prompt.toLowerCase().includes('explain')) {
          response = 'This SQL query selects data from the users table where the status is active and joins with the orders table to find recent orders.'
        } else if (prompt.toLowerCase().includes('modify')) {
          response = 'Here\'s the modified query:\n\nSELECT u.name, u.email, COUNT(o.id) as order_count\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE u.status = \'active\'\nGROUP BY u.id\nORDER BY order_count DESC\nLIMIT 10'
        } else {
          response = 'I\'ve refined the query based on your feedback. Is there anything specific you\'d like me to explain or modify?'
        }
        
        // Add the response to messages
        messages.value.push({
          role: 'assistant',
          content: response
        })
      }
      
      // Accept the current result
      const acceptResult = () => {
        // Get the latest assistant message or use the initial response if no conversation
        const latestResponse = messages.value.length > 0 
          ? messages.value.filter(m => m.role === 'assistant').pop()?.content 
          : props.initialResponse
        
        // Validate before accepting
        if (props.validateFn(latestResponse)) {
          props.closeFn(latestResponse, true)
        } else {
          // Handle validation failure (could add a message to the chat)
          messages.value.push({
            role: 'assistant',
            content: 'The current query doesn\'t meet the required criteria. Please refine it further.'
          })
        }
      }
      
      // Close without saving
      const handleClose = () => {
        props.closeFn(null, false)
      }
      
      return {
        messages,
        userInput,
        isLoading,
        messagesContainer,
        sendMessage,
        acceptResult,
        handleClose
      }
    }
  })
  </script>
  
  <style scoped>
  .chat-refinement-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    background-color: #f9f9f9;
    overflow: hidden;
  }
  
  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 15px;
    background-color: #f0f0f0;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .chat-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  
  .close-button {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 0 5px;
  }
  
  .chat-messages {
    flex-grow: 1;
    overflow-y: auto;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background-color: #fff;
  }
  
  .message {
    padding: 10px 12px;
    border-radius: 6px;
    max-width: 85%;
    word-break: break-word;
  }
  
  .message.user {
    align-self: flex-end;
    background-color: #e3f2fd;
  }
  
  .message.assistant {
    align-self: flex-start;
    background-color: #f5f5f5;
  }
  
  .message-content pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: inherit;
  }
  
  .loading-indicator {
    align-self: center;
    padding: 8px 12px;
    background-color: #eeeeee;
    border-radius: 12px;
    font-size: 0.9em;
    color: #666;
  }
  
  .input-container {
    display: flex;
    padding: 10px;
    border-top: 1px solid #e0e0e0;
    background-color: #f5f5f5;
  }
  
  .input-container textarea {
    flex-grow: 1;
    min-height: 60px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
    font-family: inherit;
  }
  
  .input-container button {
    margin-left: 10px;
    padding: 0 15px;
    background-color: #2196f3;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    align-self: flex-end;
  }
  
  .input-container button:hover:not(:disabled) {
    background-color: #0d8aee;
  }
  
  .input-container button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
  
  .action-buttons {
    display: flex;
    justify-content: flex-end;
    padding: 10px;
    gap: 10px;
    background-color: #f5f5f5;
    border-top: 1px solid #e0e0e0;
  }
  
  .accept-button {
    padding: 8px 16px;
    background-color: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .accept-button:hover:not(:disabled) {
    background-color: #3d8b40;
  }
  
  .discard-button {
    padding: 8px 16px;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .discard-button:hover:not(:disabled) {
    background-color: #d32f2f;
  }
  
  button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  </style>