<script setup lang="ts">
// @ts-ignore
import { EditorModel, IDE, Manager } from 'trilogy-studio-core';
import { DuckDBConnection, BigQueryOauthConnection } from 'trilogy-studio-core/connections';
import { ModelConfig, ModelParseResults, Concept, Datasource, DataType, Purpose } from 'trilogy-studio-core/models';
import { LocalStorage } from 'trilogy-studio-core/data';
import { useEditorStore, useConnectionStore, useModelConfigStore, AxiosTrilogyResolver } from 'trilogy-studio-core/stores';

import { ref } from "vue";


let connection = new DuckDBConnection(
  'test-connection',
);
let connection2 = new BigQueryOauthConnection(
  'test-connection2',
  'preqldata'
);
const apiUrl = import.meta.env.VITE_RESOLVER_URL ? import.meta.env.VITE_RESOLVER_URL : 'https://trilogy-service.fly.dev';

let resolver = new AxiosTrilogyResolver(apiUrl);

let localStorage = new LocalStorage()

let contentSources = [localStorage]

let local = localStorage.loadEditors()

if (Object.keys(local).length == 0) {
  const editor1 = new EditorModel(
    { name: "Test Editor", type: "text", connection: "test-connection", storage: "local", contents: ref('select 1 as fun;') },

  )

  const editor2 = new EditorModel(
    { name: "Test Editor 2", type: "text", connection: "test-connection", storage: "local", contents: ref('select 1') },

  )
  localStorage.saveEditors([editor1, editor2])
}

let store = useEditorStore();

let connections = useConnectionStore();
connections.addConnection(connection);
connections.addConnection(connection2);

let models = useModelConfigStore();
let modelConfigs = [
  new ModelConfig(
    {
      name: "Config A",
      storage: 'local',
      sources: ["source1.sql", "source2.sql"],
      parseResults: new ModelParseResults(
        [
          new Concept("concept1", "Concept 1", "namespace1", DataType.STRING, Purpose.KEY),
          new Concept("concept2", "Concept 2", "namespace2", DataType.NUMBER, Purpose.METRIC),
        ],
        [
          new Datasource("Datasource A", "address-a", [], []),
          new Datasource("Datasource B", "address-b", [], []),
        ]
      )
    }
  ),
  new ModelConfig(
    {
      name: "Config C",
      storage: 'local',
      sources: ["source1.sql", "source2.sql"],
      parseResults: new ModelParseResults(
        [
          new Concept("concept1", "Concept 1", "namespace1", DataType.STRING, Purpose.KEY),
          new Concept("concept2", "Concept 2", "namespace2", DataType.NUMBER, Purpose.METRIC),
        ],
        [
          new Datasource("Datasource A", "address-a", [], []),
          new Datasource("Datasource B", "address-b", [], []),
        ]
      )
    }
  ),
  new ModelConfig({
    name: "Config B",
    storage: 'local',
    sources: ["source3.sql"],
    parseResults: null // No parse results for this example
  }
  ),
] as ModelConfig[]
modelConfigs.forEach((config) => {
  models.addModelConfig(config)
})



</script>

<template>
  <div class="main">
    <Manager :connectionStore="connections" :editorStore="store" :trilogyResolver="resolver" :modelStore="models"
      :storageSources="contentSources">
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
