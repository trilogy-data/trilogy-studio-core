# Trilogy Studio Components

This package contains core UI components for [Trilogy Studio](https://trilogydata.dev/trilogy-studio-core), which can be used to embed interactive dashboards into other applications easily.

Vue-only. Very much prototype/experimental.

## Embedding Themes

Embedded consumers can now provide theme information without wiring the full Studio `userSettingsStore`.

Theme resolution order is:

1. Explicit embed theme from `TrilogyEmbedProvider`
2. Injected Studio `userSettingsStore` theme, if present
3. Default `'dark'`

Basic usage:

```vue
<script setup lang="ts">
import { TrilogyEmbedProvider, Dashboard } from '@trilogy-data/trilogy-studio-components'
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

