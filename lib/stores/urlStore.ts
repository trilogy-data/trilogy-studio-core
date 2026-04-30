// Canonical list of URL hash keys. Use these constants at every call site so
// writers and readers stay in sync — past bugs came from one place writing
// `editors` while another read `editor`.
//
// Per-screen active-key entries (EDITORS, DASHBOARD, ...) intentionally match
// the ScreenType strings in useScreenNavigation.ts so `pushHashToUrl(screen, ...)`
// in tab handling can round-trip.
export const URL_HASH_KEYS = {
  // Navigation state
  SCREEN: 'screen',
  SIDEBAR_SCREEN: 'sidebarScreen',
  // Per-screen active item (keys mirror ScreenType values)
  EDITORS: 'editors',
  DASHBOARD: 'dashboard',
  CONNECTIONS: 'connections',
  LLMS: 'llms',
  TUTORIAL: 'tutorial',
  MODELS: 'models',
  JOBS: 'jobs',
  COMMUNITY_MODELS: 'community-models',
  DASHBOARD_IMPORT: 'dashboard-import',
  ASSET_IMPORT: 'asset-import',
  WELCOME: 'welcome',
  SETTINGS: 'settings',
  PROFILE: 'profile',
  // Editor tab within a result panel
  ACTIVE_EDITOR_TAB: 'activeEditorTab',
  // Deep-link / bootstrap params
  SKIP_TIPS: 'skipTips',
  INITIAL_SEARCH: 'initialSearch',
  IMPORT: 'import',
  STORE: 'store',
  STORE_ID: 'storeId',
  TOKEN: 'token',
  REMOTE: 'remote',
  ASSET_TYPE: 'assetType',
  ASSET_NAME: 'assetName',
  MODEL_NAME: 'modelName',
  CONNECTION: 'connection',
} as const

export type UrlHashKey = (typeof URL_HASH_KEYS)[keyof typeof URL_HASH_KEYS]

export function getDefaultValueFromHash(key: UrlHashKey, fallback: string): string

export function getDefaultValueFromHash(key: UrlHashKey, fallback?: null): string | null

export function getDefaultValueFromHash(
  key: UrlHashKey,
  fallback: string | null = null,
): string | null {
  const hash = window.location.hash
  if (!hash || !hash.startsWith('#')) {
    return fallback
  }
  const hashParams = new URLSearchParams(hash.slice(1))
  const value = hashParams.get(key)
  return value !== null ? value : fallback
}

export function pushHashToUrl(key: UrlHashKey, value: string): void {
  const hash = window.location.hash
  const hashParams = new URLSearchParams(hash.slice(1))
  hashParams.set(key, value)
  window.location.hash = `#${hashParams.toString()}`
}

export function removeHashFromUrl(key: UrlHashKey): void {
  const hash = window.location.hash
  const hashParams = new URLSearchParams(hash.slice(1))
  hashParams.delete(key)
  window.location.hash = `#${hashParams.toString()}`
}

export function removeHashesFromUrl(keys: UrlHashKey[]): void {
  const hash = window.location.hash
  const hashParams = new URLSearchParams(hash.slice(1))
  keys.forEach((key) => {
    hashParams.delete(key)
  })
  window.location.hash = `#${hashParams.toString()}`
}
