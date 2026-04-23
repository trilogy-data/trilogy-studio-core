import RemoteStoreStorage from '../data/remoteStoreStorage'
import { buildGenericStoreModelName } from './genericStoreMetadata'
import type { GenericModelStore } from './models'
import useCommunityApiStore from '../stores/communityApiStore'
import useModelConfigStore from '../stores/modelStore'
import useEditorStore from '../stores/editorStore'

const inFlight = new Map<string, Promise<boolean>>()

// Lazily reloads a remote-sourced model (and its editors) from a registered
// generic store when it's missing from the in-memory stores — e.g. after a
// page refresh, because remote models aren't persisted to localStorage.
export async function rehydrateRemoteModel(modelName: string): Promise<boolean> {
  const modelStore = useModelConfigStore()
  if (modelStore.models[modelName]) {
    return true
  }

  const existing = inFlight.get(modelName)
  if (existing) {
    return existing
  }

  const communityStore = useCommunityApiStore()
  if (communityStore.stores.length <= 1) {
    // Only the default GitHub store is present — pull any user-registered
    // stores from localStorage before searching.
    communityStore.loadStoresFromStorage()
  }

  const matchingStore = communityStore.stores.find(
    (s): s is GenericModelStore =>
      s.type === 'generic' && buildGenericStoreModelName(s) === modelName,
  )
  if (!matchingStore) {
    return false
  }

  const promise = (async () => {
    try {
      const storage = new RemoteStoreStorage(communityStore)
      const snapshot = await storage.loadStore(matchingStore.id)

      const editorStore = useEditorStore()
      for (const editor of Object.values(snapshot.editors)) {
        if (!editorStore.editors[editor.id]) {
          editorStore.addEditor(editor)
        }
      }
      for (const model of Object.values(snapshot.models)) {
        if (!modelStore.models[model.name]) {
          modelStore.addModelConfig(model)
        }
      }
      return !!modelStore.models[modelName]
    } catch (err) {
      console.warn(`Failed to rehydrate remote model "${modelName}":`, err)
      return false
    } finally {
      inFlight.delete(modelName)
    }
  })()

  inFlight.set(modelName, promise)
  return promise
}
