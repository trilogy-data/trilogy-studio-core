// Generic store interface - base URL + name
export interface ModelStore {
  type: 'github' | 'generic'
  name: string
  id: string // Unique identifier for the store
}

// GitHub-specific store (backward compatible)
export interface GithubModelStore extends ModelStore {
  type: 'github'
  owner: string
  repo: string
  branch: string
}

// Generic URL-based store
export interface GenericModelStore extends ModelStore {
  type: 'generic'
  baseUrl: string // Base URL that serves index.json
}

// Union type for all store types
export type AnyModelStore = GithubModelStore | GenericModelStore

// Deprecated: kept for backward compatibility
export interface ModelRoot {
  owner: string
  repo: string
  branch: string
  displayName?: string
}

export interface Component {
  url: string
  name?: string
  alias?: string
  purpose?: string
  type: 'sql' | 'dashboard' | 'trilogy'
}

export interface ModelFile {
  name: string
  description: string
  engine: string
  downloadUrl: string
  components: Component[]
  modelRoot?: ModelRoot // Deprecated: Add reference to which root this file belongs to
  store?: AnyModelStore // New: Reference to the store this model belongs to
}

// Generic index format
export interface StoreIndex {
  name?: string // Optional store name override
  models: {
    name: string // Display name
    url: string // Full URL to the model JSON file
  }[]
}

// Default model root (backward compatible)
export const DEFAULT_MODEL_ROOT: ModelRoot = {
  owner: 'trilogy-data',
  repo: 'trilogy-public-models',
  branch: 'main',
  displayName: 'Trilogy Public Models',
}

// Default stores (including the original as a GitHub store)
export const DEFAULT_GITHUB_STORE: GithubModelStore = {
  type: 'github',
  id: 'trilogy-data-trilogy-public-models-main',
  name: 'Trilogy Public Models',
  owner: 'trilogy-data',
  repo: 'trilogy-public-models',
  branch: 'main',
}
