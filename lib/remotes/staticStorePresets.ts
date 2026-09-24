import type {
  AnyModelStore,
  GithubStoreOrigin,
  LegacyGithubModelStore,
  StaticModelStore,
} from './models'
import {
  buildGenericStoreFallbackName,
  buildGenericStoreId,
  normalizeGenericStoreBaseUrl,
} from './genericStoreMetadata'

const CANONICAL_OWNER = 'trilogy-data'
const CANONICAL_REPO = 'trilogy-public-models'

/**
 * Where a GitHub repository's `studio/` catalog is served from. The canonical
 * repo goes through GitHub Pages; anything else through raw.githubusercontent,
 * which serves the same bytes with CORS `*` and no API rate limit. Public
 * repositories only — no auth is sent.
 */
export const githubBaseUrl = (owner: string, repo: string, branch: string): string => {
  if (owner === CANONICAL_OWNER && repo === CANONICAL_REPO) {
    return `https://${CANONICAL_OWNER}.github.io/${CANONICAL_REPO}/studio`
  }
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/studio`
}

// Ids for GitHub-derived stores predate the static kind; keep the scheme so a
// migrated store and a freshly added one for the same repo collide.
export const buildGithubStoreId = (owner: string, repo: string, branch: string): string =>
  `${owner}-${repo}-${branch}`

export const buildGithubStaticStore = (
  owner: string,
  repo: string,
  branch: string,
  name?: string,
): StaticModelStore => {
  const origin: GithubStoreOrigin = { kind: 'github', owner, repo, branch }
  return {
    type: 'static',
    id: buildGithubStoreId(owner, repo, branch),
    name: name || `${owner}/${repo}`,
    baseUrl: githubBaseUrl(owner, repo, branch),
    origin,
  }
}

export const buildUrlStaticStore = (baseUrl: string, name?: string): StaticModelStore => {
  const normalized = normalizeGenericStoreBaseUrl(baseUrl.trim())
  return {
    type: 'static',
    id: buildGenericStoreId(normalized),
    name: name || buildGenericStoreFallbackName(normalized),
    baseUrl: normalized,
  }
}

/**
 * Upgrade a persisted store row to the current shape. `github` rows become
 * `static` stores with a derived baseUrl and their id preserved, so anything
 * keyed by `store.id` keeps resolving. Rows of an unknown type are dropped.
 */
export const migrateLegacyStore = (
  persisted: AnyModelStore | LegacyGithubModelStore | { type?: unknown },
): AnyModelStore | null => {
  if (!persisted || typeof persisted !== 'object') {
    return null
  }
  const row = persisted as AnyModelStore | LegacyGithubModelStore
  if (row.type === 'github') {
    const migrated = buildGithubStaticStore(row.owner, row.repo, row.branch, row.name)
    return { ...migrated, id: row.id || migrated.id }
  }
  if (row.type === 'static' || row.type === 'generic') {
    return row
  }
  return null
}

/** Short human label for where a store's files come from. */
export const describeStoreOrigin = (store: AnyModelStore): string => {
  if (store.type === 'static' && store.origin?.kind === 'github') {
    return `${store.origin.owner}/${store.origin.repo}@${store.origin.branch}`
  }
  try {
    return new URL(store.baseUrl).host
  } catch {
    return store.baseUrl
  }
}
