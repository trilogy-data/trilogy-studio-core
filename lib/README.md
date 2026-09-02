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
  useEmbeddedDashboardGroup,
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

## Shared Embedded Dashboard Execution

When an embedding app renders several independent dashboard charts on one page, prefer a shared
embedded dashboard group instead of creating one `DashboardQueryExecutor` per chart. The group
coalesces sibling refreshes into `generate_queries` calls, so Trilogy only resolves imports and
model context once per batch.

```ts
import { useEmbeddedDashboardGroup } from '@trilogy-data/trilogy-studio-components/dashboard'

const embeddedGroup = useEmbeddedDashboardGroup({
  dashboardId: 'summary-usbtv',
  connectionId: 'tree-duckdb',
  queryExecutionService,
  imports: SUMMARY_IMPORTS,
})

embeddedGroup.registerItem({
  itemId: 'top-species',
  title: 'Top Species',
  query: 'select species, count(tree_id) as tree_count;',
})

embeddedGroup.registerItem({
  itemId: 'native-status',
  title: 'Native Status',
  query: 'select native_status, count(tree_id) as tree_count;',
})

embeddedGroup.scheduleRun('top-species')
embeddedGroup.scheduleRun('native-status')
```

This is the intended fit for tree-style summary pages that compose several standalone charts.

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

## Chat Documentation Tools

The chat toolset carries the docs pack: `search_docs` and `read_doc` let the agent look up Trilogy
idioms (window functions, date handling, filtering on aggregates) from the in-app documentation
instead of guessing at syntax, and the system prompt tells it to. `open_documentation` is in the
same pack; it needs app navigation and reports itself unavailable without it, so an embedding
host typically withholds it with `disabledTools` (below).

## Adding Host Tools to a Chat

`useTrilogyChat` (and `useChatWithTools` for persistent chats) also takes `extraTools`: tools the
host application defines, each a definition for the model plus the function that runs it. They
are sent after the built-ins and ahead of `return_to_user`, and a call to one runs the host's
executor instead of the library's registry. A host tool may not reuse a built-in name.

```ts
const chat = useTrilogyChat({
  dataConnectionName: 'my-database',
  extraTools: [
    {
      definition: {
        name: 'show_in_view',
        description: 'Open the launches map filtered to a launch site.',
        input_schema: { type: 'object', properties: { site: { type: 'string' } }, required: ['site'] },
      },
      execute: async ({ site }) => {
        router.push({ name: 'rockets', query: { site } })
        return { success: true, message: `Opened the launches map for ${site}.` }
      },
    },
  ],
})
```

`customTools` remains the standalone-mode (no chat store) equivalent.

## Withholding Chat Tools

`useTrilogyChat` (and `useChatWithTools` for persistent chats) takes `disabledTools`, a list of
chat tool names — or a ref/getter for one — to keep out of the conversation. The tools are removed
from the request and the prompt guidance that asks for them is dropped, so the model is never told
to call something it cannot see. Use it when a host surface makes a tool pointless: a layout with
no artifact panel has nothing for `reorder_artifacts` to reorder.

```ts
const chat = useTrilogyChat({
  dataConnectionName: 'my-database',
  disabledTools: () => (isNarrowScreen.value ? ['reorder_artifacts'] : []),
})
```

The toolset is part of the provider's prompt-cache prefix, so keep the list stable within a
conversation where you can; each change costs one cache miss.

## Returning Control on Failure

A turn ends when the agent calls `return_to_user`. Left to itself, a model whose query keeps
failing tends to re-run it with small edits, or search the docs again, until the iteration cap
(50 for persistent chats) is spent — one paid call per attempt, with the user watching a spinner.
Two things guard against that:

- **The prompt says when to stop.** The chat agent prompt caps query corrections at two attempts,
  after which the model is told to call `return_to_user` with the error and what it tried, and to
  return rather than explore when a request is already answered or cannot be answered from the
  available sources.
- **The loop counts failures.** `runToolLoop` tracks consecutive failed tool calls (results with
  `success: false`; any success resets the streak). From the third failure in a row
  (`failureNudgeAfter`), each failed result carries a `<system_input>` note telling the model to
  change approach or hand control back; at the eighth (`maxConsecutiveFailures`, `0` to disable)
  the loop stops itself and persists a notice carrying the last error as the final assistant
  message. Both thresholds and the note's text (`consecutiveFailureReminder`) are `ToolLoopConfig`
  options; `ExecuteMessageOverrides` accepts the reminder text for custom toolsets.

## Styling Prerequisites

The package stylesheet (`@trilogy-data/trilogy-studio-components/style.css`) carries the
components' own styles only. Two things come from the host page:

- **Tabulator's base stylesheet.** `DataTable` is built on
  [Tabulator](https://tabulator.info/) and relies on its layout rules (nowrap headers, inline
  column and cell widths). Import one of Tabulator's sheets before the package stylesheet, e.g.
  `import 'tabulator-tables/dist/css/tabulator.min.css'`, and put any theme overrides after it.
  Without it the table renders with no layout at all — header columns wrap and cells lose their
  widths.
- **Icons beyond the registered set.** The package registers the Material Design Icons it uses
  itself as SVG masks (`lib/icons/registerMdiIcons.ts`), so those `mdi-*` classes need no icon
  font. A class outside that set is left untouched and renders with whatever the host provides,
  typically the `@mdi/font` webfont; with no font loaded it renders as nothing.

`DataTable` also takes `showControls` (default `true`). Set it `false` to drop the floating
copy/download buttons and call `copyToClipboard()` / `downloadData()` on the component through a
template ref from controls of your own.

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

