import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import { initializeCspTracking } from '../lib/remotes/modelApiService'
import '../lib/icons/registerMdiIcons'
import './style.css'
import './tabulator-style.css'

import 'prismjs/plugins/line-numbers/prism-line-numbers.css'
import 'prismjs'
// Do NOT statically import Prism language components here.
//
// The components (prism-sql, prism-python, ...) are bare scripts that mutate a
// global `Prism`; they declare no dependency on the core, so nothing forces the
// bundler to order them after it. A static import lets the component end up as
// a chunk-level dependency that evaluates *before* `import 'prismjs'` above —
// static imports are hoisted and evaluated in source order, so App.vue on line
// 2 and its whole graph run first — and the component then throws
// `ReferenceError: Prism is not defined` at module scope. That is an uncaught
// exception during boot, so it takes down the entire app shell, not just syntax
// highlighting.
//
// Load them through ensurePrismLanguagesReady() in lib/utility/prism.ts
// instead: it holds a real import of the core, so the core is guaranteed
// evaluated before it dynamically imports any component. It always includes
// 'sql' and guards on Prism.languages.sql, so this import was redundant anyway.
import './prism.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'

// Initialize CSP violation tracking
initializeCspTracking()
self.MonacoEnvironment = {
  getWorker: async function (_, label) {
    switch (label) {
      default:
        const monacoEditorWorker = await import('monaco-editor/esm/vs/editor/editor.worker?worker')
        return new monacoEditorWorker.default()
    }
  },
}

async function initializeTrilogy() {
  const { configureTrilogy } = await import('../lib/monaco')
  configureTrilogy()
}

const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)

// Start loading trilogy configuration in the background after Pinia is available.
initializeTrilogy().catch(console.error)

function removeLoadingScreen() {
  const loadingElement = document.getElementById('loading-screen')

  if (loadingElement) {
    // Direct removal without transitions
    if (loadingElement.parentNode) {
      loadingElement.parentNode.removeChild(loadingElement)
    } else {
      console.error('Loading screen element parent not found')
    }
  } else {
    console.error('Loading screen element not found')
  }
}

removeLoadingScreen()
app.mount('#app')
