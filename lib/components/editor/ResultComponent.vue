<template>
  <div class="results-view">
    <!-- Inline refinement chat (hosts without the global chat panel) -->
    <div v-if="displayMode === 'chat' && hasActiveChat" class="chat-only-view">
      <LLMEditorRefinement
        :editorId="editorData.id"
        :runEditorQuery="handleRunEditorQuery"
        @accept="handleAccept"
        @discard="handleDiscard"
        @content-change="handleContentChange"
        @chart-config-change="handleChartConfigChange"
      />
    </div>
    <!-- Results mode: show loading, results, or hint -->
    <template v-else-if="displayMode !== 'chat'">
      <loading-view
        v-if="editorData.loading"
        :startTime="editorData.startTime"
        :cancel="editorData.cancelCallback"
      />
      <results-container
        v-else-if="hasResults"
        :results="editorData.results"
        :generatedSql="editorData.generated_sql || undefined"
        :trilogySource="editorData.executed_contents || undefined"
        :containerHeight="containerHeight"
        :type="editorData.type"
        :chartConfig="editorData.chartConfig"
        :error="editorData.error || undefined"
        :symbols="editorData.completionSymbols"
        :showChatButton="canOpenChat"
        @config-change="(config: ChartConfig) => editorData.setChartConfig(config)"
        @drilldown-click="handleDrilldown"
        @refresh-click="() => $emit('refresh-click')"
        @open-chat="handleOpenChat"
      />
      <hint-component v-else />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, type PropType } from 'vue'
import LoadingView from '../LoadingView.vue'
import ResultsContainer from './Results.vue'
import HintComponent from '../HintComponent.vue'
import LLMEditorRefinement from '../llm/LLMEditorRefinement.vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorModel } from '../../main'
import type { ChartConfig } from '../../editors/results'
import type { QueryExecutionResult } from '../../llm/editorRefinementToolExecutor'

export default defineComponent({
  name: 'ResultsView',
  components: {
    LoadingView,
    ResultsContainer,
    HintComponent,
    LLMEditorRefinement,
  },
  props: {
    editorData: {
      type: Object as PropType<EditorModel>,
      required: true,
    },
    containerHeight: {
      type: Number,
      default: 0,
    },
    canOpenChat: {
      type: Boolean,
      default: false,
    },
    runEditorQuery: {
      type: Function as PropType<() => Promise<QueryExecutionResult | undefined>>,
      default: undefined,
    },
    displayMode: {
      type: String as PropType<'results' | 'chat'>,
      default: 'results',
    },
  },
  emits: ['llm-query-accepted', 'drilldown-click', 'refresh-click', 'content-change', 'open-chat'],
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    if (!connectionStore) {
      throw new Error('Requires injection of connection store')
    }

    return {
      connectionStore,
    }
  },
  computed: {
    hasActiveChat(): boolean {
      return this.editorData.hasActiveRefinement()
    },
    hasResults(): boolean {
      return (
        (this.editorData.results.headers && this.editorData.results.headers.size > 0) ||
        !!this.editorData.error
      )
    },
  },
  methods: {
    handleAccept(_message?: string) {
      // Session is cleared by the store
      this.$emit('llm-query-accepted')
    },
    handleDiscard() {
      // Session is cleared and content restored by the store
    },
    handleContentChange(content: string, _replaceSelection?: boolean) {
      // Update editor content (store also updates the session)
      this.editorData.setContent(content)
      this.$emit('content-change', content)
    },
    handleChartConfigChange(config: ChartConfig) {
      this.editorData.setChartConfig(config)
    },
    handleDrilldown(data: any) {
      this.$emit('drilldown-click', data)
    },
    handleOpenChat() {
      this.$emit('open-chat')
    },
    async handleRunEditorQuery(): Promise<QueryExecutionResult> {
      if (!this.runEditorQuery) {
        return {
          success: false,
          error: 'Run editor query is not available',
        }
      }

      const result = await this.runEditorQuery()
      if (!result) {
        return {
          success: false,
          error: 'Query execution returned no result',
        }
      }

      // Convert Results object to the expected format
      const headers = result.results ? [...result.results.headers.keys()].map((k) => String(k)) : []
      return {
        success: result.success,
        results: result.results
          ? {
              headers,
              data: result.results.data as any[],
            }
          : undefined,
        error: result.error,
        executionTime: result.executionTime,
        resultSize: result.resultSize,
        columnCount: result.columnCount,
        generatedSql: result.generatedSql,
      }
    },
  },
})
</script>

<style scoped>
.results-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--query-window-bg);
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.chat-only-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}
</style>
