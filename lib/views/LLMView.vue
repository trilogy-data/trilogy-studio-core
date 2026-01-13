<template>
  <div class="llm-view-container">
    <!-- View Tabs -->
    <div class="view-tabs">
      <button
        class="view-tab"
        :class="{ active: activeView === 'chat' }"
        @click="activeView = 'chat'"
      >
        Chat
      </button>
      <button
        class="view-tab"
        :class="{ active: activeView === 'validation' }"
        @click="activeView = 'validation'"
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
        :onSendMessage="handleChatMessageWithTools"
        @update:messages="handleMessagesUpdate"
        @update:artifacts="handleArtifactsUpdate"
        @update:activeArtifactIndex="handleActiveArtifactUpdate"
        @import-change="handleImportChange"
        @title-update="handleTitleUpdate"
      />
    </div>

    <!-- Validation View (existing content) -->
    <div v-else class="debug-container">
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
            <div v-if="testRunDetails[index]" class="test-run-details">
              {{ testRunDetails[index].passed }}/5 runs passed
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  computed,
  onMounted,
  nextTick,
  watch,
  inject,
  type PropType,
} from 'vue'
import type { LLMRequestOptions, LLMResponse, LLMMessage } from '../llm'
import type { LLMConnectionStoreType } from '../stores/llmStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import type { ChatStoreType } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { NavigationStore } from '../stores/useScreenNavigation'
import { KeySeparator } from '../data/constants'
import testCases from '../llm/data/testCases'
import type { TestScenario } from '../llm/data/testCases'
import { extractLastTripleQuotedText } from '../stores/llmStore'
import LLMChatSplitView from '../components/llm/LLMChatSplitView.vue'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'
import { ChatToolExecutor } from '../llm/chatToolExecutor'
import {
  buildChatAgentSystemPrompt,
  parseToolCalls,
  CHAT_TOOLS,
} from '../llm/chatAgentPrompt'
import type { ModelConceptInput } from '../llm/data/models'
import type { ContentInput, CompletionItem } from '../stores/resolver'

export interface TestResult {
  passed: boolean
  reason?: string
}

export interface TestRunDetail {
  passed: number
  total: number
  runs: TestResult[]
}

export interface MessageWithTest extends LLMMessage {
  testResult?: TestResult
}

export default defineComponent({
  name: 'LLMChatDebugComponent',
  components: {
    LLMChatSplitView,
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

    // Chat state
    const isChatLoading = ref(false)
    const activeChatMessages = ref<ChatMessage[]>([])
    const activeChatArtifacts = ref<ChatArtifact[]>([])
    const activeChatArtifactIndex = ref(-1)

    // Create tool executor if dependencies are available
    const toolExecutor = computed(() => {
      if (connectionStore && queryExecutionService) {
        return new ChatToolExecutor(
          queryExecutionService,
          connectionStore,
          chatStore || undefined,
          editorStore || undefined,
        )
      }
      return null
    })

    // Computed properties for chat
    const activeChatTitle = computed(() => {
      if (chatStore?.activeChat) {
        return chatStore.activeChat.name
      }
      return 'LLM Chat'
    })

    const chatConnectionInfo = computed(() => {
      const parts: string[] = []
      if (llmConnectionStore.activeConnection) {
        const conn = llmConnectionStore.getConnection(llmConnectionStore.activeConnection)
        if (conn) {
          parts.push(`${conn.name} (${conn.model})`)
        }
      }
      if (chatStore?.activeChat?.dataConnectionName) {
        parts.push(`Data: ${chatStore.activeChat.dataConnectionName}`)
      }
      return parts.join(' | ')
    })

    // Available imports for current data connection
    const availableImportsForChat = computed((): ChatImport[] => {
      const connectionName = chatStore?.activeChat?.dataConnectionName
      if (!connectionName || !editorStore) return []

      return Object.values(editorStore.editors)
        .filter((editor) => editor.connection === connectionName)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((editor) => ({
          id: editor.id,
          name: editor.name.replace(/\//g, '.'),
          alias: '',
        }))
    })

    // Currently active imports for chat
    const activeImportsForChat = computed((): ChatImport[] => {
      return chatStore?.activeChat?.imports || []
    })

    // Concepts fetched from active imports
    const chatConcepts = ref<ModelConceptInput[]>([])
    // Raw completion items for the symbols pane
    const chatSymbols = ref<CompletionItem[]>([])

    // Function to fetch concepts/symbols from imports - can be called externally
    const refreshChatSymbols = async (): Promise<CompletionItem[]> => {
      const imports = chatStore?.activeChat?.imports
      const connectionName = chatStore?.activeChat?.dataConnectionName

      if (!connectionName) {
        chatConcepts.value = []
        chatSymbols.value = []
        return []
      }

      // Start with model sources from the connection (root imports)
      const modelSources = connectionStore?.getConnectionSources(connectionName) || []
      console.log('Chat symbols refresh - model sources:', modelSources.length, modelSources.map((s) => s.alias))

      // Add extra content from chat imports
      const importContent: ContentInput[] = (imports || []).map((imp) => ({
        alias: imp.alias || imp.name,
        contents: editorStore?.editors[imp.id]?.contents || '',
      }))
      console.log('Chat symbols refresh - import content:', importContent.length, importContent.map((s) => s.alias))

      // Combine model sources with import content
      const extraContent: ContentInput[] = [...modelSources, ...importContent]

      // If no sources at all, return empty
      if (extraContent.length === 0) {
        console.log('Chat symbols refresh - no sources, returning empty')
        chatConcepts.value = []
        chatSymbols.value = []
        return []
      }

      try {
        // Build imports array from chat imports to actually import the concepts
        // The Import type expects { name: string, alias: string }
        const importsForValidation = (imports || []).map((imp) => ({
          name: imp.name,
          alias: imp.alias || '',
        }))

        // Use validation to get parsed concepts
        const queryInput = {
          text: 'SELECT 1', // Minimal query just to parse sources
          editorType: 'trilogy' as const,
          imports: importsForValidation,
          extraContent,
        }

        const validation = await queryExecutionService?.validateQuery(
          connectionName,
          queryInput,
          false, // Don't log
        )

        if (validation?.data?.completion_items) {
          // Debug: log what we're getting
          console.log(
            'Chat symbols refresh - completion_items count:',
            validation.data.completion_items.length,
          )
          console.log(
            'Chat symbols refresh - trilogyTypes:',
            [...new Set(validation.data.completion_items.map((i) => i.trilogyType))],
          )

          // Store raw completion items for the symbols pane
          chatSymbols.value = validation.data.completion_items.filter(
            (item) => item.trilogyType === 'concept',
          )

          console.log('Chat symbols refresh - filtered concepts count:', chatSymbols.value.length)

          // Map CompletionItem to ModelConceptInput for the system prompt
          chatConcepts.value = chatSymbols.value.map((item) => ({
            name: item.label,
            type: item.datatype || item.type,
            description: item.description || undefined,
            calculation: item.calculation || undefined,
            keys: item.keys || undefined,
          }))

          return chatSymbols.value
        }
      } catch (error) {
        console.error('Failed to fetch concepts from imports:', error)
        chatConcepts.value = []
        chatSymbols.value = []
      }
      return []
    }

    // Watch for import changes and fetch concepts
    watch(
      () => chatStore?.activeChat?.imports,
      async () => {
        await refreshChatSymbols()
      },
      { deep: true, immediate: true },
    )

    // Also watch for active chat changes to refresh symbols with model sources
    watch(
      () => chatStore?.activeChat?.dataConnectionName,
      async () => {
        await refreshChatSymbols()
      },
      { immediate: true },
    )

    const chatSystemPrompt = computed(() => {
      const dataConnectionName = chatStore?.activeChat?.dataConnectionName || null
      const availableConnections = connectionStore
        ? Object.keys(connectionStore.connections)
        : []

      // Check if the data connection is currently active/connected
      const isDataConnectionActive = dataConnectionName && connectionStore
        ? connectionStore.connections[dataConnectionName]?.connected ?? false
        : false

      return buildChatAgentSystemPrompt({
        dataConnectionName,
        availableConnections,
        availableConcepts: chatConcepts.value,
        activeImports: activeImportsForChat.value,
        availableImportsForConnection: availableImportsForChat.value,
        isDataConnectionActive,
      })
    })

    // Handle import changes from UI
    const handleImportChange = (newImports: ChatImport[]) => {
      if (chatStore?.activeChatId) {
        chatStore.setImports(chatStore.activeChatId, newImports)
      }
    }

    // Watch for changes to initialTab prop
    watch(
      () => props.initialTab,
      (newTab) => {
        if (newTab === 'chat' || newTab === 'validation') {
          activeView.value = newTab
        }
      },
    )

    // Watch for active chat changes
    watch(
      () => chatStore?.activeChat,
      (chat) => {
        if (chat) {
          activeChatMessages.value = [...chat.messages]
          activeChatArtifacts.value = [...chat.artifacts]
          activeChatArtifactIndex.value = chat.activeArtifactIndex
        } else {
          activeChatMessages.value = []
          activeChatArtifacts.value = []
          activeChatArtifactIndex.value = -1
        }
      },
      { immediate: true },
    )

    // Auto-connect the LLM connection when opening chat view if it's idle
    const autoConnectIfNeeded = async () => {
      const activeConn = llmConnectionStore.activeConnection
      if (activeConn) {
        const status = llmConnectionStore.getConnectionStatus(activeConn)
        if (status === 'disabled') {
          try {
            await llmConnectionStore.resetConnection(activeConn)
          } catch (err) {
            console.error('Failed to auto-connect LLM:', err)
          }
        }
      }
    }

    // Watch for chat view becoming active
    watch(
      () => activeView.value,
      (newView) => {
        if (newView === 'chat') {
          autoConnectIfNeeded()
        }
      },
      { immediate: true },
    )

    // Chat state
    const messages = ref<MessageWithTest[]>([])
    const userInput = ref('')
    const isLoading = ref(false)
    const isRunningAll = ref(false)
    const error = ref('')
    const messagesContainer = ref<HTMLElement | null>(null)
    const scenarioResults = ref<(TestResult | null)[]>([])
    const testRunDetails = ref<(TestRunDetail | null)[]>([])

    // Constants
    const TEST_ITERATIONS = 5
    const REQUIRED_PASSES = 4

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
      rawResponse: string,
      criteria: TestScenario['expectedResponse'],
    ): TestResult => {
      const result: TestResult = { passed: true }

      let response = extractLastTripleQuotedText(rawResponse)

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

    // Run a single test iteration (for a specific scenario)
    const runTestIteration = async (scenarioIndex: number): Promise<TestResult> => {
      const scenario = scenarios.value[scenarioIndex]

      try {
        const options: LLMRequestOptions = {
          prompt: scenario.prompt,
        }

        const response: LLMResponse = await llmConnectionStore.generateCompletion(
          selectedProvider.value,
          options,
        )

        // Evaluate the response
        return evaluateResponse(response.text, scenario.expectedResponse)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
        return {
          passed: false,
          reason: `Error: ${errorMessage}`,
        }
      }
    }

    // Run a scenario multiple times and aggregate results
    const runScenario = async (index: number) => {
      if (isLoading.value || !selectedProvider.value) return

      const scenario = scenarios.value[index]

      // Clear existing messages
      messages.value = []

      // Add test description message
      messages.value.push({
        role: 'user',
        content: `RUNNING TEST: ${scenario.name} (${TEST_ITERATIONS} iterations)`,
      })

      isLoading.value = true
      error.value = ''

      try {
        // Initialize test run details
        const runDetails: TestRunDetail = {
          passed: 0,
          total: TEST_ITERATIONS,
          runs: [],
        }

        // Update messages to show we're starting the tests
        messages.value.push({
          role: 'assistant',
          content: `Running ${TEST_ITERATIONS} iterations of test "${scenario.name}"...`,
        })

        // Run the test multiple times
        for (let i = 0; i < TEST_ITERATIONS; i++) {
          // Add progress indicator
          if (i > 0) {
            messages.value[messages.value.length - 1].content +=
              `\nRunning iteration ${i + 1}/${TEST_ITERATIONS}...`
          }

          // Run the test iteration
          const iterationResult = await runTestIteration(index)

          // Track results
          runDetails.runs.push(iterationResult)
          if (iterationResult.passed) {
            runDetails.passed++
          }
        }

        // Consider the test passed overall if at least REQUIRED_PASSES runs passed
        const overallResult: TestResult = {
          passed: runDetails.passed >= REQUIRED_PASSES,
          reason:
            runDetails.passed >= REQUIRED_PASSES
              ? undefined
              : `Only ${runDetails.passed}/${TEST_ITERATIONS} runs passed (need at least ${REQUIRED_PASSES})`,
        }

        // Update scenario results
        scenarioResults.value[index] = overallResult
        testRunDetails.value[index] = runDetails

        // Update the last message with final results
        messages.value[messages.value.length - 1].content =
          `Test "${scenario.name}" completed: ${runDetails.passed}/${TEST_ITERATIONS} runs passed.\n\n` +
          `${overallResult.passed ? '✓ OVERALL PASSED' : '✗ OVERALL FAILED'}\n\n` +
          `Iteration Results:\n` +
          runDetails.runs
            .map(
              (result, idx) =>
                `Iteration ${idx + 1}: ${result.passed ? '✓ PASSED' : '✗ FAILED'}${result.reason ? ' - ' + result.reason : ''}`,
            )
            .join('\n')

        // Add test result to the last message
        messages.value[messages.value.length - 1].testResult = overallResult
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
        content: 'RUNNING ALL TESTS IN SEQUENCE (5 iterations each)',
      })

      try {
        // Run each scenario in sequence
        for (let i = 0; i < scenarios.value.length; i++) {
          await runScenario(i)

          // Small delay between tests to avoid overwhelming the LLM service
          if (i < scenarios.value.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }

        // Add summary message after all tests complete
        const passedCount = Object.values(scenarioResults.value).filter((r) => r?.passed).length
        const failedCount = Object.values(scenarioResults.value).filter(
          (r) => r && !r.passed,
        ).length

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
        error.value = 'No LLM connections found. Please add connections in the sidebar.'
      }
    })

    // Handle chat messages with tool execution loop
    const handleChatMessageWithTools = async (
      message: string,
      chatMessages: ChatMessage[],
    ): Promise<{ response?: string; artifacts?: ChatArtifact[] } | void> => {
      const MAX_TOOL_ITERATIONS = 50 // Safety limit - agent decides when to stop

      if (!llmConnectionStore.activeConnection) {
        return {
          response: 'No LLM connection available. Please configure an LLM provider first.',
        }
      }

      isChatLoading.value = true

      try {
        const allArtifacts: ChatArtifact[] = []
        let currentMessages = [...chatMessages]
        let currentPrompt = message
        let finalResponseText = ''

        // Tool use loop - keep going until LLM stops calling tools or we hit max iterations
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const options: LLMRequestOptions = {
            prompt: currentPrompt,
            systemPrompt: chatSystemPrompt.value,
            tools: CHAT_TOOLS,
          }

          // Generate completion from LLM
          const response: LLMResponse = await llmConnectionStore.generateCompletion(
            llmConnectionStore.activeConnection,
            options,
            currentMessages,
          )

          const responseText = response.text
          const toolCalls = parseToolCalls(responseText)

          // If no tool calls, we're done - return the final response
          if (toolCalls.length === 0 || !toolExecutor.value) {
            finalResponseText = responseText
            break
          }

          // Execute tool calls and build tool results
          const toolResults: string[] = []

          for (const toolCall of toolCalls) {
            const result = await toolExecutor.value.executeToolCall(toolCall.name, toolCall.input)

            if (result.success) {
              // Check if this tool triggers a symbol refresh (e.g., add_import, remove_import)
              let symbolInfo = ''
              if (result.triggersSymbolRefresh) {
                const updatedSymbols = await refreshChatSymbols()
                if (updatedSymbols.length > 0) {
                  // Include updated symbol names in the result for the agent
                  const symbolNames = updatedSymbols
                    .slice(0, 50) // Limit to first 50 symbols
                    .map((s) => s.label)
                    .join(', ')
                  symbolInfo = `\n\nUpdated available fields (${updatedSymbols.length} total): ${symbolNames}${updatedSymbols.length > 50 ? '...' : ''}`
                } else {
                  symbolInfo = '\n\nNo fields available after import change.'
                }
              }

              if (result.artifact) {
                allArtifacts.push(result.artifact)
                // Format result for LLM - include actual data so agent can analyze it
                const config = result.artifact.config
                const artifactData = result.artifact.data
                let dataPreview = ''
                if (artifactData) {
                  // Convert Results to JSON for the agent
                  const jsonData = typeof artifactData.toJSON === 'function'
                    ? artifactData.toJSON()
                    : artifactData
                  // Limit data rows to avoid token overflow
                  const limitedData = {
                    ...jsonData,
                    data: jsonData.data?.slice(0, 100) // Limit to first 100 rows
                  }
                  dataPreview = `\n\nQuery results (${config?.resultSize || 0} rows, showing up to 100):\n${JSON.stringify(limitedData, null, 2)}`
                }
                const artifactInfo = config
                  ? `Results: ${config.resultSize || 0} rows, ${config.columnCount || 0} columns.`
                  : ''
                toolResults.push(
                  `<tool_result name="${toolCall.name}">\nSuccess. ${result.message || artifactInfo}${dataPreview}${symbolInfo}\n</tool_result>`,
                )
              } else if (result.message) {
                toolResults.push(
                  `<tool_result name="${toolCall.name}">\n${result.message}${symbolInfo}\n</tool_result>`,
                )
              }
            } else {
              toolResults.push(
                `<tool_result name="${toolCall.name}">\nError: ${result.error}\n</tool_result>`,
              )
            }
          }

          // Add assistant response and tool results to conversation for next iteration
          currentMessages = [
            ...currentMessages,
            { role: 'assistant' as const, content: responseText },
            {
              role: 'user' as const,
              content: toolResults.join('\n\n'),
              hidden: true, // Tool results are hidden in UI
            },
          ]

          // Clear prompt for continuation (context is in messages)
          currentPrompt = 'Continue based on the tool results.'

          // If this is the last iteration, save the response
          if (iteration === MAX_TOOL_ITERATIONS - 1) {
            finalResponseText = responseText + '\n\n(Max tool iterations reached)'
          }
        }

        return {
          response: finalResponseText,
          artifacts: allArtifacts.length > 0 ? allArtifacts : undefined,
        }
      } catch (err) {
        return {
          response: `Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`,
        }
      } finally {
        isChatLoading.value = false
      }
    }

    // Update handlers for chat state synchronization with store
    const handleMessagesUpdate = (newMessages: ChatMessage[]) => {
      activeChatMessages.value = newMessages
      if (chatStore?.activeChatId) {
        // Sync messages to the active chat in the store
        const chat = chatStore.chats[chatStore.activeChatId]
        if (chat) {
          chat.messages = [...newMessages]
          chat.changed = true
        }
      }
    }

    const handleArtifactsUpdate = (newArtifacts: ChatArtifact[]) => {
      activeChatArtifacts.value = newArtifacts
      if (chatStore?.activeChatId) {
        const chat = chatStore.chats[chatStore.activeChatId]
        if (chat) {
          chat.artifacts = [...newArtifacts]
          chat.changed = true
        }
      }
    }

    const handleActiveArtifactUpdate = (index: number) => {
      activeChatArtifactIndex.value = index
      if (chatStore?.activeChatId) {
        chatStore.setActiveArtifact(chatStore.activeChatId, index)
      }
    }

    const handleTitleUpdate = (newTitle: string) => {
      if (chatStore?.activeChatId) {
        chatStore.updateChatName(chatStore.activeChatId, newTitle)
        // Also update the tab name in navigation
        const chat = chatStore.activeChat
        if (chat && navigationStore) {
          const address = `${chat.llmConnectionName}${KeySeparator}${chat.id}`
          navigationStore.updateTabName('llms', newTitle, address)
        }
      }
    }

    return {
      activeView,
      chatSplitView,
      // Chat view props
      activeChatTitle,
      chatConnectionInfo,
      chatSystemPrompt,
      availableImportsForChat,
      activeImportsForChat,
      chatSymbols,
      activeChatMessages,
      activeChatArtifacts,
      activeChatArtifactIndex,
      isChatLoading,
      handleChatMessageWithTools,
      handleMessagesUpdate,
      handleArtifactsUpdate,
      handleActiveArtifactUpdate,
      handleTitleUpdate,
      handleImportChange,
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
      testRunDetails,
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

.debug-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
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

.test-run-details {
  font-size: 0.8em;
  margin-top: 8px;
  color: var(--text-muted);
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
