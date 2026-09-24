import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFromStaticStore,
  fetchFromStore,
  normalizeStaticIndex,
  resolveComponentUrls,
} from './storeService'
import {
  buildGithubStaticStore,
  buildUrlStaticStore,
  describeStoreOrigin,
  githubBaseUrl,
  migrateLegacyStore,
} from './staticStorePresets'
import { DEFAULT_STATIC_STORE } from './models'
import { fetchWithBackoff } from './modelApiService'

vi.mock('./modelApiService', () => ({
  fetchWithBackoff: vi.fn(),
}))

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const BUCKET = 'https://storage.googleapis.com/trilogy_public_models/published-dev/acme/sales'

describe('normalizeStaticIndex', () => {
  it('resolves relative model urls against the index document', () => {
    const index = normalizeStaticIndex(
      {
        contract: { kind: 'static', version: 1 },
        name: 'Acme sales',
        updated_at: '2026-09-24T12:00:00Z',
        generation: 3,
        models: [{ name: 'sales', url: 'v3/model.json', engine: 'bigquery', tags: ['retail'] }],
      },
      `${BUCKET}/index.json`,
    )

    expect(index.name).toBe('Acme sales')
    expect(index.updated_at).toBe('2026-09-24T12:00:00Z')
    expect(index.generation).toBe(3)
    expect(index.models).toEqual([
      { name: 'sales', url: `${BUCKET}/v3/model.json`, engine: 'bigquery', tags: ['retail'] },
    ])
  })

  it('passes absolute model urls through unchanged', () => {
    const index = normalizeStaticIndex(
      { models: [{ name: 'a', url: 'https://cdn.example.com/a.json' }] },
      `${BUCKET}/index.json`,
    )
    expect(index.models[0].url).toBe('https://cdn.example.com/a.json')
  })

  it('normalizes the legacy public-models {count, files} shape', () => {
    const index = normalizeStaticIndex(
      {
        count: 3,
        files: [
          { filename: 'mbta.json', name: 'mbta', engine: 'duckdb', description: 'Transit' },
          { filename: 'no_name.json' },
          { filename: 'README.md' },
        ],
      },
      'https://trilogy-data.github.io/trilogy-public-models/studio/index.json',
    )

    expect(index.models).toEqual([
      {
        name: 'mbta',
        url: 'https://trilogy-data.github.io/trilogy-public-models/studio/mbta.json',
        engine: 'duckdb',
        description: 'Transit',
        tags: undefined,
      },
      {
        name: 'no_name',
        url: 'https://trilogy-data.github.io/trilogy-public-models/studio/no_name.json',
        engine: undefined,
        description: undefined,
        tags: undefined,
      },
    ])
  })

  it('rejects an index with neither shape', () => {
    expect(() => normalizeStaticIndex({ name: 'x' }, `${BUCKET}/index.json`)).toThrow(
      /neither `models` nor `files`/,
    )
    expect(() => normalizeStaticIndex(null, `${BUCKET}/index.json`)).toThrow()
  })
})

describe('resolveComponentUrls', () => {
  it('resolves relative component urls against the manifest and keeps absolute ones', () => {
    const manifest = resolveComponentUrls(
      {
        components: [
          { url: 'files/routes.preql', name: 'routes' },
          { url: 'https://raw.githubusercontent.com/o/r/main/x.preql', name: 'x' },
        ],
      },
      `${BUCKET}/v3/model.json`,
    )
    expect(manifest.components.map((c) => c.url)).toEqual([
      `${BUCKET}/v3/files/routes.preql`,
      'https://raw.githubusercontent.com/o/r/main/x.preql',
    ])
  })

  it('leaves urls alone when the base is not absolute', () => {
    const manifest = resolveComponentUrls({ components: [{ url: 'a.preql' }] }, 'model.json')
    expect(manifest.components[0].url).toBe('a.preql')
  })
})

describe('static store presets', () => {
  it('derives GitHub Pages for the canonical repo and raw GitHub otherwise', () => {
    expect(githubBaseUrl('trilogy-data', 'trilogy-public-models', 'main')).toBe(
      'https://trilogy-data.github.io/trilogy-public-models/studio',
    )
    expect(githubBaseUrl('acme', 'models', 'dev')).toBe(
      'https://raw.githubusercontent.com/acme/models/dev/studio',
    )
  })

  it('keeps the default store id and baseUrl stable', () => {
    const rebuilt = buildGithubStaticStore(
      'trilogy-data',
      'trilogy-public-models',
      'main',
      'Trilogy Public Models',
    )
    expect(rebuilt).toEqual(DEFAULT_STATIC_STORE)
  })

  it('migrates a persisted github row to static, preserving its id', () => {
    const migrated = migrateLegacyStore({
      type: 'github',
      id: 'custom-id',
      name: 'My Models',
      owner: 'acme',
      repo: 'models',
      branch: 'main',
    })
    expect(migrated).toEqual({
      type: 'static',
      id: 'custom-id',
      name: 'My Models',
      baseUrl: 'https://raw.githubusercontent.com/acme/models/main/studio',
      origin: { kind: 'github', owner: 'acme', repo: 'models', branch: 'main' },
    })
  })

  it('passes current rows through and drops unknown ones', () => {
    const generic = { type: 'generic' as const, id: 'g', name: 'G', baseUrl: 'http://x' }
    expect(migrateLegacyStore(generic)).toBe(generic)
    const stat = buildUrlStaticStore(BUCKET)
    expect(migrateLegacyStore(stat)).toBe(stat)
    expect(migrateLegacyStore({ type: 'ftp' })).toBeNull()
  })

  it('builds a URL store with a stable id and hostname name', () => {
    const store = buildUrlStaticStore(`${BUCKET}/`)
    expect(store.baseUrl).toBe(BUCKET)
    expect(store.id).toBe('storage.googleapis.com-trilogy_public_models-published-dev-acme-sales')
    expect(store.name).toBe('storage.googleapis.com')
    expect(describeStoreOrigin(store)).toBe('storage.googleapis.com')
    expect(describeStoreOrigin(DEFAULT_STATIC_STORE)).toBe(
      'trilogy-data/trilogy-public-models@main',
    )
  })
})

describe('fetchFromStaticStore', () => {
  const mockedFetch = vi.mocked(fetchWithBackoff)

  afterEach(() => {
    mockedFetch.mockReset()
  })

  it('fetches the index and manifests with no auth header, resolving relative urls', async () => {
    const store = buildUrlStaticStore(BUCKET, 'Acme')
    mockedFetch.mockImplementation(async (url: string) => {
      if (url === `${BUCKET}/index.json`) {
        return jsonResponse({ models: [{ name: 'sales', url: 'v3/model.json' }] })
      }
      if (url === `${BUCKET}/v3/model.json`) {
        return jsonResponse({
          name: 'sales',
          engine: 'bigquery',
          description: 'Sales',
          components: [{ url: 'files/orders.preql', name: 'orders', type: 'trilogy' }],
        })
      }
      return jsonResponse({}, 404)
    })

    const { files, error } = await fetchFromStore(store)

    expect(error).toBeNull()
    expect(files).toHaveLength(1)
    expect(files[0].downloadUrl).toBe(`${BUCKET}/v3/model.json`)
    expect(files[0].store).toBe(store)
    expect(files[0].components[0].url).toBe(`${BUCKET}/v3/files/orders.preql`)
    for (const call of mockedFetch.mock.calls) {
      expect(call[1]).toBeUndefined()
    }
  })

  it('reports an index failure as a store error', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({}, 404))
    const { files, error } = await fetchFromStaticStore(buildUrlStaticStore(BUCKET))
    expect(files).toEqual([])
    expect(error).toMatch(/404/)
  })
})
