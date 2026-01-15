<template>
  <div class="chat-split-container" :class="{ 'is-resizing': isResizing }">
    <!-- Left: Chat Panel -->
    <div class="chat-panel">
      <l-l-m-chat
        ref="chatRef"
        :messages="messages"
        :title="title"
        :editableTitle="editableTitle"
        :showHeader="showHeader"
        :placeholder="placeholder"
        :systemPrompt="systemPrompt"
        :disabled="disabled"
        :externalLoading="isLoading"
        :activeToolName="activeToolName"
        :customSendHandler="handleSendMessage"
        @update:messages="handleMessagesUpdate"
        @message-sent="$emit('message-sent', $event)"
        @response-received="handleResponseReceived"
        @title-update="$emit('title-update', $event)"
      >
        <template #header-prefix>
          <slot name="header-prefix"></slot>
        </template>
        <template #header-actions>
          <slot name="header-actions">
            <div class="chat-header-controls">
              <dashboard-import-selector
                v-if="availableImports.length > 0"
                :available-imports="availableImports"
                :active-imports="activeImports"
                @update:imports="$emit('import-change', $event)"
              />
              <span v-if="connectionInfo" class="connection-info">
                {{ connectionInfo }}
              </span>
            </div>
          </slot>
        </template>
      </l-l-m-chat>
    </div>

    <!-- Resizer -->
    <div
      class="panel-resizer"
      @mousedown="startResize"
    ></div>

    <!-- Right: Sidebar with Symbols/Artifacts tabs -->
    <div class="sidebar-panel" :style="{ width: sidebarWidth + 'px' }">
      <!-- Sidebar tabs -->
      <div class="sidebar-tabs">
        <button
          class="sidebar-tab"
          :class="{ active: sidebarTab === 'symbols' }"
          @click="sidebarTab = 'symbols'"
          data-testid="llm-sidebar-tab-fields"
        >
          Fields
        </button>
        <button
          class="sidebar-tab"
          :class="{ active: sidebarTab === 'artifacts' }"
          @click="sidebarTab = 'artifacts'"
          data-testid="llm-sidebar-tab-artifacts"
        >
          Artifacts
          <span v-if="artifacts.length > 0" class="artifact-count">{{ artifacts.length }}</span>
        </button>
      </div>

      <!-- Symbols Pane -->
      <div v-if="sidebarTab === 'symbols'" class="sidebar-content">
        <SymbolsPane
          :symbols="symbols"
          @select-symbol="handleSymbolSelect"
        />
      </div>

      <!-- Artifacts Pane -->
      <div v-else-if="sidebarTab === 'artifacts'" class="sidebar-content artifacts-content">
        <!-- Artifact List -->
        <div class="artifacts-list" v-if="artifacts.length > 0">
          <div
            v-for="(artifact, index) in artifacts"
            :key="index"
            class="artifact-list-item"
            :class="{ active: activeArtifactIndex === index }"
            @click="setActiveArtifact(index)"
          >
            <i :class="getArtifactIcon(artifact)"></i>
            <div class="artifact-item-content">
              <span class="artifact-label">{{ getArtifactLabel(artifact, index) }}</span>
              <span class="artifact-meta">{{ getArtifactMeta(artifact) }}</span>
            </div>
          </div>
        </div>

        <!-- Expanded Artifact View -->
        <div class="artifact-expanded" v-if="activeArtifact" ref="artifactExpandedRef">
          <div class="artifact-content" :style="{ height: artifactContentHeight + 'px' }">
            <template v-if="activeArtifactResults">
              <results-component
                :type="'trilogy'"
                :results="activeArtifactResults"
                :chartConfig="activeArtifactChartConfig"
                :generatedSql="activeArtifact.config?.generatedSql"
                :containerHeight="artifactContentHeight"
                :defaultTab="activeArtifact.type === 'chart' ? 'visualize' : 'results'"
                @config-change="handleChartConfigChange"
              />
            </template>
            <template v-else-if="activeArtifact.type === 'code'">
              <code-block
                :language="activeArtifact.config?.language || 'sql'"
                :content="activeArtifact.data || ''"
              />
            </template>
            <template v-else>
              <div class="custom-artifact-view">
                <slot name="custom-artifact" :artifact="activeArtifact">
                  <pre>{{ JSON.stringify(activeArtifact.data, null, 2) }}</pre>
                </slot>
              </div>
            </template>
          </div>
        </div>

        <!-- No artifacts state -->
        <div class="no-artifacts" v-else>
          <span>No artifacts yet. Run a query to see results here.</span>
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
  watch,
  onMounted,
  onUnmounted,
  type PropType,
} from 'vue'
import LLMChat from './LLMChat.vue'
import type { ChatMessage, ChatArtifact, ChatImport } from '../../chats/chat'
import ResultsComponent from '../editor/Results.vue'
import CodeBlock from '../CodeBlock.vue'
import DashboardImportSelector from '../dashboard/DashboardImportSelector.vue'
import SymbolsPane from '../SymbolsPane.vue'
import { Results, type ChartConfig } from '../../editors/results'
import type { CompletionItem } from '../../stores/resolver'

export default defineComponent({
  name: 'LLMChatSplitView',
  components: {
    LLMChat,
    ResultsComponent,
    CodeBlock,
    DashboardImportSelector,
    SymbolsPane,
  },
  props: {
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
      type: String,
      default: 'Type your message... (Enter to send)',
    },
    systemPrompt: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    connectionInfo: {
      type: String,
      default: '',
    },
    // Initial messages (from loaded chat)
    initialMessages: {
      type: Array as PropType<ChatMessage[]>,
      default: () => [],
    },
    // Initial artifacts (from loaded chat)
    initialArtifacts: {
      type: Array as PropType<ChatArtifact[]>,
      default: () => [],
    },
    // Initial active artifact index
    initialActiveArtifactIndex: {
      type: Number,
      default: -1,
    },
    // External loading state
    externalLoading: {
      type: Boolean,
      default: false,
    },
    // Custom send handler
    onSendMessage: {
      type: [Function, null] as PropType<
        | ((
            message: string,
            messages: ChatMessage[],
          ) => Promise<{ response?: string; artifacts?: ChatArtifact[] } | void>)
        | null
      >,
      default: undefined,
    },
    // Available imports for current connection
    availableImports: {
      type: Array as PropType<ChatImport[]>,
      default: () => [],
    },
    // Currently active imports
    activeImports: {
      type: Array as PropType<ChatImport[]>,
      default: () => [],
    },
    // Symbols/completion items for the symbols pane
    symbols: {
      type: Array as PropType<CompletionItem[]>,
      default: () => [],
    },
    // Current tool being executed (for inline indicator)
    activeToolName: {
      type: String,
      default: '',
    },
  },
  emits: [
    'message-sent',
    'response-received',
    'artifact-created',
    'artifact-selected',
    'update:messages',
    'update:artifacts',
    'update:activeArtifactIndex',
    'import-change',
    'select-symbol',
    'title-update',
  ],
  setup(props, { emit }) {
    const chatRef = ref<InstanceType<typeof LLMChat> | null>(null)
    const artifactExpandedRef = ref<HTMLElement | null>(null)

    // State
    const messages = ref<ChatMessage[]>([...props.initialMessages])
    const artifacts = ref<ChatArtifact[]>([...props.initialArtifacts])
    const activeArtifactIndex = ref(props.initialActiveArtifactIndex)
    const sidebarTab = ref<'symbols' | 'artifacts'>('symbols')
    const internalLoading = ref(false)
    const artifactContentHeight = ref(400)

    // Resizer state
    const isResizing = ref(false)
    const sidebarWidth = ref(350)

    const startResize = (e: MouseEvent) => {
      isResizing.value = true
      document.addEventListener('mousemove', handleResize)
      document.addEventListener('mouseup', stopResize)
      e.preventDefault()
    }

    const handleResize = (e: MouseEvent) => {
      if (!isResizing.value) return
      const container = document.querySelector('.chat-split-container') as HTMLElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const newWidth = containerRect.right - e.clientX

      // Clamp between 200 and 600 pixels
      sidebarWidth.value = Math.min(600, Math.max(200, newWidth))
    }

    const stopResize = () => {
      isResizing.value = false
      document.removeEventListener('mousemove', handleResize)
      document.removeEventListener('mouseup', stopResize)
    }

    const isLoading = computed(() => props.externalLoading || internalLoading.value)

    // Active artifact computed
    const activeArtifact = computed(() => {
      if (activeArtifactIndex.value >= 0 && activeArtifactIndex.value < artifacts.value.length) {
        return artifacts.value[activeArtifactIndex.value]
      }
      return null
    })

    // Convert artifact data to Results for display
    const activeArtifactResults = computed(() => {
      if (!activeArtifact.value) return null
      const data = activeArtifact.value.data

      if (data instanceof Results) {
        return data
      }

      if (data?.headers && data?.data) {
        return Results.fromJSON(data)
      }

      return null
    })

    const activeArtifactChartConfig = computed<ChartConfig | undefined>(() => {
      return activeArtifact.value?.config?.chartConfig
    })

    // Watch for prop changes
    watch(
      () => props.initialMessages,
      (newMessages) => {
        messages.value = [...newMessages]
      },
      { deep: true },
    )

    watch(
      () => props.initialArtifacts,
      (newArtifacts) => {
        artifacts.value = [...newArtifacts]
      },
      { deep: true },
    )

    watch(
      () => props.initialActiveArtifactIndex,
      (newIndex) => {
        activeArtifactIndex.value = newIndex
      },
    )

    // Update artifact content height based on container
    const updateArtifactContentHeight = () => {
      if (artifactExpandedRef.value) {
        const headerHeight = 44 // Header height
        const queryHeight = 0 // Query section is in details, doesn't affect height
        const containerHeight = artifactExpandedRef.value.parentElement?.clientHeight || 500
        const listHeight = 200 // Approximate artifact list height
        artifactContentHeight.value = Math.max(
          200,
          containerHeight - listHeight - headerHeight - queryHeight - 60,
        )
      }
    }

    onMounted(() => {
      updateArtifactContentHeight()
      window.addEventListener('resize', updateArtifactContentHeight)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', updateArtifactContentHeight)
    })

    watch(activeArtifactIndex, () => {
      setTimeout(updateArtifactContentHeight, 50)
    })

    // Handlers
    const handleMessagesUpdate = (newMessages: ChatMessage[]) => {
      messages.value = newMessages
      emit('update:messages', newMessages)
    }

    const handleSendMessage = async (message: string, msgs: ChatMessage[]) => {
      internalLoading.value = true

      try {
        if (props.onSendMessage) {
          const result = await props.onSendMessage(message, msgs)
          if (result) {
            if (result.response) {
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: result.response,
              }
              messages.value.push(assistantMessage)
              emit('update:messages', messages.value)
              emit('response-received', assistantMessage)
            }

            if (result.artifacts && result.artifacts.length > 0) {
              for (const artifact of result.artifacts) {
                addArtifact(artifact)
              }
            }
          }
        }
      } catch (error) {
        messages.value.push({
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
        emit('update:messages', messages.value)
      } finally {
        internalLoading.value = false
      }
    }

    const handleResponseReceived = (message: ChatMessage) => {
      emit('response-received', message)
    }

    // Artifact management
    const setActiveArtifact = (index: number) => {
      if (index >= -1 && index < artifacts.value.length) {
        activeArtifactIndex.value = index
        emit('update:activeArtifactIndex', index)
        if (index >= 0) {
          emit('artifact-selected', artifacts.value[index])
        }
      }
    }

    const collapseArtifact = () => {
      setActiveArtifact(-1)
    }

    const addArtifact = (artifact: ChatArtifact) => {
      artifacts.value.push(artifact)
      // Auto-expand new artifact and switch to artifacts tab
      activeArtifactIndex.value = artifacts.value.length - 1
      sidebarTab.value = 'artifacts'
      emit('update:artifacts', artifacts.value)
      emit('update:activeArtifactIndex', activeArtifactIndex.value)
      emit('artifact-created', artifact)
      setTimeout(updateArtifactContentHeight, 50)
    }

    const handleChartConfigChange = (config: ChartConfig) => {
      if (activeArtifact.value) {
        activeArtifact.value.config = { ...activeArtifact.value.config, chartConfig: config }
        emit('update:artifacts', artifacts.value)
      }
    }

    // Helper functions for artifact display
    const getArtifactIcon = (artifact: ChatArtifact): string => {
      switch (artifact.type) {
        case 'results':
          return 'mdi mdi-table'
        case 'chart':
          return 'mdi mdi-chart-bar'
        case 'code':
          return 'mdi mdi-code-braces'
        default:
          return 'mdi mdi-file-document'
      }
    }

    const getArtifactLabel = (artifact: ChatArtifact, index: number): string => {
      if (artifact.config?.title) {
        return artifact.config.title
      }
      const typeLabel = artifact.type === 'results' ? 'Query Result' : artifact.type === 'chart' ? 'Chart' : artifact.type
      return `${typeLabel} #${index + 1}`
    }

    const getArtifactMeta = (artifact: ChatArtifact): string => {
      const parts: string[] = []
      if (artifact.config?.resultSize) {
        parts.push(`${artifact.config.resultSize} rows`)
      }
      if (artifact.config?.executionTime) {
        parts.push(`${artifact.config.executionTime}ms`)
      }
      return parts.join(' | ')
    }

    // Public methods
    const addMessage = (message: ChatMessage) => {
      messages.value.push(message)
      emit('update:messages', messages.value)
    }

    const clearChat = () => {
      messages.value = []
      artifacts.value = []
      activeArtifactIndex.value = -1
      emit('update:messages', messages.value)
      emit('update:artifacts', artifacts.value)
      emit('update:activeArtifactIndex', -1)
    }

    const getMessages = () => messages.value
    const getArtifacts = () => artifacts.value

    // Handle symbol selection from SymbolsPane
    const handleSymbolSelect = (symbol: CompletionItem) => {
      emit('select-symbol', symbol)
    }

    return {
      chatRef,
      artifactExpandedRef,
      messages,
      artifacts,
      activeArtifact,
      activeArtifactIndex,
      activeArtifactResults,
      activeArtifactChartConfig,
      sidebarTab,
      artifactContentHeight,
      isLoading,
      handleMessagesUpdate,
      handleSendMessage,
      handleResponseReceived,
      setActiveArtifact,
      collapseArtifact,
      addArtifact,
      handleChartConfigChange,
      getArtifactIcon,
      getArtifactLabel,
      getArtifactMeta,
      addMessage,
      clearChat,
      getMessages,
      getArtifacts,
      handleSymbolSelect,
      // Resizer
      isResizing,
      sidebarWidth,
      startResize,
    }
  },
})
</script>

<style scoped>
.chat-split-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.chat-panel {
  flex: 1;
  min-width: 300px;
  height: 100%;
  overflow: hidden;
}

.chat-split-container.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.panel-resizer {
  flex: 0 0 4px;
  background-color: var(--border-light);
  cursor: col-resize;
  transition: background-color 0.15s ease;
}

.panel-resizer:hover {
  background-color: var(--special-text);
}

.chat-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connection-info {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  padding: 2px 8px;
  background-color: var(--bg-color);
  border-radius: 4px;
}

/* Sidebar Panel with tabs */
.sidebar-panel {
  min-width: 200px;
  max-width: 600px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}

.sidebar-tabs {
  display: flex;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-light);
  min-height: 36px;
}

.sidebar-tab {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-color);
  font-size: var(--font-size);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.sidebar-tab:hover {
  background-color: var(--button-mouseover);
}

.sidebar-tab.active {
  color: var(--special-text);
  border-bottom-color: var(--special-text);
}

.artifact-count {
  background-color: var(--special-text);
  color: white;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-content.artifacts-content {
  overflow: hidden;
}

/* Artifact List */
.artifacts-list {
  max-height: 180px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.artifact-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
  transition: background-color 0.15s ease;
}

.artifact-list-item:last-child {
  border-bottom: none;
}

.artifact-list-item:hover {
  background-color: var(--button-mouseover);
}

.artifact-list-item.active {
  background-color: var(--sidebar-selector-selected-bg);
  color: var(--sidebar-selector-font);
}

.artifact-list-item i {
  font-size: 16px;
  opacity: 0.7;
}

.artifact-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.artifact-label {
  font-size: var(--font-size);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artifact-meta {
  font-size: var(--small-font-size);
  color: var(--text-faint);
}

.artifact-list-item.active .artifact-meta {
  color: inherit;
  opacity: 0.7;
}

/* Expanded Artifact View */
.artifact-expanded {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.artifact-content {
  flex: 1;
  overflow: auto;
  min-height: 200px;
}

.custom-artifact-view {
  padding: 10px;
  overflow: auto;
  height: 100%;
}

.custom-artifact-view pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--font-size);
}

.no-artifacts {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  font-size: var(--font-size);
  padding: 20px;
  text-align: center;
}

/* Responsive design */
@media screen and (max-width: 900px) {
  .chat-split-container {
    flex-direction: column;
  }

  .chat-panel {
    flex: 1;
    max-width: 100%;
    min-height: 50%;
  }

  .panel-resizer {
    display: none;
  }

  .sidebar-panel {
    width: 100% !important;
    max-width: 100%;
    min-width: 100%;
    height: 50%;
    border-top: 1px solid var(--border-light);
  }

  .artifacts-list {
    max-height: 100px;
  }
}
</style>
