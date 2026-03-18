<template>
  <div class="artifacts-pane">
    <!-- Scrollable view: visible artifacts -->
    <div class="artifacts-scroll" v-if="visibleArtifacts.length > 0 || hiddenArtifacts.length > 0">
      <!-- Visible artifacts -->
      <div
        v-for="{ artifact, originalIndex } in visibleArtifacts"
        :key="artifact.id || originalIndex"
        class="artifact-card"
        :class="{ active: activeArtifactIndex === originalIndex }"
      >
        <div class="artifact-card-header" @click="toggleArtifactCollapsed(artifact, originalIndex)">
          <i :class="getArtifactIcon(artifact)"></i>
          <span class="artifact-label">{{ getArtifactLabel(artifact, originalIndex) }}</span>
          <span class="artifact-meta">{{ getArtifactMeta(artifact) }}</span>
          <i
            :class="
              isArtifactCollapsed(artifact, originalIndex)
                ? 'mdi mdi-chevron-down'
                : 'mdi mdi-chevron-up'
            "
            class="collapse-chevron"
          ></i>
        </div>
        <div
          v-show="!isArtifactCollapsed(artifact, originalIndex)"
          class="artifact-card-body"
          :style="getArtifactCardStyle(artifact)"
        >
          <template v-if="getArtifactResults(artifact)">
            <results-component
              :type="'trilogy'"
              :results="getArtifactResults(artifact)!"
              :chartConfig="artifact.config?.chartConfig"
              :generatedSql="artifact.config?.generatedSql"
              :trilogySource="artifact.config?.query"
              :containerHeight="getArtifactContainerHeight(artifact)"
              :defaultTab="artifact.type === 'chart' ? 'visualize' : 'results'"
              @config-change="
                (config: ChartConfig) => $emit('chart-config-change', artifact, config)
              "
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

      <!-- Hidden artifacts section -->
      <div v-if="hiddenArtifacts.length > 0" class="hidden-section">
        <div class="hidden-section-header" @click="showHidden = !showHidden">
          <i :class="showHidden ? 'mdi mdi-chevron-down' : 'mdi mdi-chevron-right'"></i>
          <span>Hidden ({{ hiddenArtifacts.length }})</span>
        </div>
        <div v-if="showHidden" class="hidden-artifacts-list">
          <div
            v-for="{ artifact, originalIndex } in hiddenArtifacts"
            :key="artifact.id || originalIndex"
            class="hidden-artifact-row"
          >
            <i :class="getArtifactIcon(artifact)" class="hidden-artifact-icon"></i>
            <span class="artifact-label hidden-artifact-label">{{
              getArtifactLabel(artifact, originalIndex)
            }}</span>
            <span class="artifact-meta">{{ getArtifactMeta(artifact) }}</span>
            <button
              class="unhide-btn"
              title="Restore artifact"
              @click.stop="$emit('unhide-artifact', artifact.id)"
            >
              <i class="mdi mdi-eye-outline"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- No artifacts state -->
    <div class="no-artifacts" v-else>
      <span>No artifacts yet. Run a query to see results here.</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, type PropType } from 'vue'
import type { ChatArtifact } from '../../chats/chat'
import ResultsComponent from '../editor/Results.vue'
import CodeBlock from '../CodeBlock.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { Results, type ChartConfig, ColumnType } from '../../editors/results'

// Height sizing constants
// Results.vue subtracts TABS_HEIGHT (30px) before passing height to DataTable.
// DataTable (Tabulator) renders rows at 25px; column header is ~38px.
// ARRAY/STRUCT columns disable fixed row height — fall back to max for those.
const CHART_HEIGHT = 450
const RESULTS_TABS_OVERHEAD = 30
const TABLE_HEADER_HEIGHT = 38
const TABLE_ROW_HEIGHT = 25
const MIN_RESULTS_HEIGHT = 120
const MAX_RESULTS_HEIGHT = 450
const CODE_LINE_HEIGHT = 20
const CODE_MIN_HEIGHT = 80
const CODE_MAX_HEIGHT = 350
const MARKDOWN_MAX_HEIGHT = 800

export default defineComponent({
  name: 'ArtifactsPane',
  components: {
    ResultsComponent,
    CodeBlock,
    MarkdownRenderer,
  },
  props: {
    artifacts: {
      type: Array as PropType<ChatArtifact[]>,
      required: true,
    },
    activeArtifactIndex: {
      type: Number,
      default: -1,
    },
  },
  emits: ['chart-config-change', 'update:activeArtifactIndex', 'unhide-artifact'],
  setup(props, { emit }) {
    const collapsedArtifacts = ref<Set<string>>(new Set())
    const showHidden = ref(false)

    // Split artifacts into visible and hidden, preserving original index for activeArtifactIndex matching
    const visibleArtifacts = computed(() =>
      props.artifacts
        .map((artifact, originalIndex) => ({ artifact, originalIndex }))
        .filter(({ artifact }) => !artifact.hidden),
    )

    const hiddenArtifacts = computed(() =>
      props.artifacts
        .map((artifact, originalIndex) => ({ artifact, originalIndex }))
        .filter(({ artifact }) => artifact.hidden),
    )

    // Convert artifact data to Results for display
    const getArtifactResults = (artifact: ChatArtifact): Results | null => {
      const data = artifact.data
      if (data instanceof Results) return data
      if (data?.headers && data?.data) return Results.fromJSON(data)
      return null
    }

    // Convert markdown artifact data to Results for the MarkdownRenderer
    const getMarkdownResults = (artifact: ChatArtifact): Results | null => {
      if (artifact.type !== 'markdown') return null
      const queryResults = artifact.data?.queryResults
      if (!queryResults) return null
      if (queryResults instanceof Results) return queryResults
      if (queryResults?.headers && queryResults?.data) return Results.fromJSON(queryResults)
      return null
    }

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
      if (artifact.config?.title) return artifact.config.title
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
      if (artifact.config?.resultSize) parts.push(`${artifact.config.resultSize} rows`)
      if (artifact.config?.executionTime) parts.push(`${artifact.config.executionTime}ms`)
      return parts.join(' | ')
    }

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
        emit('update:activeArtifactIndex', index)
      }
      collapsedArtifacts.value = next
    }

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
      if (artifact.type === 'chart') return { height: `${CHART_HEIGHT}px` }

      if (artifact.type === 'results') {
        const results = getArtifactResults(artifact)
        if (!results || hasComplexColumns(results)) return { height: `${MAX_RESULTS_HEIGHT}px` }
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

    return {
      visibleArtifacts,
      hiddenArtifacts,
      showHidden,
      getArtifactResults,
      getMarkdownResults,
      getArtifactIcon,
      getArtifactLabel,
      getArtifactMeta,
      isArtifactCollapsed,
      toggleArtifactCollapsed,
      getArtifactCardStyle,
      getArtifactContainerHeight,
    }
  },
})
</script>

<style scoped>
.artifacts-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  height: 100%;
}

/* Scrollable all-artifacts view */
.artifacts-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 10px 8px;
}

.artifact-card {
  border: 1px solid var(--border-light);
  background-color: var(--query-window-bg);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.15s ease;
  box-shadow: none;
}

.artifact-card:hover {
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.18);
}

.artifact-card.active {
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.26);
}

.artifact-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background-color: transparent;
  border-bottom: 1px solid var(--border-light);
  min-height: 30px;
  cursor: pointer;
  user-select: none;
}

.artifact-card-header:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.025);
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
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.artifact-meta {
  font-size: 10px;
  color: var(--text-faint);
  flex-shrink: 0;
}

.artifact-card-body {
  overflow: hidden;
}

.markdown-artifact-view {
  padding: 6px 8px;
  overflow: auto;
}

.custom-artifact-view {
  padding: 6px 8px;
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

/* Hidden artifacts section */
.hidden-section {
  flex-shrink: 0;
  border: 1px solid var(--border-light);
  background-color: var(--query-window-bg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: none;
}

.hidden-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  background-color: transparent;
  cursor: pointer;
  user-select: none;
  min-height: 30px;
  font-size: 12px;
  color: var(--text-faint);
}

.hidden-section-header:hover {
  background-color: var(--button-mouseover);
  color: var(--text-color);
}

.hidden-section-header i {
  font-size: 14px;
  flex-shrink: 0;
}

.hidden-artifacts-list {
  display: flex;
  flex-direction: column;
}

.hidden-artifact-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 9px;
  border-top: 1px solid var(--border-light);
  min-height: 30px;
}

.hidden-artifact-icon {
  font-size: 13px;
  opacity: 0.4;
  flex-shrink: 0;
}

.hidden-artifact-label {
  font-weight: normal;
  color: var(--text-faint);
}

.unhide-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  padding: 2px 6px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.unhide-btn:hover {
  border-color: var(--special-text);
  color: var(--special-text);
  background-color: var(--button-mouseover);
}

:deep(.results-container),
:deep(.tab-content),
:deep(.sql-view),
:deep(.result-table),
:deep(.table-container) {
  background: transparent;
}

:deep(.results-container) {
  border: 0 !important;
  box-shadow: none !important;
}

:deep(.tabulator) {
  border-top: 0 !important;
  border-right: 0 !important;
  border-bottom: 0 !important;
  border-left: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}

:deep(.tabs) {
  min-height: 22px;
  height: 22px;
  padding: 0 8px;
}

:deep(.tab-content) {
  background: transparent !important;
}

:deep(.result-table-flush .tabulator) {
  border-left: 0 !important;
  border-right: 0 !important;
  border-bottom: 0 !important;
  border-radius: 0 !important;
}

:deep(.result-table-flush .tabulator .tabulator-footer) {
  box-shadow: none !important;
}

:deep(.markdown-content p) {
  margin: 0 0 10px;
  line-height: 1.55;
}

:deep(.markdown-content h1),
:deep(.markdown-content h2),
:deep(.markdown-content h3),
:deep(.markdown-content h4) {
  margin-top: 0;
  margin-bottom: 10px;
}

:deep(.markdown-content ul),
:deep(.markdown-content ol) {
  margin: 0 0 10px 18px;
}
</style>
