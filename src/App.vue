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
import * as monaco from 'monaco-editor'


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
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
userSettingsStore.updateSetting('trilogyResolver', apiUrl)
userSettingsStore.updateSetting('theme', systemPrefersDark ? 'dark' : 'light')
userSettingsStore.toggleTheme()
userSettingsStore.toggleTheme()

let resolver = new AxiosTrilogyResolver(userSettingsStore.getSettings['trilogyResolver'])

let localStorage = new LocalStorage()

let contentSources = [localStorage]

let store = useEditorStore()

let connections = useConnectionStore()

let models = useModelConfigStore()

// add model autocompletion
function getModelCompletions(word: string, range: monaco.Range) {
  // returning a static list of proposals, not even looking at the prefix (filtering is done by the Monaco editor),
  // here you could do a server side lookup
  let completions = store.getCurrentEditorAutocomplete(word)
  console.log(completions.length)
  return completions.map((completion) => {
    return {
      label: completion.label,
      kind: monaco.languages.CompletionItemKind.Variable,
      insertText: completion.insertText,
      range: range
    }
  })
}

function getLastDotSegment(text: string): string | null {
  const regex = /(?:^|[\s(])([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)$/;
  const match = text.match(regex);

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

function getLastContiguousToken(line: string): string | null {
    const match = line.match(/\S+$/);
    return match ? match[0] : null;
}

monaco.languages.registerCompletionItemProvider("trilogy", {
  provideCompletionItems: function (model, position) {
    // const word = model.getWordUntilPosition(position);
    const lineContent = model.getLineContent(position.lineNumber);
    const cursorIndex = position.column - 1; // Convert Monaco 1-based column to 0-based index

    // Extract all non-whitespace characters before `.`
    console.log(lineContent)
    console.log(lineContent.substring(0, cursorIndex))
    const match = getLastDotSegment(lineContent.substring(0, cursorIndex));
    console.log('FINAL')
    console.log(match)

    let fullIdentifier = match ? match[0] + "." : ""; // Include the `.`

    const range = new monaco.Range(
      position.lineNumber,
      position.column - fullIdentifier.length,
      position.lineNumber,
      position.column
    );
    return {
      suggestions: getModelCompletions(fullIdentifier, range)
    };
  },
  triggerCharacters: ["."]
});

// monaco.languages.registerCompletionItemProvider("trilogy", {
//   provideCompletionItems: function (model, position) {
//     const lineContent = model.getLineContent(position.lineNumber);
//     const cursorIndex = position.column - 1; // Convert Monaco 1-based column to 0-based index

//     // Check if text before cursor ends with ::
//     const textUntilPosition = lineContent.substring(0, cursorIndex);
//     if (!textUntilPosition.endsWith("::")) {
//       return { suggestions: [] };
//     }

//     // Define data types from the enum
//     const dataTypes = [
//       // PRIMITIVES
//       { label: "string", detail: "String type", documentation: "Basic string data type" },
//       { label: "bool", detail: "Boolean type", documentation: "True/False boolean value" },
//       { label: "map", detail: "Map type", documentation: "Key-value pair collection" },
//       { label: "list", detail: "List type", documentation: "Ordered collection of items" },
//       { label: "number", detail: "Number type", documentation: "Generic number type" },
//       { label: "float", detail: "Float type", documentation: "Floating-point number" },
//       { label: "numeric", detail: "Numeric type", documentation: "Arbitrary precision number" },
//       { label: "int", detail: "Integer type", documentation: "Integer value" },
//       { label: "bigint", detail: "Big Integer type", documentation: "Large integer value" },
//       { label: "date", detail: "Date type", documentation: "Calendar date without time" },
//       { label: "datetime", detail: "DateTime type", documentation: "Date with time" },
//       { label: "timestamp", detail: "Timestamp type", documentation: "Point in time" },
//       { label: "array", detail: "Array type", documentation: "Collection of items" },
//       { label: "date_part", detail: "Date Part type", documentation: "Part of a date" },
//       { label: "struct", detail: "Struct type", documentation: "Composite data structure" },
//       { label: "null", detail: "Null type", documentation: "Null/absent value" },
//       // GRANULAR
//       { label: "unix_seconds", detail: "Unix Seconds type", documentation: "Unix timestamp in seconds" },
//       // PARSING
//       { label: "unknown", detail: "Unknown type", documentation: "Type couldn't be determined" }
//     ];

//     // Create range for replacing text
//     const range = new monaco.Range(
//       position.lineNumber,
//       textUntilPosition.length - 1, // Start from the first colon
//       position.lineNumber,
//       position.column
//     );

//     // Create completion items
//     const suggestions = dataTypes.map(type => ({
//       label: type.label,
//       kind: monaco.languages.CompletionItemKind.Enum,
//       detail: type.detail,
//       documentation: type.documentation,
//       insertText: type.label,
//       range: range
//     }));

//     return {
//       suggestions: suggestions
//     };
//   },
//   triggerCharacters: [":"]
// });

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
