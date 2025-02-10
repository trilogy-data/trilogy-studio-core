<template>
    <div class="p-4">
      <h1 class="text-2xl font-bold mb-4">Model Configurations</h1>
      <div v-for="(config, index) in modelConfigs" :key="index" class="mb-6 border rounded-lg p-4">
        <h2 class="text-xl font-semibold">{{ config.name }}</h2>
        <ul class="mb-4">
          <li v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">
            {{ source }}
          </li>
        </ul>
        <div class="flex space-x-2">
          <button
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            @click="fetchParseResults(index)"
          >
            Fetch Parse Results
          </button>
          <button
            class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            @click="addNewSource(index)"
          >
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
              <li
                v-for="(datasource, datasourceIndex) in config.parseResults.datasources"
                :key="datasourceIndex"
              >
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
  import { defineComponent } from "vue";
  import {
    ModelConfig,
    ModelParseResults,
    Datasource,
    Concept,
    DataType,
    Purpose,
  } from "../models"; // Adjust the import path
  
  export default defineComponent({
    name: "ModelConfigViewer",
    data() {
      return {
        modelConfigs: [
          new ModelConfig(
            "Config A",
            ["source1.sql", "source2.sql"],
            new ModelParseResults(
              [
                new Concept("concept1", "Concept 1", "namespace1", DataType.STRING, Purpose.KEY),
                new Concept("concept2", "Concept 2", "namespace2", DataType.NUMBER, Purpose.METRIC),
              ],
              [
                new Datasource("Datasource A", "address-a", [], []),
                new Datasource("Datasource B", "address-b", [], []),
              ]
            )
          ),
          new ModelConfig(
            "Config B",
            ["source3.sql"],
            null // No parse results for this example
          ),
        ] as ModelConfig[],
      };
    },
    methods: {
      fetchParseResults(index: number) {
        console.log(`Fetching parse results for config at index ${index}`);
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
        this.modelConfigs[index].parseResults = mockParseResults;
      },
      addNewSource(index: number) {
        console.log(`Adding new source to config at index ${index}`);
        const newSource = `source${Math.random().toFixed(3).slice(2)}.sql`;
        this.modelConfigs[index].sources.push(newSource);
      },
    },
  });
  </script>
  
  <style scoped>
  /* Add any additional styling if needed */
  </style>
  