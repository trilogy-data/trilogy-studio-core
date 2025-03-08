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

languages.register({ id: 'trilogy' })
languages.setLanguageConfiguration('trilogy', {
  comments: {
    lineComment: '#',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '`', close: '`', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
})

languages.setMonarchTokensProvider('trilogy', {
  ignoreCase: true,
  tokenizer: {
    root: [
      // Match comments (lines starting with #)
      [/#.*/, 'comment'],

      // Match hidden
      [/\-\-.*/, 'hidden'],

      // Match Keywords (SELECT, WHERE, ORDER, BY)
      [
        /(^|\s)(IMPORT|SELECT|WHERE|ORDER|ASC|DESC|LIMIT|HAVING|DATASOURCE|GRAIN|BY|AS)(?=\s|$|,|;)/,
        'keyword',
      ],

      // Match definitions (auto, property, metric)
      [/(^|\s)(AUTO|PROPERTY|KEY|METRIC)(\s|$)/, 'definition'],

      // Match types (e.g., ::type, such as ::date or ::int)
      [/::[a-zA-Z0-9_]+/, 'type'],

      // Match operators (like ->, <-, *, +, -, /, !)
      [/\<\-|\-\>|\*|\+|\-|\/|\!/, 'operator'],

      // match first part of <a,b>.b or a.b
      [/\<[a-zA-Z0-9\_\.\,]+\>\./, 'property'],
      [/([a-zA-Z0-9\_]+)\./, 'property'],
      // Match strings (enclosed in single or double quotes)
      [/['"`][^'"]*['"`]/, 'string'],

      // Match numbers (integers and floats)
      [/\b\d+(\.\d+)?\b/, 'number'],

      // Match delimiters (like commas, colons, parentheses)
      [/[(),;=]/, 'delimiter'],

      // Match variable or property names (e.g., line_item, discounted_price)
      // [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, "variable"],
      [
        /(^|\s)(current_date|current_datetime|cast|sum|max|avg|count|min|length|round|coalesce|concat|upper|lower|trim|date|now)(?=\()/,
        'function',
      ],

      // Additional special handling for `->` or `as` for renaming (like `sum(line_item.extended_price)-> base_price`)
      [/\->|\bas\b/, 'operator'],
    ],
  },
})

const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)

app.mount('#app')
