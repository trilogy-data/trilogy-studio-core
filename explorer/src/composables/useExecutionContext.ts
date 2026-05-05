import { onMounted, watch } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import { TrilogyResolver, QueryExecutionService } from '@lib/stores'
import useUserSettingsStore from '@lib/stores/userSettingsStore'
import useConnectionStore from '@lib/stores/connectionStore'

export type { QueryExecutionService } from '@lib/stores'

/**
 * Bootstraps the runtime context that powers tool execution AND lib's
 * Editor.vue. Produces real instances synchronously so they can be
 * `provide()`d at App.vue setup time. Async work (loading persisted
 * settings + connections) runs in onMounted.
 */
export interface ExecutionContext {
  queryExecutionService: QueryExecutionService
  trilogyResolver: TrilogyResolver
}

export function useExecutionContext(prefix = 'explorer:'): ExecutionContext {
  const settingsStore = useUserSettingsStore()
  const connectionStore = useConnectionStore()
  const storage = new LocalStorage(prefix)

  // Resolver reads its URL out of settingsStore at call time — the empty
  // string before onMounted load is fine because no one calls .validate()
  // until the user types something.
  const trilogyResolver = new TrilogyResolver(settingsStore)
  const queryExecutionService = new QueryExecutionService(trilogyResolver, connectionStore, false)

  onMounted(async () => {
    settingsStore.loadSettings()
    if (!settingsStore.settings.trilogyResolver) {
      settingsStore.settings.trilogyResolver = settingsStore.defaults.trilogyResolver
    }

    const loaded = await storage.loadConnections()
    for (const conn of Object.values(loaded)) {
      if (!connectionStore.connections[conn.id]) {
        connectionStore.addConnection(conn)
      }
    }
  })

  let flushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => connectionStore.connections,
    () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        const dirty = Object.values(connectionStore.connections).filter(
          (conn) => conn.changed || conn.deleted,
        )
        if (dirty.length === 0) return
        storage
          .saveConnections(dirty)
          .then(() => connectionStore.purgeDeletedConnections())
          .catch((e) => console.error('saveConnections failed', e))
      }, 250)
    },
    { deep: true },
  )

  return {
    queryExecutionService,
    trilogyResolver,
  }
}
