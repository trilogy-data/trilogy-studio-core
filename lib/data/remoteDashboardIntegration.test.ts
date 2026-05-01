import { beforeEach, describe, expect, it, vi } from 'vitest'
import RemoteStoreStorage from './remoteStoreStorage'
import { syncRemoteStoreIntoIde } from '../remotes/remoteStoreSync'
import { buildGenericStoreConnectionName } from '../remotes/genericStoreMetadata'
import { isTrilogyType } from '../editors/fileTypes'

vi.mock('../remotes/storeService', () => ({
  fetchFromStore: vi.fn(),
  fetchGenericStoreIndex: vi.fn(),
}))

vi.mock('../remotes/jobsService', () => ({
  fetchStoreFiles: vi.fn(),
  fetchStoreFileContent: vi.fn(),
  createStoreFile: vi.fn(),
  updateStoreFile: vi.fn(),
  deleteStoreFile: vi.fn(),
}))

import { fetchFromStore, fetchGenericStoreIndex } from '../remotes/storeService'
import { fetchStoreFileContent, fetchStoreFiles } from '../remotes/jobsService'

// Reproduces the user-reported failure: loading a live faa-demo-shaped store
// and then asking for dashboard-eligible imports returns nothing.
describe('remote store → dashboard eligible imports', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('exposes remote preql editors as eligible imports against the generated connection', async () => {
    const store = {
      type: 'generic' as const,
      id: 'localhost:8100',
      name: 'faa-demo',
      baseUrl: 'http://localhost:8100',
    }
    const communityStore = { stores: [store] } as any

    // Mirrors the shape the user's mock server returns
    vi.mocked(fetchGenericStoreIndex).mockResolvedValue({
      name: 'Trilogy Models - faa-demo',
      project_name: null,
      connection: null,
      models: [{ name: 'faa-demo', url: 'http://localhost:8100/models/faa-demo.json' }],
    } as any)

    vi.mocked(fetchStoreFiles).mockResolvedValue({
      directories: [
        {
          directory: '',
          files: ['aircraft.preql', 'aircraft_model.preql', 'airport.preql', 'setup.sql'],
        },
      ],
    })

    vi.mocked(fetchStoreFileContent).mockImplementation(async (_, path: string) => `-- ${path}`)

    vi.mocked(fetchFromStore).mockResolvedValue({
      files: [{ engine: 'duck_db' }],
    } as any)

    // Simulate Pinia-like stores with addEditor/addConnection/addModelConfig
    const editorStore = {
      editors: {} as Record<string, any>,
      addEditor: vi.fn((e: any) => {
        editorStore.editors[e.id] = e
      }),
    } as any
    const connectionStore = {
      connections: {} as Record<string, any>,
      addConnection: vi.fn((c: any) => {
        connectionStore.connections[c.name] = c
      }),
    } as any
    const modelStore = {
      models: {} as Record<string, any>,
      addModelConfig: vi.fn((m: any) => {
        modelStore.models[m.name] = m
      }),
    } as any

    const storage = new RemoteStoreStorage(communityStore)
    await syncRemoteStoreIntoIde(storage, store.id, editorStore, connectionStore, modelStore)

    const runtimeConnectionName = buildGenericStoreConnectionName(store)
    // Sanity: connection name matches what AssetAutoImporter will use, and
    // matches the `${modelName}-connection` convention of the manifest path so
    // both flows land editors on the same connection.
    expect(runtimeConnectionName).toBe('faa-demo-connection')

    // Connection appears in the store with model set (required to show in
    // dashboard creator's connection dropdown)
    const connection = connectionStore.connections[runtimeConnectionName]
    expect(connection).toBeDefined()
    expect(connection.model).toBe('faa-demo')

    // The dashboard's availableImports filter is:
    //   editor.connection === selectedConnection && isTrilogyType(editor.type)
    const eligibleImports = Object.values(editorStore.editors as Record<string, any>).filter(
      (editor) => editor.connection === runtimeConnectionName && isTrilogyType(editor.type),
    )

    // Diagnostic: print what we actually see
    // eslint-disable-next-line no-console
    console.log(
      'editors:',
      Object.values(editorStore.editors as Record<string, any>).map((e: any) => ({
        name: e.name,
        connection: e.connection,
        type: e.type,
        deleted: e.deleted,
      })),
    )

    expect(eligibleImports.length).toBeGreaterThan(0)
    // aircraft.preql should be one of them
    expect(eligibleImports.some((e: any) => e.name === 'aircraft.preql')).toBe(true)
  })
})
