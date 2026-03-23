import { describe, expect, it, vi } from 'vitest'
import { removeRemoteStoreFromIde, syncRemoteStoreIntoIde } from './remoteStoreSync'

describe('remoteStoreSync', () => {
  it('hydrates editors, connections, and models from the remote storage snapshot', async () => {
    const editor = { id: 'remote:store-a:core.preql' }
    const connection = { name: 'Project A' }
    const model = { name: 'Project A' }
    const remoteStorage = {
      loadStore: vi.fn().mockResolvedValue({
        editors: { [editor.id]: editor },
        connections: { [connection.name]: connection },
        models: { [model.name]: model },
      }),
    } as any
    const editorStore = { addEditor: vi.fn(), editors: {} } as any
    const connectionStore = { addConnection: vi.fn(), connections: {} } as any
    const modelStore = { addModelConfig: vi.fn(), models: {} } as any

    await syncRemoteStoreIntoIde(remoteStorage, 'store-a', editorStore, connectionStore, modelStore)

    expect(remoteStorage.loadStore).toHaveBeenCalledWith('store-a')
    expect(editorStore.addEditor).toHaveBeenCalledWith(editor)
    expect(connectionStore.addConnection).toHaveBeenCalledWith(connection)
    expect(modelStore.addModelConfig).toHaveBeenCalledWith(model)
  })

  it('removes only the IDE objects owned by the specified remote store', () => {
    const editorStore = {
      editors: {
        'remote:store-a:core.preql': {
          storage: 'remote',
          remoteStoreId: 'store-a',
        },
        'remote:store-b:core.preql': {
          storage: 'remote',
          remoteStoreId: 'store-b',
        },
        local: {
          storage: 'local',
          remoteStoreId: null,
        },
      },
    } as any
    const connectionStore = {
      connections: {
        'Project A': {
          storage: 'remote',
          remoteStoreId: 'store-a',
        },
        'Project B': {
          storage: 'remote',
          remoteStoreId: 'store-b',
        },
        Local: {
          storage: 'local',
        },
      },
    } as any
    const modelStore = {
      models: {
        'Project A': {
          storage: 'remote',
          sources: [{ editor: 'remote:store-a:core.preql' }],
        },
        'Project B': {
          storage: 'remote',
          sources: [{ editor: 'remote:store-b:core.preql' }],
        },
        Local: {
          storage: 'local',
          sources: [{ editor: 'local' }],
        },
      },
    } as any

    removeRemoteStoreFromIde('store-a', editorStore, connectionStore, modelStore)

    expect(editorStore.editors['remote:store-a:core.preql']).toBeUndefined()
    expect(editorStore.editors['remote:store-b:core.preql']).toBeDefined()
    expect(editorStore.editors.local).toBeDefined()

    expect(connectionStore.connections['Project A']).toBeUndefined()
    expect(connectionStore.connections['Project B']).toBeDefined()
    expect(connectionStore.connections.Local).toBeDefined()

    expect(modelStore.models['Project A']).toBeUndefined()
    expect(modelStore.models['Project B']).toBeDefined()
    expect(modelStore.models.Local).toBeDefined()
  })
})
