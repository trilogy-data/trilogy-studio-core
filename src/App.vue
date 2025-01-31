<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import { Test, DataTable, Editor, EditorModel } from 'trilogy-studio-core';
import  "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css"
import { ref, reactive } from "vue";

var loading = false;


const editor = new EditorModel(
  {name: "Test Editor", type: "text", connection:"test-connection"},
  
)

const headers = new Map([
  ["id", { name: "id", datatype: "string", purpose: "key" }],
  ["name", { name: "name", datatype: "string", purpose: "key" }],
  ["progress", { name: "progress", datatype: "number", purpose: "data" }],
  ["gender", { name: "gender", datatype: "string", purpose: "key" }]


]);

var tabledata = reactive([
  { id: 1, name: "Oli Bob", progress: 12, gender: "male", rating: 1, col: "red", dob: "19/02/1984", car: 1 },
  { id: 2, name: "Mary May", progress: 1, gender: "female", rating: 2, col: "blue", dob: "14/05/1982", car: true },
  { id: 3, name: "Christine Lobowski", progress: 42, gender: "female", rating: 0, col: "green", dob: "22/05/1982", car: "true" },
  { id: 4, name: "Brendon Philips", progress: 100, gender: "male", rating: 1, col: "orange", dob: "01/08/1980" },
  { id: 5, name: "Margret Marmajuke", progress: 16, gender: "female", rating: 5, col: "yellow", dob: "31/01/1999" },
  { id: 6, name: "Frank Harbours", progress: 38, gender: "male", rating: 4, col: "red", dob: "12/05/1966", car: 1 },
]);

function addData() {
  let id = tabledata.length + 1
  tabledata.push({ id: id, name: "Data", progress : 24, gender: "male", rating: 4, col: "red", dob: "12/05/1966", car: 1 })
  console.log(tabledata)
}
function submitQuery() {
  console.log("submitting query")
  loading=true;
  setTimeout(() => {
    loading = false;
    addData()
  }, 2000);

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
  </div >
<div  class="table"> 
  editor here
  <Editor :editorData="editor" :submitCallback="submitQuery"></Editor>
</div>

 
 <div> <DataTable :headers="headers" :results="tabledata"  /></div>
  
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
  width : 500px;
  height : 500px;
}
</style>
