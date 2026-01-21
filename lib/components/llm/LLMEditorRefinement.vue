<template>
  <div class="editor-refinement-container" data-testid="editor-refinement-container">
    <l-l-m-chat
      ref="chatRef"
      :messages="messages"
      :title="'Refine Query'"
      :showHeader="true"
      :externalLoading="isLoading"
      :activeToolName="activeToolName"
      :customSendHandler="handleSendMessage"
      :placeholder="placeholders"
      @update:messages="handleMessagesUpdate"
    >
      <template #header-actions>
        <div class="refinement-actions">
          <button
            class="action-btn accept-btn"
            @click="handleAccept"
            :disabled="isLoading"
            data-testid="accept-button"
          >
            <i class="mdi mdi-check"></i>
            Accept
          </button>
          <button
            class="action-btn discard-btn"
            @click="handleDiscard"
            :disabled="isLoading"
            data-testid="discard-button"
          >
            <i class="mdi mdi-close"></i>
            Discard
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
import { defineComponent, ref, inject, type PropType } from 'vue'
import LLMChat from './LLMChat.vue'
import ResultsComponent from '../editor/Results.vue'
import type { ChatMessage, ChatArtifact } from '../../chats/chat'
import type { ChartConfig } from '../../editors/results'
import type { CompletionItem } from '../../stores/resolver'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { EditorStoreType } from '../../stores/editorStore'
import { Results } from '../../editors/results'
import {
  useEditorRefinement,
  type EditorRefinementSession,
} from '../../composables/useEditorRefinement'

export default defineComponent({
  name: 'LLMEditorRefinement',
  components: {
    LLMChat,
    ResultsComponent,
  },
  props: {
    connectionName: {
      type: String,
      required: true,
    },
    initialContent: {
      type: String,
      required: true,
    },
    selectedText: {
      type: String,
      default: '',
    },
    selectionRange: {
      type: Object as PropType<{ start: number; end: number } | null>,
      default: null,
    },
    chartConfig: {
      type: Object as PropType<ChartConfig | undefined>,
      default: undefined,
    },
    completionSymbols: {
      type: Array as PropType<CompletionItem[]>,
      default: () => [],
    },
    existingSession: {
      type: Object as PropType<EditorRefinementSession | null>,
      default: null,
    },
  },

  emits: ['accept', 'discard', 'content-change', 'chart-config-change', 'session-change'],

  setup(props, { emit }) {
    const chatRef = ref<InstanceType<typeof LLMChat> | null>(null)

    // Inject stores
    const llmConnectionStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
    const editorStore = inject<EditorStoreType>('editorStore')

    if (!llmConnectionStore || !connectionStore || !queryExecutionService) {
      throw new Error(
        'LLMEditorRefinement requires llmConnectionStore, connectionStore, and queryExecutionService to be provided',
      )
    }

    // Placeholders for input
    const placeholders = [
      'Describe your changes... (Enter to send)',
      'Ask me to fix, improve, or explain the query...',
      'Try: "Add a filter for last 30 days"',
      'Try: "Group by region and show totals"',
    ]

    // Use the editor refinement composable
    const refinement = useEditorRefinement({
      llmConnectionStore,
      connectionStore,
      queryExecutionService,
      editorStore,
      connectionName: props.connectionName,
      initialContent: props.initialContent,
      selectedText: props.selectedText,
      selectionRange: props.selectionRange || undefined,
      chartConfig: props.chartConfig,
      completionSymbols: props.completionSymbols,
      existingSession: props.existingSession,
      onContentChange: (content, replaceSelection) => {
        emit('content-change', content, replaceSelection)
      },
      onChartConfigChange: (config) => {
        emit('chart-config-change', config)
      },
      onFinish: (message) => {
        emit('accept', message)
      },
      onDiscard: () => {
        emit('discard')
      },
      onSessionChange: (session) => {
        emit('session-change', session)
      },
    })

    // Expose composable state
    const {
      messages,
      artifacts,
      isLoading,
      activeToolName,
      currentContent,
      currentChartConfig,
      sendMessage,
      accept,
      discard,
    } = refinement

    // Handle sending messages
    const handleSendMessage = async (message: string, _msgs: ChatMessage[]) => {
      await sendMessage(message)
    }

    // Handle messages update from LLMChat
    const handleMessagesUpdate = (_newMessages: ChatMessage[]) => {
      // Messages are managed by the composable, so we don't need to sync back
    }

    // Handle accept button
    const handleAccept = () => {
      accept()
    }

    // Handle discard button
    const handleDiscard = () => {
      discard()
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
      currentContent,
      currentChartConfig,
      placeholders,
      handleSendMessage,
      handleMessagesUpdate,
      handleAccept,
      handleDiscard,
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

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
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
