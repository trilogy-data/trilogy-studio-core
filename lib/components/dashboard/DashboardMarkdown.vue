<template>
  <div
    ref="chartContainer"
    class="chart-placeholder no-drag"
    :class="{ 'chart-placeholder-edit-mode': editMode }"
    @mouseenter="onChartMouseEnter"
    @mouseleave="onChartMouseLeave"
  >
    <ErrorMessage
      v-if="error && !loading"
      :compact="true"
      :details="error"
      :query="query"
      :filters="filters"
    />

    <MarkdownRenderer
      v-else-if="ready"
      :markdown="markdown"
      :results="results"
      :loading="loading"
    />

    <div
      v-if="!loading && editMode"
      class="controls-toggle"
      :class="{ 'controls-visible': controlsVisible }"
    >
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Refresh text"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, computed, type PropType } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { Results } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { type GridItemDataResponse } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import { useDashboardItemShell } from './useDashboardItemShell'

export default defineComponent({
  name: 'DynamicMarkdownChart',
  components: {
    ErrorMessage,
    MarkdownRenderer,
  },
  props: {
    dashboardId: {
      type: String,
      required: true,
    },
    itemId: {
      type: String,
      required: true,
    },
    getItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string) => GridItemDataResponse>,
      required: true,
      default: () => ({ type: 'MARKDOWN', content: { markdown: '', query: '' } }),
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
      default: () => ({ type: 'MARKDOWN', content: { markdown: '', query: '' } }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    getDashboardQueryExecutor: {
      type: Function as PropType<(dashboardId: string) => DashboardQueryExecutor>,
      required: true,
    },
  },
  setup(props) {
    const itemData = computed(() => props.getItemData(props.itemId, props.dashboardId))

    const contentData = computed(() => {
      return itemData.value.structured_content || { markdown: '', query: '' }
    })

    const markdown = computed(() => {
      return contentData.value.markdown || ''
    })

    const query = computed(() => {
      return contentData.value.query || ''
    })

    const results = computed((): Results | null => {
      return itemData.value.results || null
    })

    const loading = computed(() => {
      return itemData.value.loading || false
    })

    const error = computed(() => {
      return itemData.value.error || null
    })

    const filters = computed(() => {
      return itemData.value.filters || []
    })

    const startTime = computed(() => {
      return itemData.value.loadStartTime || null
    })

    const onRefresh = computed(() => {
      return itemData.value.onRefresh || null
    })

    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')

    if (!connectionStore) {
      throw new Error('Connection store not found!')
    }

    const {
      chartContainer,
      ready,
      controlsVisible,
      handleLocalRefresh,
      onChartMouseEnter,
      onChartMouseLeave,
    } = useDashboardItemShell({
      dashboardId: () => props.dashboardId,
      itemId: () => props.itemId,
      query,
      results,
      loading,
      onRefresh,
      getDashboardQueryExecutor: props.getDashboardQueryExecutor,
      analyticsStore,
      analyticsEvent: 'dashboard-markdown-execution',
      analyticsType: 'MARKDOWN',
    })

    return {
      chartContainer,
      results,
      ready,
      loading,
      error,
      filters,
      query,
      markdown,
      handleLocalRefresh,
      startTime,
      controlsVisible,
      onChartMouseEnter,
      onChartMouseLeave,
    }
  },
})
</script>

<style scoped src="./dashboardItemShell.css"></style>
<style scoped>
.chart-placeholder {
  flex: 1;
  height: 100%;
  padding-top: 5px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  position: relative;
  overflow-y: hidden;
}

.chart-placeholder :deep(.markdown-content) {
  padding: 2px 18px 14px;
}

.chart-placeholder :deep(.rendered-markdown) {
  font-size: var(--helper-font-size);
  line-height: 1.75;
  color: var(--dashboard-helper-text);
}

.chart-placeholder :deep(.rendered-markdown h1),
.chart-placeholder :deep(.rendered-markdown-h2),
.chart-placeholder :deep(.rendered-markdown-h3) {
  color: var(--text-color);
}

.chart-placeholder :deep(.rendered-markdown h1) {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0.35em;
  font-size: var(--section-title-font-size);
}

.chart-placeholder :deep(.rendered-markdown-h2) {
  font-size: 15px;
}

.chart-placeholder :deep(.rendered-markdown-h3) {
  font-size: 14px;
}

.chart-placeholder :deep(.rendered-markdown pre.code-block) {
  border: 1px solid var(--markdown-code-border);
  background-color: var(--markdown-code-bg);
}

.chart-placeholder :deep(.rendered-markdown pre.code-block code) {
  background: transparent;
}

/* Mobile responsiveness - always show controls on mobile */
@media (max-width: 768px) {
  .controls-toggle {
    opacity: 1;
    visibility: visible;
  }

  .control-btn {
    width: 32px;
    height: 32px;
  }
}
</style>
