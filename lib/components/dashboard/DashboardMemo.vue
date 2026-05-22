<template>
  <div class="memo-card no-drag" :class="`verdict-${verdict}`">
    <ErrorMessage
      v-if="error && !loading"
      :compact="true"
      :details="error"
      :query="query"
      :filters="filters"
    />
    <template v-else-if="ready">
      <div class="memo-banner">
        <span class="memo-eyebrow">Executive Memo</span>
        <span class="verdict-chip" :title="verdictTitle">{{ verdictLabel }}</span>
        <span class="confidence-chip" :title="confidenceRationale || ''">
          confidence: {{ confidence }}
        </span>
      </div>
      <h1 class="memo-headline">
        <MarkdownRenderer :markdown="headline || '_No headline yet_'" :results="results" />
      </h1>
      <div class="memo-grid">
        <div class="memo-field">
          <span class="memo-label">Magnitude</span>
          <MarkdownRenderer
            class="memo-prose"
            :markdown="magnitude || '_(not set)_'"
            :results="results"
          />
        </div>
        <div class="memo-field">
          <span class="memo-label">Likely cause</span>
          <MarkdownRenderer
            class="memo-prose"
            :markdown="cause || '_(not set)_'"
            :results="results"
          />
        </div>
        <div class="memo-field memo-action">
          <span class="memo-label">Recommended action</span>
          <MarkdownRenderer
            class="memo-prose"
            :markdown="action || '_(not set)_'"
            :results="results"
          />
        </div>
      </div>
    </template>

    <div v-if="!loading && editMode" class="controls-toggle controls-visible">
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-memo-btn"
        title="Refresh memo data"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, inject, type PropType } from 'vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import ErrorMessage from '../ErrorMessage.vue'
import type { Results } from '../../editors/results'
import type { GridItemDataResponse, MemoVerdict } from '../../dashboards/base'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import { useDashboardItemShell } from './useDashboardItemShell'

const VERDICT_LABEL: Record<MemoVerdict, string> = {
  good: 'Good',
  bad: 'Bad',
  mixed: 'Mixed',
  inconclusive: 'Inconclusive',
}

export default defineComponent({
  name: 'DashboardMemo',
  components: { MarkdownRenderer, ErrorMessage },
  props: {
    dashboardId: { type: String, required: true },
    itemId: { type: String, required: true },
    getItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string) => GridItemDataResponse>,
      required: true,
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
    },
    editMode: { type: Boolean, required: true },
    getDashboardQueryExecutor: {
      type: Function as PropType<(dashboardId: string) => DashboardQueryExecutor>,
      required: true,
    },
  },
  setup(props) {
    const itemData = computed(() => props.getItemData(props.itemId, props.dashboardId))
    const memo = computed(() => itemData.value.memoData)
    const headline = computed(() => memo.value?.headline || '')
    const verdict = computed<MemoVerdict>(() => memo.value?.verdict || 'inconclusive')
    const verdictLabel = computed(() => VERDICT_LABEL[verdict.value])
    const verdictTitle = computed(() => `Verdict: ${verdictLabel.value}`)
    const magnitude = computed(() => memo.value?.magnitude || '')
    const cause = computed(() => memo.value?.cause || '')
    const action = computed(() => memo.value?.action || '')
    const confidence = computed(() => memo.value?.confidence || 'medium')
    const confidenceRationale = computed(() => memo.value?.confidenceRationale || '')
    const query = computed(() => itemData.value.structured_content?.query || '')
    const results = computed((): Results | null => itemData.value.results || null)
    const loading = computed(() => itemData.value.loading || false)
    const error = computed(() => itemData.value.error || null)
    const filters = computed(() => itemData.value.filters || [])
    const onRefresh = computed(() => itemData.value.onRefresh || null)

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')
    if (!connectionStore) throw new Error('Connection store not found!')

    const { ready, handleLocalRefresh } = useDashboardItemShell({
      dashboardId: () => props.dashboardId,
      itemId: () => props.itemId,
      query,
      results,
      loading,
      onRefresh,
      getDashboardQueryExecutor: props.getDashboardQueryExecutor,
      analyticsStore,
      analyticsEvent: 'dashboard-memo-execution',
      analyticsType: 'MEMO',
    })

    return {
      headline,
      verdict,
      verdictLabel,
      verdictTitle,
      magnitude,
      cause,
      action,
      confidence,
      confidenceRationale,
      query,
      results,
      loading,
      error,
      filters,
      ready,
      handleLocalRefresh,
    }
  },
})
</script>

<style scoped>
.memo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 26px 24px;
  border-radius: 14px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent, #2563eb) 6%, transparent),
      color-mix(in srgb, var(--accent, #2563eb) 1%, transparent) 60%
    ),
    var(--bg, #ffffff);
  box-shadow: inset 0 0 0 1px var(--border, #d6dde6);
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.memo-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.memo-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
}

.verdict-chip,
.confidence-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.confidence-chip {
  background: rgba(100, 116, 139, 0.12);
  color: var(--muted, #475569);
}

.verdict-good .verdict-chip {
  background: rgba(16, 185, 129, 0.18);
  color: #047857;
}
.verdict-bad .verdict-chip {
  background: rgba(239, 68, 68, 0.18);
  color: #b91c1c;
}
.verdict-mixed .verdict-chip {
  background: rgba(245, 158, 11, 0.18);
  color: #b45309;
}
.verdict-inconclusive .verdict-chip {
  background: rgba(100, 116, 139, 0.16);
  color: #475569;
}

.verdict-good {
  border-left: 4px solid #10b981;
  padding-left: 22px;
}
.verdict-bad {
  border-left: 4px solid #ef4444;
  padding-left: 22px;
}
.verdict-mixed {
  border-left: 4px solid #f59e0b;
  padding-left: 22px;
}
.verdict-inconclusive {
  border-left: 4px solid #94a3b8;
  padding-left: 22px;
}

.memo-headline {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--fg, #0f172a);
}
.memo-headline :deep(p) {
  margin: 0;
}

.memo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 22px;
}

.memo-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.memo-action {
  grid-column: 1 / -1;
  padding-top: 6px;
  border-top: 1px dashed var(--border, #d6dde6);
}

.memo-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
}

.memo-prose {
  font-size: 14px;
  line-height: 1.5;
  color: var(--fg, #1f2937);
}
.memo-prose :deep(p) {
  margin: 0 0 0.4em;
}

.controls-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.controls-toggle.controls-visible {
  opacity: 0.9;
}
.control-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  cursor: pointer;
}

@media (max-width: 720px) {
  .memo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
