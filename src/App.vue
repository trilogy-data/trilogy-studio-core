<script setup lang="ts">
// @ts-ignore
import { EditorModel, IDE, MobileIDE, Manager } from 'trilogy-studio-core'
import { LocalStorage } from 'trilogy-studio-core/data'
import {
  useEditorStore,
  useConnectionStore,
  useModelConfigStore,
  AxiosTrilogyResolver,
} from 'trilogy-studio-core/stores'
import {
  Tabulator,
  ResizeColumnsModule,
  DownloadModule,
  FormatModule,
  FilterModule,
  SortModule,
  EditModule,
  ExportModule,
} from 'tabulator-tables'

Tabulator.registerModule([
  ResizeColumnsModule,
  DownloadModule,
  FormatModule,
  FilterModule,
  SortModule,
  EditModule,
  ExportModule,
])

const apiUrl = import.meta.env.VITE_RESOLVER_URL
  ? import.meta.env.VITE_RESOLVER_URL
  : 'https://trilogy-service.fly.dev'

let resolver = new AxiosTrilogyResolver(apiUrl)

let localStorage = new LocalStorage()

let contentSources = [localStorage]

let store = useEditorStore()

let connections = useConnectionStore()

let models = useModelConfigStore()

</script>

<template>
  <div class="main">
    <Manager
      :connectionStore="connections"
      :editorStore="store"
      :trilogyResolver="resolver"
      :modelStore="models"
      :storageSources="contentSources"
    >
      <IDE />
    </Manager>
  </div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}

.main {
  width: 100vw;
  height: 100vh;
}
</style>
