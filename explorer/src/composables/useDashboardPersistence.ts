import { onMounted, ref, watch, type Ref } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import { useDashboardStore } from '@lib/stores/dashboardStore'

/**
 * Wires dashboardStore to a host storage adapter. Mirrors
 * useChatPersistence — load on mount, debounced flush of dirty dashboards.
 *
 * Reports and free-form dashboards are the same model under the hood (a
 * Dashboard with `layoutType` flipping the renderer), so a single persistence
 * channel covers both.
 */
export function useDashboardPersistence(prefix = 'explorer:'): {
  storage: LocalStorage
  ready: Ref<boolean>
} {
  const store = useDashboardStore()
  const storage = new LocalStorage(prefix)
  const ready = ref(false)

  onMounted(async () => {
    const loaded = await storage.loadDashboards()
    for (const [id, dashboard] of Object.entries(loaded)) {
      if (!store.dashboards[id]) {
        store.dashboards[id] = dashboard
      }
    }
    ready.value = true
  })

  // Debounce with a max-wait cap so long agent-authoring sessions still
  // flush periodically. Same shape as useChatPersistence.
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let firstDirtyAt: number | null = null
  const IDLE_MS = 250
  const MAX_WAIT_MS = 2000
  watch(
    () => store.dashboards,
    () => {
      if (firstDirtyAt === null) firstDirtyAt = Date.now()
      if (flushTimer) clearTimeout(flushTimer)
      const sinceFirst = Date.now() - firstDirtyAt
      const wait = Math.max(0, Math.min(IDLE_MS, MAX_WAIT_MS - sinceFirst))
      flushTimer = setTimeout(() => {
        flushTimer = null
        firstDirtyAt = null
        const dirty = Object.values(store.dashboards).filter((d) => d.changed || d.deleted)
        if (dirty.length === 0) return
        storage.saveDashboards(dirty).catch((e) => console.error('saveDashboards failed', e))
        for (const d of dirty) {
          if (d.deleted) delete store.dashboards[d.id]
        }
      }, wait)
    },
    { deep: true },
  )

  return { storage, ready }
}
