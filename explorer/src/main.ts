import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { setKvBackend } from '@lib/data/idbKv'
// Side-effect import: injects CSS for `.mdi mdi-*` icons used by lib
// components (send button, stop button, artifact icons, chevrons, etc.).
// Without this, every LLMChat icon renders as a 0-width nothing.
import '@lib/icons/registerMdiIcons'
// Tabulator CSS — lib's Results / DataTable / DatasourceTable / ConceptTable
// all render via tabulator-tables. Studio injects these via SCSS
// `additionalData` in vite.config; explorer has no SCSS pipeline so we
// import the CSS directly here. Default to the light stylesheet.
import 'tabulator-tables/dist/css/tabulator.min.css'
import App from './App.vue'
import { isTauri, tauriKvBackend } from './storage/tauriKvBackend'
import './style.css'

// Monaco worker — required so lib's CodeEditor renders. Mirror studio's
// setup; without this the editor mounts but throws inside its worker.
self.MonacoEnvironment = {
  getWorker: async function (_, _label) {
    const monacoEditorWorker = await import('monaco-editor/esm/vs/editor/editor.worker?worker')
    return new monacoEditorWorker.default()
  },
}

// Register Trilogy as a Monaco language so .preql files get syntax
// highlighting / completion. Lazy-loaded so initial bundle stays smaller.
async function initializeTrilogy() {
  const { configureTrilogy } = await import('@lib/monaco')
  configureTrilogy()
}
initializeTrilogy().catch(console.error)

// When running inside the Tauri shell, route lib's storage through the
// Rust-side filesystem commands so projects/chats/editors live in the app
// data dir as real JSON files (visible, backup-able, survives WebView
// storage clears). Browser dev keeps the default IndexedDB path.
if (isTauri()) {
  setKvBackend(tauriKvBackend)
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
