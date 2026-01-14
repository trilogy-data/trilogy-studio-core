<template>
  <div class="chat-artifacts-container" :class="{ 'has-artifact': currentArtifact }">
    <!-- Chat Panel -->
    <div class="chat-panel" :class="{ 'full-width': !currentArtifact && !showArtifactPanel }">
      <l-l-m-chat
        ref="chatRef"
        :messages="messages"
        :title="title"
        :showHeader="showHeader"
        :placeholder="placeholder"
        :systemPrompt="systemPrompt"
        :disabled="disabled"
        :externalLoading="isLoading"
        :customSendHandler="handleSendMessage"
        @update:messages="handleMessagesUpdate"
        @message-sent="$emit('message-sent', $event)"
        @response-received="handleResponseReceived"
      >
        <template #header-actions>
          <slot name="header-actions">
            <button
              v-if="artifacts.length > 0"
              class="header-action-btn"
              @click="toggleArtifactPanel"
              :title="showArtifactPanel ? 'Hide artifacts' : 'Show artifacts'"
            >
              <i :class="showArtifactPanel ? 'mdi mdi-dock-right' : 'mdi mdi-dock-left'"></i>
              <span class="artifact-count" v-if="artifacts.length > 0">{{ artifacts.length }}</span>
            </button>
          </slot>
        </template>

        <template #artifact="{ artifact }">
          <chat-artifact
            :artifact="artifact"
            :height="inlineArtifactHeight"
            :canExpand="true"
            @expand="expandArtifact"
            @config-change="(config: ChartConfig) => handleArtifactConfigChange(artifact, config)"
          />
        </template>
      </l-l-m-chat>
    </div>

    <!-- Artifact Panel -->
    <div
      v-if="showArtifactPanel || currentArtifact"
      class="artifact-panel"
      :class="{ expanded: artifactExpanded }"
    >
      <div class="artifact-panel-header">
        <span class="artifact-panel-title">
          {{ currentArtifact?.config?.title || 'Artifacts' }}
        </span>
        <div class="artifact-panel-actions">
          <button
            v-if="artifacts.length > 1"
            class="panel-action-btn"
            @click="previousArtifact"
            :disabled="currentArtifactIndex <= 0"
            title="Previous artifact"
          >
            <i class="mdi mdi-chevron-left"></i>
          </button>
          <span v-if="artifacts.length > 1" class="artifact-counter">
            {{ currentArtifactIndex + 1 }} / {{ artifacts.length }}
          </span>
          <button
            v-if="artifacts.length > 1"
            class="panel-action-btn"
            @click="nextArtifact"
            :disabled="currentArtifactIndex >= artifacts.length - 1"
            title="Next artifact"
          >
            <i class="mdi mdi-chevron-right"></i>
          </button>
          <button
            class="panel-action-btn"
            @click="toggleArtifactExpanded"
            :title="artifactExpanded ? 'Shrink' : 'Expand'"
          >
            <i :class="artifactExpanded ? 'mdi mdi-arrow-collapse' : 'mdi mdi-arrow-expand'"></i>
          </button>
          <button class="panel-action-btn" @click="closeArtifactPanel" title="Close">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>

      <div class="artifact-panel-content" ref="artifactPanelContent">
        <template v-if="currentArtifact">
          <!-- Full artifact display -->
          <div class="full-artifact-display">
            <div class="artifact-tabs" v-if="currentArtifact.type === 'results'">
              <button
                class="artifact-tab"
                :class="{ active: artifactViewTab === 'table' }"
                @click="artifactViewTab = 'table'"
              >
                Table
              </button>
              <button
                class="artifact-tab"
                :class="{ active: artifactViewTab === 'chart' }"
                @click="artifactViewTab = 'chart'"
              >
                Chart
              </button>
            </div>

            <div class="artifact-view" :style="{ height: artifactViewHeight + 'px' }">
              <template v-if="currentResults">
                <data-table
                  v-if="artifactViewTab === 'table'"
                  :headers="currentResults.headers"
                  :results="currentResults.data"
                  :containerHeight="artifactViewHeight"
                />
                <vega-lite-chart
                  v-else
                  :data="currentResults.data"
                  :columns="currentResults.headers"
                  :containerHeight="artifactViewHeight"
                  :initialConfig="currentChartConfig"
                  :showControls="true"
                  @config-change="handleCurrentArtifactConfigChange"
                />
              </template>
              <template v-else-if="currentArtifact.type === 'code'">
                <code-block
                  :language="currentArtifact.config?.language || 'sql'"
                  :content="currentArtifact.data || ''"
                />
              </template>
              <template v-else>
                <div class="custom-artifact-view">
                  <slot name="custom-artifact" :artifact="currentArtifact">
                    <pre>{{ JSON.stringify(currentArtifact.data, null, 2) }}</pre>
                  </slot>
                </div>
              </template>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="no-artifact-message">
            No artifacts yet. Artifacts will appear here when generated.
          </div>
        </template>
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
  inject,
  onMounted,
  onUnmounted,
  type PropType,
} from 'vue'
import LLMChat, { type ChatArtifact as ChatArtifactType, type ChatMessage } from './LLMChat.vue'
import ChatArtifactComponent from './ChatArtifact.vue'
import DataTable from '../DataTable.vue'
import VegaLiteChart from '../VegaLiteChart.vue'
import CodeBlock from '../CodeBlock.vue'
import { Results, type ChartConfig } from '../../editors/results'
import type { LLMConnectionStoreType } from '../../stores/llmStore'

export default defineComponent({
  name: 'LLMChatWithArtifactsComponent',
  components: {
    LLMChat,
    ChatArtifact: ChatArtifactComponent,
    DataTable,
    VegaLiteChart,
    CodeBlock,
  },
  props: {
    title: {
      type: String,
      default: 'Chat',
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
    inlineArtifactHeight: {
      type: Number,
      default: 300,
    },
    // Custom message handler for integrations
    onSendMessage: {
      type: [Function, null] as PropType<
        | ((
            message: string,
            messages: ChatMessage[],
          ) => Promise<{ response?: string; artifact?: ChatArtifactType } | void>)
        | null
      >,
      default: undefined,
    },
  },
  emits: ['message-sent', 'response-received', 'artifact-created', 'artifact-selected'],
  setup(props, { emit }) {
    const chatRef = ref<InstanceType<typeof LLMChat> | null>(null)
    const artifactPanelContent = ref<HTMLElement | null>(null)

    const messages = ref<ChatMessage[]>([])
    const artifacts = ref<ChatArtifactType[]>([])
    const currentArtifactIndex = ref(0)
    const showArtifactPanel = ref(false)
    const artifactExpanded = ref(false)
    const artifactViewTab = ref<'table' | 'chart'>('table')
    const isLoading = ref(false)
    const artifactViewHeight = ref(400)

    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore', null as any)

    const currentArtifact = computed(() => {
      if (artifacts.value.length === 0) return null
      return artifacts.value[currentArtifactIndex.value]
    })

    const currentResults = computed(() => {
      if (!currentArtifact.value) return null
      const data = currentArtifact.value.data

      if (data instanceof Results) {
        return data
      }

      if (data?.headers && data?.data) {
        return Results.fromJSON(data)
      }

      return null
    })

    const currentChartConfig = computed<ChartConfig | undefined>(() => {
      return currentArtifact.value?.config?.chartConfig
    })

    // Update artifact view height based on container
    const updateArtifactViewHeight = () => {
      if (artifactPanelContent.value) {
        const headerHeight = 40 // Header height
        const tabsHeight = currentArtifact.value?.type === 'results' ? 36 : 0
        artifactViewHeight.value =
          artifactPanelContent.value.clientHeight - headerHeight - tabsHeight - 20
      }
    }

    let resizeObserver: ResizeObserver | null = null

    onMounted(() => {
      if (artifactPanelContent.value) {
        resizeObserver = new ResizeObserver(updateArtifactViewHeight)
        resizeObserver.observe(artifactPanelContent.value)
      }
    })

    onUnmounted(() => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    })

    watch(showArtifactPanel, () => {
      setTimeout(updateArtifactViewHeight, 100)
    })

    watch(artifactExpanded, () => {
      setTimeout(updateArtifactViewHeight, 100)
    })

    const handleMessagesUpdate = (newMessages: ChatMessage[]) => {
      messages.value = newMessages

      // Extract artifacts from messages
      const newArtifacts: ChatArtifactType[] = []
      newMessages.forEach((msg) => {
        if (msg.artifact) {
          newArtifacts.push(msg.artifact)
        }
      })
      artifacts.value = newArtifacts

      if (newArtifacts.length > 0) {
        currentArtifactIndex.value = newArtifacts.length - 1
      }
    }

    const handleSendMessage = async (message: string, msgs: ChatMessage[]) => {
      isLoading.value = true

      try {
        // Use custom handler if provided
        if (props.onSendMessage) {
          const result = await props.onSendMessage(message, msgs)
          if (result) {
            if (result.response) {
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: result.response,
                artifact: result.artifact,
              }
              messages.value.push(assistantMessage)

              if (result.artifact) {
                artifacts.value.push(result.artifact)
                currentArtifactIndex.value = artifacts.value.length - 1
                showArtifactPanel.value = true
                emit('artifact-created', result.artifact)
              }

              emit('response-received', assistantMessage)
            }
          }
          return
        }

        // Default: use llmStore
        if (!llmStore) {
          messages.value.push({
            role: 'assistant',
            content: 'Error: No LLM connection available.',
          })
          return
        }

        await llmStore.generateValidatedCompletion(
          message,
          () => true,
          3,
          llmStore.activeConnection,
          messages.value,
          false,
        )

        const lastMessage = messages.value[messages.value.length - 1]
        emit('response-received', lastMessage)
      } catch (error) {
        messages.value.push({
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        })
      } finally {
        isLoading.value = false
      }
    }

    const handleResponseReceived = (message: ChatMessage) => {
      emit('response-received', message)
    }

    const expandArtifact = (artifact: ChatArtifactType) => {
      const index = artifacts.value.indexOf(artifact)
      if (index !== -1) {
        currentArtifactIndex.value = index
      }
      showArtifactPanel.value = true
      emit('artifact-selected', artifact)
    }

    const toggleArtifactPanel = () => {
      showArtifactPanel.value = !showArtifactPanel.value
    }

    const closeArtifactPanel = () => {
      showArtifactPanel.value = false
      artifactExpanded.value = false
    }

    const toggleArtifactExpanded = () => {
      artifactExpanded.value = !artifactExpanded.value
    }

    const previousArtifact = () => {
      if (currentArtifactIndex.value > 0) {
        currentArtifactIndex.value--
        emit('artifact-selected', currentArtifact.value)
      }
    }

    const nextArtifact = () => {
      if (currentArtifactIndex.value < artifacts.value.length - 1) {
        currentArtifactIndex.value++
        emit('artifact-selected', currentArtifact.value)
      }
    }

    const handleArtifactConfigChange = (artifact: ChatArtifactType, config: ChartConfig) => {
      artifact.config = { ...artifact.config, chartConfig: config }
    }

    const handleCurrentArtifactConfigChange = (config: ChartConfig) => {
      if (currentArtifact.value) {
        currentArtifact.value.config = { ...currentArtifact.value.config, chartConfig: config }
      }
    }

    // Public methods for external control
    const addArtifact = (
      artifact: ChatArtifactType,
      messageText: string = 'Here are the results:',
    ) => {
      const message: ChatMessage = {
        role: 'assistant',
        content: messageText,
        artifact,
      }
      messages.value.push(message)
      artifacts.value.push(artifact)
      currentArtifactIndex.value = artifacts.value.length - 1
      showArtifactPanel.value = true
      emit('artifact-created', artifact)
    }

    const addMessage = (message: ChatMessage) => {
      messages.value.push(message)
      if (message.artifact) {
        artifacts.value.push(message.artifact)
        currentArtifactIndex.value = artifacts.value.length - 1
      }
    }

    const clearChat = () => {
      messages.value = []
      artifacts.value = []
      currentArtifactIndex.value = 0
      showArtifactPanel.value = false
    }

    return {
      chatRef,
      artifactPanelContent,
      messages,
      artifacts,
      currentArtifact,
      currentArtifactIndex,
      currentResults,
      currentChartConfig,
      showArtifactPanel,
      artifactExpanded,
      artifactViewTab,
      artifactViewHeight,
      isLoading,
      handleMessagesUpdate,
      handleSendMessage,
      handleResponseReceived,
      expandArtifact,
      toggleArtifactPanel,
      closeArtifactPanel,
      toggleArtifactExpanded,
      previousArtifact,
      nextArtifact,
      handleArtifactConfigChange,
      handleCurrentArtifactConfigChange,
      addArtifact,
      addMessage,
      clearChat,
    }
  },
})
</script>

<style scoped>
.chat-artifacts-container {
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
  transition: flex 0.2s ease;
}

.chat-panel.full-width {
  flex: 1;
}

.chat-artifacts-container.has-artifact .chat-panel {
  flex: 0 0 40%;
  min-width: 300px;
}

.artifact-panel {
  flex: 0 0 60%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-light);
  background-color: var(--bg-color);
  transition: flex 0.2s ease;
}

.artifact-panel.expanded {
  flex: 0 0 75%;
}

.artifact-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-light);
  min-height: 40px;
}

.artifact-panel-title {
  font-weight: 600;
  font-size: var(--font-size);
  color: var(--text-color);
}

.artifact-panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.artifact-counter {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  padding: 0 8px;
}

.panel-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.panel-action-btn:hover:not(:disabled) {
  background-color: var(--button-mouseover);
}

.panel-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.artifact-panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.full-artifact-display {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.artifact-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
}

.artifact-tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: var(--font-size);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.artifact-tab:hover {
  color: var(--special-text);
}

.artifact-tab.active {
  color: var(--special-text);
  border-bottom-color: var(--special-text);
}

.artifact-view {
  flex: 1;
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

.no-artifact-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-faint);
  font-size: var(--font-size);
}

.header-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border-light);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: var(--small-font-size);
}

.header-action-btn:hover {
  background-color: var(--button-mouseover);
}

.artifact-count {
  background-color: var(--special-text);
  color: white;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 10px;
  min-width: 16px;
  text-align: center;
}

/* Responsive design */
@media screen and (max-width: 768px) {
  .chat-artifacts-container {
    flex-direction: column;
  }

  .chat-panel,
  .chat-artifacts-container.has-artifact .chat-panel {
    flex: 1;
    min-width: 100%;
  }

  .artifact-panel {
    flex: 0 0 50%;
    border-left: none;
    border-top: 1px solid var(--border-light);
  }

  .artifact-panel.expanded {
    flex: 0 0 70%;
  }
}
</style>
