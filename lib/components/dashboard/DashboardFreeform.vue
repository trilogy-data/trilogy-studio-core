<template>
  <div
    ref="chartContainer"
    class="freeform-placeholder no-drag"
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

    <div v-else-if="!html" class="freeform-empty">
      No widget content yet. Use the edit button to author HTML for this cell.
    </div>

    <template v-else>
      <iframe
        ref="frameRef"
        class="freeform-frame"
        :class="{ 'freeform-frame-hidden': !!widgetFailure }"
        :sandbox="FREEFORM_SANDBOX"
        :srcdoc="srcdoc"
        :title="widgetTitle"
        referrerpolicy="no-referrer"
        allow=""
        :style="frameStyle"
      ></iframe>

      <div v-if="widgetFailure" class="freeform-failure">
        <i class="mdi mdi-alert-circle-outline"></i>
        <div class="freeform-failure-text">{{ widgetFailure }}</div>
        <button class="freeform-retry" data-testid="freeform-retry-btn" @click="reloadWidget">
          Reload widget
        </button>
      </div>
    </template>

    <div v-if="loading && showLoading" class="loading-overlay">
      <LoadingView :startTime="startTime" text="" subtle />
    </div>

    <div class="controls-toggle" :class="{ 'controls-visible': controlsVisible }">
      <button
        @click="handleLocalRefresh"
        class="control-btn"
        data-testid="refresh-freeform-btn"
        title="Refresh widget data"
      >
        <i class="mdi mdi-refresh icon"></i>
      </button>
      <button
        @click="reloadWidget"
        class="control-btn"
        data-testid="reload-freeform-btn"
        title="Reload widget"
      >
        <i class="mdi mdi-reload icon"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type PropType,
} from 'vue'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingView from '../LoadingView.vue'
import { type GridItemDataResponse } from '../../dashboards/base'
import type { DashboardQueryExecutor } from '../../dashboards/dashboardQueryExecutor'
import type { AnalyticsStoreType } from '../../stores/analyticsStore'
import type { CompletionItem } from '../../stores/resolver'
import type { CrossFilterChartMap, CrossFilterValueMap } from '../../dashboards/crossFilters'
import { useDashboardItemShell } from './useDashboardItemShell'
import { FreeformBridge } from '../../dashboards/freeform/bridge'
import { buildFreeformSrcdoc, FREEFORM_SANDBOX } from '../../dashboards/freeform/buildSrcdoc'
import {
  buildFreeformState,
  resolveFilterFieldAddresses,
} from '../../dashboards/freeform/protocol'
import { FREEFORM_READY_TIMEOUT_MS, type GuestFilterMessage } from '../../dashboards/freeform/types'
import { buildWidgetTheme } from '../../dashboards/freeform/theme'
import { useResolvedThemeMode } from '../../embed/config'
import type { UserSettingsStoreType } from '../../stores/userSettingsStore'

export default defineComponent({
  name: 'DashboardFreeform',
  components: { ErrorMessage, LoadingView },
  props: {
    dashboardId: { type: String, required: true },
    itemId: { type: String, required: true },
    getItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string) => GridItemDataResponse>,
      required: true,
    },
    setItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string, content: any) => void>,
      required: true,
    },
    editMode: { type: Boolean, required: true },
    symbols: { type: Array as PropType<CompletionItem[]>, required: true },
    getDashboardQueryExecutor: {
      type: Function as PropType<(dashboardId: string) => DashboardQueryExecutor>,
      required: true,
    },
  },
  emits: ['dimension-click', 'background-click'],
  setup(props, { emit }) {
    const frameRef = ref<HTMLIFrameElement | null>(null)
    const widgetFailure = ref<string | null>(null)
    const requestedHeight = ref<number | null>(null)
    /** Bumped to force a fresh frame + bridge (author edit, or manual reload). */
    const frameGeneration = ref(0)

    let bridge: FreeformBridge | null = null
    let readyTimer: ReturnType<typeof setTimeout> | null = null

    const itemData = computed(() => props.getItemData(props.itemId, props.dashboardId))
    const freeformData = computed(() => itemData.value.freeformData || null)
    const html = computed(() => freeformData.value?.html || '')
    const query = computed(() => itemData.value.structured_content?.query || '')
    const results = computed(() => itemData.value.results || null)
    const loading = computed(() => itemData.value.loading || false)
    const error = computed(() => itemData.value.error || null)
    const filters = computed(() => itemData.value.filters || [])
    const startTime = computed(() => itemData.value.loadStartTime || null)
    const onRefresh = computed(() => itemData.value.onRefresh || null)
    const widgetTitle = computed(() => itemData.value.name || 'Custom widget')

    const analyticsStore: AnalyticsStoreType | null = inject<AnalyticsStoreType | null>(
      'analyticsStore',
      null,
    )

    const settingsStore = inject<UserSettingsStoreType | null>('userSettingsStore', null)
    const themeMode = useResolvedThemeMode(settingsStore)

    const {
      chartContainer,
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
      analyticsEvent: 'dashboard-freeform-execution',
      analyticsType: 'FREEFORM',
      loadingDelayMs: 250,
    })

    /** Resolve the widget theme contract against this cell, so a widget picks up
     *  whatever the surrounding dashboard actually renders with. */
    function readTheme() {
      return buildWidgetTheme({ mode: themeMode.value, element: chartContainer.value })
    }

    const srcdoc = computed(() => {
      if (!html.value) return ''
      // frameGeneration is read so a reload rebuilds an identical string into a
      // fresh document rather than being deduplicated by Vue.
      void frameGeneration.value
      // Depending on the mode means a fresh frame is built with the right
      // variables inline — no flash of the wrong theme before the first push.
      void themeMode.value
      return buildFreeformSrcdoc({ html: html.value, theme: readTheme() })
    })

    const frameStyle = computed(() =>
      requestedHeight.value ? { height: `${requestedHeight.value}px` } : undefined,
    )

    function pushState(): void {
      if (!bridge) return
      bridge.postState(
        buildFreeformState({
          status: loading.value ? 'loading' : error.value ? 'error' : 'ready',
          results: results.value,
          filters: filters.value,
          error: error.value,
        }),
      )
    }

    function clearReadyTimer(): void {
      if (readyTimer) {
        clearTimeout(readyTimer)
        readyTimer = null
      }
    }

    /** A widget that never calls ready() is broken or hung. Surface it rather
     *  than leaving a blank cell — the frame stays mounted so its own console
     *  errors remain inspectable in devtools. */
    function startReadyTimer(): void {
      clearReadyTimer()
      readyTimer = setTimeout(() => {
        if (!bridge?.connected || widgetFailure.value) return
        widgetFailure.value = 'Widget did not finish loading.'
      }, FREEFORM_READY_TIMEOUT_MS)
    }

    function handleGuestFilter(message: GuestFilterMessage): void {
      if (message.mode === 'clear') {
        emit('background-click')
        return
      }

      // Values are already validated as typed CrossFilterEntry objects; the
      // dashboard then checks each field against the concept allowlist before
      // any SQL is built. A widget can express nothing a chart click can't.
      // Column names are resolved to concept addresses first, so widgets can
      // use the names they rendered instead of namespace-qualified addresses.
      const resolved = resolveFilterFieldAddresses(message.filters, results.value)

      const chart: CrossFilterChartMap = {}
      for (const [field, entry] of Object.entries(resolved)) {
        if (entry.op === 'eq') chart[field] = entry.value
        else if (entry.op === 'in') chart[field] = entry.value
      }

      emit('dimension-click', {
        source: props.itemId,
        filters: resolved as CrossFilterValueMap,
        chart,
        append: message.mode === 'append',
      })
    }

    function teardownBridge(): void {
      clearReadyTimer()
      bridge?.destroy()
      bridge = null
    }

    function setupBridge(): void {
      teardownBridge()
      const frame = frameRef.value
      if (!frame) return

      widgetFailure.value = null
      bridge = new FreeformBridge({
        itemId: props.itemId,
        editMode: props.editMode,
        onReady: () => {
          clearReadyTimer()
          widgetFailure.value = null
        },
        onFilter: handleGuestFilter,
        onRefresh: () => handleLocalRefresh(),
        onResize: (height) => {
          requestedHeight.value = height
        },
        onLog: (level, message) => {
          const prefix = `[widget ${props.itemId}]`
          if (level === 'error') console.error(prefix, message)
          else if (level === 'warn') console.warn(prefix, message)
          else console.log(prefix, message)
        },
      })
      bridge.attach(frame)
      bridge.postTheme(readTheme())
      pushState()
      startReadyTimer()
    }

    function reloadWidget(): void {
      requestedHeight.value = null
      frameGeneration.value += 1
    }

    // A new srcdoc means a new document, which means the old port is dead.
    watch(
      [srcdoc, frameRef],
      ([nextSrcdoc, frame]) => {
        if (!nextSrcdoc || !frame) {
          teardownBridge()
          return
        }
        setupBridge()
      },
      { immediate: true, flush: 'post' },
    )

    watch([results, loading, error, filters], () => pushState())

    // Push the theme on mode flips. The host CSS variables change with the
    // root class, so read them after the DOM has settled.
    watch(themeMode, async () => {
      await nextTick()
      bridge?.postTheme(readTheme())
    })

    onBeforeUnmount(teardownBridge)

    return {
      chartContainer,
      frameRef,
      srcdoc,
      frameStyle,
      html,
      query,
      filters,
      loading,
      showLoading,
      error,
      startTime,
      controlsVisible,
      widgetFailure,
      widgetTitle,
      handleLocalRefresh,
      onChartMouseEnter,
      onChartMouseLeave,
      reloadWidget,
      FREEFORM_SANDBOX,
    }
  },
})
</script>

<style scoped src="./dashboardItemShell.css"></style>
<style scoped>
.freeform-placeholder {
  flex: 1;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: auto;
  background: transparent;
  color: var(--dashboard-helper-text);
}

.freeform-frame {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  border: 0;
  display: block;
  background: transparent;
  color-scheme: normal;
}

.freeform-frame-hidden {
  visibility: hidden;
}

.freeform-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  font-size: 13px;
}

.freeform-failure {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color);
  background: var(--dashboard-background, var(--bg-color));
}

.freeform-failure .mdi {
  font-size: 22px;
  color: var(--delete-color, #dc2626);
}

.freeform-failure-text {
  max-width: 320px;
}

.freeform-retry {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--button-bg-color, transparent);
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
}

.freeform-retry:hover {
  border-color: var(--special-text);
  color: var(--special-text);
}
</style>
