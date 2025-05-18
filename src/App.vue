<script setup lang="ts">
// @ts-ignore
import { Manager } from 'trilogy-studio-core'
import { LocalStorage } from 'trilogy-studio-core/data'
import { dataTypes } from 'trilogy-studio-core/language'
import {
  useEditorStore,
  useConnectionStore,
  useModelConfigStore,
  useUserSettingsStore,
  TrilogyResolver,
  useLLMConnectionStore,
  useDashboardStore,
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
  InteractionModule,
} from 'tabulator-tables'
import { Range, languages } from 'monaco-editor'

Tabulator.registerModule([
  ResizeColumnsModule,
  DownloadModule,
  FormatModule,
  FilterModule,
  SortModule,
  EditModule,
  ExportModule,
  PageModule,
  InteractionModule,
])

let defaultResolver = 'https://trilogy-service.fly.dev'
let userSettingsStore = useUserSettingsStore()
userSettingsStore.loadSettings()
//@ts-ignore
// if (typeof __IS_VITE__ !== 'undefined') {
//   console.log('Running in vite, assuming local environment')
//   defaultResolver = 'http://127.0.0.1:5678'
//   // default telemetry to off for local
//   if (userSettingsStore.settings.telemetryEnabled === null) {
//     userSettingsStore.updateSetting('telemetryEnabled', false)
//   }
// }

const apiUrl = import.meta.env.VITE_RESOLVER_URL
  ? import.meta.env.VITE_RESOLVER_URL
  : defaultResolver

const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
if (!userSettingsStore.settings.theme) {
  userSettingsStore.updateSetting('theme', systemPrefersDark ? 'dark' : 'light')
}
if (!userSettingsStore.settings.trilogyResolver) {
  userSettingsStore.updateSetting('trilogyResolver', apiUrl)
}

userSettingsStore.toggleTheme()

let resolver = new TrilogyResolver(userSettingsStore.getSettings['trilogyResolver'])

let localStorage = new LocalStorage()

let contentSources = [localStorage]

let store = useEditorStore()

let connections = useConnectionStore()

let models = useModelConfigStore()

let llms = useLLMConnectionStore()

let dashboards = useDashboardStore()

// add model autocompletion
function getModelCompletions(word: string, range: Range) {
  // returning a static list of proposals, not even looking at the prefix (filtering is done by the Monaco editor),
  // here you could do a server side lookup
  let completions = store.getCurrentEditorAutocomplete(word)
  return completions.map((completion) => {
    return {
      label: completion.label,
      kind: languages.CompletionItemKind.Variable,
      insertText: completion.insertText,
      range: range,
      commitCharacters: ['\t'],
    }
  })
}

function getLastContiguousToken(line: string): string | null {
  const match = line.match(/(\S+)(?:\s*$)/)
  return match ? match[0] : null
}

interface Completion {
  label: string
  kind: languages.CompletionItemKind
  insertText: string
  range: Range
}

languages.registerCompletionItemProvider('trilogy', {
  provideCompletionItems: function (model, position) {
    // const word = model.getWordUntilPosition(position);
    const lineContent = model.getLineContent(position.lineNumber)
    const cursorIndex = position.column - 1 // Convert Monaco 1-based column to 0-based index
    // Extract all non-whitespace characters before `.`
    const lineToCursor = lineContent.substring(0, cursorIndex)
    const match = getLastContiguousToken(lineToCursor)
    let fullIdentifier = match ? match : ''
    const range = new Range(
      position.lineNumber,
      position.column - fullIdentifier.length,
      position.lineNumber,
      position.column,
    )
    let suggestions: Completion[] = []
    if (fullIdentifier === '') {
      suggestions = []
    } else if (fullIdentifier.endsWith('::')) {
      suggestions = dataTypes.map((type) => ({
        label: `${fullIdentifier}${type.label}`,
        kind: languages.CompletionItemKind.Enum,
        insertText: `${fullIdentifier}${type.label}`,
        range: range,
        commitCharacters: ['\t'],
      }))
    } else {
      suggestions = getModelCompletions(fullIdentifier, range)
    }
    return {
      suggestions: suggestions,
    }
  },
  triggerCharacters: ['.'],
})
</script>

<template>
  <div class="main">
    <Manager
      :connectionStore="connections"
      :editorStore="store"
      :trilogyResolver="resolver"
      :modelStore="models"
      :storageSources="contentSources"
      :userSettingsStore="userSettingsStore"
      :dashboardStore="dashboards"
      :llmConnectionStore="llms"
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
