import { Buffer } from 'buffer'

window.Buffer = Buffer
// polyfill for SQL Server Driver
// @ts-ignore
Error.captureStackTrace = (targetObject: object, constructorOpt?: Function) => {}
import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import '@mdi/font/css/materialdesignicons.css'
import './style.css'
import './tabulator-style.css'
import { languages } from 'monaco-editor'
import monacoEditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { configureTrilogy } from 'trilogy-studio-core/monaco'

import 'prismjs/plugins/line-numbers/prism-line-numbers.css'
import 'prismjs'
import 'prismjs/components/prism-sql'

self.MonacoEnvironment = {
  getWorker: function (_, label) {
    switch (label) {
      default:
        return new monacoEditorWorker()
    }
  },
}

configureTrilogy(languages)

const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)

function removeLoadingScreen() {
  console.log("Attempting to remove loading screen...");
  const loadingElement = document.getElementById('loading-screen');
  
  if (loadingElement) {
      console.log("Loading screen found, removing...");
      // Direct removal without transitions
      if (loadingElement.parentNode) {
          loadingElement.parentNode.removeChild(loadingElement);
          console.log("Loading screen removed successfully");
      } else {
          console.error("Parent node not found");
      }
  } else {
      console.error("Loading screen element not found");
  }
}

removeLoadingScreen();
app.mount('#app')


