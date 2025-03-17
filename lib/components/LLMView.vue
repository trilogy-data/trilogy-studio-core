<template>
  <div class="debug-container">
    <!-- Left side: LLM Chat -->
    <div class="llm-chat-container">
      <div class="section-header">
        LLM Validation
        <span class="text-faint text-small"
          >Test that your LLM connection will deliver acceptable experience.</span
        >
      </div>
      <div class="connection-controls">
        <div class="provider-selector">
          <label for="provider-select">Provider:</label>
          <select id="provider-select" v-model="selectedProvider">
            <option v-for="provider in availableProviders" :key="provider" :value="provider">
              {{ provider }}
              <span v-if="getConnectionStatus(provider)">
                ({{ getConnectionStatus(provider) }})
              </span>
            </option>
          </select>
          <span class="status-indicator" :class="getConnectionStatus(selectedProvider)"></span>
        </div>
      </div>
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      <div class="chat-messages" ref="messagesContainer">
        <div v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
          <div class="message-header">
            <strong>{{ message.role === 'user' ? 'You' : 'AI' }}</strong>
            <span v-if="message.role === 'assistant' && message.modelInfo" class="model-info">
              {{ message.modelInfo.totalTokens }} tokens
            </span>
          </div>
          <div class="message-content">
            <pre>{{ message.content }}</pre>
          </div>
          <div
            v-if="message.testResult"
            :class="['test-result', message.testResult.passed ? 'passed' : 'failed']"
          >
            Test: {{ message.testResult.passed ? 'PASSED ✓' : 'FAILED ✗' }}
            <div v-if="!message.testResult.passed" class="failure-reason">
              {{ message.testResult.reason }}
            </div>
          </div>
        </div>
      </div>

      <div class="input-container">
        <textarea
          v-model="userInput"
          @keydown.enter.ctrl="sendPrompt"
          placeholder="Type your message here... (Ctrl+Enter to send)"
          :disabled="isLoading || !isProviderSelected"
        >
        </textarea>
        <button
          @click="sendPrompt"
          :disabled="isLoading || !userInput.trim() || !isProviderSelected"
        >
          {{ isLoading ? 'Sending...' : 'Send' }}
        </button>
      </div>
    </div>

    <!-- Right side: Scenarios -->
    <div class="scenarios-container">
      <div class="section-header">
        Test Scenarios
        <div class="header-controls">
          <button 
            @click="runAllScenarios" 
            :disabled="isLoading || !isProviderSelected"
            class="run-all-button"
          >
            {{ isRunningAll ? 'Running...' : 'Run All Tests' }}
          </button>
          <span
            class="pass-indicator text-small"
            v-if="
              Object.values(scenarioResults).length == scenarios.length &&
              Object.values(scenarioResults).every((v) => v?.passed)
            "
            >✓ All passed, LLM integration should meet expectations!</span
          >
        </div>
      </div>

      <div class="scenarios-list">
        <div
          v-for="(scenario, index) in scenarios"
          :key="index"
          :class="['scenario-item', { passed: scenarioResults[index]?.passed }]"
          @click="runScenario(index)"
        >
          <div class="scenario-name">{{ scenario.name }}</div>
          <div class="scenario-description">{{ scenario.description }}</div>
          <div v-if="scenarioResults[index]" class="scenario-result-indicator">
            <span v-if="scenarioResults[index].passed" class="pass-indicator">✓</span>
            <span v-else class="fail-indicator">✗</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, nextTick, watch, inject } from 'vue'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from '../llm'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import testCases from '../llm/data/testCases'
import type { TestScenario } from '../llm/data/testCases'
// import AxiosResolver from '../stores/resolver'

interface TestResult {
  passed: boolean
  reason?: string
}

interface MessageWithTest extends LLMMessage {
  testResult?: TestResult
}

export default defineComponent({
  name: 'LLMChatDebugComponent',

  props: {
    initialProvider: {
      type: String,
      default: '',
    },
    initialModel: {
      type: String,
      default: '',
    },
  },

  setup(_) {
    // Inject the store
    const llmConnectionStore = inject('llmConnectionStore') as LLMConnectionStoreType
    // TODO: validate query syntax on resolver
    // const trilogyResolver = inject<AxiosResolver>('trilogyResolver')

    // Chat state
    const messages = ref<MessageWithTest[]>([])
    const userInput = ref('')
    const isLoading = ref(false)
    const isRunningAll = ref(false)
    const error = ref('')
    const messagesContainer = ref<HTMLElement | null>(null)
    const scenarioResults = ref<(TestResult | null)[]>([])

    // Connection state
    const selectedProvider = ref(
      Object.keys(llmConnectionStore.connections).length > 0
        ? Object.keys(llmConnectionStore.connections)[0]
        : '',
    )

    // Sample test scenarios - would normally be imported
    const scenarios = ref<TestScenario[]>(testCases)

    // Computed properties
    const availableProviders = computed(() => {
      return Object.keys(llmConnectionStore.connections)
    })

    const isProviderSelected = computed(() => {
      return (
        !!selectedProvider.value &&
        llmConnectionStore.getConnection(selectedProvider.value) !== null
      )
    })

    // Scroll to bottom when messages are updated
    watch(messages, () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
        }
      })
    })

    // Get the connection status for display
    const getConnectionStatus = (providerName: string) => {
      if (!providerName) return 'disconnected'
      return llmConnectionStore.getConnectionStatus(providerName)
    }

    // Evaluate if the AI response meets the test criteria
    const evaluateResponse = (
      response: string,
      criteria: TestScenario['expectedResponse'],
    ): TestResult => {
      const result: TestResult = { passed: true }

      // Check for required phrases
      if (criteria.contains) {
        for (const phrase of criteria.contains) {
          if (!response.toLowerCase().includes(phrase.toLowerCase())) {
            result.passed = false
            result.reason = `Response missing expected phrase: "${phrase}"`
            return result
          }
        }
      }

      // Check for forbidden phrases
      if (criteria.notContains) {
        for (const phrase of criteria.notContains) {
          const lines = response.split('\n') // Split response into lines
          for (const line of lines) {
            if (!line.trim().startsWith('#') && line.toLowerCase().includes(phrase.toLowerCase())) {
              result.passed = false
              result.reason = `Response contains forbidden phrase: "${phrase}"`
              return result
            }
          }
        }
      }
      // Check for required issue identification
      if (criteria.mustIdentify) {
        const lowerResponse = response.toLowerCase()
        const mustIdentify = criteria.mustIdentify.toLowerCase()

        if (!lowerResponse.includes(mustIdentify)) {
          // Check for synonyms or related phrases
          const identified = checkForIssueSynonyms(lowerResponse, mustIdentify)

          if (!identified) {
            result.passed = false
            result.reason = `Response did not identify the issue: "${criteria.mustIdentify}"`
            return result
          }
        }
      }

      return result
    }

    // Helper function to check for synonyms or related phrases
    const checkForIssueSynonyms = (response: string, issue: string): boolean => {
      // Simple implementation - in a real scenario this would be more sophisticated
      const synonymMap: Record<string, string[]> = {
        'missing index': [
          'no index',
          'should create index',
          'index would improve',
          'needs an index',
        ],
        'n+1 query problem': [
          'multiple queries',
          'separate queries',
          'query for each',
          'batch fetch',
        ],
        'function in where clause': [
          'non-sargable',
          "can't use index",
          'prevents index',
          'function on column',
        ],
      }

      if (issue in synonymMap) {
        return synonymMap[issue].some((synonym) => response.includes(synonym))
      }

      return false
    }

    const sendPrompt = async () => {
      if (!userInput.value.trim() || isLoading.value || !selectedProvider.value) return

      // Add user message
      messages.value.push({
        role: 'user',
        content: userInput.value,
      })

      const prompt = userInput.value
      userInput.value = '' // Clear input field
      isLoading.value = true
      error.value = ''

      try {
        const options: LLMRequestOptions = {
          prompt,
        }

        const response: LLMResponse = await llmConnectionStore.generateCompletion(
          selectedProvider.value,
          options,
        )
        

        // Add AI response
        messages.value.push({
          role: 'assistant',
          content: response.text,
          modelInfo: {
            totalTokens: response.usage.totalTokens,
          },
        })
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'An unknown error occurred'
      } finally {
        isLoading.value = false
      }
    }

    const runScenario = async (index: number) => {
      if (isLoading.value || !selectedProvider.value) return

      const scenario = scenarios.value[index]

      // Clear existing messages
      messages.value = []

      // Add test description message
      messages.value.push({
        role: 'user',
        content: `RUNNING TEST: ${scenario.name}\n\n${scenario.prompt}`,
      })

      isLoading.value = true
      error.value = ''

      try {
        const options: LLMRequestOptions = {
          prompt: scenario.prompt,
        }

        const response: LLMResponse = await llmConnectionStore.generateCompletion(
          selectedProvider.value,
          options,
        )

        // Evaluate the response
        const testResult = evaluateResponse(response.text, scenario.expectedResponse)

        // Update scenario results
        scenarioResults.value[index] = testResult

        // Add AI response with test results
        messages.value.push({
          role: 'assistant',
          content: response.text,
          modelInfo: {
            totalTokens: response.usage.totalTokens,
          },
          testResult: testResult,
        })
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'An unknown error occurred'

        // Update scenario result for failure
        scenarioResults.value[index] = {
          passed: false,
          reason: `Error: ${error.value}`,
        }
      } finally {
        isLoading.value = false
      }
    }

    // Run all scenarios in sequence
    const runAllScenarios = async () => {
      if (isLoading.value || !selectedProvider.value) return
      
      isRunningAll.value = true
      
      // Clear existing messages
      messages.value = []
      
      // Add start message
      messages.value.push({
        role: 'user',
        content: 'RUNNING ALL TESTS IN SEQUENCE',
      })
      
      try {
        // Run each scenario in sequence
        for (let i = 0; i < scenarios.value.length; i++) {
          await runScenario(i)
          
          // Small delay between tests to avoid overwhelming the LLM service
          if (i < scenarios.value.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
        
        // Add summary message after all tests complete
        const passedCount = Object.values(scenarioResults.value).filter(r => r?.passed).length
        const failedCount = Object.values(scenarioResults.value).filter(r => r && !r.passed).length
        
        messages.value.push({
          role: 'user',
          content: `ALL TESTS COMPLETED: ${passedCount} passed, ${failedCount} failed`,
        })
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'An unknown error occurred'
      } finally {
        isRunningAll.value = false
      }
    }

    // Initialize providers list on mount if none are available
    onMounted(() => {
      if (availableProviders.value.length === 0) {
        error.value = 'No LLM providers available. Please configure providers in settings.'
      }
    })

    return {
      messages,
      userInput,
      isLoading,
      isRunningAll,
      error,
      selectedProvider,
      availableProviders,
      isProviderSelected,
      messagesContainer,
      getConnectionStatus,
      sendPrompt,
      scenarios,
      runScenario,
      scenarioResults,
      runAllScenarios,
    }
  },
})
</script>
<style scoped>
pre {
  white-space: pre-wrap;
  /* Preserves whitespace and wraps lines */
  word-wrap: break-word;
  /* Ensures long words break properly */
}

.debug-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.section-header {
  font-size: 1.2em;
  font-weight: bold;
  padding: 10px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
}

.text-small {
  font-size: 0.8em;
  font-weight: 500;
}

.llm-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 60%;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.scenarios-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 40%;
  border-right: 1px solid var(--border-color);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}

.scenarios-list {
  overflow-y: auto;
  height: 100%;
}

.scenario-item {
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s;
}

.scenario-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.scenario-item.passed {
  background-color: rgba(76, 175, 80, 0.1);
}

.scenario-name {
  font-weight: bold;
  margin-bottom: 5px;
}

.scenario-description {
  font-size: 0.9em;
  color: var(--text-muted);
}

.scenario-result-indicator {
  position: absolute;
  top: 15px;
  right: 15px;
  font-size: 1.2em;
}

.pass-indicator {
  color: #4caf50;
}

.fail-indicator {
  color: #f44336;
}

.connection-controls {
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
  gap: 15px;
}

.provider-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-selector label {
  font-weight: bold;
}

.provider-selector select {
  padding: 5px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.status-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-left: 5px;
}

.status-indicator.connected {
  background-color: #4caf50;
}

.status-indicator.connecting {
  background-color: #ffc107;
}

.status-indicator.disconnected {
  background-color: #f44336;
}

.chat-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  background-color: var(--editor-bg);
}

.message {
  padding: 10px 15px;
  border-radius: 8px;
  max-width: 80%;
  word-break: break-word;
}

.message.user {
  align-self: flex-end;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
}

.message.assistant {
  align-self: flex-start;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
}

.message-header {
  margin-bottom: 5px;
  font-size: 0.9em;
  display: flex;
  justify-content: space-between;
}

.model-info {
  font-size: 0.8em;
}

.message-content {
  margin-bottom: 8px;
}

.test-result {
  margin-top: 8px;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.9em;
  font-weight: bold;
}

.test-result.passed {
  background-color: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
}

.test-result.failed {
  background-color: rgba(244, 67, 54, 0.1);
  color: #c62828;
}

.failure-reason {
  font-weight: normal;
  font-size: 0.9em;
  margin-top: 5px;
}

.input-container {
  display: flex;
  padding: 10px;
  border-top: 1px solid var(--border-color);
  background-color: var(--editor-bg);
}

.input-container textarea {
  flex-grow: 1;
  min-height: 60px;
  padding: 8px;
  border: 1px solid var(--border-color);
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
  color: var(--button-bg-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.input-container button:hover:not(:disabled) {
  background-color: #0d8aee;
}

.input-container button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error-message {
  color: #f44336;
  padding: 10px;
  text-align: center;
  background-color: #ffebee;
  border-top: 1px solid #ffcdd2;
}
</style>
