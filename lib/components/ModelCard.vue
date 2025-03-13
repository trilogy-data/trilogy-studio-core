<template>
  <section :id="config.name" class="model-section">
    <div class="model-title" @click="startEditing">
      <span v-if="!isEditing" class="editable-text">
        {{ config.name }}
        <span class="edit-indicator">✎</span>
      </span>
      <input
        v-else
        ref="nameInput"
        v-model="editableName"
        @blur="finishEditing"
        @keyup.enter="finishEditing"
        @keyup.esc="cancelEditing"
        class="name-input"
        type="text"
      />
    </div>
    <div class="button-container">
      <loading-button class="button" :action="() => fetchParseResults(index)">
        Parse
      </loading-button>
      <button class="button" @click="toggleNewSource(index)">Add New Source</button>
      <button class="button" @click="clearSources(index)">Clear Sources</button>
      <button class="button" @click="remove(index)">Delete</button>
    </div>

    <div v-if="newSourceVisible[index]" class="absolute-form">
      <form @submit.prevent="submitSourceAddition(index)">
        <label for="editor-alias">Alias</label>
        <input type="text" v-model="sourceDetails.alias" id="editor-alias" required />
        <label for="editor-name">Editor</label>
        <select v-model="sourceDetails.name" id="editor-name" required>
          <option v-for="editor in editorList" :key="editor" :value="editor">
            {{ editor }}
          </option>
        </select>
        <button type="submit">Submit</button>
        <button type="button" @click="toggleNewSource(index)">Cancel</button>
      </form>
    </div>

    <div v-if="config.parseError" class="parse-error">
      <error-message>Error fetching parse results: {{ config.parseError }}</error-message>
    </div>

    <div v-else>
      <h3 class="parse-results">Model Sources ({{ config.sources.length }})</h3>
      <div class="model-source" v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">
        <div>
          <div class="source-title">{{ source.alias }} ({{ source.editor }})</div>
          <div class="action-bar">
            <button class="button delete-button" @click.stop="removeSource(index, sourceIndex)">
              Remove
            </button>
          </div>
        </div>
        <div class="toggle-concepts" @click="toggleConcepts(source.alias)">
          {{ isExpanded[source.alias] ? 'Hide' : 'Show' }} Concepts ({{ source.concepts.length }})
        </div>
        <div v-if="isExpanded[source.alias]">
          <ConceptTable :concepts="source.concepts" />
        </div>
        <div class="datasources">
          <div class="toggle-concepts" @click="toggleDatasources(source.alias)">
            {{ isDatasourceExpanded[source.alias] ? 'Hide' : 'Show' }} Datasources ({{
              source.datasources.length
            }})
          </div>
          <div v-if="isDatasourceExpanded[source.alias]">
            <DatasourceTable :datasources="source.datasources" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.button-container {
  position: relative;
}
.action-bar {
  padding-bottom: 10px;
}
.editable-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-indicator {
  opacity: 0;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
}

.model-title {
  font-weight: 500;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  font-size: 24px;
}

.model-title:hover .edit-indicator {
  opacity: 1;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-indicator {
  opacity: 0;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
}

.name-input {
  background: var(--bg-color);
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: inherit;
  font-weight: 500;
  width: auto;
  min-width: 200px;
}

.name-input:focus {
  outline: none;
  border-color: #339af0;
  box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.1);
}

.model-section {
  margin-bottom: 20px;
  padding: 10px;
}

.model-source {
  border-left: 1px solid var(--border);
  padding: 10px;
}

.source-title {
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  font-size: 18px;
  padding-bottom: 10px;
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
  margin-bottom: 5px;
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
import { defineComponent, inject, ref, computed, nextTick } from 'vue'
import { ModelConfig } from '../models' // Adjust the import path
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { EditorStoreType } from '../stores/editorStore'
import ModelConcept from './ModelConcept.vue'
import AxiosResolver from '../stores/resolver'
import LoadingButton from './LoadingButton.vue'
import ErrorMessage from './ErrorMessage.vue'
import ConceptTable from './ConceptTable.vue'
import DatasourceTable from './DatasourceTable.vue'
import Editor from './Editor.vue'
export default defineComponent({
  name: 'ModelConfigViewer',
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
    })

    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const trilogyResolver = inject<AxiosResolver>('trilogyResolver')
    if (!modelStore || !editorStore || !trilogyResolver) {
      throw new Error('Missing model store or editor store!')
    }
    const isExpanded = ref<Record<string, boolean>>({})
    const isDatasourceExpanded = ref<Record<string, boolean>>({})
    const isEditing = ref<boolean>(false)
    const editableName = ref<string>('')

    const isEditorExpanded = ref<Record<string, boolean>>({})

    const toggleConcepts = (index: string) => {
      isExpanded.value[index] = !isExpanded.value[index]
    }

    const toggleDatasources = (index: string) => {
      isDatasourceExpanded.value[index] = !isDatasourceExpanded.value[index]
    }

    const newSourceVisible = ref<Record<string, boolean>>({})
    const toggleNewSource = (index: string) => {
      newSourceVisible.value[index] = !newSourceVisible.value[index]
    }
    const fetchParseResults = (model: string) => {
      return trilogyResolver
        .resolveModel(
          model,
          modelStore.models[model].sources.map((source) => ({
            alias: source.alias,
            contents: (editorStore.editors[source.editor] || { contents: '' }).contents,
          })),
        )
        .then((parseResults) => {
          modelStore.setModelConfigParseResults(model, parseResults)
        })
        .catch((error) => {
          modelStore.setModelParseError(model, error.message)
          console.error('Failed to fetch parse results:', error)
        })
    }

    // Function to submit the editor details
    const submitSourceAddition = (model: string) => {
      if (sourceDetails.value.name) {
        let target = modelStore.models[model]
        // check if it's already in the sources (sources are {name: string, alias: string}[])
        if (target.sources.some((source) => source.editor === sourceDetails.value.name)) {
          console.error('Source already exists in model')
        } else {
          target.sources.push({
            alias: sourceDetails.value.alias,
            editor: sourceDetails.value.name,
            concepts: [],
            datasources: [],
          })
          fetchParseResults(model)
        }
      }
    }
    let index = computed(() => props.config.name)

    const nameInput = ref<HTMLDivElement | null>(null)
    const startEditing = () => {
      isEditing.value = true
      editableName.value = props.config.name
      nextTick(() => {
        if (nameInput.value) {
          nameInput.value.focus()
        }
      })
    }

    const cancelEditing = () => {
      isEditing.value = false
    }

    const finishEditing = () => {
      isEditing.value = false
      modelStore.updateModelName(props.config.name, editableName.value)
    }

    return {
      modelStore,
      editorStore,
      isExpanded,
      toggleConcepts,
      isDatasourceExpanded,
      newSourceVisible,
      submitSourceAddition,
      toggleDatasources,
      sourceDetails,
      trilogyResolver,
      fetchParseResults,
      isEditorExpanded,
      index,
      toggleNewSource,
      isEditing,
      startEditing,
      editableName,
      finishEditing,
      cancelEditing,
      nameInput,
    }
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
      return this.modelStore.models
    },
    editorList(): string[] {
      return Object.values(this.editorStore.editors).map((editor) => editor.name)
    },
  },
  methods: {
    clearSources(model: string) {
      this.modelConfigs[model].sources = []
      this.fetchParseResults(model)
    },
    removeSource(model: string, sourceIndex: number) {
      this.modelConfigs[model].sources.splice(sourceIndex, 1)
      this.fetchParseResults(model)
    },
    remove(model: string) {
      this.modelStore.removeModelConfig(model)
    },
    onEditorClick(source: { alias: string; editor: string }) {
      this.isEditorExpanded[source.editor] = !this.isEditorExpanded[source.editor]
    },
  },
})
</script>
