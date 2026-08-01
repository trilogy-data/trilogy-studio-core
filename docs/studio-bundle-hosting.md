# Hosting the Studio Bundle from `trilogy serve`

Implementation handoff for the `pytrilogy` side. The studio repo now publishes a versioned bundle; this describes what `trilogy serve` needs to do with it.

## Why

The hosted deep link (`https://trilogydata.dev/trilogy-studio-core/#store=http://localhost:8100...`) is blocked by **Local Network Access**. A public origin reaching a loopback address is gated behind a browser permission that, when the fetch fires unattended on page load, is auto-denied — Firefox logs `prompt action: prompt_deny`, Chrome 142+ requires an explicit grant. It is not a CORS-header problem; LNA is permission-based and dropped the old preflight opt-in, so there is nothing the server can send to satisfy it.

Same-address-space requests are not gated at all. If the studio document is served from `http://localhost:<port>` — the same origin as the store — the permission never comes into play. That is the fix: serve hosts the bundle.

## What the studio repo publishes

Merging a `package.json` version bump to `main` on `trilogy-studio-core` publishes a `v<version>` release with three assets under **stable, version-free names**:

```
https://github.com/trilogy-data/trilogy-studio-core/releases/latest/download/manifest.json
https://github.com/trilogy-data/trilogy-studio-core/releases/latest/download/trilogy-studio.tgz
https://github.com/trilogy-data/trilogy-studio-core/releases/latest/download/trilogy-studio.tgz.sha256
```

The `releases/latest/download/` form resolves via redirect without touching `api.github.com`, so **do not use the GitHub API** to discover releases — the unauthenticated API is limited to 60 requests/hour per IP, and asset downloads over these URLs are not. Pin a specific version by swapping `latest` for `tags/v1.2.3`.

`manifest.json` is a few hundred bytes:

```json
{
  "name": "trilogy-studio",
  "version": "1.2.3",
  "contractVersion": 1,
  "basePath": "/trilogy-studio-core/",
  "commit": "abc123...",
  "builtAt": "2026-08-01T21:48:53.737Z",
  "tarball": { "name": "trilogy-studio.tgz", "bytes": 22399640, "sha256": "80e2386a..." }
}
```

- **`version`** — cache key. Poll the manifest, compare, only pull the tarball when it changes.
- **`contractVersion`** — the remote store contract (`docs/remote-store-contract.md`) this bundle speaks. Refuse a bundle whose `contractVersion` exceeds what serve implements, with a message telling the user to upgrade `pytrilogy`.
- **`basePath`** — where the bundle must be mounted. Non-negotiable, see below.
- **`tarball.sha256`** — verify before extracting.

The tarball is ~22M gzipped and expands to ~93M, most of it two DuckDB wasm builds. Only one is fetched by any given browser, lazily, on first DuckDB connection — but both must be present on disk.

## What serve implements

1. **Resolve** — `GET releases/latest/download/manifest.json`.
2. **Cache check** — if `~/.trilogy/studio/<version>/` exists and is intact, skip to step 5.
3. **Download and verify** — `GET .../trilogy-studio.tgz`, check sha256 against the manifest, fail loudly on mismatch (do not extract).
4. **Extract** to a temp dir, then atomically rename into `~/.trilogy/studio/<version>/`, so an interrupted download never yields a half-populated cache that step 2 mistakes for good. Keep the manifest alongside it.
5. **Mount** the extracted contents at `manifest.basePath` — currently `/trilogy-studio-core/`.

### Mount requirements

- **`basePath` is mandatory.** The bundle is built with an absolute Vite base, so assets resolve to `/trilogy-studio-core/assets/…`. Mounting anywhere else 404s every asset. Read the value from the manifest rather than hardcoding it.
- **No SPA history fallback needed.** There is no client-side router — the app is a single `index.html` and all state travels in hash params. Plain static file serving is sufficient.
- **Serve `.wasm` as `application/wasm`.** DuckDB uses streaming instantiation and will fail on a wrong content type. Python's `mimetypes` does not always register `.wasm`; add it explicitly.
- **No cross-origin isolation required.** The bundle ships the `mvp` and `eh` DuckDB builds, not the threaded `coi` build, so no COOP/COEP headers and no `SharedArrayBuffer`.

## Deep link format

Once the studio is on loopback, point users at the local origin:

```
http://localhost:8100/trilogy-studio-core/#store=http%3A%2F%2Flocalhost%3A8100&remote=true&assetType=trilogy&assetName=analytics_common&modelName=user_analytics&token=<token>
```

Hash params (`lib/stores/urlStore.ts`):

| Param | Required | Notes |
|---|---|---|
| `store` | yes | Store base URL, URL-encoded. Absolute. |
| `remote` | yes | `true` — selects the remote-backed path |
| `assetName` | yes | Editor name; extension optional |
| `modelName` | yes | |
| `assetType` | yes | `trilogy` \| `editor` \| `dashboard` |
| `token` | if auth on | Sent as `X-Trilogy-Token` |
| `storeId` | recommended | Stable store id; without it the id is derived from the URL, so a port change orphans prior state |
| `import`, `connection` | no | Manifest-path only; ignored when `remote=true` — the connection comes from `/index.json` |

Dashboards are not served by the store contract, so `assetType=dashboard` only resolves an already-local dashboard bound to this store's connection.

## Failure modes worth handling

- **No network on first run** — nothing cached, nothing to serve. Fail with a clear message rather than a stack trace; consider a `--studio-bundle <path>` escape hatch for air-gapped installs.
- **Network down, cache present** — serve the cached version silently. Do not block startup on the manifest poll; treat it as best-effort with a short timeout.
- **Checksum mismatch** — discard, do not extract, retry once, then fail.
- **`contractVersion` too new** — serve the cached older bundle if there is one, and tell the user to upgrade.

## Out of scope

The hosted `trilogydata.dev` deep link still exists and still hits the LNA wall. Making that path work (opting into `targetAddressSpace: 'loopback'`, raising the permission prompt from a user gesture, better error copy) is client-side work in the studio repo and independent of anything here.
