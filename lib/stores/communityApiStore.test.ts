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
})
