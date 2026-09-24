# Static Store Contract

**Contract: `{kind: "static", version: 1}`.** Versioned independently of the live
[remote store contract](remote-store-contract.md); a catalog field added here never moves that
contract's `contractVersion`.

A static store is a **catalog**: an `index.json`, one manifest per model, and the raw component
files, served as flat files from any HTTP origin — a GCS or S3 bucket, a CDN, GitHub Pages, raw
GitHub. Studio browses it in the community screen and imports its models as local copies. It is
never written to, never sent an auth header, and never enters the live-store machinery (remote
editors, jobs, tokens). For a project server that does those things, see the `generic`
(`trilogy serve`) contract.

Producers today: `trilogy-public-models` (`studio/build.py`, served by GitHub Pages) and
trilogy-cloud workspace publishing (a subfolder of a public bucket).

## Registration

A store is identified by its `baseUrl`; studio fetches `${baseUrl}/index.json`. Its id is derived
from the URL (`buildGenericStoreId`: protocol stripped, `/` → `-`), except for stores added from a
GitHub repository, which keep the `${owner}-${repo}-${branch}` id.

Three ways in:

- **Add Store → Static files (URL)**: any `baseUrl`.
- **Add Store → GitHub repository**: owner/repo/branch, a preset that derives `baseUrl`:

  | Repo | `baseUrl` |
  |---|---|
  | `trilogy-data/trilogy-public-models` | `https://trilogy-data.github.io/trilogy-public-models/studio` |
  | any other | `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/studio` |

  Public repositories only.
- **Deep link**: `?store=<baseUrl>&kind=static` in the query string registers the store if absent
  and persists it. Without `kind`, `?store=&token=` keeps its older meaning (pairing a token with a
  `generic` store). Asset import links (`#screen=asset-import&…&store=<baseUrl>&kind=static`)
  register a static store the same way.

The origin must answer `GET` with CORS allowing the studio origin (`Access-Control-Allow-Origin: *`
is fine; no custom headers are sent, so there is no preflight).

## `GET ${baseUrl}/index.json`

```jsonc
{
  "contract": { "kind": "static", "version": 1 },  // optional hint
  "name": "Acme — sales",                           // optional display name
  "updated_at": "2026-09-24T12:00:00Z",            // optional, ISO 8601
  "generation": 3,                                  // optional, monotone per publisher
  "models": [
    {
      "name": "sales",
      "url": "v3/model.json",                       // absolute, or relative to index.json
      "engine": "bigquery",                         // optional card fields
      "description": "…",
      "tags": ["bigquery", "retail"]
    }
  ],
  "connection": { "type": "bigquery", "options": { "projectId": "acme" } }  // accepted, unused in v1
}
```

**Legacy shape.** `{count, files: [{filename, name?, engine?, description?, tags?}]}` (what
`trilogy-public-models` emits today) is normalized on read into `models[]`, with `url = filename`
resolved relative to the index. Entries whose `filename` does not end in `.json` are skipped.

## `GET <models[].url>` — the model manifest

Identical to the `ModelFile` the `generic` contract serves (`lib/remotes/models.ts`):

```jsonc
{
  "name": "sales",
  "engine": "bigquery",
  "description": "…markdown…",
  "components": [
    { "url": "files/orders.preql", "name": "orders", "alias": "orders", "purpose": "source", "type": "trilogy" },
    { "url": "files/entrypoint.preql", "name": "entrypoint", "alias": "entrypoint", "purpose": "entrypoint", "type": "trilogy" },
    { "url": "files/setup.sql", "name": "setup", "purpose": "setup", "type": "sql" },
    { "url": "files/examples/top.preql", "name": "top", "alias": "top", "purpose": "example", "type": "trilogy" },
    { "url": "files/examples/overview.json", "name": "overview", "purpose": "example", "type": "dashboard" }
  ]
}
```

- **`components[].url` may be relative**, resolved against the manifest's own URL. Absolute URLs
  pass through unchanged. Relative URLs are what make a published tree relocatable (bucket move,
  CDN in front) without rewriting it.
- `alias` is the name `import x` resolves against — for a nested source, the slash-separated path
  (`data/orders` for `import data.orders`).
- `purpose`: `source` and `setup` are tagged; `data` is skipped; anything else imports as an
  untagged editor. `(type, name)` must be unique within a manifest.
- Component bodies are fetched as text.

## Not in v1

- Auth on static origins. A private origin would add an optional token and a header, which brings
  a CORS preflight; that is its own decision.
- Lazy manifest fetching from the index card fields. Studio fetches every manifest today; the card
  fields make it possible later.
