# Remote Worker Service: Scope and Status

Status: **v0 built, in Rust, over `query-bridge`.** The section below describes what shipped.
Sections 1-11 are the original proposal. They are kept because their threat model (§4), limits
(§5) and driver reasoning (§6) still apply. Where the build departs from them, §0 says so.

## 0. What was built

### Shape

- **One driver implementation.** `engine/` is a small axum server (`trilogy-engine`) over the
  explorer's `query-bridge` crate, built with only the `databricks` feature. The desktop app's
  in-process worker and the hosted engine run the same Databricks client
  (`query-bridge/src/workers/databricks/client.rs`): settings, statement submit/poll/cancel,
  result collection, describe, and the egress policy (`egress.rs`). A fix to either lands in both.
- **Its own service, not part of the resolver.** `engine/` is a separate Fly app
  (`trilogy-engine`) with its own image, machines and secrets. pyserver (the resolver) is
  CPU-bound and wants dedicated cores; the engine is I/O-bound but memory-heavy and is an outbound
  proxy to customer warehouses. They scale on different signals, and the engine's network
  position and Databricks secrets stay out of the resolver's process.
- **Stateless, not session-based** (a departure from §2). The engine scales to zero and wakes
  more machines under load, so a session table would need sticky routing. Instead every call
  carries the connection config and the warehouse holds the statement; the client drives it by
  statement id. The browser keeps the "session" (`lib/connections/httpRemoteWorkerHost.ts`), so
  `RemoteWorkerHost` is unchanged and nothing is lost on a restart. This is why the engine calls
  the crate's `Client` directly rather than `SessionManager`, which stays the desktop's
  in-process model.
- **Submit, then poll.** A statement call never holds a request open longer than `poll`
  (default 10 s). This settles open question 3: no request comes near the Fly proxy's 60 s idle
  timeout.
- **`trilogy serve`** runs the same binary as a subprocess and proxies `<store>/engine/*` to it
  (see below), rather than linking anything.

### Wire contract (`/v1` on the engine; `<store>/engine/v1` behind `trilogy serve`)

Every `/v1` route requires auth.

| Route | Body | Response |
| --- | --- | --- |
| `GET /info` | none | drivers, whether a server warehouse is configured, limits |
| `POST /connect` | `{driver, config}` | `{queryType, capabilities}`; a warehouse metadata call, which doesn't start the warehouse |
| `POST /statements` | `{driver, config, sql, parameters}` | `200` Arrow IPC (`X-Row-Count`, `X-Duration-Ms`, `X-Statement-Id`) or `202 {statementId}` |
| `POST /statements/{id}` | `{driver, config}` | same as above (a poll) |
| `POST /statements/{id}/cancel` | `{driver, config}` | `{canceled: true}` |
| `POST /script` | `{driver, config, sql}` | `204` |
| `POST /describe/{kind}` (`databases`, `schemas`, `tables`, `columns`, `table`) | `{driver, config, database, schema, table}` | the existing camelCase DTOs |

Errors are `{code, message, detail}`, with the codes from §2: `unauthorized` 401,
`invalid_request` 400 (including egress refusals and malformed bodies), `canceled` 409,
`too_large` 413, `overloaded` 503 + `Retry-After`, `driver_error` / `upstream_unreachable` 502,
`timeout` 504. They map one-to-one from `BridgeError`, which gained `EgressDenied`, `TooLarge`
and `Timeout`.

### Credentials

A call either names its own workspace (`host`, `httpPath` / `warehouseId`, `token`) or names none
of them and runs on the server's warehouse (`DATABRICKS_HOST` / `DATABRICKS_HTTP_PATH` /
`DATABRICKS_TOKEN`, optional `DATABRICKS_CATALOG` / `DATABRICKS_SCHEMA`). The two are **never
mixed** (`DatabricksSettings::resolve`): a caller-supplied host must come with a caller-supplied
token, so the server's token can't be sent to a host the caller picked. `catalog` / `schema` can
always be overridden. `TRILOGY_ENGINE_ALLOW_CALLER_CREDENTIALS=0` pins the engine to the server
warehouse.

### Auth and configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRILOGY_ENGINE_API_KEYS` | unset | `keyId:sha256hex,...`. **Unset means only `/health` is served.** Keys are compared in constant time. `trilogy-engine new-key <id>` mints a key and its entry. |
| `TRILOGY_ENGINE_STRICT_EGRESS` | on | the §4 policy: Databricks host suffixes, https/443 only, no private or loopback resolution (checked up front and again in the connector's resolver), no proxy env, API paths under `/api/2.0/sql/` |
| `TRILOGY_ENGINE_DATABRICKS_HOST_SUFFIXES` | the four cloud suffixes | override the allowlist |
| `TRILOGY_ENGINE_ALLOW_PRIVATE_EGRESS` | off | let a self-host reach private-link workspaces |
| `TRILOGY_ENGINE_POLL_SECONDS` / `TRILOGY_ENGINE_SYNC_SECONDS` | 10 / 50 | per-request wait; budget for describe and scripts |
| `TRILOGY_ENGINE_MAX_RESULT_BYTES` | 128 MiB | checked against the manifest, while downloading, and on the re-encoded stream |
| `TRILOGY_ENGINE_MAX_INFLIGHT` | 6 | calls holding a warehouse request at once; past it, 503 immediately |
| `TRILOGY_ENGINE_ALLOWED_ORIGINS` | none | extra CORS origins beyond the studio, the desktop shell and localhost |
| `HOST` / `PORT` | `127.0.0.1` / `5680` | the image sets `0.0.0.0` / `8080` |

Deploying, from the **repo root** (the image needs the crate): `fly launch --config
engine/fly.toml --copy-config --no-deploy` once to create the `trilogy-engine` app, then
`fly secrets set -a trilogy-engine TRILOGY_ENGINE_API_KEYS=... DATABRICKS_HOST=...
DATABRICKS_HTTP_PATH=... DATABRICKS_TOKEN=...` and `fly deploy . --config engine/fly.toml`.
`fly.toml` explains the memory budget behind its limits. The image is distroless, runs as
non-root, and its build runs the offline test suite.

### Egress finding: result links redirect

Live testing showed that results on Databricks-managed storage
(`*.storage.cloud.databricks.com`) answer **`307` to a sibling path** once they are larger than a
few MB. §4.4's `redirects(0)` would therefore break every large query. The client now sets
`redirects(0)` and follows download redirects **by hand** (at most 5 hops), re-running the egress
check on every hop. The link's own headers go only to the host Databricks named, and the token is
never attached. API calls follow no redirects. This replaced ureq's implicit redirect following in
the desktop worker too, so both hosts behave the same.

### Studio

- **`createHttpRemoteWorkerHost`** implements `RemoteWorkerHost` over the wire contract.
  `engineKey` (bearer) and `engineUrl` (base override) are host fields, stripped from the config
  before it is sent.
- **Fallback host.** `Manager.vue` installs it with `setDefaultRemoteWorkerHost`, pointing at
  the `remoteEngineUrl` user setting (default `https://trilogy-engine.fly.dev`;
  `VITE_ENGINE_URL` overrides the default, and dev builds use `http://127.0.0.1:5680`). It is
  independent of `trilogyResolver`. A connection's `engineUrl` overrides it, and a host
  registered by a shell (Tauri) still wins.
- **Connection.** "Databricks (Remote Engine)" in the connection creator makes a
  `remote-worker:databricks` connection: the same type the explorer uses.
  - Only the secrets the user actually entered become `secretFields`. Several are stored as one
    JSON credential.
  - The sidebar gets a re-entry row per secret, plus a save-credential toggle.
- **`trilogy serve` stores** advertising `connection.type = databricks` get a
  `RemoteWorkerConnection` with an explicit HTTP host at `<store>/engine`. It sends the store's
  `X-Trilogy-Token` and holds no warehouse secret (see `remote-store-contract.md`).

### `trilogy serve` (pytrilogy side, not yet done)

Serve runs `trilogy-engine` as a **subprocess** on loopback and proxies to it:

1. Mint a per-run engine key, start `trilogy-engine` with `HOST=127.0.0.1`, a free `PORT`,
   `TRILOGY_ENGINE_API_KEYS=serve:<digest>`, `TRILOGY_ENGINE_STRICT_EGRESS=0` (the user's own
   machine) and `DATABRICKS_*` from `[engine.config]`.
2. Proxy `<store>/engine/*` to it: check the store's `X-Trilogy-Token` as for every other
   route, then forward with `Authorization: Bearer <per-run key>`.
3. Map `Dialects.DATABRICKS` to `databricks` in `connection_spec.py`, publishing `catalog` /
   `schema`, and add `X-Row-Count`, `X-Duration-Ms` and `X-Statement-Id` to its CORS
   `expose_headers`.

That needs a `trilogy-engine` binary on the user's machine. Publishing it is open: GitHub release
assets per platform next to the studio bundle, fetched by serve the way it fetches the bundle,
are the likely route.

### Tests

- **`query-bridge`** (`src/workers/databricks/tests.rs`, `egress.rs`): the existing worker tests,
  plus redirect hops, link headers kept to their host, redirect loops, the size cap, out-of-band
  cancel, credential separation, the strict API-path prefix, and IP classification. CI runs
  them with and without DuckDB.
- **`engine/tests/engine.rs`** (offline, against a scripted Databricks): the HTTP contract.
  Privacy without keys, auth, CORS, connect, error passthrough without the token, credential
  separation, strict egress, malformed bodies, LZ4 multi-chunk results with a redirect, empty
  results, submit/poll, cancel, failures, list parameters, the size cap, load shedding, scripts
  and describe.
- **`engine/tests/live.rs`** and `query-bridge/tests/databricks_live.rs` (skipped without
  `DATABRICKS_*`): the engine under the strict policy (typed parameters, 4M rows across
  redirecting chunks, describe, error passthrough) and the desktop worker.
- **`lib/connections/httpRemoteWorkerHost.test.ts`**: wire behaviour, cancel, error mapping, the
  multi-secret credential round trip, host precedence.
- **`e2e/databricks-remote-engine.spec.ts`** (opt-in via `E2E_ENGINE_KEY`): create the connection
  in the UI and run a query.

---

## Original proposal

This is the design scope for an authenticated, deployable HTTP service that hosts the Rust
`query-bridge` crate. It would let the **web** Trilogy Studio run queries against warehouses the
browser can't reach directly.

The first target is Databricks. Its SQL Statement API sends no CORS headers: a preflight from a
browser origin gets a bare `401` with no `Access-Control-*` headers. That is why the Databricks
connection currently ships as desktop-only, in the explorer's in-process bridge.

**Summary:** the crate already has the right shape for this. It is driver-agnostic, keeps a
session map, has an out-of-band cancel handle, and returns one Arrow IPC buffer per query. The
service can be a thin axum layer over `SessionManager`. The real work is in four areas the
desktop host never needed:

1. **Egress control.** The service must not become an open proxy.
2. **Session ownership and reaping.**
3. **Limits.** Query deadline and result size.
4. **Caller authentication.**

None of these changes the wire protocol.

---

## 1. What exists today

| Claim | Where |
| --- | --- |
| `SessionManager` is synchronous. It uses `parking_lot::Mutex` for the session map and a per-session worker mutex, with UUID v4 session ids. | `explorer/src-tauri/crates/query-bridge/src/manager.rs` |
| `QueryWorker::execute` returns the full IPC stream as a `Vec<u8>` ("Phase 5 will swap this for a streaming callback"). | `src/workers/mod.rs` |
| Cancel goes through a `CancelHandle` that lives outside the worker mutex. | `manager.rs` `cancel()` |
| `BridgeError::SessionNotFound` displays as `session not found: <id>`. That prefix is a contract the TS side depends on. | `src/protocol.rs`; `lib/connections/remoteWorker.ts` `isSessionNotFoundError` |
| **No idle reaping exists.** `Session` holds only `worker` + `cancel`. | `manager.rs` |
| Drivers are compiled in per feature. The default is `["duckdb", "databricks"]`. | `crates/query-bridge/Cargo.toml` |
| The Databricks worker uses ureq 2.12 (sync, rustls, `proxy-from-env`) with `EXTERNAL_LINKS` + `ARROW_STREAM`, and polls with a 5 s `wait_timeout`. `http://` is accepted only for loopback. Presigned downloads never carry the token. API paths taken from responses must be rooted (`Client::url`). | `src/workers/databricks.rs` |
| Databricks sessions are stateless between statements: a session is just a validated client plus its credential. | `databricks.rs` header |
| `build()` calls `GET /api/2.0/sql/warehouses/{id}`, so connecting costs one round trip but never starts the warehouse. | `DatabricksFactory::build` |
| The Tauri host returns execute bytes through `tauri::ipc::Response`. `rowCount` is always 0. Every `remote_*` command is `#[tauri::command(async)]`, so none of them block the main thread. | `explorer/src-tauri/src/lib.rs`, `explorer/src/storage/tauriRemoteWorkerHost.ts` |
| Only Tauri registers a host. The web studio registers none. | `explorer/src/composables/useExecutionContext.ts` |
| `RemoteWorkerConnection` takes `secretFields`. Those config keys persist only as `'saved'` or `''`, and are restored through `getSecret`/`setSecret`, the same way as MotherDuck and Snowflake. | `lib/connections/remoteWorker.ts`; `lib/stores/Manager.vue` |
| A `session not found` error resets the connection **without retrying**, so the user sees one failed query. | `remoteWorker.ts` `withSessionRecovery` |
| pyserver has no caller auth. It applies a CORS origin regex and a body-size middleware, and its 503 admission gate rejects excess work rather than queueing it without bound. | `pyserver/server_policy.py`, `pyserver/main.py`, `pyserver/studio_endpoints.py` `_run_gated` |
| pyserver's access log records route, origin, latency and machine, but no body, query string or headers. | `pyserver/access_log.py` |
| CI runs `cargo test` on query-bridge twice: once with default features and once Databricks-only. Nothing deploys to Fly from CI; pyserver is deployed by hand. | `.github/workflows/test.yml` |
| `src-tauri/Cargo.lock` is gitignored. | `explorer/src-tauri/.gitignore` |

---

## 2. Transport and API shape

**Decision: plain HTTPS. Requests are JSON over REST-style RPC, and Arrow comes back as a binary
response body. No WebSocket.**

Why not a WebSocket:

- `execute` already produces a single buffer, so streaming gains nothing yet.
- Cancel is a separate call in the interface anyway.
- The browser WebSocket API can't set an `Authorization` header.
- Long-lived sockets fight Fly's scale-to-zero.

Batch streaming can come later as a chunked `fetch` body (`ReadableStream`, one `onBatch` per IPC
message) without changing the transport.

All routes live under `/v1` and require `Authorization: Bearer <key>`, except `/health`.

| `RemoteWorkerHost` method | Endpoint | Response |
| --- | --- | --- |
| `connect(args)` | `POST /v1/sessions`, body `ConnectArgs` | `201` `ConnectResult` |
| `execute(req, onBatch)` | `POST /v1/sessions/{sid}/execute`, body `{sql, parameters, identifier}` | `200` `application/vnd.apache.arrow.stream`, plus `X-Row-Count` and `X-Duration-Ms` |
| `executeScript(sid, sql)` | `POST /v1/sessions/{sid}/script`, body `{sql}` | `204` |
| `cancel(sid, id)` | `POST /v1/sessions/{sid}/cancel`, body `{identifier}` | `200 {"canceled": bool}` |
| `describe*` | `POST /v1/sessions/{sid}/describe/{databases\|schemas\|tables\|columns\|table}`, body `{database, schema, table}` | `200` JSON DTOs (the existing camelCase serde shapes) |
| `disconnect(sid)` | `DELETE /v1/sessions/{sid}` | `204`, idempotent |
| `setWorkingDirectory` | Not exposed. It is a host-filesystem concept and optional in the interface. | none |
| (new) | `GET /v1/info` | enabled drivers, limits, version |
| (new) | `GET /health` (no auth; never takes a session lock) | `200` |

Describe uses POST with a JSON body because catalog and table names can contain `.`, `/` and
spaces. Every authenticated request is preflighted regardless of method, so this costs nothing.

**Error envelope:** `{"code": "...", "message": "..."}`.

- `message` is always the `BridgeError` `Display` string.
- The TS host throws `new Error(message)`, which keeps the `session not found` contract working
  with no TS change.

| Condition | Status | `code` |
| --- | --- | --- |
| `SessionNotFound`, including a session owned by another principal | 404 | `session_not_found` |
| `Canceled` | 409 | `canceled` |
| `UnknownDriver`, `InvalidConfig`, egress-policy denial | 400 | `invalid_request` |
| `Driver` | 502 | `driver_error` |
| `Io` | 502 | `upstream_unreachable` |
| Auth | 401 / 403 | `unauthorized` |
| Limits | 413 / 429 / 503 / 504 | `too_large` / `rate_limited` / `overloaded` / `timeout` |

**CORS** comes from `tower-http`'s `CorsLayer`:

- **Origins:** reuse pyserver's allowed-origin patterns, configurable with `QB_ALLOWED_ORIGINS`.
- **Allowed headers:** `Authorization`, `Content-Type`.
- **Exposed headers:** `X-Row-Count`, `X-Duration-Ms`.
- **Credentials:** none.
- **`max_age`:** 600 s.

**Session lifecycle:**

- Sessions live in memory only.
- Idle TTL is `QB_SESSION_IDLE_SECS` (default 900); absolute TTL is `QB_SESSION_MAX_SECS`
  (default 8 h).
- A reaper runs every 60 s and skips sessions with a call in flight.
- A reaped or unknown session answers 404 `session not found: …`.
- If the client drops the response future, a drop guard in the execute handler calls `cancel`.

---

## 3. Caller authentication

| Option | Verdict |
| --- | --- |
| None | Loopback self-host only. `QB_AUTH=none` refuses to start on a non-loopback bind: an unauthenticated instance is an open egress proxy. |
| One shared key | Fine for self-host. Useless for the hosted web studio, because any key shipped in the bundle is public. |
| **Per-principal static API keys** | **v0 and v1.** Configured as `QB_API_KEYS="<keyId>:<sha256>,…"` (a Fly secret) and compared in constant time. `keyId` is the principal used for session ownership, quotas and logs. Hosted v1 is invite-only. |
| **OIDC / JWT** | **Later.** Validate ID tokens against a JWKS (Google and/or GitHub). The principal is `iss`+`sub`. Needs sign-in UX the studio doesn't have yet. |
| Warehouse credential as auth (anonymous, strict allowlist) | A possible "public tier". With §4's allowlist the service can only reach Databricks, and only with the caller's own token. Revisit once v1 usage is known. |

Each session records its owner principal. A request from any other principal gets the same 404
as a missing session.

In the browser, the API key goes through the credential manager (`lib/stores/Manager.vue`), not
plain `userSettings`.

---

## 4. Warehouse credentials, trust model, egress

**Credential custody:** the token is sent with each connect and held only in session memory.
There is no vault in v0 or v1.

- The token arrives in `ConnectArgs.config`, lives inside the worker's `Client`, and is dropped
  on disconnect or reap.
- A vault would turn the service into a high-value store, and it needs real user identity
  first.

**Trust model:** whoever operates the service can read tokens held in memory.

- For self-host, that's the user themselves.
- For the hosted service, users have to trust the operator. Say so in the connection form, and
  recommend short-lived or scoped tokens.

**Never log secrets:**

- Don't log request bodies: `ConnectArgs` derives `Debug` and carries the token.
- `TraceLayer` records route, status, latency and principal only. SQL text isn't logged either.
- `api_error_message` never echoes request headers.
- Wrap the token in a `Secret(String)` newtype with a redacted `Debug`.

**SSRF / egress is the main new risk.** The worker is permissive by design for desktop:

- the API host can be any authority and port;
- `http://` is allowed for loopback;
- presigned download URLs and headers are used exactly as the response gives them;
- ureq follows redirects by default;
- `proxy-from-env` is enabled.

Add an `EgressPolicy` that `SessionManager` passes to factories. Desktop keeps `Permissive`; the
service uses `Strict`:

1. **Allowlist the API base host per driver.** For Databricks: `.cloud.databricks.com`,
   `.azuredatabricks.net`, `.gcp.databricks.com`, `.cloud.databricks.us`. Overridable with
   `QB_DATABRICKS_HOST_SUFFIXES`. https on port 443 only, with no loopback exception.
2. **Allowlist download hosts** for cloud storage: `.amazonaws.com`, `.blob.core.windows.net`,
   `.dfs.core.windows.net`, `storage.googleapis.com`. Confirm the list against real responses.
   https only.
3. **Keep internal links rooted** under `/api/2.0/sql/statements/`. `Client::url` already
   rejects unrooted and `//` paths, so a response can't redirect the token to another
   authority. Strict mode adds the prefix check.
4. **Disable redirects** with `AgentBuilder::redirects(0)`.
5. **Use a custom `ureq::Resolver`** that resolves the name, drops any address in a blocked
   range, and connects only to the addresses it vetted. Checking and connecting to the same IP
   closes DNS rebinding.
   - Blocked IPv4 ranges: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16,
     198.18/15, 224/4, 240/4.
   - Blocked IPv6 ranges: `::1`, `fc00::/7` (this includes Fly's `fdaa::/16`), `fe80::/10`, and
     IPv4-mapped / NAT64 forms of the above.
   - Names under `.internal` and `.flycast` are refused before resolution.
6. **Set no proxy env vars** in the service image, because `proxy-from-env` would bypass the
   resolver.

Private-link workspaces resolve to private IPs, so they are rejected by design. Self-hosters can
opt in with `QB_ALLOW_PRIVATE_EGRESS=1`.

---

## 5. Concurrency, limits, timeouts

**Runtime:** tokio (multi-thread) with axum and tower-http (CORS, trace, body limit). Every
`SessionManager` call runs in `spawn_blocking`. `max_blocking_threads` is capped (default 64).

**Admission**, mirroring pyserver's bounded, fail-fast gate:

| Scope | Limit | When exceeded |
| --- | --- | --- |
| Global in flight | `QB_MAX_INFLIGHT` (default 32) | 503 immediately |
| Per session | One async `Semaphore(1)`, acquired *before* `spawn_blocking` so queued calls don't park blocking threads; queue depth 4 | 429 |
| Per principal | 10 sessions, 8 concurrent calls | 429 |
| Global sessions | 500 | — |

`cancel` bypasses the per-session gate, as it does in `manager.rs`.

**Timeouts:**

- Connect: 30 s.
- Execute: `QB_QUERY_TIMEOUT_SECS` (default 300). On expiry, arm the cancel handle and return
  504.
- The worker also needs its own deadline. Its poll loop has none, and a stuck download read
  can't see the cancel flag. Pass `Limits { max_duration, max_result_bytes, max_rows }` into
  `WorkerFactory::build`.

**Result size:**

- `QB_MAX_RESULT_BYTES` (default 128 MiB) and `QB_MAX_ROWS` (default 2 M).
- The Databricks worker fails fast on the manifest's `total_byte_count` / `total_row_count`, and
  also checks the running download total.
- Plan memory at roughly 2.5 × cap × in-flight calls: downloaded chunks plus the re-encoded
  stream.

**Request body cap:** 2 MiB.

---

## 6. Drivers in the service build

Ship **`databricks` only**:

- `query-bridge = { default-features = false, features = ["databricks"] }`
- plus a runtime `QB_DRIVERS` allowlist.

**Exclude DuckDB.** In a shared service it hands every caller:

- `read_csv('/etc/...')`, `COPY ... TO`, `ATTACH`, `INSTALL`/`LOAD`;
- httpfs, which bypasses the §4 resolver;
- `setWorkingDirectory`, which points at the server's filesystem.

The web studio already has duckdb-wasm. If remote DuckDB is ever wanted for single-user
self-host, gate it behind the `duckdb` feature *and* `QB_ENABLE_DUCKDB=1`, with
`enable_external_access=false` and `lock_configuration=true`.

---

## 7. Frontend wiring

1. **`lib/connections/httpRemoteWorkerHost.ts`**: `createHttpRemoteWorkerHost({ baseUrl,
   getApiKey })`, built on `fetch`.
   - `execute` reads `arrayBuffer()` and makes one `onBatch` call.
   - `rowCount` comes from `X-Row-Count`.
   - A non-2xx response throws `new Error(body.message)`.
2. **Registration.**
   - Add `UserSettings.queryBridgeUrl`.
   - At web boot, after settings load:
     `if (!getRemoteWorkerHost() && url) registerRemoteWorkerHost(createHttpRemoteWorkerHost(...))`.
     Tauri registers first, so desktop keeps its in-process bridge.
   - Re-register when the setting changes.
3. **One transparent retry** in `RemoteWorkerConnection`: on `session not found`, reconnect and
   replay the call once. This is safe because the manager raises that error before doing any
   work. It also hides cold starts and reaps.
4. **Connection creator.**
   - Add `{label: 'Databricks (Access Token)', value: 'databricks'}` to `connectionTypes`, plus a
     factory branch building `RemoteWorkerConnection({driver: 'databricks', queryType:
     'databricks', secretFields: ['token']})`.
   - Add a form in `ConnectionCreatorInline.vue`: host, HTTP path, token, catalog, schema, save
     credential. Its fields match the explorer's `ProjectEngineSection.vue`.
   - Disable the option, with a hint, when no host is registered or `/v1/info` doesn't list the
     driver. Hide "DuckDB (Native)" on web the same way.
   - Show an inline notice: "Your token is sent to `<bridge host>` and held in memory for this
     session only."
   - Settings: bridge URL, API key, and a Test button (`GET /v1/info`).

---

## 8. Deployment

**Crate:** `explorer/src-tauri/crates/query-bridge-server`, a binary depending on `query-bridge`
by path.

- Commit its own `Cargo.lock` and build with `--locked`. This is also where the supply-chain
  pinning that the gitignored desktop lockfile can't provide would happen.
- This may be the point to move both crates out of `explorer/src-tauri/` (e.g. to `rust/`).

**Dockerfile:**

- Stages: `cargo-chef` → `rust:1-bookworm` builder → `gcr.io/distroless/cc-debian12:nonroot`.
- rustls + webpki-roots means no OpenSSL. There's no DuckDB C++ build either, so it builds in
  minutes.
- Add a `healthcheck` subcommand for `HEALTHCHECK`, since distroless has no curl.

**Fly** — app `trilogy-query-bridge`, org `personal`:

- `internal_port=8080`, `force_https`, `auto_stop_machines='stop'`, `min_machines_running=0`.
- Concurrency `requests` soft 16 / hard 64.
- `/health` check every 15 s; Prometheus on `:9091/metrics`.
- `shared-cpu-2x` with 2 GB. The workload is mostly waiting on upstream and bounded by result
  buffer memory.
- **One machine in v1**, because sessions live in memory. A stopped machine loses its sessions,
  but a Databricks session is cheap to rebuild and the §7.3 retry hides it.
- To go multi-machine later: prefix session ids with `FLY_MACHINE_ID` and answer requests on the
  wrong machine with `fly-replay: instance=<id>`.
- Secret: `QB_API_KEYS`. Deploy by hand, as pyserver is today.

**Observability:**

- `tracing` JSON logs with route template, `keyId`, driver, session-id prefix, status, latency,
  bytes, rows and queue wait. No SQL, config or headers.
- Metrics: in-flight calls, session count, 503/429 counts, and upstream latency by driver.

**CI:** add a job path-filtered to `explorer/src-tauri/crates/**` that runs `fmt --check`,
`clippy -D warnings` and `cargo test` for the server, plus `docker build` without pushing. A
`fly deploy` workflow can come later.

---

## 9. Phased plan

**v0: self-host (~1.5 weeks)**

| Work | Effort |
| --- | --- |
| Crate: session `owner` / `last_used` / `created_at`, `reap_idle()`, a `Limits` argument to `build()`, Databricks deadline and size caps, `Secret` newtype | 2 d |
| Crate: `EgressPolicy` (allowlists, `redirects(0)`, guarded resolver) with IP-classifier tests | 2 d |
| Server: routes, error envelope, CORS, API-key auth, gates, timeouts, drop-guard cancel, reaper, `/health`, `/v1/info`, tracing | 3 d |
| TS: HTTP host, settings and registration, one-retry, Databricks creator form | 2–3 d |
| Dockerfile, "run it yourself" README, CI job | 1 d |

**v1: hosted (~1 more week)**

- Fly app, metrics, invite-only keys, a hosted default URL.
- Load test: 100 concurrent describes and 10 × 100 MB results, to size the VM.
- Threat review of §4, including tests that refuse `169.254.169.254`, `fdaa::`, a rebinding
  name, and a host containing `@`.

**Later:** OIDC principals, batch streaming, multi-machine `fly-replay`, more HTTP-native drivers
(e.g. the Snowflake SQL API as a CORS fallback), an optional vault.

## 10. Open questions

1. **pytrilogy release.** `Dialects.DATABRICKS` was merged upstream (trilogy-data/pytrilogy#999)
   but isn't in a release yet (0.3.503 lacks it), and pyserver pins 0.3.501. Until it ships and
   the pin is bumped, the resolver can't compile for `queryType: 'databricks'`. This blocks both
   the desktop connection and this service.
2. Which storage hosts actually appear in `external_links` across AWS, Azure and GCP? The answer
   finalises §4.2.
3. How does the Fly proxy handle a single request running for minutes? If timeouts bite, move
   execute to async submit-and-poll (`202` + `GET …/result`).
4. Should a hosted public tier (warehouse credential as auth) exist, after v1 usage data is in?

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| **Open proxy / SSRF** if any §4 control is missed. Highest impact. | Deny by default, plus resolver tests. |
| **Token custody** on hosted | In-form notice, memory-only storage, no logging. |
| **Memory blowups** from buffered results | Size caps × in-flight (§5). |
| **Cold start or reap** showing up as a failed query | The §7.3 retry. |
| **Feature-flag drift**: the default features include DuckDB, so a careless dependency line would ship it in the service | CI's Databricks-only build, plus a `/v1/info` assertion in the deploy smoke test. |
