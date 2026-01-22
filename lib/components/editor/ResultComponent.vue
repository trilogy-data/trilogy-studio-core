<template>
  <div class="results-view">
    <!-- Horizontal split when chat is active -->
    <div v-if="hasActiveChat" class="split-view" ref="splitViewRef">
      <div class="results-pane" :style="{ width: resultsPaneWidth }">
        <!-- Loading in results pane -->
        <loading-view
          v-if="editorData.loading"
          :startTime="editorData.startTime"
          :cancel="editorData.cancelCallback"
        />
        <!-- Results in results pane -->
        <results-container
          v-else-if="hasResults"
          :results="editorData.results"
          :generatedSql="editorData.generated_sql || undefined"
          :containerHeight="containerHeight"
          :type="editorData.type"
          :chartConfig="editorData.chartConfig"
          :error="editorData.error || undefined"
          :symbols="editorData.completionSymbols"
          :showChatButton="false"
          @config-change="(config: ChartConfig) => editorData.setChartConfig(config)"
          @drilldown-click="handleDrilldown"
          @refresh-click="() => $emit('refresh-click')"
        />
        <!-- Hint when no results yet -->
        <hint-component v-else />
      </div>
      <div class="divider" @mousedown="startDragging">
        <div class="divider-handle"></div>
      </div>
      <div class="chat-pane" :style="{ width: chatPaneWidth }">
        <LLMEditorRefinement
          :editorId="editorData.id"
          :runEditorQuery="handleRunEditorQuery"
          @accept="handleAccept"
          @discard="handleDiscard"
          @content-change="handleContentChange"
          @chart-config-change="handleChartConfigChange"
        />
      </div>
    </div>
    <!-- No chat active: show loading, results, or hint -->
    <template v-else>
      <loading-view
        v-if="editorData.loading"
        :startTime="editorData.startTime"
        :cancel="editorData.cancelCallback"
      />
      <results-container
        v-else-if="hasResults"
        :results="editorData.results"
        :generatedSql="editorData.generated_sql || undefined"
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
import { defineComponent, inject, ref, type PropType } from 'vue'
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
  },
  emits: [
    'llm-query-accepted',
    'drilldown-click',
    'refresh-click',
    'content-change',
    'open-chat',
  ],
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    if (!connectionStore) {
      throw new Error('Requires injection of connection store')
    }

    const splitViewRef = ref<HTMLElement | null>(null)
    const splitRatio = ref(0.5) // Start at 50/50
    const isDragging = ref(false)
    const minPaneWidth = 200 // Minimum width in pixels

    return {
      connectionStore,
      splitViewRef,
      splitRatio,
      isDragging,
      minPaneWidth,
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
    resultsPaneWidth(): string {
      return `calc(${this.splitRatio * 100}% - 4px)`
    },
    chatPaneWidth(): string {
      return `calc(${(1 - this.splitRatio) * 100}% - 4px)`
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
      const headers = result.results ? [...result.results.headers.keys()] : []
      return {
        success: result.success,
        results: result.results
          ? {
              headers,
              data: result.results.data as any[][],
            }
          : undefined,
        error: result.error,
        executionTime: result.executionTime,
        resultSize: result.resultSize,
        columnCount: result.columnCount,
        generatedSql: result.generatedSql,
      }
    },
    startDragging(e: MouseEvent) {
      e.preventDefault()
      this.isDragging = true
      document.addEventListener('mousemove', this.onDrag)
      document.addEventListener('mouseup', this.stopDragging)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    onDrag(e: MouseEvent) {
      if (!this.isDragging || !this.splitViewRef) return

      const container = this.splitViewRef
      const containerRect = container.getBoundingClientRect()
      const containerWidth = containerRect.width
      const mouseX = e.clientX - containerRect.left

      // Calculate new ratio with constraints
      let newRatio = mouseX / containerWidth

      // Enforce minimum widths
      const minRatio = this.minPaneWidth / containerWidth
      const maxRatio = 1 - minRatio

      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio))
      this.splitRatio = newRatio
    },
    stopDragging() {
      this.isDragging = false
      document.removeEventListener('mousemove', this.onDrag)
      document.removeEventListener('mouseup', this.stopDragging)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
  },
  beforeUnmount() {
    // Clean up event listeners if component unmounts while dragging
    document.removeEventListener('mousemove', this.onDrag)
    document.removeEventListener('mouseup', this.stopDragging)
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

.split-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;
}

.results-pane {
  min-width: 200px;
  overflow: hidden;
}

.chat-pane {
  min-width: 200px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.divider {
  width: 8px;
  background: var(--sidebar-bg);
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-left: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
}

.divider:hover,
.divider:active {
  background: var(--border-light);
}

.divider-handle {
  width: 4px;
  height: 32px;
  background: var(--border);
  border-radius: 2px;
}

.divider:hover .divider-handle,
.divider:active .divider-handle {
  background: var(--special-text);
}
</style>
