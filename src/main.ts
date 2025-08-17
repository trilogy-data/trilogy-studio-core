import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import '@mdi/font/css/materialdesignicons.css'
import './style.css'
import './tabulator-style.css'

import 'prismjs/plugins/line-numbers/prism-line-numbers.css'
import 'prismjs'
import 'prismjs/components/prism-sql'
import './prism.css'
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
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
  const { configureTrilogy } = await import('trilogy-studio-components/monaco')
  configureTrilogy()
}
// Start loading trilogy configuration in the background
initializeTrilogy().catch(console.error)

const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)

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
