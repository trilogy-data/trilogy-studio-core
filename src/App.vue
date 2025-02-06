<script setup lang="ts">
import { DataTable, Editor, EditorList, EditorModel, SidebarLayout, VerticalSplitLayout, IDE, Manager } from 'trilogy-studio-core';
import { MotherDuckConnection } from 'trilogy-studio-core/connections';
import { useEditorStore, useConnectionStore } from 'trilogy-studio-core/data';
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css"
import { ref, reactive } from "vue";
import token from './.token.ts'
import axios from 'axios';

var loading = false;


var headers = reactive(new Map([
]));



var tabledata: ArrayLike<any> = ref([
]);

// function addData() {
//   let id = tabledata.length + 1
//   tabledata.push({ id: id, name: "Data", progress: 24, gender: "male", rating: 4, col: "red", dob: "12/05/1966", car: 1 })
//   console.log(tabledata)
// }
async function submitQuery() {
  loading = true;
  let parsed = await axios.post('https://trilogy-service.fly.dev/generate_query', {
    query: editor.contents,
    dialect: 'duckdb'
  })
  console.log(parsed.data)
  try {
    const result = await connection.evaluateQuery(parsed.data.generated_sql);
    headers = new Map(result.data.columnNames().map((header) => [header, { name: header, datatype: "string", purpose: "key" }],));
    console.log(result.data.toRows())
    tabledata.value = result.data.toRows();
    console.log('query result', result);
    console.log(tabledata)
    loading = false;
  } catch (err) {
    console.log('query failed', err);
    loading = false;
  }


}
let connection = new MotherDuckConnection(
  'test-connection',
  token

);




const editor1 = new EditorModel(
  { name: "Test Editor", type: "text", connection: "test-connection", contents: ref('select 1 as fun;') },

)

const editor2 = new EditorModel(
  { name: "Test Editor 2", type: "text", connection: "test-connection", contents: ref('select 1') },

)

let store = useEditorStore();
console.log('store')
console.log(store)
console.log(store.editors); // Should print an empty object `{}` initially
store.addEditor(editor1)
store.addEditor(editor2)

let connections = useConnectionStore();

connections.addConnection(connection);

let editors = ref([editor1, editor2])
</script>

<template>
  <div class="main">
    <Manager :connectionStore="connections" :editorStore="store"></Manager>
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
