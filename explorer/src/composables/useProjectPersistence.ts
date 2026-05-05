import { onMounted, watch } from 'vue'
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
 */
export function useProjectPersistence(prefix = 'explorer:') {
  const store = useProjectStore()
  const storage = new LocalStorage(prefix)

  onMounted(async () => {
    const loaded = await storage.loadProjects()
    if (Object.keys(loaded).length > 0) {
      store.setProjects(loaded)
    }
  })

  // Debounced flush on any project mutation. Pinia's $subscribe fires
  // synchronously on every action, so we coalesce.
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => store.projects,
    () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        const dirty = Object.values(store.projects).filter((p) => p.changed || p.deleted)
        if (dirty.length === 0) return
        storage.saveProjects(dirty).catch((e) => console.error('saveProjects failed', e))
        // Drop tombstones once persisted so the local store reflects deletes.
        for (const p of dirty) {
          if (p.deleted) delete store.projects[p.id]
        }
      }, 250)
    },
    { deep: true },
  )

  return { storage }
}
