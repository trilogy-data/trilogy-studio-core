import { onMounted, ref, watch, type Ref } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import { useProjectStore } from '@lib/stores/projectStore'

/**
 * Wires the project store to a host storage adapter. In the browser/dev
 * shell that's lib's LocalStorage (IndexedDB-backed). When explorer becomes
 * a Tauri app we'll swap in a Tauri-backed AbstractStorage subclass without
 * touching the store or any consumer.
 *
 * This is the host-adapter principle in practice: lib defines the contract,
 * explorer chooses the implementation.
 *
 * Returns a `ready` signal so callers can sequence work that depends on
 * projects being hydrated (e.g. orphan-subchat reconciliation needs both
 * project and chat stores loaded before it can decide what to prune).
 */
export function useProjectPersistence(
  prefix = 'explorer:',
): { storage: LocalStorage; ready: Ref<boolean> } {
  const store = useProjectStore()
  const storage = new LocalStorage(prefix)
  const ready = ref(false)

  onMounted(async () => {
    const loaded = await storage.loadProjects()
    if (Object.keys(loaded).length > 0) {
      store.setProjects(loaded)
    }
    ready.value = true
  })

  // Debounce with a max-wait cap. See useChatPersistence for the rationale —
  // the same starvation can happen here in principle (rapid project edits),
  // and using the same pattern keeps behavior consistent across stores.
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let firstDirtyAt: number | null = null
  const IDLE_MS = 250
  const MAX_WAIT_MS = 2000
  watch(
    () => store.projects,
    () => {
      if (firstDirtyAt === null) firstDirtyAt = Date.now()
      if (flushTimer) clearTimeout(flushTimer)
      const sinceFirst = Date.now() - firstDirtyAt
      const wait = Math.max(0, Math.min(IDLE_MS, MAX_WAIT_MS - sinceFirst))
      flushTimer = setTimeout(() => {
        flushTimer = null
        firstDirtyAt = null
        const dirty = Object.values(store.projects).filter((p) => p.changed || p.deleted)
        if (dirty.length === 0) return
        storage.saveProjects(dirty).catch((e) => console.error('saveProjects failed', e))
        // Drop tombstones once persisted so the local store reflects deletes.
        for (const p of dirty) {
          if (p.deleted) delete store.projects[p.id]
        }
      }, wait)
    },
    { deep: true },
  )

  return { storage, ready }
}
