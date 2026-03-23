import { beforeEach, describe, expect, it, vi } from 'vitest'
import RemoteStoreStorage from './remoteStoreStorage'

vi.mock('../remotes/storeService', () => ({
  fetchFromStore: vi.fn(),
}))

vi.mock('../remotes/jobsService', () => ({
  fetchStoreFiles: vi.fn(),
  fetchStoreFileContent: vi.fn(),
  createStoreFile: vi.fn(),
  updateStoreFile: vi.fn(),
  deleteStoreFile: vi.fn(),
}))

import { fetchFromStore } from '../remotes/storeService'
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
})
