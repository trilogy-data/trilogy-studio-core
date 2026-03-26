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

