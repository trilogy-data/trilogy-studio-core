<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import { Test, DataTable, Editor, EditorModel, SidebarLayout, VerticalSplitLayout } from 'trilogy-studio-core';
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css"
import { ref, reactive } from "vue";

import { MDConnection } from '@motherduck/wasm-client';
import token from './.token.ts'
import axios from 'axios';
var loading = false;

const connection = MDConnection.create({
  mdToken: token
});

var content = "SELECT 1;"


const editor = new EditorModel(
  { name: "Test Editor", type: "text", connection: "test-connection", contents: content },

)

var headers = reactive(new Map([
  ["id", { name: "id", datatype: "string", purpose: "key" }],
  ["name", { name: "name", datatype: "string", purpose: "key" }],
  ["progress", { name: "progress", datatype: "number", purpose: "data" }],
  ["gender", { name: "gender", datatype: "string", purpose: "key" }]


]));


var tabledata:ArrayLike<any> = ref([
]);

// function addData() {
//   let id = tabledata.length + 1
//   tabledata.push({ id: id, name: "Data", progress: 24, gender: "male", rating: 4, col: "red", dob: "12/05/1966", car: 1 })
//   console.log(tabledata)
// }
async function submitQuery() {
  console.log("submitting query")
  console.log(editor.contents)
  loading = true;

  let parsed = await axios.post('http://127.0.0.1:5678/generate_query', {
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
  } catch (err) {
    console.log('query failed', err);
  }


}

</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <div class="table">

    <SidebarLayout>
      <template #sidebar>
        <div>
          <button @click="addData">Add Data</button>
        </div>
      </template>
      <VerticalSplitLayout>
        <template v-slot:editor="{ x, y }">
          <Editor :editorData="editor" :submitCallback="submitQuery" :x="x" :y="y" />
        </template>
        <template #results>
          <DataTable :headers="headers" :results="tabledata" />
        </template>
      </VerticalSplitLayout>
    </SidebarLayout>

  </div>

  <div>
    <Test msg="TEST MESSAGE PLEASE IGNORE" />
    {{ tabledata }}
  </div>
  <HelloWorld msg="Vite + Vue" />
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

.table {
  width: 1000px;
  height: 1000px;

}
</style>
