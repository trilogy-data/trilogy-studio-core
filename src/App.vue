<script setup lang="ts">
// @ts-ignore
import { Manager } from 'trilogy-studio-core'
import { LocalStorage } from 'trilogy-studio-core/data'
import {
  useEditorStore,
  useConnectionStore,
  useModelConfigStore,
  useUserSettingsStore,
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
  PageModule,
} from 'tabulator-tables'

Tabulator.registerModule([
  ResizeColumnsModule,
  DownloadModule,
  FormatModule,
  FilterModule,
  SortModule,
  EditModule,
  ExportModule,
  PageModule,
])

const apiUrl = import.meta.env.VITE_RESOLVER_URL
  ? import.meta.env.VITE_RESOLVER_URL
  : 'https://trilogy-service.fly.dev'


let userSettingsStore = useUserSettingsStore()
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
userSettingsStore.updateSetting('trilogyResolver', apiUrl)
userSettingsStore.updateSetting('theme', systemPrefersDark ? 'dark' : 'light')
console.log(userSettingsStore.settings.theme)
userSettingsStore.toggleTheme()
userSettingsStore.toggleTheme()

let resolver = new AxiosTrilogyResolver(userSettingsStore.getSettings['trilogyResolver'])

let localStorage = new LocalStorage()

let contentSources = [localStorage]

let store = useEditorStore()

let connections = useConnectionStore()

let models = useModelConfigStore()

</script>

<template>
  <div class="main">
    <Manager :connectionStore="connections" :editorStore="store" :trilogyResolver="resolver" :modelStore="models"
      :storageSources="contentSources" :userSettingsStore="userSettingsStore">
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
