import type RemoteStoreStorage from '../data/remoteStoreStorage'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ModelConfigStoreType } from '../stores/modelStore'

export const syncRemoteStoreIntoIde = async (
  remoteStorage: RemoteStoreStorage,
  storeId: string,
  editorStore: EditorStoreType,
  connectionStore: ConnectionStoreType,
  modelStore: ModelConfigStoreType,
): Promise<void> => {
  const snapshot = await remoteStorage.loadStore(storeId)

  Object.values(snapshot.editors).forEach((editor) => {
    editorStore.addEditor(editor)
  })

  Object.values(snapshot.connections).forEach((connection) => {
    connectionStore.addConnection(connection)
  })

  Object.values(snapshot.models).forEach((model) => {
    modelStore.addModelConfig(model)
  })
}

export const removeRemoteStoreFromIde = (
  storeId: string,
  editorStore: EditorStoreType,
  connectionStore: ConnectionStoreType,
  modelStore: ModelConfigStoreType,
): void => {
  const editorPrefix = `remote:${storeId}:`

  Object.entries(editorStore.editors).forEach(([editorId, editor]) => {
    if (editor.storage === 'remote' && editor.remoteStoreId === storeId) {
      delete editorStore.editors[editorId]
    }
  })

  Object.entries(connectionStore.connections).forEach(([connectionName, connection]) => {
    const remoteConnection = connection as typeof connection & { remoteStoreId?: string | null }
    if (connection.storage === 'remote' && remoteConnection.remoteStoreId === storeId) {
      delete connectionStore.connections[connectionName]
    }
  })

  Object.entries(modelStore.models).forEach(([modelName, model]) => {
    if (
      model.storage === 'remote' &&
      model.sources.some((source) => source.editor.startsWith(editorPrefix))
    ) {
      delete modelStore.models[modelName]
    }
  })
}
