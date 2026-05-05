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

  let flushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => store.editors,
    () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        const dirty = Object.values(store.editors).filter((e) => e.changed || e.deleted)
        if (dirty.length === 0) return
        storage.saveEditors(dirty).catch((e) => console.error('saveEditors failed', e))
        for (const ed of dirty) {
          if (ed.deleted) delete store.editors[ed.id]
        }
      }, 250)
    },
    { deep: true },
  )

  return { storage }
}
