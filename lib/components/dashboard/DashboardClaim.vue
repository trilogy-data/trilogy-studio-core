<template>
  <div class="claim-card no-drag">
    <ErrorMessage
      v-if="error && !loading"
      :compact="true"
      :details="error"
      :query="query"
      :filters="filters"
    />
    <template v-else-if="ready">
      <div v-if="heading" class="claim-heading">
        <MarkdownRenderer :markdown="heading" :results="results" />
      </div>
      <div class="claim-body">
        <span class="claim-label">Claim</span>
        <MarkdownRenderer
          class="claim-prose claim-main"
          :markdown="claim || '_(no claim yet — set one with the report agent)_'"
          :results="results"
        />
      </div>
      <div v-if="caveat" class="claim-caveat">
        <span class="claim-label">Caveat</span>
        <MarkdownRenderer class="claim-prose" :markdown="caveat" :results="results" />
      </div>
      <div v-if="drilldown" class="claim-drilldown">
        <span class="claim-label">Next drilldown</span>
        <MarkdownRenderer class="claim-prose" :markdown="drilldown" :results="results" />
      </div>
    </template>

    <div v-if="!loading && editMode" class="controls-toggle controls-visible">
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-claim-btn"
        title="Refresh claim data"
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
import type { GridItemDataResponse } from '../../dashboards/base'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import { useDashboardItemShell } from './useDashboardItemShell'

export default defineComponent({
  name: 'DashboardClaim',
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
    const claimData = computed(() => itemData.value.claimData)
    const heading = computed(() => claimData.value?.heading || '')
    const claim = computed(() => claimData.value?.claim || '')
    const caveat = computed(() => claimData.value?.caveat || '')
    const drilldown = computed(() => claimData.value?.drilldown || '')

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
      analyticsEvent: 'dashboard-claim-execution',
      analyticsType: 'CLAIM',
    })

    return {
      heading,
      claim,
      caveat,
      drilldown,
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
.claim-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 22px;
  border-radius: 12px;
  background: var(--bg, #ffffff);
  box-shadow: inset 0 0 0 1px var(--border, #d6dde6);
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.claim-heading {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--fg, #0f172a);
}
.claim-heading :deep(p) {
  margin: 0;
}

.claim-body,
.claim-caveat,
.claim-drilldown {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.claim-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
}

.claim-prose {
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg, #1f2937);
}
.claim-prose :deep(p) {
  margin: 0 0 0.4em;
}

.claim-main {
  font-size: 15px;
  font-weight: 500;
}

.claim-caveat .claim-prose {
  color: var(--muted, #475569);
  font-style: italic;
}

.claim-drilldown {
  border-top: 1px dashed var(--border, #d6dde6);
  padding-top: 8px;
  margin-top: 4px;
}

.controls-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.controls-toggle.controls-visible {
  opacity: 0.85;
}
.control-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  cursor: pointer;
}
</style>
