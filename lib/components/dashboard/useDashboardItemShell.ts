import { onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'

interface DashboardItemShellOptions {
  dashboardId: () => string
  itemId: () => string
  query: ComputedRef<string>
  results: ComputedRef<unknown>
  loading: ComputedRef<boolean>
  onRefresh: ComputedRef<((itemId: string) => void) | null>
  getDashboardQueryExecutor: (dashboardId: string) => DashboardQueryExecutor
  analyticsStore?: AnalyticsStoreType | null
  analyticsEvent: string
  analyticsType: string
  loadingDelayMs?: number
}

export function useDashboardItemShell(options: DashboardItemShellOptions) {
  const chartContainer = ref<HTMLElement | null>(null)
  const ready = ref(false)
  const currentQueryId = ref<string | null>(null)
  const showLoading = ref(false)
  const loadingTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null)
  const controlsVisible = ref(false)

  const clearLoadingTimeout = () => {
    if (loadingTimeoutId.value) {
      clearTimeout(loadingTimeoutId.value)
      loadingTimeoutId.value = null
    }
  }

  const getPositionBasedDelay = () => {
    if (!chartContainer.value) return 0

    const rect = chartContainer.value.getBoundingClientRect()
    const scrollY = window.scrollY || document.documentElement.scrollTop
    const absoluteTop = rect.top + scrollY
    const delay = Math.floor(absoluteTop / 200) * 10

    return Math.min(delay, 100)
  }

  onMounted(() => {
    setTimeout(() => {
      const delay = getPositionBasedDelay()

      if (!options.results.value) {
        ready.value = true
        return
      }

      setTimeout(() => {
        ready.value = true
      }, delay)
    }, 0)
  })

  onUnmounted(() => {
    clearLoadingTimeout()
  })

  watch(
    options.loading,
    (newLoading) => {
      clearLoadingTimeout()

      if (newLoading) {
        loadingTimeoutId.value = setTimeout(() => {
          showLoading.value = true
          loadingTimeoutId.value = null
        }, options.loadingDelayMs ?? 150)
        return
      }

      showLoading.value = false
    },
    { immediate: true },
  )

  const executeQuery = async (): Promise<void> => {
    if (!options.query.value) return

    const dashboardId = options.dashboardId()
    const itemId = options.itemId()
    const dashboardQueryExecutor = options.getDashboardQueryExecutor(dashboardId)
    if (!dashboardQueryExecutor) {
      throw new Error('Dashboard query executor not found!')
    }

    try {
      options.analyticsStore?.log(options.analyticsEvent, options.analyticsType, true)

      if (currentQueryId.value) {
        dashboardQueryExecutor.cancelQuery(currentQueryId.value)
      }

      currentQueryId.value = await dashboardQueryExecutor.runSingle(itemId)
      await dashboardQueryExecutor.waitForQuery(currentQueryId.value)
    } catch (err) {
      console.error('Error setting up query:', err)
      currentQueryId.value = null
    }
  }

  const handleLocalRefresh = () => {
    const onRefresh = options.onRefresh.value
    if (onRefresh) {
      onRefresh(options.itemId())
      return
    }

    void executeQuery()
  }

  const onChartMouseEnter = () => {
    controlsVisible.value = true
  }

  const onChartMouseLeave = () => {
    controlsVisible.value = false
  }

  return {
    chartContainer,
    ready,
    showLoading,
    controlsVisible,
    executeQuery,
    handleLocalRefresh,
    onChartMouseEnter,
    onChartMouseLeave,
  }
}
