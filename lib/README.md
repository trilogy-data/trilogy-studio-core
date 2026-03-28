# Trilogy Studio Components

This package contains core UI components for [Trilogy Studio](https://trilogydata.dev/trilogy-studio-core), which can be used to embed interactive dashboards into other applications easily.

Vue-only. Very much prototype/experimental.

## Recommended Entry Points

For embedded dashboard consumers, prefer the narrow dashboard-focused entrypoint instead of the root package:

```ts
import {
  Dashboard,
  DashboardChart,
  DashboardQueryExecutor,
  QueryExecutionService,
  TrilogyEmbedProvider,
  createCrossFilterController,
} from '@trilogy-data/trilogy-studio-components/dashboard'
```

Available public subpaths:

- `@trilogy-data/trilogy-studio-components/dashboard`
- `@trilogy-data/trilogy-studio-components/embed`
- `@trilogy-data/trilogy-studio-components/views`
- `@trilogy-data/trilogy-studio-components/monaco`
- `@trilogy-data/trilogy-studio-components/stores`
- `@trilogy-data/trilogy-studio-components/connections`
- `@trilogy-data/trilogy-studio-components/llm`

There is no root package export. Import one of the explicit subpaths above so bundle-splitting stays predictable.

## Self-Hosted DuckDB Assets

Consumers using `DuckDBConnection` can override the default DuckDB asset loading and point the
connection layer at app-hosted worker and wasm files:

```ts
import {
  DuckDBConnection,
  configureDuckDBAssets,
  type DuckDBAssetUrls,
} from '@trilogy-data/trilogy-studio-components/connections'

const duckdbAssets: DuckDBAssetUrls = {
  mvp: {
    mainModule: '/duckdb/duckdb-mvp.wasm',
    mainWorker: '/duckdb/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: '/duckdb/duckdb-eh.wasm',
    mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
  },
}

configureDuckDBAssets(duckdbAssets)

const connection = new DuckDBConnection('Local analytics')
await connection.reset()
```

This is useful when an embedding app already has another DuckDB runtime, or wants to avoid the
`jsDelivr` fallback and serve the assets from its own origin.

For actual asset deduplication across the main app bundle and web workers, prefer stable URLs from
the host app's `public/` assets or another static host. Importing DuckDB files with `?url` from
multiple Vite build graphs can still emit duplicate hashed files even when they resolve to the same
source package.

## Embedding Themes

Embedded consumers can now provide theme information without wiring the full Studio `userSettingsStore`.

Theme resolution order is:

1. Explicit embed theme from `TrilogyEmbedProvider`
2. Injected Studio `userSettingsStore` theme, if present
3. Default `'dark'`

Basic usage:

```vue
<script setup lang="ts">
import { TrilogyEmbedProvider, Dashboard } from '@trilogy-data/trilogy-studio-components/dashboard'
</script>

<template>
  <TrilogyEmbedProvider theme="light">
    <Dashboard />
  </TrilogyEmbedProvider>
</template>
```

You can also pass a richer theme object:

```ts
const theme = {
  mode: 'dark',
  variables: {
    '--special-text': '#22c55e',
    '--panel-header-bg': '#0b1220',
  },
}
```

