<template>
  <section :id="config.name" class="model-section">
    <div class="model-header">
      <div class="model-title" @click="startEditing">
        <span v-if="!isEditing" class="editable-text">
          {{ config.name }}
          <span class="edit-icon">✎</span>
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
      <div class="controls">
        <loading-button class="btn" :action="() => fetchParseResults(index)">
          Parse
        </loading-button>
        <button class="btn" @click="toggleNewSource(index)">Add Source</button>
        <button class="btn" @click="clearSources(index)">Clear</button>
        <button class="btn delete-btn" @click="remove(index)">Delete</button>
      </div>
    </div>
    <div v-if="config.description">{{ config.description }}</div>
    <div v-if="newSourceVisible[index]" class="source-form">
      <form @submit.prevent="submitSourceAddition(index)">
        <div class="form-row">
          <label for="editor-alias">Alias</label>
          <input type="text" v-model="sourceDetails.alias" id="editor-alias" required />
        </div>
        <div class="form-row">
          <label for="editor-name">Editor</label>
          <select v-model="sourceDetails.name" id="editor-name" required>
            <option v-for="editor in editorList" :key="editor" :value="editor">
              {{ editor }}
            </option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Submit</button>
          <button type="button" class="btn" @click="toggleNewSource(index)">Cancel</button>
        </div>
      </form>
    </div>

    <div v-if="config.parseError" class="parse-error">
      <error-message>Error fetching parse results: {{ config.parseError }}</error-message>
    </div>

    <div v-else>
      <div class="section-title">Model Sources ({{ config.sources.length }})</div>
      <div class="model-source" v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">
        <div class="source-header">
          <div class="source-title">{{ source.alias }} ({{ source.editor }})</div>
          <button class="btn remove-btn" @click.stop="removeSource(index, sourceIndex)">
            Remove
          </button>
        </div>

        <div class="collapsible" @click="toggleConcepts(source.alias)">
          {{ isExpanded[source.alias] ? '▾' : '▸' }} Concepts ({{ source.concepts.length }})
        </div>
        <div v-if="isExpanded[source.alias]" class="collapsible-content">
          <ConceptTable :concepts="source.concepts" />
        </div>

        <div class="collapsible" @click="toggleDatasources(source.alias)">
          {{ isDatasourceExpanded[source.alias] ? '▾' : '▸' }} Datasources ({{
            source.datasources.length
          }})
        </div>
        <div v-if="isDatasourceExpanded[source.alias]" class="collapsible-content">
          <DatasourceTable :datasources="source.datasources" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.model-section {
  margin-bottom: 20px;
  padding: 16px;
  background-color: var(--query-window-bg);
  border: 1px solid var(--border);
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.model-title {
  font-weight: 500;
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-icon {
  opacity: 0;
  font-size: 14px;
  transition: opacity 0.2s ease;
}

.model-title:hover .edit-icon {
  opacity: 0.7;
}

.name-input {
  background: var(--bg-color);
  border: 1px solid var(--border);
  padding: 4px 8px;
  font-size: inherit;
  font-weight: 500;
  width: auto;
  min-width: 200px;
}

.name-input:focus {
  outline: none;
  border-color: #339af0;
}

.controls {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 4px 12px;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border);
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn:hover {
  background-color: var(--bg-light);
}

.delete-btn,
.remove-btn {
  color: #dc3545;
}

.section-title {
  margin: 16px 0 12px;
  font-weight: 500;
  font-size: var(--big-font-size);
}

.source-form {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid var(--border);
  background-color: var(--bg-light);
}

.form-row {
  margin-bottom: 8px;
}

.form-row label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

.form-row input,
.form-row select {
  width: 100%;
  padding: 6px;
  border: 1px solid var(--border);
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
}

.form-row input:focus,
.form-row select:focus {
  border-color: #339af0;
  outline: none;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.model-source {
  margin-bottom: 16px;
  padding: 12px;
  border-left: 2px solid var(--border);
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.source-title {
  font-weight: 500;
  font-size: 18px;
}

.collapsible {
  cursor: pointer;
  padding: 8px;
  background-color: var(--sidebar-bg);
  margin-bottom: 8px;
  font-size: 16px;
  transition: background-color 0.2s;
}

.collapsible:hover {
  background-color: var(--bg-light);
}

.collapsible-content {
  margin-bottom: 16px;
}

.parse-error {
  color: #dc3545;
  margin: 12px 0;
}

@media screen and (max-width: 768px) {
  .model-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .controls {
    flex-wrap: wrap;
  }
}
</style>

<script lang="ts">
import { defineComponent, inject, ref, computed, nextTick } from 'vue'
import { ModelConfig, ModelSource } from '../models' // Adjust the import path
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
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
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const trilogyResolver = inject<AxiosResolver>('trilogyResolver')

    if (!modelStore || !editorStore || !trilogyResolver || !connectionStore) {
      throw new Error('Missing model store or editor store!')
    }

    const isExpanded = ref<Record<string, boolean>>({})
    const isDatasourceExpanded = ref<Record<string, boolean>>({})
    const isEditing = ref<boolean>(false)
    const editableName = ref<string>('')
    const newSourceVisible = ref<Record<string, boolean>>({})
    const nameInput = ref<HTMLDivElement | null>(null)

    const index = computed(() => props.config.name)

    const toggleConcepts = (index: string) => {
      isExpanded.value[index] = !isExpanded.value[index]
    }

    const toggleDatasources = (index: string) => {
      isDatasourceExpanded.value[index] = !isDatasourceExpanded.value[index]
    }

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

    const submitSourceAddition = (model: string) => {
      if (sourceDetails.value.name) {
        let target = modelStore.models[model]
        if (target.sources.some((source) => source.editor === sourceDetails.value.name)) {
          console.error('Source already exists in model')
        } else {
          target.sources.push(
            ModelSource.fromJSON({
              alias: sourceDetails.value.alias,
              editor: sourceDetails.value.name,
              concepts: [],
              datasources: [],
            }),
          )
          fetchParseResults(model)
        }
      }
    }

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
      connectionStore,
      isExpanded,
      toggleConcepts,
      isDatasourceExpanded,
      newSourceVisible,
      submitSourceAddition,
      toggleDatasources,
      sourceDetails,
      trilogyResolver,
      fetchParseResults,
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
      let matchedConnections = Object.values(this.connectionStore.connections)
        .filter((connection) => connection.model === this.config.name)
        .map((connection) => connection.name)
      return Object.values(this.editorStore.editors)
        .filter((editor) => matchedConnections.includes(editor.connection))
        .map((editor) => editor.name)
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
  },
})
</script>
