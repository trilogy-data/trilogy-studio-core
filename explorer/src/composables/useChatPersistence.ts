import { onMounted, ref, watch, type Ref } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import useChatStore from '@lib/stores/chatStore'

/**
 * Wires chatStore to a host storage adapter. Same shape as
 * useProjectPersistence — load on mount, debounced flush of dirty chats.
 *
 * Returns a `ready` signal so callers can avoid racing against the async
 * load. Specifically: explorer's overseer-singleton bootstrap waits for
 * this to flip true before deciding whether to create a fresh overseer
 * (otherwise a load completion would wipe a just-created singleton).
 */
export function useChatPersistence(
  prefix = 'explorer:',
): { storage: LocalStorage; ready: Ref<boolean> } {
  const store = useChatStore()
  const storage = new LocalStorage(prefix)
  const ready = ref(false)

  onMounted(async () => {
    const loaded = await storage.loadChats()
    // Merge rather than replace: anything already in the store (e.g. the
    // overseer singleton if the watcher beat us to it) wins over the
    // disk copy for the same id. Non-conflicting ids load normally.
    for (const [id, chat] of Object.entries(loaded)) {
      if (!store.chats[id]) {
        store.chats[id] = chat
      }
    }
    ready.value = true
  })

  // Debounce with a max-wait cap. A pure debounce gets starved during long
  // streams: every token mutation re-triggers the deep watcher and resets
  // the timer, so the idle window never opens and nothing reaches disk
  // until streaming stops. The cap forces a flush at most MAX_WAIT_MS after
  // the first dirty mutation, bounding crash data loss.
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let firstDirtyAt: number | null = null
  const IDLE_MS = 250
  const MAX_WAIT_MS = 2000
  watch(
    () => store.chats,
    () => {
      if (firstDirtyAt === null) firstDirtyAt = Date.now()
      if (flushTimer) clearTimeout(flushTimer)
      const sinceFirst = Date.now() - firstDirtyAt
      const wait = Math.max(0, Math.min(IDLE_MS, MAX_WAIT_MS - sinceFirst))
      flushTimer = setTimeout(() => {
        flushTimer = null
        firstDirtyAt = null
        const dirty = Object.values(store.chats).filter((c) => c.changed || c.deleted)
        if (dirty.length === 0) return
        storage.saveChats(dirty).catch((e) => console.error('saveChats failed', e))
        for (const c of dirty) {
          if (c.deleted) delete store.chats[c.id]
        }
      }, wait)
    },
    { deep: true },
  )

  return { storage, ready }
}
