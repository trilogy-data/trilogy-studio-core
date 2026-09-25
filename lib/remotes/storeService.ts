import type {
  AnyModelStore,
  GenericModelStore,
  ModelFile,
  StaticModelStore,
  StaticStoreIndex,
  StaticStoreModelRef,
  StoreIndex,
} from './models'
import { fetchWithBackoff } from './modelApiService'

const buildAuthRequest = (token?: string): RequestInit | undefined => {
  if (!token) {
    return undefined
  }

  return {
    headers: {
      'X-Trilogy-Token': token,
    },
  }
}

export const fetchGenericStoreIndex = async (store: GenericModelStore): Promise<StoreIndex> => {
  const indexUrl = `${store.baseUrl}/index.json`
  const response = await fetchWithBackoff(indexUrl, buildAuthRequest(store.token))

  if (!response.ok) {
    throw new Error(`Failed to fetch store index: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetch models from a generic store
 * @param store The generic store configuration
 * @returns Object with files array and optional error
 */
export const fetchFromGenericStore = async (
  store: GenericModelStore,
): Promise<{
  files: ModelFile[]
  error: string | null
}> => {
  let error: string | null = null
  let files: ModelFile[] = []

  try {
    const index = await fetchGenericStoreIndex(store)

    // Fetch each model file
    const filePromises = index.models.map(async (modelRef) => {
      try {
        const modelResponse = await fetchWithBackoff(modelRef.url, buildAuthRequest(store.token))

        if (!modelResponse.ok) {
          console.warn(`Failed to fetch model ${modelRef.name}: ${modelResponse.statusText}`)
          return null
        }

        const modelData: ModelFile = await modelResponse.json()
        modelData.downloadUrl = modelRef.url
        modelData.store = store
        return modelData
      } catch (err) {
        console.warn(`Error fetching model ${modelRef.name}:`, err)
        return null
      }
    })

    const results = await Promise.all(filePromises)
    files = results.filter((f): f is ModelFile => f !== null)
  } catch (rawError) {
    if (rawError instanceof Error) {
      error = rawError.message
    } else {
      error = 'Error fetching store data'
    }
    console.error('Error fetching from generic store:', rawError)
  }

  return { files, error }
}

// Resolve `url` against the document that named it. Absolute URLs pass
// through; a base that is not itself absolute leaves `url` untouched.
const resolveUrl = (url: string, base: string): string => {
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

// Legacy public-models index: `{count, files: [{filename, name, ...}]}`.
interface LegacyStaticIndex {
  count?: number
  files: {
    filename: string
    name?: string
    engine?: string
    description?: string
    tags?: string[]
  }[]
}

export interface NormalizedStaticIndex {
  name?: string
  updated_at?: string
  generation?: number
  models: StaticStoreModelRef[] // urls absolute
}

/**
 * Normalize either static index shape into `models[]` with absolute URLs.
 * Relative model URLs resolve against the index document itself.
 */
export const normalizeStaticIndex = (raw: unknown, indexUrl: string): NormalizedStaticIndex => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Store index is not a JSON object')
  }
  const index = raw as Partial<StaticStoreIndex> & Partial<LegacyStaticIndex>

  let models: StaticStoreModelRef[]
  if (Array.isArray(index.models)) {
    models = index.models
  } else if (Array.isArray(index.files)) {
    models = index.files
      .filter((file) => typeof file.filename === 'string' && file.filename.endsWith('.json'))
      .map((file) => ({
        name: file.name || file.filename.replace(/\.json$/, ''),
        url: file.filename,
        engine: file.engine,
        description: file.description,
        tags: file.tags,
      }))
  } else {
    throw new Error('Store index has neither `models` nor `files`')
  }

  return {
    name: typeof index.name === 'string' ? index.name : undefined,
    updated_at: typeof index.updated_at === 'string' ? index.updated_at : undefined,
    generation: typeof index.generation === 'number' ? index.generation : undefined,
    models: models
      .filter((model) => model && typeof model.url === 'string')
      .map((model) => ({ ...model, url: resolveUrl(model.url, indexUrl) })),
  }
}

/**
 * Make every component URL in a manifest absolute, resolved against the
 * manifest's own URL. Absolute URLs pass through unchanged.
 */
export const resolveComponentUrls = <T extends { components?: { url: string }[] }>(
  manifest: T,
  manifestUrl: string,
): T => {
  if (Array.isArray(manifest.components)) {
    manifest.components = manifest.components.map((component) => ({
      ...component,
      url: resolveUrl(component.url, manifestUrl),
    }))
  }
  return manifest
}

export const staticStoreIndexUrl = (store: StaticModelStore): string =>
  `${store.baseUrl.replace(/\/$/, '')}/index.json`

/**
 * Fetch models from a static catalog (any HTTP origin serving flat files)
 * @param store The static store configuration
 * @returns Object with files array and optional error
 */
export const fetchFromStaticStore = async (
  store: StaticModelStore,
): Promise<{
  files: ModelFile[]
  error: string | null
}> => {
  let error: string | null = null
  let files: ModelFile[] = []

  try {
    const indexUrl = staticStoreIndexUrl(store)
    const response = await fetchWithBackoff(indexUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch store index: ${response.status} ${response.statusText}`)
    }

    const index = normalizeStaticIndex(await response.json(), indexUrl)

    const filePromises = index.models.map(async (modelRef) => {
      const modelResponse = await fetchWithBackoff(modelRef.url)

      if (!modelResponse.ok) {
        throw new Error(`Error fetching model ${modelRef.name}: ${modelResponse.statusText}`)
      }

      const modelData: ModelFile = resolveComponentUrls(await modelResponse.json(), modelRef.url)
      modelData.downloadUrl = modelRef.url
      modelData.store = store
      return modelData
    })

    files = await Promise.all(filePromises)
  } catch (rawError) {
    if (rawError instanceof Error) {
      error = rawError.message
    } else {
      error = 'Error fetching files'
    }
    console.error('Error fetching from static store:', rawError)
  }

  return { files, error }
}

/**
 * Fetch models from any store type
 * @param store The store configuration
 * @returns Object with files array and optional error
 */
export const fetchFromStore = async (
  store: AnyModelStore,
): Promise<{
  files: ModelFile[]
  error: string | null
}> => {
  if (store.type === 'static') {
    return fetchFromStaticStore(store)
  }
  return fetchFromGenericStore(store)
}

/**
 * Fetch models from multiple stores
 * @param stores Array of store configurations
 * @param onStoreComplete Optional callback called when each store completes (success or failure)
 * @returns Object with files organized by store ID and any errors
 */
export const fetchFromAllStores = async (
  stores: AnyModelStore[],
  onStoreComplete?: (storeId: string, result: { files: ModelFile[]; error: string | null }) => void,
): Promise<{
  filesByStore: Record<string, ModelFile[]>
  errors: Record<string, string>
}> => {
  const filesByStore: Record<string, ModelFile[]> = {}
  const errors: Record<string, string> = {}

  await Promise.all(
    stores.map(async (store) => {
      try {
        const { files, error } = await fetchFromStore(store)
        filesByStore[store.id] = files
        if (error) {
          errors[store.id] = error
        }

        // Call callback immediately when this store completes
        if (onStoreComplete) {
          onStoreComplete(store.id, { files, error })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        errors[store.id] = errorMessage
        filesByStore[store.id] = []

        // Call callback for error case too
        if (onStoreComplete) {
          onStoreComplete(store.id, { files: [], error: errorMessage })
        }
      }
    }),
  )

  return { filesByStore, errors }
}
