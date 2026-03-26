<template>
  <div
    ref="chartContainer"
    class="chart-placeholder no-drag"
    :class="{ 'chart-placeholder-edit-mode': editMode }"
    @mouseenter="onChartMouseEnter"
    @mouseleave="onChartMouseLeave"
  >
    <drilldown-pane
      v-if="activeDrilldown"
      :drilldown-remove="activeDrilldown.remove"
      :drilldown-filter="activeDrilldown.filter"
      @close="activeDrilldown = null"
      :symbols="symbols"
      @submit="submitDrilldown"
    />
    <ErrorMessage
      v-else-if="error && !loading"
      class="chart-placeholder"
      :details="error"
      :query="query"
      :filters="filters"
    />
    <VegaLiteChart
      v-else-if="results && ready && !loading"
      :id="`${itemId}-${dashboardId}`"
      :columns="results.headers"
      :data="results.data"
      :showControls="editMode"
      :initialConfig="chartConfig"
      :containerHeight="chartHeight"
      :container-width="chartWidth"
      :onChartConfigChange="onChartConfigChange"
      :chartSelection
      :chartTitle
      :drilldown-active="hasDrilldown"
      @dimension-click="handleDimensionClick"
      @background-click="handleBackgroundClick"
      @refresh-click="handleLocalRefresh"
      @drilldown-click="activateDrilldown"
      @revert-drilldown="revertDrilldown"
    />
    <div v-if="loading && showLoading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="Loading"></LoadingView>
    </div>
    <div
      v-if="!editMode || !(results && ready)"
      class="controls-toggle"
      :class="{ 'controls-visible': controlsVisible }"
    >
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Refresh table"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
      <button
        @click="revertDrilldown"
        class="control-btn"
        data-testid="refresh-chart-btn"
        title="Clear Drilldown"
      >
        <i class="mdi mdi-undo icon"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
//      v-if="!loading && editMode &&
import { defineComponent, inject, computed, ref, type PropType } from 'vue'
import type { ChartConfig } from '../../editors/results'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import ErrorMessage from '../ErrorMessage.vue'
import VegaLiteChart from '../VegaLiteChart.vue'
import LoadingView from '../LoadingView.vue'
import DrilldownPane from '../DrilldownPane.vue'
import { type GridItemDataResponse, type DimensionClick } from '../../dashboards/base'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import { objectToSqlExpression } from '../../dashboards/conditions'
import type { CompletionItem } from '../../stores/resolver'
import { useDashboardItemShell } from './useDashboardItemShell'
export interface Drilldown {
  remove: string
  filter: string
}

export default defineComponent({
  name: 'DashboardChart',
  components: {
    VegaLiteChart,
    ErrorMessage,
    LoadingView,
    DrilldownPane,
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
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => void>,
      required: true,
      default: () => ({ type: 'CHART', content: '' }),
    },
    editMode: {
      type: Boolean,
      required: true,
    },
    symbols: {
      type: Array as PropType<CompletionItem[]>,
      required: true,
    },
    getDashboardQueryExecutor: {
      type: Function as PropType<(dashboardId: string) => DashboardQueryExecutor>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const activeDrilldown = ref<Drilldown | null>(null)

    const itemData = computed(() => {
      return props.getItemData(props.itemId, props.dashboardId)
    })

    const query = computed(() => {
      return itemData.value.structured_content.query
    })

    const results = computed(() => {
      return itemData.value.results || null
    })

    const chartTitle = computed(() => {
      return itemData.value.name || ''
    })

    const chartHeight = computed(() => {
      return (itemData.value.height || 300) - 75
    })

    const chartWidth = computed(() => {
      return itemData.value.width || 300
    })

    const chartConfig = computed((): ChartConfig | undefined => {
      if (!itemData.value.chartConfig) return undefined
      return {
        ...(itemData.value.chartConfig as ChartConfig),
        showTitle: false,
      }
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

    const chartSelection = computed(() => {
      return (itemData.value.chartFilters || []).map((filter) => filter.value)
    })

    const hasDrilldown = computed(() => {
      return itemData.value.hasDrilldown
    })

    const onRefresh = computed(() => {
      return itemData.value.onRefresh || null
    })

    const analyticsStore: AnalyticsStoreType | null = inject<AnalyticsStoreType | null>(
      'analyticsStore',
      null,
    )

    const onChartConfigChange = (chartConfig: ChartConfig) => {
      const nextChartConfig = {
        ...chartConfig,
        showTitle: false,
      }

      if (hasDrilldown.value) {
        props.setItemData(props.itemId, props.dashboardId, {
          drilldownChartConfig: nextChartConfig,
        })
        return
      }
      props.setItemData(props.itemId, props.dashboardId, { chartConfig: nextChartConfig })
    }

    const {
      chartContainer,
      ready,
      showLoading,
      controlsVisible,
      executeQuery,
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
      analyticsEvent: 'dashboard-chart-execution',
      analyticsType: 'CHART',
      loadingDelayMs: 250,
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

    // Drilldown methods - matching ResultsContainer pattern
    const activateDrilldown = (e: any) => {
      let filters = e.filters
      // remove is keys of e.filters
      let remove = Object.keys(filters)[0]

      let filterString = objectToSqlExpression(e.filters)
      if (!remove) {
        return
      }
      activeDrilldown.value = { remove, filter: filterString }
    }

    const revertDrilldown = async () => {
      props.setItemData(props.itemId, props.dashboardId, {
        drilldown: null,
        drilldownChartConfig: null,
        loading: true,
      })
      await executeQuery()
    }

    const submitDrilldown = async (selected: string[]) => {
      let executor = props.getDashboardQueryExecutor(props.dashboardId)
      let newQuery = await executor.createDrilldownQuery(
        query.value,
        selected,
        activeDrilldown.value!.remove,
        activeDrilldown.value!.filter,
        itemData.value.rootContent || [],
        (itemData.value.imports || []).map((imp) => ({ name: imp.name, alias: imp.alias })),
      )
      props.setItemData(props.itemId, props.dashboardId, {
        drilldown: newQuery,
        drilldownChartConfig: null,
        loading: true,
      })
      ready.value = false
      showLoading.value = true
      activeDrilldown.value = null
      await executeQuery()
        .then(() => {
          ready.value = true
        })
        .catch((error) => {
          console.error('Error executing drilldown query:', error)
          ready.value = true
        })
        .finally(() => {
          showLoading.value = false
        })
    }
    return {
      chartContainer,
      results,
      ready,
      loading,
      showLoading,
      error,
      filters,
      query,
      chartHeight,
      chartWidth,
      chartConfig,
      chartTitle,
      onChartConfigChange,
      onRefresh,
      handleLocalRefresh,
      chartSelection,
      startTime,
      handleDimensionClick,
      handleBackgroundClick,
      activeDrilldown,
      activateDrilldown,
      submitDrilldown,
      controlsVisible,
      onChartMouseEnter,
      onChartMouseLeave,
      revertDrilldown,
      hasDrilldown,
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
  justify-content: center;
  align-items: center;
  /* padding: 5px; */
  color: var(--dashboard-helper-text);
  position: relative;
  overflow-y: hidden;
  padding-top: 0;
  background: transparent;
}

.chart-query {
  font-family: monospace;
  font-size: 12px;
  margin-top: 10px;
  padding: 8px;
  background-color: var(--bg-color);
  border: 1px var(--border);
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-actions {
  position: absolute;
  bottom: 10px;
  right: 10px;
  z-index: 5;
}

.chart-refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: var(--button-bg, #f5f5f5);
  border: 1px solid var(--border-light, #ddd);
  color: var(--text-color, #333);
  cursor: pointer;
  opacity: 0.7;
  transition:
    opacity 0.2s,
    background-color 0.2s;
}

.chart-refresh-button:hover {
  opacity: 1;
  background-color: var(--button-hover-bg, #e0e0e0);
}

.refresh-icon {
  font-size: 16px;
  font-weight: bold;
}

.chart-placeholder-edit-mode {
  padding-top: 0;
}
</style>
