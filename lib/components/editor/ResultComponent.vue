<template>
  <div class="results-view">
    <LLMEditorRefinement
      v-if="editorData.refinementSession || editorData.hasActiveRefinement()"
      :connectionName="editorData.connection"
      :initialContent="editorData.contents"
      :selectedText="editorData.refinementSession?.selectedText || ''"
      :selectionRange="editorData.refinementSession?.selectionRange || null"
      :chartConfig="editorData.chartConfig || undefined"
      :completionSymbols="editorData.completionSymbols"
      :existingSession="editorData.refinementSession"
      @accept="handleAccept"
      @discard="handleDiscard"
      @content-change="handleContentChange"
      @chart-config-change="handleChartConfigChange"
      @session-change="handleSessionChange"
    />
    <loading-view
      v-else-if="editorData.loading"
      :startTime="editorData.startTime"
      :cancel="editorData.cancelCallback"
    />
    <results-container
      v-else-if="
        (editorData.results.headers && editorData.results.headers.size > 0) || editorData.error
      "
      :results="editorData.results"
      :generatedSql="editorData.generated_sql || undefined"
      :containerHeight="containerHeight"
      :type="editorData.type"
      :chartConfig="editorData.chartConfig"
      :error="editorData.error || undefined"
      :symbols="editorData.completionSymbols"
      @config-change="(config) => editorData.setChartConfig(config)"
      @drilldown-click="(data) => handleDrilldown(data)"
      @refresh-click="() => $emit('refresh-click')"
    />
    <hint-component v-else />
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
import type { EditorRefinementSession } from '../../editors/editor'
import type { ChartConfig } from '../../editors/results'

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
  },
  emits: ['llm-query-accepted', 'drilldown-click', 'refresh-click', 'content-change'],
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    if (!connectionStore) {
      throw new Error('Requires injection of connection store')
    }

    return {
      connectionStore,
    }
  },
  methods: {
    handleAccept(_message?: string) {
      // Clear the refinement session
      this.editorData.setRefinementSession(null)
      this.$emit('llm-query-accepted')
    },
    handleDiscard() {
      // Clear the refinement session (content is restored by the composable)
      this.editorData.setRefinementSession(null)
    },
    handleContentChange(content: string, _replaceSelection?: boolean) {
      // Update editor content
      this.editorData.setContent(content)
      this.$emit('content-change', content)
    },
    handleChartConfigChange(config: ChartConfig) {
      this.editorData.setChartConfig(config)
    },
    handleSessionChange(session: EditorRefinementSession) {
      // Persist session to editor for tab-away support
      this.editorData.setRefinementSession(session)
    },
    handleDrilldown(data: any) {
      this.$emit('drilldown-click', data)
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
}
</style>
