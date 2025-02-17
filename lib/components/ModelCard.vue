<template>
    <section :id="config.name" class="model-section">
        <h3 class="card-title">{{ config.name }}</h3>
        <div class="button-container">
            <loading-button class="button" :action="() => fetchParseResults(index)">
                Parse
            </loading-button>
            <div class="flex relative-container">
                <button class="button" @click="newSourceVisible[index] = true">
                    Add New Source
                </button>

                <div v-if="newSourceVisible[index]" class="absolute-form">
                    <form @submit.prevent="submitSourceAddition(index)">
                        <div>
                            <label for="connection-name">Alias</label>
                            <input type="text" v-model="sourceDetails.alias" id="editor-alias" required />
                            <label for="connection-name">Editor</label>

                            <select v-model="sourceDetails.name" id="editor-name" required>
                                <option v-for="editor in editorList" :key="editor" :value="editor">
                                    {{ editor }}
                                </option>
                            </select>
                        </div>

                        <button type="submit">Submit</button>
                        <button type="button"
                            @click="newSourceVisible[index] = !newSourceVisible[index]">Cancel</button>
                    </form>
                </div>
            </div>
            <button class="button" @click="clearSources(index)">
                Clear Sources
            </button>
            <button class="button" @click="remove(index)">
                Delete
            </button>
        </div>
        <ul class="source-list">
            <li v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">

                <div class="editor-source" @click="onEditorClick(source)">
                    <div class="flex relative-container">{{ source.editor }} <span class="editor-source-alias">
                            (imported as {{
                                source.alias }})</span>
                        <button class="button delete-button" @click="removeSource(index, sourceIndex)">
                            Remove
                        </button>
                    </div>
                    <Editor :context="source.editor" class="editor-inline" v-if="isEditorExpanded[source.editor]"
                        :editorName="source.editor" />
                </div>



            </li>

        </ul>
        <div v-if="config.parseError" class="parse-error">
            <error-message><span>Error fetching parse results: {{ config.parseError }}</span></error-message>
        </div>
        <div v-else-if="config.parseResults" class="parse-results">
            <div>
                <div class="toggle-concepts" @click="toggleConcepts(index)">
                    {{ isExpanded[index] ? 'Hide' : 'Show' }} Concepts ({{ config.parseResults.concepts.length }})
                </div>
            </div>
            <div v-if="isExpanded[index]">
                <!-- <ModelConcept :config="config.parseResults" /> -->
                <ConceptTable :concepts="config.parseResults.concepts" />
            </div>
            <div class="datasources">
                <div class="toggle-concepts" @click="toggleDatasources(index)">
                    {{ isDatasourceExpanded[index] ? 'Hide' : 'Show' }} Datasources ({{
                        config.parseResults.datasources.length }})
                </div>
                <div v-if="isDatasourceExpanded[index]">
                    <DatasourceTable :datasources="config.parseResults.datasources" />
                </div>
            </div>
        </div>
        <div v-else class="no-results">
            <em>No parse results available.</em>
        </div>
    </section>

</template>

<style scoped>
.button {
    flex: .25
}

.delete-button {
    width: 100px;
    margin-left: 20px;
    font-size: 10px;
    height: 20px;
}

.editor-source {
    cursor: pointer;
    border-left: 1px solid var(--border);
    padding: 4px;
    margin-bottom: 10px;
    flex: 1;
}

.editor-source:hover {
    background-color: var(--bg-light);
}

.editor-source-alias {
    font-size: 0.875rem;
    color: var(--text-faint);
}

.editor-inline {
    height: 400px;
}


.card-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 0px;
}

.source-list {
    list-style: none;
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
    cursor: pointer;
    /* text-decoration: underline; */
    font-size: 1.1rem;
    background-color: var(--sidebar-bg);
    padding: 4px;
}

.toggle-concepts:hover {
    color: #0056b3;
}

.concepts-list ul,
.datasources ul {
    list-style: disc;
    padding-left: 20px;
    color: var(--text-faint);
}

.no-results {
    margin-top: 16px;
    color: var(--text-faint);
}

input,
select {
    font-size: 12px;
    border: 1px solid #ccc;
    /* Light gray border for inputs */
    border-radius: 0;
    /* Sharp corners */
    width: 95%;
    /* Full width of the container */
}

input:focus,
select:focus {
    border-color: #4b4b4b;
    /* Dark gray border on focus */
    outline: none;
}
</style>

<script lang="ts">
import { defineComponent, inject, ref, computed } from "vue";
import {
    ModelConfig,
} from "../models"; // Adjust the import path
import type { ModelConfigStoreType } from "../stores/modelStore";
import type { EditorStoreType } from "../stores/editorStore";
import ModelConcept from "./ModelConcept.vue";
import AxiosResolver from "../stores/resolver";
import LoadingButton from "./LoadingButton.vue";
import ErrorMessage from "./ErrorMessage.vue";
import ConceptTable from "./ConceptTable.vue";
import DatasourceTable from "./DatasourceTable.vue";
import Editor from "./Editor.vue";
export default defineComponent({
    name: "ModelConfigViewer",
    props: {
        config: {
            type: Object as () => ModelConfig,
            required: true,
        },
    },
    setup(props) {
        const sourceDetails = ref({
            name: '',
            alias: '',
        });

        const modelStore = inject<ModelConfigStoreType>("modelStore");
        const editorStore = inject<EditorStoreType>("editorStore");
        const trilogyResolver = inject<AxiosResolver>("trilogyResolver");
        if (!modelStore || !editorStore || !trilogyResolver) {
            throw new Error("Missing model store or editor store!");
        }
        const isExpanded = ref<Record<string, boolean>>({});
        const isDatasourceExpanded = ref<Record<string, boolean>>({});

        const isEditorExpanded = ref<Record<string, boolean>>({});

        const toggleConcepts = (index: string) => {
            isExpanded.value[index] = !isExpanded.value[index];
        };

        const toggleDatasources = (index: string) => {
            isDatasourceExpanded.value[index] = !isDatasourceExpanded.value[index];
        };

        const newSourceVisible = ref<Record<string, boolean>>({});

        const fetchParseResults = (model: string) => {
            return trilogyResolver
                .resolveModel(model, modelStore.models[model].sources.map((source) => ({ alias: source.alias, contents: (editorStore.editors[source.editor] || { contents: "" }).contents })))
                .then((parseResults) => {

                    modelStore.setModelConfigParseResults(model, parseResults);
                })
                .catch((error) => {
                    modelStore.setModelParseError(model, error.message);
                    console.error("Failed to fetch parse results:", error);
                });
        }

        // Function to submit the editor details
        const submitSourceAddition = (model: string) => {
            if (sourceDetails.value.name) {
                let target = modelStore.models[model];
                // check if it's already in the sources (sources are {name: string, alias: string}[])
                if (target.sources.some((source) => source.editor === sourceDetails.value.name)) {
                    console.error('Source already exists in model');
                } else {
                    target.sources.push({ alias: sourceDetails.value.alias, editor: sourceDetails.value.name });
                    fetchParseResults(model);
                }
            }
        };
        let index = computed(() => props.config.name);
        return { modelStore, editorStore, isExpanded, toggleConcepts, isDatasourceExpanded, newSourceVisible, submitSourceAddition, toggleDatasources, sourceDetails, trilogyResolver, fetchParseResults, isEditorExpanded, index };
    },
    components: {
        ModelConcept,
        LoadingButton,
        ErrorMessage,
        Editor,
        ConceptTable,
        DatasourceTable,
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
        clearSources(model: string) {
            this.modelConfigs[model].sources = [];
            this.fetchParseResults(model);
        },
        removeSource(model: string, sourceIndex: number) {
            this.modelConfigs[model].sources.splice(sourceIndex, 1);
            this.fetchParseResults(model);
        },
        remove(model: string) {
            this.modelStore.removeModelConfig(model);
        },
        onEditorClick(source: { alias: string; editor: string }) {
            this.isEditorExpanded[source.editor] = !this.isEditorExpanded[source.editor];
        },
    },
});
</script>