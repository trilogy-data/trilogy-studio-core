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
              <span v-if="connectionInfo" class="connection-info" :title="connectionInfo">
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
        <div class="sidebar-tabs-left">
          <button
            class="sidebar-tab"
            :class="{ active: sidebarTab === 'artifacts' }"
            @click="sidebarTab = 'artifacts'"
            data-testid="llm-sidebar-tab-artifacts"
          >
            Artifacts
            <span v-if="visibleArtifactCount > 0" class="artifact-count">{{
              visibleArtifactCount
            }}</span>
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
        <div class="sidebar-tabs-right">
          <button
            v-if="sidebarTab === 'artifacts' && visibleArtifactCount > 0"
            class="publish-link-btn"
            @click="$emit('publish-artifacts')"
            title="Publish artifacts as a dashboard"
            data-testid="publish-artifacts-btn"
          >
            <i class="mdi mdi-view-dashboard-outline"></i>
            Publish
          </button>
        </div>
      </div>

      <!-- Artifacts Pane -->
      <div v-if="sidebarTab === 'artifacts'" class="sidebar-content artifacts-content">
        <artifacts-pane
          :artifacts="artifacts"
          :activeArtifactIndex="activeArtifactIndex"
          @update:activeArtifactIndex="setActiveArtifact"
          @chart-config-change="handleArtifactChartConfigChange"
          @unhide-artifact="unhideArtifact"
        >
          <template #custom-artifact="slotProps">
            <slot name="custom-artifact" v-bind="slotProps"></slot>
          </template>
        </artifacts-pane>
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
import ArtifactsPane from './ArtifactsPane.vue'
import type { ChatMessage, ChatArtifact, ChatImport } from '../../chats/chat'
import DashboardImportSelector from '../dashboard/DashboardImportSelector.vue'
import SymbolsPane from '../SymbolsPane.vue'
import type { ChartConfig } from '../../editors/results'
import type { CompletionItem } from '../../stores/resolver'

export default defineComponent({
  name: 'LLMChatSplitView',
  components: {
    LLMChat,
    ArtifactsPane,
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
    const internalLoading = ref(false)

    // Resizer state - controls chat panel width (artifacts panel takes remaining flex space)
    const isResizing = ref(false)
    const chatWidth = ref(300)

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

      // Clamp chat panel between 220 and 480 pixels
      chatWidth.value = Math.min(480, Math.max(220, newWidth))
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

    const visibleArtifactCount = computed(() => artifacts.value.filter((a) => !a.hidden).length)

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
    }

    const handleArtifactChartConfigChange = (artifact: ChatArtifact, config: ChartConfig) => {
      artifact.config = { ...artifact.config, chartConfig: config }
      emit('update:artifacts', artifacts.value)
    }

    function unhideArtifact(artifactId: string) {
      const artifact = artifacts.value.find((a) => a.id === artifactId)
      if (artifact) {
        artifact.hidden = false
        emit('update:artifacts', artifacts.value)
      }
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

    // vue-tsc noUnusedLocals workaround: function declarations used only in template
    void unhideArtifact

    return {
      chatRef,
      messages,
      artifacts,
      activeArtifact,
      activeArtifactIndex,
      visibleArtifactCount,
      sidebarTab,
      isLoading,
      handleMessagesUpdate,
      handleSendMessage,
      handleResponseReceived,
      setActiveArtifact,
      collapseArtifact,
      addArtifact,
      handleArtifactChartConfigChange,
      unhideArtifact,
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
  gap: 0;
  padding: 0;
  background: var(--query-window-bg);
}

.chat-panel {
  flex: 0 0 auto;
  min-width: 220px;
  max-width: 480px;
  height: 100%;
  overflow: visible;
  background: var(--query-window-bg);
  border: 0;
  border-radius: 0;
  box-shadow: none;
  position: relative;
  z-index: 3;
}

.chat-split-container.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.panel-resizer {
  flex: 0 0 1px;
  background-color: rgba(148, 163, 184, 0.14);
  cursor: col-resize;
  transition: background-color 0.15s ease;
}

.panel-resizer:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.2);
}

.chat-header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: visible;
}

.connection-info {
  font-size: 11px;
  color: var(--text-faint);
  padding: 0;
  background-color: transparent;
  border-radius: 0;
  min-width: 0;
  max-width: clamp(120px, 20vw, 220px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.chat-header) {
  height: 34px;
  min-height: 34px;
  padding: 0 8px;
  background: transparent;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  overflow: visible;
}

:deep(.chat-title) {
  font-size: 12px;
  font-weight: 600;
}

:deep(.chat-messages) {
  padding: 10px 12px 10px 10px;
}

:deep(.input-container) {
  padding: 6px 8px 8px;
  border-top: 0;
}

:deep(.input-wrapper) {
  padding: 4px 5px;
  gap: 6px;
  border-radius: 8px;
}

@media (max-width: 900px) {
  .chat-header-controls {
    gap: 8px;
  }

  .connection-info {
    max-width: 120px;
  }
}

@media (max-width: 720px) {
  .connection-info {
    display: none;
  }
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
  background-color: var(--query-window-bg);
  border: 0;
  border-radius: 0;
  overflow: hidden;
  box-shadow: none;
  position: relative;
  z-index: 1;
}

.sidebar-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--query-window-bg);
  border-bottom: 1px solid var(--border-light);
  min-height: 34px;
  padding: 0 10px;
  gap: 8px;
}

.sidebar-tabs-left,
.sidebar-tabs-right {
  display: flex;
  align-items: center;
}

.sidebar-tabs-left {
  gap: 4px;
}

.sidebar-tab {
  flex: 0 0 auto;
  padding: 0 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 1.5px solid transparent;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.sidebar-tab:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.03);
  color: var(--text-color);
}

.sidebar-tab.active {
  color: var(--special-text);
  border-bottom-color: var(--special-text);
}

.artifact-count {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.12);
  color: var(--special-text);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.publish-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(var(--special-text-rgb, 37, 99, 235), 0.14);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.04);
  cursor: pointer;
  color: var(--text-faint);
  font-size: 11px;
  border-radius: 7px;
}

.publish-link-btn:hover {
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
  color: var(--text-color);
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
