import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useEditorStore from '../stores/editorStore'
import useModelConfigStore from '../stores/modelStore'
import { useDashboardStore } from '../stores/dashboardStore'
import useConnectionStore from '../stores/connectionStore'
import { DashboardModel } from '../dashboards'
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
            {
              url: 'http://localhost:8100/files/raw-boston-boston_loader.py',
              name: 'raw/boston/boston_loader',
              alias: '',
              purpose: 'source',
              type: 'python',
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

      if (url === 'http://localhost:8100/files/raw-boston-boston_loader.py') {
        return new Response('def datasource():\n    return "boston"')
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

    // ImportOutput maps now contain editor ids (namespaced for remote stores)
    // instead of plain editor names — callers can index editorStore.editors
    // directly without an ambiguous name scan.
    expect(imports?.trilogy.get('core_local')).toBe('remote:localhost:8100:core_local.preql')
    expect(imports?.trilogy.get('raw/boston/boston_landmarks')).toBe(
      'remote:localhost:8100:raw%2Fboston%2Fboston_landmarks.preql',
    )
    expect(imports?.python.get('raw/boston/boston_loader')).toBe(
      'remote:localhost:8100:raw%2Fboston%2Fboston_loader.py',
    )

    const coreEditor = editorStore.getEditorByName('core_local.preql')
    const nestedEditor = editorStore.getEditorByName('raw/boston/boston_landmarks.preql')
    const pythonEditor = editorStore.getEditorByName('raw/boston/boston_loader.py')

    expect(coreEditor?.remotePath).toBe('core_local.preql')
    expect(coreEditor?.remotePersisted).toBe(true)
    expect(coreEditor?.changed).toBe(false)

    expect(nestedEditor?.remotePath).toBe('raw/boston/boston_landmarks.preql')
    expect(nestedEditor?.remotePersisted).toBe(true)
    expect(nestedEditor?.changed).toBe(false)

    expect(pythonEditor?.remotePath).toBe('raw/boston/boston_loader.py')
    expect(pythonEditor?.remotePersisted).toBe(true)
    expect(pythonEditor?.changed).toBe(false)
  })
})

/**
 * The manifest import is the other writer of a model's contents, and it lands
 * on whichever model a connection is bound to. These cover the local (non
 * remote-store) path end to end: manifest -> editors -> model sources ->
 * whatever getConnectionSources hands the query executor.
 */
describe('ModelImportService - local manifest import', () => {
  const MANIFEST_URL = 'http://example.com/models/manifest.json'

  const dashboardContent = (name: string, importName: string) =>
    JSON.stringify(
      new DashboardModel({
        id: 'placeholder',
        name,
        connection: 'ignored-on-import',
        connectionId: 'ignored-on-import',
        imports: [{ id: 'stale-id-from-export', name: importName, alias: importName }],
        gridItems: {},
      }).serialize(),
    )

  const stubManifest = (components: unknown[], files: Record<string, string>) => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) {
        return jsonResponse({ components })
      }
      if (url in files) {
        return new Response(files[url])
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const buildService = () =>
    new ModelImportService(useEditorStore(), useModelConfigStore(), useDashboardStore())

  it('makes only trilogy components model sources, keyed by alias', async () => {
    const modelStore = useModelConfigStore()
    const editorStore = useEditorStore()
    modelStore.newModelConfig('sales', true)
    stubManifest(
      [
        {
          url: 'http://example.com/core.preql',
          name: 'core',
          alias: 'core_alias',
          purpose: 'source',
          type: 'trilogy',
        },
        {
          url: 'http://example.com/setup.sql',
          name: 'setup',
          alias: '',
          purpose: 'setup',
          type: 'sql',
        },
        {
          url: 'http://example.com/loader.py',
          name: 'loader',
          alias: '',
          purpose: 'source',
          type: 'python',
        },
        // `data` components are payloads, not code, and are dropped upstream.
        { url: 'http://example.com/rows.csv', name: 'rows', alias: '', purpose: 'data' },
      ],
      {
        'http://example.com/core.preql': 'const one <- 1;',
        'http://example.com/setup.sql': 'create table t as select 1;',
        'http://example.com/loader.py': 'def load(): pass',
      },
    )

    const output = await buildService().importModel('sales', MANIFEST_URL, 'sales-connection')

    const model = modelStore.models['sales']
    expect(model.sources.map((source) => source.alias)).toEqual(['core_alias'])
    expect(model.storage).toBe('local')
    expect(model.changed).toBe(true)
    expect(editorStore.editors[model.sources[0].editor].contents).toBe('const one <- 1;')

    // The sql/python components still become editors, just not model sources.
    expect(output?.sql.get('setup')).toBeDefined()
    expect(output?.python.get('loader')).toBeDefined()
    expect(output?.trilogy.get('rows')).toBeUndefined()
  })

  it('feeds the connection bound to the imported model', async () => {
    const connectionStore = useConnectionStore()
    const connection = connectionStore.newConnection('sales-connection', 'duckdb', {})
    connection.setModel('sales')
    useModelConfigStore().newModelConfig('sales', true)
    stubManifest(
      [
        {
          url: 'http://example.com/core.preql',
          name: 'core',
          alias: 'core',
          purpose: 'source',
          type: 'trilogy',
        },
      ],
      { 'http://example.com/core.preql': 'const one <- 1;' },
    )

    await buildService().importModel('sales', MANIFEST_URL, 'sales-connection')

    // The whole point of the binding: an import has to show up in the sources
    // the query executor sends, with no reconnect in between.
    expect(connectionStore.getConnectionSources(connection.id)).toEqual([
      { alias: 'core', contents: 'const one <- 1;' },
    ])
  })

  it('updates the existing editor on re-import instead of duplicating it', async () => {
    const modelStore = useModelConfigStore()
    const editorStore = useEditorStore()
    modelStore.newModelConfig('sales', true)
    const component = {
      url: 'http://example.com/core.preql',
      name: 'core',
      alias: 'core',
      purpose: 'source',
      type: 'trilogy',
    }

    stubManifest([component], { 'http://example.com/core.preql': 'const one <- 1;' })
    const first = await buildService().importModel('sales', MANIFEST_URL, 'sales-connection')

    stubManifest([component], { 'http://example.com/core.preql': 'const two <- 2;' })
    const second = await buildService().importModel('sales', MANIFEST_URL, 'sales-connection')

    expect(second?.trilogy.get('core')).toBe(first?.trilogy.get('core'))
    expect(Object.keys(editorStore.editors)).toHaveLength(1)
    expect(editorStore.editors[second!.trilogy.get('core')!].contents).toBe('const two <- 2;')
    expect(modelStore.models['sales'].sources).toHaveLength(1)
  })

  it('binds imported dashboards to the connection and rewrites stale import ids', async () => {
    const dashboardStore = useDashboardStore()
    useModelConfigStore().newModelConfig('sales', true)
    stubManifest(
      [
        {
          url: 'http://example.com/core.preql',
          name: 'core',
          alias: 'core',
          purpose: 'source',
          type: 'trilogy',
        },
        {
          url: 'http://example.com/overview.json',
          name: 'overview',
          alias: '',
          purpose: 'source',
          type: 'dashboard',
        },
      ],
      {
        'http://example.com/core.preql': 'const one <- 1;',
        'http://example.com/overview.json': dashboardContent('Overview', 'core'),
      },
    )

    const output = await buildService().importModel('sales', MANIFEST_URL, 'sales-connection')

    const dashboard = dashboardStore.dashboards[output!.dashboards.get('overview')!]
    expect(dashboard.connection).toBe('sales-connection')
    expect(dashboard.connectionId).toBe('local:sales-connection')
    expect(dashboard.storage).toBe('local')
    expect(dashboard.state).toBe('published')
    // The exported id refers to the author's editor; it has to be re-resolved
    // against the editors this import just created or the dashboard runs blind.
    expect(dashboard.imports[0].id).toBe(output!.trilogy.get('core'))
  })

  it('keeps importing when a single component fetch fails', async () => {
    const modelStore = useModelConfigStore()
    const editorStore = useEditorStore()
    modelStore.newModelConfig('sales', true)
    stubManifest(
      [
        {
          url: 'http://example.com/core.preql',
          name: 'core',
          alias: 'core',
          purpose: 'source',
          type: 'trilogy',
        },
        {
          url: 'http://example.com/missing.preql',
          name: 'missing',
          alias: 'missing',
          purpose: 'source',
          type: 'trilogy',
        },
      ],
      { 'http://example.com/core.preql': 'const one <- 1;' },
    )

    const output = await buildService().importModel('sales', MANIFEST_URL, 'sales-connection')

    // The reachable component still lands intact...
    expect(editorStore.editors[output!.trilogy.get('core')!].contents).toBe('const one <- 1;')
    // ...and the failed one becomes a placeholder source rather than aborting
    // the import. Note the empty fetch result is backfilled with Editor's
    // per-type starter content, so a broken manifest entry reaches the model as
    // a runnable stub, not as an obvious blank.
    expect(modelStore.models['sales'].sources.map((s) => s.alias)).toEqual(['core', 'missing'])
    expect(editorStore.editors[output!.trilogy.get('missing')!].contents).toBe('SELECT 1 -> echo;')
  })

  it('throws when the manifest itself cannot be fetched or parsed', async () => {
    useModelConfigStore().newModelConfig('sales', true)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )
    await expect(
      buildService().importModel('sales', MANIFEST_URL, 'sales-connection'),
    ).rejects.toThrow(/Failed to import model definition/)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>not json</html>')),
    )
    await expect(
      buildService().importModel('sales', MANIFEST_URL, 'sales-connection'),
    ).rejects.toThrow(/Failed to import model definition/)
  })

  it('is a no-op without an import address', async () => {
    useModelConfigStore().newModelConfig('sales', true)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(buildService().importModel('sales', '', 'sales-connection')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
