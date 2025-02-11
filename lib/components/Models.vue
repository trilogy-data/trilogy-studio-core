<template>
  <div class="model-display">
    <h2 class="">Model Configurations</h2>
    <div v-for="(config, index) in modelConfigs" :key="index" class="mb-6 border rounded-lg p-4">
      <h2 class="text-xl font-semibold">{{ config.name }}</h2>
      <ul class="mb-4">
        <li v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">
          {{ source }}
        </li>
      </ul>
      <div class="flex space-x-2">
        <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" @click="fetchParseResults(index)">
          Fetch Parse Results
        </button>
        <button class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600" @click="addNewSource(index)">
          Add New Source
        </button>
      </div>
      <div v-if="config.parseResults" class="mt-4">
        <h3 class="text-lg font-bold">Parse Results</h3>
        <div>
          <strong>Concepts:</strong>
          <ul>
            <li v-for="(concept, conceptIndex) in config.parseResults.concepts" :key="conceptIndex">
              {{ concept.name }} ({{ concept.datatype }})
            </li>
          </ul>
        </div>
        <div>
          <strong>Datasources:</strong>
          <ul>
            <li v-for="(datasource, datasourceIndex) in config.parseResults.datasources" :key="datasourceIndex">
              {{ datasource.name }} - {{ datasource.address }}
            </li>
          </ul>
        </div>
      </div>
      <div v-else class="mt-4">
        <em>No parse results available.</em>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import {
  ModelConfig,
  ModelParseResults,
  Datasource,
  Concept,
  DataType,
  Purpose,
} from "../models"; // Adjust the import path
import type { ModelConfigStoreType } from "../stores/modelStore";
export default defineComponent({
  name: "ModelConfigViewer",
  setup() {
    const modelStore = inject<ModelConfigStoreType>('modelStore');
    if (!modelStore) {
      throw new Error('Model store is not provided!');
    }
    return { modelStore }
  },
  data() {
    return {
    };
  },
  computed: {
    modelConfigs(): Record<string, ModelConfig> {
      console.log(this.modelStore.models);
      return this.modelStore.models;
    },
  },
  methods: {
    fetchParseResults(model: string) {
      const mockParseResults = new ModelParseResults(
        [
          new Concept(
            "concept3",
            "Concept 3",
            "namespace3",
            DataType.BOOL,
            Purpose.PROPERTY
          ),
        ],
        [new Datasource("Datasource C", "address-c", [], [])]
      );
      this.modelStore.setModelConfigParseResults(model, mockParseResults);
    },
    addNewSource(model: string) {
      const newSource = `source${Math.random().toFixed(3).slice(2)}.sql`;
      this.modelConfigs[model].sources.push(newSource);
    },
  },
});
</script>

<style scoped>
.model-display {
  padding: 10px;
  margin: 0 auto;
}
</style>