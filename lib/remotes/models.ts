// A store is either a static catalog (flat files from any HTTP origin) or a
// live `trilogy serve` project server. They differ by capability, not origin:
// see docs/static-store-contract.md and docs/remote-store-contract.md.
export type ModelStoreType = 'static' | 'generic'

export interface ModelStore {
  type: ModelStoreType
  name: string
  id: string // Unique identifier for the store
}

// How a static store's baseUrl was derived. Display and re-derivation only —
// fetching always goes through baseUrl.
export interface GithubStoreOrigin {
  kind: 'github'
  owner: string
  repo: string
  branch: string
}

// Flat-file catalog: ${baseUrl}/index.json plus model manifests plus raw
// component files, served from GitHub Pages, raw GitHub, GCS, S3, a CDN...
// Catalog only — never enters the live-store (remote editor/jobs) machinery.
export interface StaticModelStore extends ModelStore {
  type: 'static'
  baseUrl: string // Serves ${baseUrl}/index.json
  origin?: GithubStoreOrigin
}

// Live `trilogy serve` store
export interface GenericModelStore extends ModelStore {
  type: 'generic'
  baseUrl: string // Base URL that serves index.json
  token?: string // Optional in-memory auth token for secured local serves
}

// Union type for all store types
export type AnyModelStore = StaticModelStore | GenericModelStore

// Pre-static persisted shape (localStorage). Migrated on load by
// `migrateLegacyStore`; never constructed any more.
export interface LegacyGithubModelStore {
  type: 'github'
  id: string
  name: string
  owner: string
  repo: string
  branch: string
}

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
// Mirrors the contract in docs/remote-store-contract.md — the server emits a
// coarse client-runtime `type` plus a bag of non-secret options. Tokens /
// passwords / private keys are never transmitted here; they live in per-user
// client credential storage. The client remaps these onto its own runtime
// constructors; see `buildRuntimeConnection` in
// `lib/data/remoteStoreStorage.ts`.
//
// `duck_db` and the engines below it are pre-contract spellings from a server
// older than contract v1, which emitted raw pytrilogy `Dialects` values. A
// conforming server emits only the first five and omits `connection` entirely
// for an engine the client cannot construct.
export type RemoteConnectionType =
  | 'duckdb'
  | 'bigquery'
  | 'snowflake'
  | 'motherduck'
  | 'sqlite'
  | 'duck_db'
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

// Static catalog index (docs/static-store-contract.md). Model and component
// URLs may be relative to the document that names them.
export interface StaticStoreModelRef {
  name: string
  url: string
  // Card fields: optional, let a browser render the list without the manifest.
  engine?: string
  description?: string
  tags?: string[]
}

export interface StaticStoreIndex {
  contract?: { kind: 'static'; version: number }
  name?: string
  updated_at?: string
  generation?: number
  models: StaticStoreModelRef[]
  connection?: StoreConnectionSpec | null // Accepted, unused by static v1
}

// The canonical public-models catalog, served by GitHub Pages. The id predates
// the static kind and is kept so `store.id` references stay stable.
export const DEFAULT_STATIC_STORE: StaticModelStore = {
  type: 'static',
  id: 'trilogy-data-trilogy-public-models-main',
  name: 'Trilogy Public Models',
  baseUrl: 'https://trilogy-data.github.io/trilogy-public-models/studio',
  origin: {
    kind: 'github',
    owner: 'trilogy-data',
    repo: 'trilogy-public-models',
    branch: 'main',
  },
}
