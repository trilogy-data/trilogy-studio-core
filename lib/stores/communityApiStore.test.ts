import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useCommunityApiStore from './communityApiStore'

const createLocalStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem(key: string) {
      return store[key] || null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

describe('communityApiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
    vi.unstubAllGlobals()
  })

  it('hydrates a matching generic store token from the URL when no token is set', () => {
    const store = useCommunityApiStore()

    localStorage.setItem(
      'trilogy-community-stores',
      JSON.stringify([
        {
          type: 'generic',
          id: 'localhost:8100',
          name: 'Local Store',
          baseUrl: 'http://localhost:8100',
        },
      ]),
    )

    window.history.pushState({}, '', '/?store=http%3A%2F%2Flocalhost%3A8100&token=abc123')

    store.loadStoresFromStorage()

    const hydratedStore = store.stores.find((item) => item.id === 'localhost:8100')
    expect(hydratedStore?.type).toBe('generic')
    expect(hydratedStore && 'token' in hydratedStore ? hydratedStore.token : undefined).toBe(
      'abc123',
    )
  })

  it('does not overwrite an existing in-memory generic store token from the URL', () => {
    const store = useCommunityApiStore()

    localStorage.setItem(
      'trilogy-community-stores',
      JSON.stringify([
        {
          type: 'generic',
          id: 'localhost:8100',
          name: 'Local Store',
          baseUrl: 'http://localhost:8100',
          token: 'persisted-token',
        },
      ]),
    )

    window.history.pushState({}, '', '/?store=http%3A%2F%2Flocalhost%3A8100&token=abc123')

    store.loadStoresFromStorage()

    const hydratedStore = store.stores.find((item) => item.id === 'localhost:8100')
    expect(hydratedStore?.type).toBe('generic')
    expect(hydratedStore && 'token' in hydratedStore ? hydratedStore.token : undefined).toBe(
      'persisted-token',
    )
  })

  it('preserves an existing in-memory generic store token and name when reloading from storage', () => {
    const store = useCommunityApiStore()

    localStorage.setItem(
      'trilogy-community-stores',
      JSON.stringify([
        {
          type: 'generic',
          id: 'localhost:8100',
          name: 'Persisted Store Name',
          baseUrl: 'http://localhost:8100',
        },
      ]),
    )

    store.stores = [
      {
        type: 'generic',
        id: 'localhost:8100',
        name: 'Imported Model Name',
        baseUrl: 'http://localhost:8100',
        token: 'live-token',
      },
    ]

    store.loadStoresFromStorage()

    const hydratedStore = store.stores.find((item) => item.id === 'localhost:8100')
    expect(hydratedStore?.type).toBe('generic')
    expect(hydratedStore?.name).toBe('Imported Model Name')
    expect(hydratedStore && 'token' in hydratedStore ? hydratedStore.token : undefined).toBe(
      'live-token',
    )
  })

  it('migrates a persisted github store to a static one and rewrites storage', () => {
    const store = useCommunityApiStore()

    localStorage.setItem(
      'trilogy-community-stores',
      JSON.stringify([
        {
          type: 'github',
          id: 'acme-models-main',
          name: 'Acme',
          owner: 'acme',
          repo: 'models',
          branch: 'main',
        },
        { type: 'mystery', id: 'x' },
      ]),
    )

    store.loadStoresFromStorage()

    expect(store.stores.map((item) => item.id)).toEqual([
      'trilogy-data-trilogy-public-models-main',
      'acme-models-main',
    ])
    const migrated = store.stores[1]
    expect(migrated.type).toBe('static')
    expect(migrated.baseUrl).toBe('https://raw.githubusercontent.com/acme/models/main/studio')

    const persisted = JSON.parse(localStorage.getItem('trilogy-community-stores') || '[]')
    expect(persisted).toHaveLength(1)
    expect(persisted[0].type).toBe('static')
    expect(persisted[0].id).toBe('acme-models-main')
  })

  it('registers a static store linked with ?store=&kind=static, once', () => {
    const store = useCommunityApiStore()
    const bucket = 'https://storage.googleapis.com/trilogy_public_models/published-dev/acme/sales'

    window.history.pushState({}, '', `/?store=${encodeURIComponent(bucket)}&kind=static`)

    store.loadStoresFromStorage()
    store.loadStoresFromStorage()

    const linked = store.stores.filter((item) => item.baseUrl === bucket)
    expect(linked).toHaveLength(1)
    expect(linked[0].type).toBe('static')
    expect(JSON.parse(localStorage.getItem('trilogy-community-stores') || '[]')).toHaveLength(1)
  })

  it('does not register a store from ?store= without kind=static', () => {
    const store = useCommunityApiStore()

    window.history.pushState({}, '', '/?store=http%3A%2F%2Flocalhost%3A8100&token=abc123')

    store.loadStoresFromStorage()

    expect(store.stores.map((item) => item.id)).toEqual(['trilogy-data-trilogy-public-models-main'])
  })
})
