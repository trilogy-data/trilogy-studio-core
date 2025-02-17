import { Buffer } from 'buffer';

window.Buffer = Buffer;
// polyfill for SQL Server Driver
// @ts-ignore
Error.captureStackTrace = (targetObject: object, constructorOpt?: Function) => { };
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
import '@mdi/font/css/materialdesignicons.css';
import "tabulator-tables/dist/css/tabulator.min.css";
if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    import("tabulator-tables/dist/css/tabulator_simple.css")
}
else {
    import("tabulator-tables/dist/css/tabulator_midnight.css")
}

import * as monaco from 'monaco-editor';
monaco.languages.register({ id: "trilogy" });
monaco.languages.setLanguageConfiguration('trilogy', {
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
});

monaco.languages.setMonarchTokensProvider("trilogy", {
    ignoreCase:true,
	tokenizer: {
		root: [
            // Match comments (lines starting with #)
            [/#.*/, "comment"],
            
            // Match hidden
            [/\-\-.*/, "hidden"],

            // Match SQL keywords (SELECT, WHERE, ORDER, BY)
            [/(^|\s)(SELECT|WHERE|ORDER|HAVING|DATASOURCE|GRAIN|BY|AS)(\s|$)/, "keyword"],
        
            // Match definitions (auto, property, metric)
            [/auto|property|metric|import/, "definition"],
        
            // Match types (e.g., ::type, such as ::date or ::int)
            [/::[a-zA-Z0-9_]+/, "type"],
        
            // Match operators (like ->, <-, *, +, -, /, !)
            [/\<\-|\-\>|\*|\+|\-|\/|\!/, "operator"],
        
            // Match strings (enclosed in single or double quotes)
            [/['"][^'"]*['"]/, "string"],
        
            // Match numbers (integers and floats)
            [/\b\d+(\.\d+)?\b/, "number"],
        
            // Match delimiters (like commas, colons, parentheses)
            [/[(),;=]/, "delimiter"],
        
            // Match variable or property names (e.g., line_item, discounted_price)
            // [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, "variable"],
            [/\s(sum|max|avg|count|min|length|round|coalesce|concat|upper|lower|trim|date|now)\b/, "function"],
        
            // Additional special handling for `->` or `as` for renaming (like `sum(line_item.extended_price)-> base_price`)
            [/\->|\bas\b/, "operator"],
        ],
	},
});

const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)

app.mount('#app')

