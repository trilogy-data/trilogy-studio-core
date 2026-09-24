# Static store backend — plan (2026-09)

Status: **built** (2026-09-24; contract of record `docs/static-store-contract.md`). Forked from trilogy-cloud's
`docs/plan-workspace-publish-2026-09.md` on 2026-09-24: cloud will publish a
workspace as flat files on an object store, and studio needs a backend that
reads flat files from *any* origin rather than one hard-wired to GitHub.

## The ask

Studio has two store types today, `github` and `generic`, and neither fits a
bucket. Replace the GitHub-specific backend with a **static file backend** —
an `index.json` plus model manifests plus raw component files, served from
any HTTP origin (GitHub Pages, raw GitHub, GCS, S3, a CDN) — so studio has
two backends that differ by *capability* (flat-file catalog vs. live API)
rather than two that differ by *origin* (GitHub vs. not-GitHub). The
`generic` (`trilogy serve`) contract is untouched.

## Why not register a bucket as a `generic` store

It works for browsing and fails everywhere else, permanently:

- `RemoteStoreStorage.loadEditors` / `loadConnections` / `loadModelConfig`
  (`lib/data/remoteStoreStorage.ts:321-376`) call `loadStore` on **every
  generic store on every IDE load**, and `loadStore` fires `GET /files`
  (`:173-179`) — a 404 on a bucket, three times per page load, forever, with
  a `console.warn` each.
- `saveEditors` (`:279-319`) tries `PUT`/`POST`/`DELETE /files/…` on an
  edited editor. A static origin cannot answer; the write-back path has to
  be unreachable for a catalog, not merely failing.
- `X-Trilogy-Token` is a custom header, so every request to a static origin
  would need a CORS preflight it does not need today.

The two protocols are not one thing with a flag. They are a **catalog** and
a **project server**, and studio should name them as such.

## What exists today, and how much of it is GitHub-shaped

- `lib/remotes/models.ts:1-24`: `ModelStore.type: 'github' | 'generic'`;
  `GithubModelStore {owner, repo, branch}`; `GenericModelStore {baseUrl,
  token?}`.
- `lib/remotes/storeService.ts:89-156` (`fetchFromGithubStore`): the
  canonical repo is special-cased to GitHub Pages
  (`…/trilogy-public-models/studio/`); any other repo goes through the
  GitHub **contents API** (base64 body, 60 req/hour unauthenticated) for the
  index and `raw.githubusercontent.com` for the manifests. Index shape:
  `{count, files:[{filename, …}]}`, manifests at `${baseUrl}${filename}`.
- `fetchFromGenericStore` (`:38-82`): `${baseUrl}/index.json` →
  `StoreIndex {name?, project_name?, connection?, models:[{name,url}],
  startup_scripts?}`, manifests at the **absolute** `models[].url`.
- Both produce `ModelFile[]` (`models.ts:34-50`) and the import path from
  there is shared (`lib/models/helpers.ts:349-416`). `components[].url` is
  fetched bare (`helpers.ts:117`) — absolute only.
- `type ===` branch points, excluding tests: **~40**, of which only **six**
  are `github`-specific — `storeService.ts:169`, `models.ts:9-14,106-113`,
  `displayHelpers.ts:38-40`, `AddStoreModal.vue:240`,
  `communityApiStore.ts:319` and `:444`. Every other guard is
  `=== 'generic'` protecting an API-only feature (jobs, tokens, remote
  editors, write-back) and stays correct when a third type appears, because
  a static store is not generic.
- Persistence: `localStorage['trilogy-community-stores']`
  (`communityApiStore.ts:18`); the default store is stripped on save and
  re-prepended on load (`:157`, `:188`).

## Design

### Two kinds

```ts
export interface StaticModelStore extends ModelStore {
  type: 'static'
  baseUrl: string                       // serves ${baseUrl}/index.json
  origin?: { kind: 'github'; owner: string; repo: string; branch: string }
                                        // how baseUrl was derived; display + re-derivation only
}
export interface GenericModelStore extends ModelStore { type: 'generic'; baseUrl; token? }  // unchanged
export type AnyModelStore = StaticModelStore | GenericModelStore
```

`github` disappears as a *type* and survives as an **origin preset**: the
AddStoreModal's "GitHub repository" tab still takes owner/repo/branch and
produces a `static` store whose `baseUrl` is derived:

| Repo | `baseUrl` |
|---|---|
| `trilogy-data/trilogy-public-models` | `https://trilogy-data.github.io/trilogy-public-models/studio` |
| any other | `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/studio` |

The contents-API path goes away: it only ever worked for public repos
(no auth was sent), `raw.githubusercontent.com` serves the same bytes with
CORS `*` and without the 60/hour API limit, and `response.json()` does not
care that raw serves `text/plain`. Private repositories never worked and
are not a regression.

A static store is **catalog only**: it appears in the community browser,
its models import as local copies (exactly what `github` does today), and
it never enters `getGenericStores()`, the jobs panel, the token modal, or
the remote-editor load/save path.

### The static catalog contract (new, additive)

`GET ${baseUrl}/index.json`:

```jsonc
{
  "contract": { "kind": "static", "version": 1 },   // optional hint; absent on legacy indexes
  "name": "Acme — sales",                             // display; falls back to hostname
  "updated_at": "2026-09-24T12:00:00Z",              // ISO 8601, surfaced in the UI
  "generation": 3,                                    // monotone per publisher; display only
  "models": [
    { "name": "sales", "url": "v3/model.json",        // absolute, or relative to index.json
      "engine": "bigquery", "description": "…", "tags": ["bigquery", "retail"] }
  ],
  "connection": { "type": "bigquery", "options": { "projectId": "acme" } }   // accepted, unused by static v1
}
```

- **`models[].url` and `components[].url` may be relative**, resolved
  against the document that names them (`new URL(url, indexUrl)`,
  `new URL(component.url, modelFile.downloadUrl)`). Absolute URLs pass
  through unchanged, so every existing manifest keeps working. This is
  what makes a published tree relocatable (bucket move, CDN in front) with
  no rewrite. `downloadUrl` is already stamped at fetch
  (`storeService.ts:61`, `:140`), so the component resolution is one line
  in `fetchModelImports`.
- **The legacy index** `{count, files:[{filename, name, engine,
  description, tags}]}` is normalized on read into `models[]` with
  `url = filename` (relative). `trilogy-public-models` needs no change
  today and may emit the new shape whenever `studio/build.py` is next
  touched.
- `models[].engine/description/tags` are **card fields**: when present the
  browser can render the list without fetching every manifest. Studio
  fetches all of them today (`:129-145`); switching to lazy manifest fetch
  is an optimization this shape permits, not part of this plan.
- `ModelFile` is unchanged. `purpose` vocabulary and the `(type, name)`
  uniqueness rule are as today.
- No auth header in v1. A future private static origin (signed cookies, a
  CDN token) can add `token?` on `StaticModelStore` and a header; that
  brings a preflight and belongs to its own decision.

Where it lives: a new `docs/static-store-contract.md`, cross-linked from
`remote-store-contract.md`. The two are versioned independently — the live
contract's `contractVersion` gates `trilogy serve` compatibility and must
not move because a catalog field was added.

### Code changes

| Where | Change |
|---|---|
| `lib/remotes/models.ts` | `StaticModelStore`; `type: 'static' \| 'generic'`; `DEFAULT_STATIC_STORE` keeps id `trilogy-data-trilogy-public-models-main` so `store.id` references and "already imported" checks are stable |
| `lib/remotes/storeService.ts` | `fetchFromStaticStore(store)`: fetch index, `normalizeStaticIndex(raw, indexUrl)` (both shapes → `{name, updated_at, models[]}` with absolute URLs), fetch manifests, stamp `downloadUrl`/`store`. Replaces `fetchFromGithubStore`; `fetchFromStore` dispatches on `static` vs `generic` |
| `lib/remotes/staticStorePresets.ts` (new) | `githubBaseUrl(owner, repo, branch)`; `migrateLegacyStore(persisted)` — `type:'github'` rows → `static` + `origin`, id preserved |
| `lib/stores/communityApiStore.ts` | run the migration on load (`:157` area); add/remove branches (`:311-319`, `:420-444`) take a `static` payload; `applyUrlTokenDefaults` untouched (generic only) |
| `lib/models/helpers.ts:117` | `fetch(new URL(component.url, base).toString())` where `base` is the manifest's `downloadUrl` |
| `lib/components/community/AddStoreModal.vue` | three tabs: **Static files (URL)**, **GitHub repository** (preset → static), **Trilogy serve (API)** |
| `lib/remotes/displayHelpers.ts:38-40` | read `origin` when `kind === 'github'`, else show hostname |
| `lib/components/community/CommunityModelCard.vue:225-229` | share link carries `store=<baseUrl>&kind=static` for static stores |
| `lib/components/AssetAutoImporter.vue:246-287` | `registerStoreIfNeeded` registers a `static` store from `?store=&kind=static` when none matches (today it only builds `generic`) |
| Types touched by the union | `communityApiStore.ts:56` literal type; `AssetAutoImporter`, `CommunityRemote`, `CommunityModels`, `EditorList`, `JobsList`, `JobsView` compile unchanged (they narrow to `generic`) |

Untouched on purpose: `remoteStoreStorage.ts`, `jobsService.ts`,
`jobsApiStore.ts`, `rehydrateRemoteModel.ts`, `remoteStoreSync.ts` — the
live-store machinery never sees a static store.

### Deep link

`?store=<baseUrl>&kind=static[&model=<name>]` registers the static store if
absent and, with `model`, opens that card. `kind` absent keeps today's
meaning (a `generic` store's token pairing). This is the link
trilogy-cloud's "Open in Studio" button emits.

### Tests

- Unit: `normalizeStaticIndex` over both shapes, relative and absolute
  URLs, missing optional fields; `githubBaseUrl` for the canonical and a
  non-canonical repo; `migrateLegacyStore` preserves ids and the default
  store; component URL resolution with an absolute and a relative `url`.
- e2e: a static fixture under `e2e/fixtures/static-stores/<name>/` in the
  **cloud-published shape** — copy `api/testdata/publish/*/expected/` from
  trilogy-cloud once that lands, so the two repos are pinned to one
  artifact — served by the same static server the `trilogy-serve-stores`
  fixtures use; add store via URL, see the card, import, run an example.
- The existing community e2e against the default store keeps passing
  unchanged (same id, same Pages URL, same manifests).

### Sequencing with trilogy-cloud

Cloud emits the static catalog shape from its first publish (absolute URLs
in v1, so it also works against today's studio). Until this lands, a cloud
store can be added as `generic` for browsing — it will 404 on `/files` at
every IDE load and is fit for dev testing only. Nothing in cloud waits on
this; nothing here waits on cloud.

## Not in scope

- Auth on static origins (see above).
- Dashboards on the live contract (`remote-store-contract.md:9`, unchanged).
- Folding `generic` into `static`. They differ by capability, which is the
  distinction worth keeping; the shared piece — `ModelFile` and the import
  path — is already shared.
- Lazy manifest fetching from index card fields.
