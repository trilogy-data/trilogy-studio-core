<template>
  <div class="editor-refinement-container" data-testid="editor-refinement-container">
    <l-l-m-chat
      ref="chatRef"
      :messages="messages"
      :title="'Refine Query'"
      :showHeader="true"
      :externalLoading="isLoading"
      :activeToolName="activeToolName"
      :sendHandler="handleSendMessage"
      :stopHandler="handleStop"
      :placeholder="placeholders"
      @update:messages="handleMessagesUpdate"
    >
      <template #header-actions>
        <div class="refinement-actions">
          <span v-if="connectionInfo" class="connection-info">
            {{ connectionInfo }}
          </span>
          <button
            class="action-btn accept-btn"
            @click="handleAccept"
            :disabled="isLoading"
            data-testid="accept-button"
          >
            <i class="mdi mdi-close"></i>
            Close
          </button>
          <button
            class="action-btn discard-btn"
            @click="handleDiscard"
            :disabled="isLoading"
            data-testid="discard-button"
          >
            <i class="mdi mdi-close"></i>
            Discard Changes
          </button>
        </div>
      </template>

      <!-- Render artifacts inline -->
      <template #artifact="{ artifact }">
        <div
          class="inline-artifact"
          v-if="
            (artifact.type === 'results' || artifact.type === 'chart') &&
            getArtifactResults(artifact)
          "
        >
          <results-component
            :type="'trilogy'"
            :results="getArtifactResults(artifact)!"
            :chartConfig="artifact.config?.chartConfig"
            :generatedSql="artifact.config?.generatedSql"
            :trilogySource="artifact.config?.query"
            :containerHeight="300"
            :defaultTab="artifact.type === 'chart' ? 'visualize' : 'results'"
          />
        </div>
        <div v-else class="artifact-placeholder">[Artifact: {{ artifact.type }}]</div>
      </template>
    </l-l-m-chat>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, inject, computed, type PropType } from 'vue'
import LLMChat from './LLMChat.vue'
import ResultsComponent from '../editor/Results.vue'
import type { ChatMessage, ChatArtifact } from '../../chats/chat'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { EditorStoreType } from '../../stores/editorStore'
import { Results } from '../../editors/results'
import type { QueryExecutionResult } from '../../llm/editorRefinementToolExecutor'

export default defineComponent({
  name: 'LLMEditorRefinement',
  components: {
    LLMChat,
    ResultsComponent,
  },
  props: {
    editorId: {
      type: String,
      required: true,
    },
    runEditorQuery: {
      type: Function as PropType<() => Promise<QueryExecutionResult>>,
      default: undefined,
    },
  },

  emits: ['accept', 'discard', 'content-change', 'chart-config-change'],

  setup(props, { emit }) {
    const chatRef = ref<InstanceType<typeof LLMChat> | null>(null)

    // Inject stores
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
    const editorStore = inject<EditorStoreType>('editorStore')

    if (!llmConnectionStore || !connectionStore || !queryExecutionService || !editorStore) {
      throw new Error(
        'LLMEditorRefinement requires llmConnectionStore, connectionStore, queryExecutionService, and editorStore to be provided',
      )
    }

    // Get editor and session from store
    const editor = computed(() => editorStore.editors[props.editorId])
    const session = computed(() => editor.value?.refinementSession)

    // Get execution state from store
    const execution = computed(() => editorStore.getRefinementExecution(props.editorId))
    const isLoading = computed(() => execution.value?.isLoading ?? false)
    const activeToolName = computed(() => execution.value?.activeToolName ?? '')

    // Get messages and artifacts from session
    const messages = computed(() => session.value?.messages ?? [])
    const artifacts = computed(() => session.value?.artifacts ?? [])

    // Connection info for display
    const connectionInfo = computed(() => {
      const activeName = llmConnectionStore.activeConnection
      if (!activeName) return ''
      const connection = llmConnectionStore.connections[activeName]
      if (!connection) return activeName
      return connection.model ? `${activeName} (${connection.model})` : activeName
    })

    // Placeholders for input
    const placeholders = [
      'Describe your changes... (Enter to send)',
      'Ask me to fix, improve, or explain the query...',
      'Try: "Add a filter for last 30 days"',
      'Try: "Group by region and show totals"',
    ]

    // Handle sending messages
    const handleSendMessage = async (message: string, _msgs: ChatMessage[]) => {
      await editorStore.executeRefinementMessage(
        props.editorId,
        message,
        {
          llmConnectionStore,
          connectionStore,
          queryExecutionService,
        },
        {
          onContentChange: (content, replaceSelection) => {
            emit('content-change', content, replaceSelection)
          },
          onChartConfigChange: (config) => {
            emit('chart-config-change', config)
          },
          onFinish: (msg) => {
            emit('accept', msg)
          },
          onRunActiveEditorQuery: props.runEditorQuery,
        },
      )
    }

    // Handle messages update from LLMChat
    const handleMessagesUpdate = (_newMessages: ChatMessage[]) => {
      // Messages are managed by the store, so we don't need to sync back
    }

    // Handle accept button
    const handleAccept = () => {
      editorStore.acceptRefinement(props.editorId, {
        onFinish: (msg) => {
          emit('accept', msg)
        },
      })
    }

    // Handle discard button
    const handleDiscard = () => {
      editorStore.discardRefinement(props.editorId, {
        onContentChange: (content) => {
          emit('content-change', content)
        },
        onChartConfigChange: (config) => {
          emit('chart-config-change', config)
        },
        onDiscard: () => {
          emit('discard')
        },
      })
    }

    // Handle stop button
    const handleStop = () => {
      editorStore.stopRefinementExecution(props.editorId)
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

    return {
      chatRef,
      messages,
      artifacts,
      isLoading,
      activeToolName,
      connectionInfo,
      placeholders,
      handleSendMessage,
      handleMessagesUpdate,
      handleAccept,
      handleDiscard,
      handleStop,
      getArtifactResults,
    }
  },
})
</script>

<style scoped>
.editor-refinement-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.refinement-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.connection-info {
  font-size: var(--small-font-size);
  color: var(--text-faint);
  padding: 2px 8px;
  background-color: var(--bg-color);
  border-radius: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 12px;
  border-radius: 4px;
  font-size: var(--font-size);
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  background: transparent;
}

.action-btn i {
  font-size: 14px;
}

.accept-btn {
  color: var(--special-text);
  border-color: var(--special-text);
}

.accept-btn:hover:not(:disabled) {
  background-color: var(--special-text);
  color: white;
}

.discard-btn {
  color: var(--delete-color);
  border-color: var(--delete-color);
}

.discard-btn:hover:not(:disabled) {
  background-color: var(--delete-color);
  color: white;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Inline artifact styling */
.inline-artifact {
  width: 100%;
  min-height: 250px;
  height: 300px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color);
  margin-top: 8px;
}

.artifact-placeholder {
  padding: 16px;
  background-color: var(--query-window-bg);
  border: 1px dashed var(--border);
  text-align: center;
  color: var(--text-faint);
  border-radius: 8px;
  margin-top: 8px;
}
</style>
