import { onMounted, watch } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import useEditorStore from '@lib/stores/editorStore'

/**
 * Mirrors useProjectPersistence / useChatPersistence: load editors on
 * mount, debounce-flush dirty editors. Editors are the universal file
 * abstraction — projects reference them by id, never own content directly.
 */
export function useEditorPersistence(prefix = 'explorer:') {
  const store = useEditorStore()
  const storage = new LocalStorage(prefix)

  onMounted(async () => {
    const loaded = await storage.loadEditors()
    if (Object.keys(loaded).length > 0) {
      store.editors = loaded
    }
  })

  // Debounce with a max-wait cap. See useChatPersistence for the rationale —
  // rapid edits to a file (typing, paste storms) would otherwise reset the
  // idle timer indefinitely and leave nothing on disk if the tab crashes.
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let firstDirtyAt: number | null = null
  const IDLE_MS = 250
  const MAX_WAIT_MS = 2000
  watch(
    () => store.editors,
    () => {
      if (firstDirtyAt === null) firstDirtyAt = Date.now()
      if (flushTimer) clearTimeout(flushTimer)
      const sinceFirst = Date.now() - firstDirtyAt
      const wait = Math.max(0, Math.min(IDLE_MS, MAX_WAIT_MS - sinceFirst))
      flushTimer = setTimeout(() => {
        flushTimer = null
        firstDirtyAt = null
        const dirty = Object.values(store.editors).filter((e) => e.changed || e.deleted)
        if (dirty.length === 0) return
        storage.saveEditors(dirty).catch((e) => console.error('saveEditors failed', e))
        for (const ed of dirty) {
          if (ed.deleted) delete store.editors[ed.id]
        }
      }, wait)
    },
    { deep: true },
  )

  return { storage }
}
