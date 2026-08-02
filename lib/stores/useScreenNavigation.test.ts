import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// useScreenNavigation caches a module-level singleton that reads the hash at
// construction time, so each case needs a fresh module instance.
const loadNavigation = async (hash: string) => {
  window.location.hash = hash
  vi.resetModules()
  setActivePinia(createPinia())
  const module = await import('./useScreenNavigation')
  return module.default()
}

// Each case re-imports the store graph from scratch, which dominates runtime.
const TEST_TIMEOUT = 30000

describe('useScreenNavigation onInitialLoad', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
  })

  it(
    'routes a remote-backed deep link to the asset importer without import/connection params',
    async () => {
      // The URL `trilogy serve` emits (docs/studio-bundle-hosting.md): no
      // `import`, no `connection`, no `screen` — everything else comes from the
      // store's /index.json.
      const navigation = await loadNavigation(
        '#store=http%3A//localhost%3A8100&storeId=bigquery&remote=true' +
          '&assetType=trilogy&assetName=hello_world&modelName=bigquery&token=abc123',
      )

      navigation.onInitialLoad()

      expect(navigation.activeScreen.value).toBe('asset-import')
      expect(navigation.tabs.value.map((tab) => tab.screen)).toContain('asset-import')
    },
    TEST_TIMEOUT,
  )

  it(
    'still routes manifest-driven imports to the asset importer',
    async () => {
      const navigation = await loadNavigation(
        '#import=https%3A//example.com/models/sales.json&connection=duckdb' +
          '&assetType=dashboard&assetName=Q4%20Sales&modelName=SalesModel',
      )

      navigation.onInitialLoad()

      expect(navigation.activeScreen.value).toBe('asset-import')
    },
    TEST_TIMEOUT,
  )

  it(
    'does not hijack a plain remote hash with no asset to open',
    async () => {
      const navigation = await loadNavigation('#store=http%3A//localhost%3A8100&remote=true')

      navigation.onInitialLoad()

      expect(navigation.activeScreen.value).not.toBe('asset-import')
      expect(navigation.tabs.value.map((tab) => tab.screen)).not.toContain('asset-import')
    },
    TEST_TIMEOUT,
  )
})
