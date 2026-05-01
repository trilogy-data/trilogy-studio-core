import { beforeEach, describe, expect, it, vi } from 'vitest'
import RemoteStoreStorage from './remoteStoreStorage'

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

describe('RemoteStoreStorage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('loads python files into remote editors without turning them into model sources', async () => {
    const store = {
      type: 'generic' as const,
      id: 'remote-store',
      name: 'urban_forest',
      baseUrl: 'http://localhost:8100',
    }
    const communityStore = {
      stores: [store],
    } as any

    vi.mocked(fetchGenericStoreIndex).mockResolvedValue({
      name: 'urban_forest',
      models: [],
    } as any)
    vi.mocked(fetchStoreFiles).mockResolvedValue({
      directories: [
        {
          directory: '',
          files: ['core_local.preql', 'urban_loader.py'],
        },
      ],
    })
    vi.mocked(fetchStoreFileContent).mockImplementation(async (_, path: string) => {
      if (path === 'urban_loader.py') {
        return 'def datasource():\n    return "urban_forest"'
      }
      return 'datasource core_local;'
    })
    vi.mocked(fetchFromStore).mockResolvedValue({
      files: [{ engine: 'duckdb' }],
    } as any)

    const storage = new RemoteStoreStorage(communityStore)
    const snapshot = await storage.loadStore(store.id)

    const pythonEditor = Object.values(snapshot.editors).find(
      (editor) => editor.name === 'urban_loader.py',
    )
    expect(pythonEditor).toBeDefined()
    expect(pythonEditor?.type).toBe('python')
    expect(pythonEditor?.tags).toEqual([])
    expect(pythonEditor?.remotePersisted).toBe(true)

    const model = snapshot.models.urban_forest
    expect(model.sources).toHaveLength(1)
    expect(model.sources[0].alias).toBe('core_local')
  })

  it('builds a real DuckDB connection when index.json declares a duck_db runtime', async () => {
    const store = {
      type: 'generic' as const,
      id: 'remote-store',
      name: 'urban_forest',
      baseUrl: 'http://localhost:8100',
    }
    const communityStore = { stores: [store] } as any

    // Wire value matches pytrilogy `Dialects.DUCK_DB` — the client remaps
    // this to an in-browser DuckDBConnection.
    vi.mocked(fetchGenericStoreIndex).mockResolvedValue({
      name: 'urban_forest',
      connection: { type: 'duck_db', options: {} },
      models: [],
    } as any)
    vi.mocked(fetchStoreFiles).mockResolvedValue({
      directories: [{ directory: '', files: ['core.preql'] }],
    })
    vi.mocked(fetchStoreFileContent).mockResolvedValue('datasource core;')

    const storage = new RemoteStoreStorage(communityStore)
    const snapshot = await storage.loadStore(store.id)

    const conn = Object.values(snapshot.connections)[0]
    expect(conn).toBeDefined()
    expect(conn.type).toBe('duckdb')
    expect(conn.storage).toBe('remote')
    expect(conn.model).toBe('urban_forest')
    expect(conn.id).toBe('remote:remote-store:urban_forest-connection')
    // fetchFromStore should NOT be consulted when a runtime connection is advertised.
    expect(fetchFromStore).not.toHaveBeenCalled()
  })

  it('tags editors listed in index.json startup_scripts with STARTUP_SCRIPT', async () => {
    const store = {
      type: 'generic' as const,
      id: 'remote-store',
      name: 'urban_forest',
      baseUrl: 'http://localhost:8100',
    }
    const communityStore = { stores: [store] } as any

    vi.mocked(fetchGenericStoreIndex).mockResolvedValue({
      name: 'urban_forest',
      connection: { type: 'duck_db', options: {} },
      models: [],
      // Server-resolved posix paths, relative to the store root. The client
      // matches these verbatim against editor remotePath.
      startup_scripts: ['setup.sql', 'bootstrap.preql'],
    } as any)
    vi.mocked(fetchStoreFiles).mockResolvedValue({
      directories: [
        {
          directory: '',
          files: ['setup.sql', 'bootstrap.preql', 'core.preql', 'helpers.py'],
        },
      ],
    })
    vi.mocked(fetchStoreFileContent).mockImplementation(async (_, path: string) => `-- ${path}`)

    const storage = new RemoteStoreStorage(communityStore)
    const snapshot = await storage.loadStore(store.id)

    const bySqlName = (name: string) =>
      Object.values(snapshot.editors).find((editor) => editor.name === name)

    const setupSql = bySqlName('setup.sql')
    expect(setupSql).toBeDefined()
    expect(setupSql?.tags).toContain('startup_script')
    // SQL files don't carry the SOURCE tag.
    expect(setupSql?.tags).not.toContain('source')

    const bootstrap = bySqlName('bootstrap.preql')
    expect(bootstrap).toBeDefined()
    // Trilogy files keep SOURCE and additionally pick up STARTUP_SCRIPT.
    expect(bootstrap?.tags).toEqual(expect.arrayContaining(['source', 'startup_script']))

    const core = bySqlName('core.preql')
    expect(core?.tags).toEqual(['source'])

    const helpers = bySqlName('helpers.py')
    expect(helpers?.tags).toEqual([])
  })

  it('falls back to RemoteProjectConnection when index.json has no connection block', async () => {
    const store = {
      type: 'generic' as const,
      id: 'remote-store',
      name: 'urban_forest',
      baseUrl: 'http://localhost:8100',
    }
    const communityStore = { stores: [store] } as any

    vi.mocked(fetchGenericStoreIndex).mockResolvedValue({
      name: 'urban_forest',
      models: [],
    } as any)
    vi.mocked(fetchStoreFiles).mockResolvedValue({
      directories: [{ directory: '', files: ['core.preql'] }],
    })
    vi.mocked(fetchStoreFileContent).mockResolvedValue('datasource core;')
    vi.mocked(fetchFromStore).mockResolvedValue({
      files: [{ engine: 'duckdb' }],
    } as any)

    const storage = new RemoteStoreStorage(communityStore)
    const snapshot = await storage.loadStore(store.id)

    const conn = Object.values(snapshot.connections)[0]
    expect(conn).toBeDefined()
    expect(conn.type).toBe('remote')
    expect(conn.storage).toBe('remote')
  })
})
