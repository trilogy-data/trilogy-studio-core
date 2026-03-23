import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useEditorStore from '../stores/editorStore'
import useModelConfigStore from '../stores/modelStore'
import { useDashboardStore } from '../stores/dashboardStore'
import { ModelImportService } from './helpers'

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

describe('ModelImportService', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('uses component names for remote editor paths and keeps imported remote editors persisted', async () => {
    const editorStore = useEditorStore()
    const modelStore = useModelConfigStore()
    const dashboardStore = useDashboardStore()
    modelStore.newModelConfig('urban_forest', true)

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)

      if (url === 'http://localhost:8100/models/data.json') {
        return jsonResponse({
          components: [
            {
              url: 'http://localhost:8100/files/core_local.preql',
              name: 'core_local',
              alias: '',
              purpose: 'source',
              type: 'trilogy',
            },
            {
              url: 'http://localhost:8100/files/raw-boston-boston_landmarks.preql',
              name: 'raw/boston/boston_landmarks',
              alias: '',
              purpose: 'source',
              type: 'trilogy',
            },
          ],
        })
      }

      if (url === 'http://localhost:8100/files/core_local.preql') {
        return new Response('datasource core_local;')
      }

      if (url === 'http://localhost:8100/files/raw-boston-boston_landmarks.preql') {
        return new Response('datasource boston_landmarks;')
      }

      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new ModelImportService(editorStore, modelStore, dashboardStore)
    const imports = await service.importModel(
      'urban_forest',
      'http://localhost:8100/models/data.json',
      'urban_forest-connection',
      {
        token: 'abc123',
        remote: true,
        remoteStoreId: 'localhost:8100',
        remoteBaseUrl: 'http://localhost:8100',
      },
    )

    expect(imports?.trilogy.get('core_local')).toBe('core_local.preql')
    expect(imports?.trilogy.get('raw/boston/boston_landmarks')).toBe(
      'raw/boston/boston_landmarks.preql',
    )

    const coreEditor = editorStore.getEditorByName('core_local.preql')
    const nestedEditor = editorStore.getEditorByName('raw/boston/boston_landmarks.preql')

    expect(coreEditor?.remotePath).toBe('core_local.preql')
    expect(coreEditor?.remotePersisted).toBe(true)
    expect(coreEditor?.changed).toBe(false)

    expect(nestedEditor?.remotePath).toBe('raw/boston/boston_landmarks.preql')
    expect(nestedEditor?.remotePersisted).toBe(true)
    expect(nestedEditor?.changed).toBe(false)
  })
})
