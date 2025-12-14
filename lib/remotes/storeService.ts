import type {
  AnyModelStore,
  GithubModelStore,
  GenericModelStore,
  ModelFile,
  StoreIndex,
} from './models'
import { fetchWithBackoff } from './modelApiService'

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
    // Fetch the index from the base URL
    const indexUrl = `${store.baseUrl}/index.json`
    const response = await fetchWithBackoff(indexUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch store index: ${response.status} ${response.statusText}`)
    }

    const index: StoreIndex = await response.json()

    // Fetch each model file
    const filePromises = index.models.map(async (modelRef) => {
      try {
        const modelResponse = await fetchWithBackoff(modelRef.url)

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

/**
 * Fetch models from a GitHub store
 * @param store The GitHub store configuration
 * @returns Object with files array and optional error
 */
export const fetchFromGithubStore = async (
  store: GithubModelStore,
): Promise<{
  files: ModelFile[]
  error: string | null
}> => {
  let error: string | null = null
  let files: ModelFile[] = []

  try {
    // Determine URLs based on whether it's the default Trilogy repo
    let contentsUrl: string
    let baseUrl: string

    if (store.owner === 'trilogy-data' && store.repo === 'trilogy-public-models') {
      contentsUrl = `https://trilogy-data.github.io/trilogy-public-models/studio/index.json`
      baseUrl = `https://trilogy-data.github.io/trilogy-public-models/studio/`
    } else {
      contentsUrl = `https://api.github.com/repos/${store.owner}/${store.repo}/contents/studio/index.json?ref=${store.branch}`
      baseUrl = `https://raw.githubusercontent.com/${store.owner}/${store.repo}/${store.branch}/studio/`
    }

    const response = await fetchWithBackoff(contentsUrl)

    if (response.status !== 200) {
      throw new Error(`Error fetching community data: ${await response.text()}`)
    }

    let data: { count: number; files: { name: string; filename: string }[] }

    // Handle different response formats for GitHub Pages vs API
    if (store.owner === 'trilogy-data' && store.repo === 'trilogy-public-models') {
      data = await response.json()
    } else {
      const apiResponse = await response.json()
      // Decode base64 content from GitHub API
      const content = JSON.parse(atob(apiResponse.content))
      data = content
    }

    const filePromises = data.files
      .filter((file) => file.filename.endsWith('.json'))
      .map(async (file) => {
        const rawUrl = `${baseUrl}${file.filename}`
        const fileResponse = await fetchWithBackoff(rawUrl)

        if (!fileResponse.ok) {
          throw new Error(`Error fetching file ${file.filename}: ${fileResponse.statusText}`)
        }

        const fileData: ModelFile = await fileResponse.json()
        fileData.downloadUrl = rawUrl
        fileData.store = store
        return fileData
      })

    files = await Promise.all(filePromises)
  } catch (rawError) {
    if (rawError instanceof Error) {
      error = rawError.message
    } else {
      error = 'Error fetching files'
    }
    console.error('Error fetching from GitHub store:', rawError)
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
  if (store.type === 'github') {
    return fetchFromGithubStore(store)
  } else {
    return fetchFromGenericStore(store)
  }
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
