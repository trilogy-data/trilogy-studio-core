<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { LocalStorage } from '../data'
import {
  useEditorStore,
  useConnectionStore,
  useModelConfigStore,
  useUserSettingsStore,
  TrilogyResolver,
  useLLMConnectionStore,
  useDashboardStore,
  useCommunityApiStore,
} from '../stores'

let defaultResolver = 'https://trilogy-service.fly.dev'
let userSettingsStore = useUserSettingsStore()
userSettingsStore.loadSettings()
const Manager = defineAsyncComponent(() => {
  return import('../stores/Manager.vue')
})

if (import.meta.env.DEV) {
  console.log(
    'Running in development mode, defaults are local resolver and telemetry off (unless otherwise set)',
  )
  defaultResolver = 'http://127.0.0.1:5678'
  // default telemetry to off for local
  if (userSettingsStore.settings.telemetryEnabled === null) {
    userSettingsStore.updateSetting('telemetryEnabled', false)
    userSettingsStore.updateSetting('trilogyResolver', defaultResolver)
  }
}

const apiUrl = import.meta.env.VITE_RESOLVER_URL
  ? import.meta.env.VITE_RESOLVER_URL
  : defaultResolver

const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
if (!userSettingsStore.settings.theme) {
  userSettingsStore.updateSetting('theme', systemPrefersDark ? 'dark' : 'light')
}
if (userSettingsStore.settings.trilogyResolver === '') {
  userSettingsStore.updateSetting('trilogyResolver', apiUrl)
}

userSettingsStore.toggleTheme()

let resolver = new TrilogyResolver(userSettingsStore)

let localStorage = new LocalStorage()

let contentSources = [localStorage]

let store = useEditorStore()

let connections = useConnectionStore()

let models = useModelConfigStore()

let llms = useLLMConnectionStore()

let dashboards = useDashboardStore()

let communityApiStore = useCommunityApiStore()

</script>
<!-- @ts-nocheck -->
<template>
  <!-- @ts-ignore -->
  <div class="main">
    <!-- @ts-ignore -->
    <Manager
      :connectionStore="connections"
      :editorStore="store"
      :trilogyResolver="resolver"
      :modelStore="models"
      :storageSources="contentSources"
      :userSettingsStore="userSettingsStore"
      :dashboardStore="dashboards"
      :llmConnectionStore="llms"
      :communityApiStore="communityApiStore"
    >
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
