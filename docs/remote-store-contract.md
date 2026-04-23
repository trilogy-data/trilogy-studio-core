# Remote Store Contract

A remote store is an HTTP service that a Trilogy Studio client can register as a `GenericModelStore`. The store hosts the editors, model, and runtime connection config for one logical Trilogy project. The client treats it as a single unit: registering the store makes the project's contents available, and editor edits made in the client are written back to it.

The authoritative implementation of this contract is `trilogy serve`; this document describes what the server emits and what the client must do with it. Mock servers (e.g. `pyserver/mock_model_server.py`) should conform to the same contract.

**Scope note on dashboards.** Dashboards currently use a Studio-specific serialization format and are intentionally **not** part of this contract. A dashboard created against a remote-backed project is persisted to browser `localStorage` with its `connection` field pointing at the store's runtime connection — so it survives refresh and re-binds to the remote data, but it is never written to the store. A future, format-agnostic dashboard spec may promote dashboards into this contract.

## Identity and registration

A store is identified to the client by its `baseUrl`. The client derives a stable `id` from it (`buildGenericStoreId` — strips protocol, replaces `/` with `-`). All endpoints below are relative to `baseUrl`.

### Auth

If a client has a token for the store, it sends it as `X-Trilogy-Token: <token>` on every request. Tokens are per-serve-run, not long-lived secrets — they may be cached in browser `localStorage`. Missing/invalid token → `401` (unless the server is running with `--no-auth`). Fully-public stores accept missing tokens.

## Endpoints

### `GET /index.json` — store metadata

```jsonc
{
  "name": "Urban Forest (Buenos Aires)",
  "project_name": "urban_forest",            // optional, may be null
  "connection": {                             // optional, may be null
    "type": "duckdb",
    "options": {}
  },
  "models": [
    { "name": "urban_forest", "url": "http://localhost:8100/models/urban_forest.json" }
  ],
  "startup_scripts": ["setup.sql"]            // optional, defaults to []
}
```

Fields:

- **`name`** *(optional string)* — display name. If absent, the client falls back to the hostname of `baseUrl`.
- **`project_name`** *(optional string | null)* — canonical project identifier from `trilogy.toml`. Client may surface this in UI; no contract-level requirement today.
- **`connection`** *(optional | null)* — declares the runtime connection the client should construct for editors bound to this store. Present only when the store owner configured it in `trilogy.toml`.
  - **`type`** *(string, required when present)* — one of `duckdb`, `bigquery`, `snowflake`, `motherduck`, `sqlite`.

    OAuth vs service-account for BigQuery is **not** a type distinction — the server always emits `bigquery`. Whether the client uses an OAuth flow or a service-account key is determined client-side from per-user credential state (or a flag inside `options` in the future). See *Client implications* below.
  - **`options`** *(object, optional)* — non-secret connection fields. Server-side enforced key sets per type; anything else is ignored:
    - `duckdb` / `sqlite` → `{}`
    - `bigquery` → `{ projectId? }`
    - `snowflake` → `{ account, username, warehouse?, role?, database?, schema? }` (no `privateKey` — that's a secret)
    - `motherduck` → `{}` (token is a secret, supplied per-user)
  - **Never** includes secrets — tokens, passwords, private keys stay in the client's per-user credential storage.
- **`models`** *(array)* — list of model manifests the store publishes, each with `name` + absolute `url` to a `ModelFile` JSON. Used by the community-model browser for discovery. The remote-backed editor load/save path does not require this; may be empty.
- **`startup_scripts`** *(array of strings, optional, defaults to `[]`)* — posix paths (relative to the store root, no leading `/`) of editor files that should run when the runtime connection resets. Populated by the server from `trilogy.toml`'s `[setup]` section (`sql` + `trilogy` keys). Each entry must be a path that also appears in `/files`; entries that resolve outside the served directory are dropped server-side. On the client, editors whose `remotePath` matches an entry receive `EditorTag.STARTUP_SCRIPT` at load time.

#### Engines the server cannot advertise

Trilogy's server supports `postgres`, `presto`, and `sql_server` as engines, but the client has no matching connection type. For these stores the server **omits** `connection`. The client falls back to the browse-only path (see below). To enable round-trip for these engines, extend `connectionTypes` in the client and add server-side mapping.

### `GET /files` — listing

```jsonc
{
  "directories": [
    { "directory": "",          "files": ["core.preql", "helpers.preql"] },
    { "directory": "analytics", "files": ["overview.preql"] }
  ]
}
```

- **`directories[].directory`** — posix path relative to the store root, `""` for root.
- **`directories[].files`** — filenames only (no directory prefix). The client concatenates `directory + "/" + file` to form a path used with `/files/{path}`.
- Files may appear in any directory; no special layout is required.

#### File type semantics (extension-based)

| Extension | Role                                                        |
|-----------|-------------------------------------------------------------|
| `.preql`  | Trilogy editor + contributes to the model's sources         |
| `.sql`    | SQL editor                                                  |
| `.py`     | Python editor                                               |
| `.csv`    | Writable (legacy `purpose="data"`), but ignored by remote-store editor enumeration — never surfaces as an editor in the snapshot |
| other     | Ignored                                                     |

### `GET /files/{path}` — fetch file contents

Returns the raw file content as text. Paths are **literal**: real `/` separators between segments, with `encodeURIComponent` applied per segment. Reserved characters (`?`, `#`, space, etc.) must be percent-encoded; **do not** percent-encode `/` itself. The previous hyphen-for-slash encoding (`/files/analytics-overview.preql`) has been removed — client and server both use literal slashes consistently with the writer endpoints and with the `url` fields returned inside `/models/*.json`.

`404` is a terminal error for a listed file; there is no alternate fallback path in the new contract.

### `POST /files` — create

```jsonc
// Request
{ "path": "analytics/overview.preql", "content": "..." }
```

- `201 Created` on success.
- `409 Conflict` if the path already exists. Client should fall back to `PUT` when it intends to overwrite.
- `400 Bad Request` for disallowed extensions (see below) or paths that escape the served directory (e.g. `..`).

### `PUT /files/{path}` — overwrite

```jsonc
// Request
{ "content": "..." }
```

- `200 OK` on success.
- `404 Not Found` if the path doesn't exist. Client should fall back to `POST` when the file should be created.

### `DELETE /files/{path}` — delete

- `204 No Content` on success.
- `404 Not Found` if already absent. Client treats this as idempotent success.

#### Allowed write extensions

`.preql`, `.sql`, `.csv`, `.py`. Anything else → `400`. Renames are DELETE-then-POST.

### `POST /run`, `POST /refresh` *(unchanged)*

Jobs panel only. Body: `{ "target": "<path>" }` → returns `JobStatus` with `job_id`.

### `GET /jobs/{jobId}`, `POST /jobs/{jobId}/cancel` *(unchanged)*

Poll / cancel.

### Legacy endpoints (still served)

- **`GET /models/<safe-name>.json`** — returns `ModelImport` for the community-model browser. Not required for the remote-backed load/save path. `components[].url` values are now literal-slash `/files/<path>`.
- **`GET /state?target=...`** — watermark/staleness info emitted by the server; client does not currently consume it.

### Not in the contract

- `/share-link` — mock-server convenience only, not part of the production contract.
- Connection mutation — no endpoint to edit the store's connection via the client. Server owner edits `trilogy.toml` and restarts.

## Client behavior (informational)

This section describes how the client uses the contract, as context for maintainers.

### On store registration / load

1. Client registers a `GenericModelStore { baseUrl, token? }`.
2. At app load (and after registration), client calls `GET /index.json` + `GET /files`.
3. Client builds a `RemoteStoreSnapshot`:
   - **Editors** — one per `.preql` / `.sql` / `.py` file, with `storage='remote'`, `connection=<runtime connection name>`, `remoteStoreId=<store.id>`, `remotePath=<file path>`. `.csv` is skipped. Editors whose `remotePath` appears in `index.json#startup_scripts` additionally get `EditorTag.STARTUP_SCRIPT`; `runStartup` executes these in parallel against the runtime connection on every reset.
   - **Model** — one `ModelConfig` with `storage='remote'` and `sources` built from the `.preql` files.
   - **Runtime connection** — depends on `index.json#connection`:
     - If present and `type` matches a known client connection type → construct the corresponding real connection (`DuckDBConnection`, `BigQueryOauthConnection`, etc.) with `storage='remote'` and the declared `options`.
     - If absent or `type` is unknown → construct a `RemoteProjectConnection` (browse-only placeholder; queries throw). Surface a warning if `ModelImport.engine` from any discovered `/models/*.json` is non-`duckdb`, because that implies the store expects a non-DuckDB runtime the client cannot construct.
4. Snapshot entries are merged into Pinia stores. `storage='remote'` items are **not** persisted to `localStorage` — always re-fetched on reload.

**Dashboards are out-of-band.** A dashboard created against a remote-backed project is stored with `storage='local'` but its `connection` field references the runtime connection above. The dashboard survives refresh via `localStorage`; the connection is recreated from the store on each load; the two re-bind automatically as long as the store remains registered and reachable.

### On save

`RemoteStoreStorage.save*` iterates items with `storage='remote'` and writes them back:

- **Editors** → `POST /files` to create, `PUT /files/{path}` to overwrite, `DELETE /files/{path}` to remove. Renames are DELETE-then-POST. Client handles:
  - `409` on POST → fall back to `PUT`.
  - `404` on PUT → fall back to `POST`.
  - `404` on DELETE → treat as success.
- **Dashboards** → not written. Saved via `LocalStorage.saveDashboards` like any other local dashboard.
- **Model** / **runtime connection** → not written. Derived from `/index.json` + `/files`; configured server-side via `trilogy.toml`.

### Secrets

Tokens, passwords, and private keys are **never** stored in the remote store. The client's credential storage handles them per-user. `index.json#connection.options` is explicitly non-secret.

## Client implications (work items)

The counter-offer surfaces a few places where the current client needs to change to match the contract:

1. **No silent DuckDB default.** `RemoteStoreStorage.loadStore` today creates a `RemoteProjectConnection` when `connection` is absent. It must not fabricate a DuckDB connection instead — that was a latent footgun for non-DuckDB stores. Keep the browse-only fallback; surface a visible warning when `ModelImport.engine` implies a real runtime is expected.
2. **`bigquery` vs `bigquery-oauth`.** The server only emits `bigquery`. The client currently has both as distinct `connectionTypes`. Decision needed: when the server says `bigquery`, do we (a) always construct `BigQueryOauthConnection` because OAuth is the end-user default, (b) introduce an `options.auth: "oauth" | "service-account"` flag, or (c) consult per-user credential state? Recommend (a) for the first cut, revisit if service-account-from-remote becomes a real use case.
3. **Write-endpoint status codes.** `remoteStoreStorage.saveEditors` calls `createStoreFile` / `updateStoreFile` / `deleteStoreFile` based on `editor.remotePersisted`. With the new status codes, add defensive handling:
   - `createStoreFile` → on `409`, retry as `updateStoreFile`.
   - `updateStoreFile` → on `404`, retry as `createStoreFile`.
   - `deleteStoreFile` → on `404`, swallow and treat as success.
4. **Literal-slash paths.** `encodePath` in `lib/remotes/jobsService.ts` already does `encodeURIComponent` per segment with literal `/` between — matches the contract. Verify no other client code is re-encoding slashes.

## Migration / backward compatibility

- Stores that don't serve `connection` on `/index.json` remain usable as read-only browse targets (`RemoteProjectConnection`). No silent DuckDB fabrication.
- Stores that haven't switched to literal-slash path encoding: client requires the new encoding. Servers on the old scheme need to update before the client can read them.

## Reference: what changes in `pyserver/mock_model_server.py`

1. Extend `StoreIndex` with `project_name: Optional[str] = None` and `connection: Optional[ConnectionSpec] = None`.
2. Add `ConnectionSpec(BaseModel)` with `type: str` and `options: dict[str, str] = {}`.
3. Implement `GET /files`, `GET /files/{path}`, `POST /files`, `PUT /files/{path}`, `DELETE /files/{path}` backed by a directory on disk. Return `201` / `409` / `200` / `404` / `204` per contract. Enforce allowed extensions and reject path traversal with `400`.
4. Emit literal-slash paths (both in `/files` listings and in any `url` fields inside `/models/*.json`).
5. Seed the backing directory with at least one `.preql` file so the example store exercises the editor code path.
6. Existing `/models/*.json` endpoints stay; `/share-link` stays as a mock-only convenience (not part of the production contract).
