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

describe('useScreenNavigation sidebar screen', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
  })

  it(
    'keeps the sidebar list when the active tab has no sidebar of its own',
    async () => {
      // Every list in Sidebar.vue is v-shown on activeSidebarScreen, so '' is
      // not a neutral value — it empties the sidebar column entirely. Closing
      // the last editor tab activates the welcome tab, which is exactly how
      // deleting a few editors used to make the editor list vanish.
      const navigation = await loadNavigation('')
      navigation.openTab('welcome', 'Welcome', 'welcome')
      navigation.openTab('editors', null, 'my-editor')
      expect(navigation.activeSidebarScreen.value).toBe('editors')

      navigation.closeTab(null, 'my-editor')

      expect(navigation.tabs.value.map((tab) => tab.screen)).toEqual(['welcome'])
      expect(navigation.activeSidebarScreen.value).toBe('editors')
    },
    TEST_TIMEOUT,
  )

  it(
    'still follows the active tab between screens that do have a sidebar',
    async () => {
      const navigation = await loadNavigation('')
      navigation.openTab('editors', null, 'my-editor')
      navigation.openTab('connections', null, 'local:duckdb')

      expect(navigation.activeSidebarScreen.value).toBe('connections')
    },
    TEST_TIMEOUT,
  )
})
