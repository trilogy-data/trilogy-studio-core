import type { GenericModelStore } from './models'

const sanitizeSegment = (value: string): string =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')

export const normalizeGenericStoreBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, '')

export const buildGenericStoreId = (baseUrl: string): string =>
  normalizeGenericStoreBaseUrl(baseUrl)
    .replace(/^https?:\/\//, '')
    .replace(/\//g, '-')

export const buildGenericStoreFallbackName = (baseUrl: string): string => {
  try {
    const url = new URL(normalizeGenericStoreBaseUrl(baseUrl))
    return sanitizeSegment(url.hostname + (url.port ? `:${url.port}` : '') || url.host || baseUrl)
  } catch {
    return sanitizeSegment(normalizeGenericStoreBaseUrl(baseUrl))
  }
}

export const buildGenericStoreResourceName = (store: GenericModelStore): string =>
  sanitizeSegment(store.name || buildGenericStoreFallbackName(store.baseUrl))

// Connections get a `-connection` suffix so they don't collide with the model
// name (which reuses the raw resource name). This also matches the legacy
// manifest-import path, keeping `${modelName}` / `${modelName}-connection`
// conventions consistent between remote and manifest flows.
export const buildGenericStoreConnectionName = (store: GenericModelStore): string =>
  `${buildGenericStoreResourceName(store)}-connection`

export const buildGenericStoreModelName = (store: GenericModelStore): string =>
  buildGenericStoreResourceName(store)
