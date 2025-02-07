<script setup lang="ts">
import { DataTable, Editor, EditorList, EditorModel, SidebarLayout, VerticalSplitLayout, IDE, Manager } from 'trilogy-studio-core';
import { MotherDuckConnection } from 'trilogy-studio-core/connections';
import 'font-awesome/css/font-awesome.css';
import { DuckDBConnection } from 'trilogy-studio-core/connections';
import { EditorLocalStorage } from 'trilogy-studio-core/data';
import { useEditorStore, useConnectionStore, AxiosTrilogyResolver } from 'trilogy-studio-core/stores';
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css"
import { ref, reactive } from "vue";
import token from './.token.ts'
import axios from 'axios';

// let connection = new MotherDuckConnection(
//   'test-connection',
//   token

// );
let connection = new DuckDBConnection(
  'test-connection',
);

let resolver = new AxiosTrilogyResolver('http://127.0.0.1:5678')

let localEditors = new EditorLocalStorage('test-connection')

let editorSources = [localEditors]

let local = localEditors.loadEditors()

if (Object.keys(local).length == 0) {
  const editor1 = new EditorModel(
    { name: "Test Editor", type: "text", connection: "test-connection", contents: ref('select 1 as fun;') },

  )

  const editor2 = new EditorModel(
    { name: "Test Editor 2", type: "text", connection: "test-connection", contents: ref('select 1') },

  )
  localEditors.saveEditors([editor1, editor2])
}



let store = useEditorStore();
console.log('store')
console.log(store)
console.log(store.editors); // Should print an empty object `{}` initially
// store.addEditor(editor1)
// store.addEditor(editor2)

let connections = useConnectionStore();

connections.addConnection(connection);


</script>

<template>
  <div class="main">
    <Manager :connectionStore="connections" :editorStore="store" :trilogyResolver="resolver" ,
      :editorSources="editorSources">
      <IDE />
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
