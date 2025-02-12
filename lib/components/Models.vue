<template>
  <div class="model-display">
    <div v-for="(config, index) in modelConfigs" :key="index" class="card">
      <section :id="config.name" class="model-section">
        <h3 class="card-title">{{ config.name }}</h3>
        <div class="button-container">
          <button class="button" @click="fetchParseResults(index)">
            Fetch Parse Results
          </button>
          <div class="flex relative-container">
            <button class="button" @click="newSourceVisible[index] = true">
              Add New Source
            </button>

            <div v-if="newSourceVisible[index]" class="absolute-form">
              <form @submit.prevent="submitSourceAddition(index)">
                <div>
                  <label for="connection-name">Editors</label>
                  <select v-model="sourceDetails.name" id="editor-name" required>
                    <option v-for="editor in editorList" :key="editor" :value="editor">
                      {{ editor }}
                    </option>
                  </select>
                </div>

                <button type="submit">Submit</button>
                <button type="button" @click="newSourceVisible[index] = !newSourceVisible[index]">Cancel</button>
              </form>
            </div>
          </div>
          <button class="button" @click="clearSources(index)">
            Clear Sources
          </button>
        </div>
        <ul class="source-list">
          <li v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">
            {{ source }}
          </li>
        </ul>

        <div v-if="config.parseResults" class="parse-results">
          <div>
            <div class="toggle-concepts" @click="toggleConcepts(index)">
              Concepts ({{ config.parseResults.concepts.length }}) {{ isExpanded[index] ? '' : '>' }}
            </div>
          </div>
          <div v-show="isExpanded[index]" class="concepts-list">
            <ul>
              <li v-for="(concept, conceptIndex) in config.parseResults.concepts" :key="conceptIndex">
                {{ concept.name }} ({{ concept.datatype }})
              </li>
            </ul>
          </div>
          <div class="datasources">
            <strong>Datasources:</strong>
            <ul>
              <li v-for="(datasource, datasourceIndex) in config.parseResults.datasources" :key="datasourceIndex">
                {{ datasource.name }} ({{ datasource.address }})
              </li>
            </ul>
          </div>
        </div>
        <div v-else class="no-results">
          <em>No parse results available.</em>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.model-display {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  padding: 20px;
  margin: 0 auto;
}

.card {
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.source-list {
  margin-bottom: 16px;
  color: #666;
}

.button-container {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.button {
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.fetch-button {
  background-color: #007bff;
}

.fetch-button:hover {
  background-color: #0056b3;
}

.add-button {
  background-color: #28a745;
}

.add-button:hover {
  background-color: #1e7e34;
}

.parse-results {
  margin-top: 16px;
}

.toggle-concepts {
  color: #007bff;
  cursor: pointer;
  text-decoration: underline;
  font-size: 1.1rem;
}

.toggle-concepts:hover {
  color: #0056b3;
}

.concepts-list ul,
.datasources ul {
  list-style: disc;
  padding-left: 20px;
  color: #666;
}

.no-results {
  margin-top: 16px;
  color: #999;
}
</style>

<script lang="ts">
import { defineComponent, inject, ref } from "vue";
import {
  ModelConfig,
  ModelParseResults,
  Datasource,
  Concept,
  DataType,
  Purpose,
} from "../models"; // Adjust the import path
import type { ModelConfigStoreType } from "../stores/modelStore";
import type { EditorStoreType } from "../stores/editorStore";
import AxiosResolver from "../stores/resolver";
export default defineComponent({
  name: "ModelConfigViewer",
  setup() {
    const sourceDetails = ref({
      name: '',
    });

    const modelStore = inject<ModelConfigStoreType>("modelStore");
    const editorStore = inject<EditorStoreType>("editorStore");
    const trilogyResolver = inject<AxiosResolver>("trilogyResolver");
    if (!modelStore || !editorStore || !trilogyResolver) {
      throw new Error("Missing model store or editor store!");
    }
    const isExpanded = ref<Record<string, boolean>>({});

    const toggleConcepts = (index: string) => {
      isExpanded.value[index] = !isExpanded.value[index];
    };

    const newSourceVisible = ref<Record<string, boolean>>({});


    // Function to submit the editor details
    const submitSourceAddition = (model: string) => {
      if (sourceDetails.value.name) {
        let target = modelStore.models[model];
        target.sources.push(sourceDetails.value.name);
      }
    };

    return { modelStore, editorStore, isExpanded, toggleConcepts, newSourceVisible, submitSourceAddition, sourceDetails, trilogyResolver };
  },
  computed: {
    modelConfigs(): Record<string, ModelConfig> {
      return this.modelStore.models;
    },
    editorList(): string[] {
      return Object.values(this.editorStore.editors).map((editor) => editor.name);
    },
  },
  methods: {
    fetchParseResults(model: string) {
      this.trilogyResolver
        .resolveModel(model, this.modelConfigs[model].sources.map((source) => ({ alias: source, contents: (this.editorStore.editors[source] || { contents: "" }).contents })))
        .then((parseResults) => {
          this.modelStore.setModelConfigParseResults(model, parseResults);
        })
        .catch((error) => {
          this.modelStore.setModelParseError(model, error.message);
          console.error("Failed to fetch parse results:", error);
        });
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
    clearSources(model: string) {
      this.modelConfigs[model].sources = [];
    },
  },
});
</script>
