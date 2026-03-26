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
      class="chart-placeholder"
      :details="error"
      :query="query"
    />
    <dashboard-data-selector
      v-else-if="ready && results"
      :id="`${itemId}-${dashboardId}`"
      :headers="results.headers"
      :results="results.data"
      :containerHeight="chartHeight"
      :prettyPrint="true"
      :fitParent="true"
      @cell-click="handleDimensionClick"
      @background-click="handleBackgroundClick"
    />

    <!-- Loading overlay positioned absolutely over the entire component -->
    <div v-if="loading && showLoading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>

    <!-- <div
      v-if="!loading && editMode"
      class="controls-toggle"
      :class="{ 'controls-visible': controlsVisible }"
    >
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Refresh filter"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
    </div> -->
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, computed, type PropType } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { Results } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import DashboardDataSelector from './DashboardDataSelector.vue'
import LoadingView from '../LoadingView.vue'
import { type GridItemDataResponse, type DimensionClick } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import { useDashboardItemShell } from './useDashboardItemShell'

export default defineComponent({
  name: 'DashboardFilter',
  components: {
    DashboardDataSelector,
    ErrorMessage,
    LoadingView,
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
      default: () => ({ type: 'CHART', content: '' }),
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => null>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
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
  setup(props, { emit }) {
    const itemData = computed(() => props.getItemData(props.itemId, props.dashboardId))

    const query = computed(() => {
      return itemData.value.content
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

    const startTime = computed(() => {
      return itemData.value.loadStartTime || null
    })

    const chartHeight = computed(() => {
      return (itemData.value.height || 300) - 75
    })

    const chartWidth = computed(() => {
      return (itemData.value.width || 300) - 100
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
      showLoading,
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
      analyticsEvent: 'dashboard-filter-execution',
      analyticsType: 'FILTER',
    })

    const handleDimensionClick = (dimension: DimensionClick) => {
      emit('dimension-click', {
        source: props.itemId,
        filters: dimension.filters,
        chart: dimension.chart,
        append: dimension.append,
      })
    }

    const handleBackgroundClick = () => {
      emit('background-click')
    }

    return {
      chartContainer,
      results,
      ready,
      loading,
      showLoading,
      error,
      query,
      chartHeight,
      chartWidth,
      onRefresh,
      handleLocalRefresh,
      startTime,
      handleDimensionClick,
      handleBackgroundClick,
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
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  position: relative;
  overflow-y: hidden;
  /* padding-top:15px; */
  background-color: transparent;
  padding-top: 2px;
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
