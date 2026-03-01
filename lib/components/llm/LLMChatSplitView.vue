<template>
  <div class="chat-split-container" :class="{ 'is-resizing': isResizing }">
    <!-- Left: Chat Panel -->
    <div class="chat-panel" :style="{ width: chatWidth + 'px' }">
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
        :renderArtifacts="showInlineArtifacts"
        :sendHandler="handleSendMessage"
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
    <div class="panel-resizer" @mousedown="startResize"></div>

    <!-- Right: Artifacts/Symbols panel (primary view) -->
    <div class="sidebar-panel">
      <!-- Sidebar tabs -->
      <div class="sidebar-tabs">
        <button
          class="sidebar-tab"
          :class="{ active: sidebarTab === 'artifacts' }"
          @click="sidebarTab = 'artifacts'"
          data-testid="llm-sidebar-tab-artifacts"
        >
          Artifacts
          <span v-if="artifacts.length > 0" class="artifact-count">{{ artifacts.length }}</span>
        </button>
        <button
          class="sidebar-tab"
          :class="{ active: sidebarTab === 'symbols' }"
          @click="sidebarTab = 'symbols'"
          data-testid="llm-sidebar-tab-fields"
        >
          Fields
        </button>
      </div>

      <!-- Artifacts Pane -->
      <div v-if="sidebarTab === 'artifacts'" class="sidebar-content artifacts-content">
        <!-- Publish button -->
        <div class="artifacts-actions" v-if="artifacts.length > 0">
          <button
            class="publish-btn"
            @click="$emit('publish-artifacts')"
            title="Publish artifacts as a dashboard"
            data-testid="publish-artifacts-btn"
          >
            <i class="mdi mdi-view-dashboard-outline"></i>
            Publish as Dashboard
          </button>
        </div>

        <!-- Scrollable view: all artifacts expanded -->
        <div class="artifacts-scroll" v-if="artifacts.length > 0">
          <div
            v-for="(artifact, index) in artifacts"
            :key="artifact.id || index"
            class="artifact-card"
            :class="{ active: activeArtifactIndex === index }"
          >
            <div
              class="artifact-card-header"
              @click="toggleArtifactCollapsed(artifact, index)"
            >
              <i :class="getArtifactIcon(artifact)"></i>
              <span class="artifact-label">{{ getArtifactLabel(artifact, index) }}</span>
              <span class="artifact-meta">{{ getArtifactMeta(artifact) }}</span>
              <i :class="isArtifactCollapsed(artifact, index) ? 'mdi mdi-chevron-down' : 'mdi mdi-chevron-up'" class="collapse-chevron"></i>
            </div>
            <div v-show="!isArtifactCollapsed(artifact, index)" class="artifact-card-body" :style="getArtifactCardStyle(artifact)">
              <template v-if="getArtifactResults(artifact)">
                <results-component
                  :type="'trilogy'"
                  :results="getArtifactResults(artifact)!"
                  :chartConfig="artifact.config?.chartConfig"
                  :generatedSql="artifact.config?.generatedSql"
                  :trilogySource="artifact.config?.query"
                  :containerHeight="getArtifactContainerHeight(artifact)"
                  :defaultTab="artifact.type === 'chart' ? 'visualize' : 'results'"
                  @config-change="(config: ChartConfig) => handleArtifactChartConfigChange(artifact, config)"
                />
              </template>
              <template v-else-if="artifact.type === 'markdown'">
                <div class="markdown-artifact-view">
                  <markdown-renderer
                    :markdown="artifact.data?.markdown || ''"
                    :results="getMarkdownResults(artifact)"
                    :loading="false"
                  />
                </div>
              </template>
              <template v-else-if="artifact.type === 'code'">
                <code-block
                  :language="artifact.config?.language || 'sql'"
                  :content="artifact.data || ''"
                />
              </template>
              <template v-else>
                <div class="custom-artifact-view">
                  <slot name="custom-artifact" :artifact="artifact">
                    <pre>{{ JSON.stringify(artifact.data, null, 2) }}</pre>
                  </slot>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- No artifacts state -->
        <div class="no-artifacts" v-else>
          <span>No artifacts yet. Run a query to see results here.</span>
        </div>
      </div>

      <!-- Symbols Pane -->
      <div v-else-if="sidebarTab === 'symbols'" class="sidebar-content">
        <SymbolsPane :symbols="symbols" @select-symbol="handleSymbolSelect" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, type PropType } from 'vue'
import LLMChat from './LLMChat.vue'
import type { ChatMessage, ChatArtifact, ChatImport } from '../../chats/chat'
import ResultsComponent from '../editor/Results.vue'
import CodeBlock from '../CodeBlock.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import DashboardImportSelector from '../dashboard/DashboardImportSelector.vue'
import SymbolsPane from '../SymbolsPane.vue'
import { Results, type ChartConfig, ColumnType } from '../../editors/results'
import type { CompletionItem } from '../../stores/resolver'

export default defineComponent({
  name: 'LLMChatSplitView',
  components: {
    LLMChat,
    ResultsComponent,
    CodeBlock,
    MarkdownRenderer,
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
      type: [String, Array] as PropType<string | string[]>,
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
    // Whether to render artifacts inline in chat messages (default off for artifact-centric view)
    showInlineArtifacts: {
      type: Boolean,
      default: false,
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
    'publish-artifacts',
  ],
  setup(props, { emit }) {
    const chatRef = ref<InstanceType<typeof LLMChat> | null>(null)

    // State
    const messages = ref<ChatMessage[]>([...props.initialMessages])
    const artifacts = ref<ChatArtifact[]>([...props.initialArtifacts])
    const activeArtifactIndex = ref(props.initialActiveArtifactIndex)
    const sidebarTab = ref<'symbols' | 'artifacts'>('artifacts')
    const collapsedArtifacts = ref<Set<string>>(new Set())
    const internalLoading = ref(false)

    // Resizer state - controls chat panel width (artifacts panel takes remaining flex space)
    const isResizing = ref(false)
    const chatWidth = ref(350)

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
      const newWidth = e.clientX - containerRect.left

      // Clamp chat panel between 200 and 600 pixels
      chatWidth.value = Math.min(600, Math.max(200, newWidth))
    }

    const stopResize = () => {
      isResizing.value = false
      document.removeEventListener('mousemove', handleResize)
      document.removeEventListener('mouseup', stopResize)
      // Dispatch a resize event to trigger chart redraw at new dimensions
      window.dispatchEvent(new Event('resize'))
    }

    const isLoading = computed(() => props.externalLoading || internalLoading.value)

    // Active artifact computed (used for highlighting most-recently created/selected artifact)
    const activeArtifact = computed(() => {
      if (activeArtifactIndex.value >= 0 && activeArtifactIndex.value < artifacts.value.length) {
        return artifacts.value[activeArtifactIndex.value]
      }
      return null
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

    // Handlers
    const handleMessagesUpdate = (newMessages: ChatMessage[]) => {
      messages.value = newMessages
      emit('update:messages', newMessages)
    }

    const handleSendMessage = async (message: string, msgs: ChatMessage[]) => {
      // Only use internalLoading when there's NO onSendMessage handler (fallback mode)
      // When onSendMessage is provided, the caller manages loading state via externalLoading prop
      const useInternalLoading = !props.onSendMessage

      if (useInternalLoading) {
        internalLoading.value = true
      }

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
        if (useInternalLoading) {
          internalLoading.value = false
        }
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

    const handleArtifactChartConfigChange = (artifact: ChatArtifact, config: ChartConfig) => {
      artifact.config = { ...artifact.config, chartConfig: config }
      emit('update:artifacts', artifacts.value)
    }

    // Convert artifact data to Results for display
    const getArtifactResults = (artifact: ChatArtifact): Results | null => {
      const data = artifact.data

      if (data instanceof Results) {
        return data
      }

      if (data?.headers && data?.data) {
        return Results.fromJSON(data)
      }

      return null
    }

    // Convert markdown artifact data to Results for template rendering
    const getMarkdownResults = (artifact: ChatArtifact): Results | null => {
      if (artifact.type !== 'markdown') return null
      const queryResults = artifact.data?.queryResults
      if (!queryResults) return null

      if (queryResults instanceof Results) return queryResults
      if (queryResults?.headers && queryResults?.data) {
        return Results.fromJSON(queryResults)
      }
      return null
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
        case 'markdown':
          return 'mdi mdi-language-markdown'
        default:
          return 'mdi mdi-file-document'
      }
    }

    const getArtifactLabel = (artifact: ChatArtifact, index: number): string => {
      if (artifact.config?.title) {
        return artifact.config.title
      }
      const typeLabel =
        artifact.type === 'results'
          ? 'Query Result'
          : artifact.type === 'chart'
            ? 'Chart'
            : artifact.type === 'markdown'
              ? 'Markdown'
              : artifact.type
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

    // Artifact card collapse
    const artifactKey = (artifact: ChatArtifact, index: number): string =>
      artifact.id || String(index)

    const isArtifactCollapsed = (artifact: ChatArtifact, index: number): boolean =>
      collapsedArtifacts.value.has(artifactKey(artifact, index))

    const toggleArtifactCollapsed = (artifact: ChatArtifact, index: number): void => {
      const key = artifactKey(artifact, index)
      const next = new Set(collapsedArtifacts.value)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        setActiveArtifact(index)
      }
      collapsedArtifacts.value = next
    }

    // Artifact card height sizing
    // Results.vue subtracts TABS_HEIGHT (30px) before passing height to DataTable.
    // DataTable (Tabulator) renders rows at 25px; column header is ~38px.
    // ARRAY/STRUCT columns disable fixed row height — fall back to max for those.
    const CHART_HEIGHT = 450
    const RESULTS_TABS_OVERHEAD = 30 // Results.vue internal tab bar
    const TABLE_HEADER_HEIGHT = 38
    const TABLE_ROW_HEIGHT = 25
    const MIN_RESULTS_HEIGHT = 120
    const MAX_RESULTS_HEIGHT = 450
    const CODE_LINE_HEIGHT = 20
    const CODE_MIN_HEIGHT = 80
    const CODE_MAX_HEIGHT = 350
    const MARKDOWN_MAX_HEIGHT = 800

    const hasComplexColumns = (results: Results): boolean => {
      for (const col of results.headers.values()) {
        if (col.type === ColumnType.ARRAY || col.type === ColumnType.STRUCT) return true
      }
      return false
    }

    // Returns a style object for the artifact-card-body div.
    // charts/results use a fixed height so their inner components fill correctly;
    // markdown/code use max-height so short content doesn't leave a wasteland of empty space.
    const getArtifactCardStyle = (artifact: ChatArtifact): Record<string, string> => {
      if (artifact.type === 'chart') {
        return { height: `${CHART_HEIGHT}px` }
      }

      if (artifact.type === 'results') {
        const results = getArtifactResults(artifact)
        if (!results || hasComplexColumns(results)) {
          return { height: `${MAX_RESULTS_HEIGHT}px` }
        }
        const rowCount = results.data.length
        const height = Math.max(
          MIN_RESULTS_HEIGHT,
          Math.min(
            MAX_RESULTS_HEIGHT,
            RESULTS_TABS_OVERHEAD + TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT * rowCount + 8,
          ),
        )
        return { height: `${height}px` }
      }

      if (artifact.type === 'code') {
        const lineCount = (artifact.data as string | undefined)?.split('\n').length ?? 1
        const height = Math.max(
          CODE_MIN_HEIGHT,
          Math.min(CODE_MAX_HEIGHT, lineCount * CODE_LINE_HEIGHT + 24),
        )
        return { maxHeight: `${height}px`, overflowY: 'auto' }
      }

      // markdown and custom: natural height capped at MARKDOWN_MAX_HEIGHT
      return { maxHeight: `${MARKDOWN_MAX_HEIGHT}px`, overflowY: 'auto' }
    }

    // containerHeight prop for results-component — must match the card body height.
    const getArtifactContainerHeight = (artifact: ChatArtifact): number => {
      if (artifact.type === 'chart') return CHART_HEIGHT
      if (artifact.type === 'results') {
        const results = getArtifactResults(artifact)
        if (!results || hasComplexColumns(results)) return MAX_RESULTS_HEIGHT
        const rowCount = results.data.length
        return Math.max(
          MIN_RESULTS_HEIGHT,
          Math.min(
            MAX_RESULTS_HEIGHT,
            RESULTS_TABS_OVERHEAD + TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT * rowCount + 8,
          ),
        )
      }
      return MAX_RESULTS_HEIGHT
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
      messages,
      artifacts,
      activeArtifact,
      activeArtifactIndex,
      sidebarTab,
      isLoading,
      handleMessagesUpdate,
      handleSendMessage,
      handleResponseReceived,
      setActiveArtifact,
      collapseArtifact,
      addArtifact,
      handleArtifactChartConfigChange,
      getArtifactResults,
      getMarkdownResults,
      getArtifactIcon,
      getArtifactLabel,
      getArtifactMeta,
      isArtifactCollapsed,
      toggleArtifactCollapsed,
      getArtifactCardStyle,
      getArtifactContainerHeight,
      addMessage,
      clearChat,
      getMessages,
      getArtifacts,
      handleSymbolSelect,
      // Resizer
      isResizing,
      chatWidth,
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
  flex: 0 0 auto;
  min-width: 200px;
  max-width: 600px;
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

.artifact-placeholder {
  padding: 16px;
  background-color: var(--query-window-bg);
  border: 1px dashed var(--border);
  text-align: center;
  color: var(--text-faint);
  border-radius: 8px;
}

/* Sidebar Panel with tabs - primary (larger) panel */
.sidebar-panel {
  flex: 1;
  min-width: 300px;
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

/* Publish button */
.artifacts-actions {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.publish-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-bg);
  color: var(--text-color);
  font-size: var(--font-size);
  cursor: pointer;
  transition: all 0.15s ease;
}

.publish-btn:hover {
  background-color: var(--special-text);
  color: white;
  border-color: var(--special-text);
}

.publish-btn i {
  font-size: 16px;
}

/* Scrollable all-artifacts view */
.artifacts-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.artifact-card {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.artifact-card:hover {
  border-color: var(--border);
}

.artifact-card.active {
  border-color: var(--special-text);
}

.artifact-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-light);
  min-height: 32px;
  cursor: pointer;
  user-select: none;
}

.artifact-card-header:hover {
  background-color: var(--button-mouseover);
}

.artifact-card-header i {
  font-size: 14px;
  opacity: 0.7;
  flex-shrink: 0;
}

.collapse-chevron {
  margin-left: auto;
  opacity: 0.5;
  flex-shrink: 0;
}

.artifact-label {
  font-size: var(--font-size);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.artifact-meta {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  flex-shrink: 0;
}

.artifact-card-body {
  overflow: hidden;
}

.markdown-artifact-view {
  padding: 10px;
  overflow: auto;
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
    flex: 0 0 auto;
    width: 100% !important;
    max-width: 100%;
    min-width: 100%;
    height: 40%;
  }

  .panel-resizer {
    display: none;
  }

  .sidebar-panel {
    flex: 1;
    width: 100% !important;
    max-width: 100%;
    min-width: 100%;
    min-height: 60%;
    border-top: 1px solid var(--border-light);
  }
}
</style>
