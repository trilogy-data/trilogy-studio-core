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
  token?: string // Optional in-memory auth token for secured local serves
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
  type: 'sql' | 'dashboard' | 'trilogy' | 'python'
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

// Runtime connection type advertised by a remote store via /index.json.
// Mirrors the contract in docs/remote-store-contract.md — the server emits
// a coarse `type` (a `Dialects` enum value from pytrilogy, e.g. `duck_db`)
// plus a bag of non-secret options. Tokens / passwords / private keys are
// never transmitted here; they live in per-user client credential storage.
// The client remaps these onto its own runtime constructors; see
// `buildRuntimeConnection` in `lib/data/remoteStoreStorage.ts`.
export type RemoteConnectionType =
  | 'duck_db'
  | 'bigquery'
  | 'snowflake'
  | 'sqlite'
  | 'postgres'
  | 'presto'
  | 'trino'
  | 'sql_server'
  | 'dataframe'

export interface StoreConnectionSpec {
  type: RemoteConnectionType | string
  options?: Record<string, string>
}

// Generic index format
export interface StoreIndex {
  name?: string // Optional store name override
  project_name?: string | null // Canonical project identifier from trilogy.toml
  connection?: StoreConnectionSpec | null // Runtime connection declaration (optional)
  models: {
    name: string // Display name
    url: string // Full URL to the model JSON file
  }[]
  // Posix paths (relative to the store root) that trilogy.toml's [setup]
  // section marks as startup scripts. Editors matching these paths get
  // tagged with EditorTag.STARTUP_SCRIPT on load.
  startup_scripts?: string[]
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
