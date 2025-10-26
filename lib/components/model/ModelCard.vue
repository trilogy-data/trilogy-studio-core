<template>
  <div class="model-section">
    <!-- Controls moved to top right like CommunityModelCard -->
    <div class="section-header">
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
        <loading-button :action="() => fetchParseResults(index)"> Parse </loading-button>
        <button  @click="toggleNewSource(index)">Add Source</button>
        <!-- <button  @click="clearSources(index)">Clear</button> -->
        <button class="delete-btn" @click="remove(index)">Delete</button>
      </div>
    </div>

    <!-- Model description section (like CommunityModelCard) -->
    <div v-if="config.description" class="model-description">
      <div class="description-content">
        <div
          :class="[
            'description-text',
            {
              'description-truncated': !isDescriptionExpanded && shouldTruncateDescription,
            },
          ]"
        >
          {{ config.description }}
        </div>
        <button
          v-if="shouldTruncateDescription"
          @click="toggleDescription"
          class="description-toggle-button"
        >
          {{ isDescriptionExpanded ? 'Show Less' : 'Show More' }}
        </button>
      </div>
    </div>

    <!-- Source form (when adding new source) -->
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

    <!-- Parse error display -->
    <div v-if="config.parseError" class="parse-error">
      <error-message>Error fetching parse results: {{ config.parseError }}</error-message>
    </div>

    <!-- Main content area -->
    <div v-else class="model-content">
      <!-- Minimal Model Sources header -->
      <h3 class="sources-header">
        Model Sources ({{ config.sources.length }})
      </h3>

      <!-- Sources directly inline -->
      <div class="model-source" v-for="(source, sourceIndex) in config.sources" :key="sourceIndex">
        <div class="source-header">
          <div class="source-title">
            {{ source.alias }} 
            <span class="text-faint">
              <span class="editor-link" @click="openEditor(source.editor)" title="Open editor">🔗</span>
            </span>
          </div>
          <button class="btn remove-btn" @click.stop="removeSource(index, sourceIndex)">
            Remove
          </button>
        </div>

        <!-- Concepts subsection -->
        <div class="subsection">
          <div class="collapsible" @click="toggleConcepts(source.alias)">
            {{ isExpanded[source.alias] ? '▾' : '▸' }} Concepts ({{ source.concepts.length }})
          </div>
          <div v-if="isExpanded[source.alias]" class="collapsible-content">
            <ConceptTable :concepts="source.concepts" />
          </div>
        </div>

        <!-- Datasources subsection -->
        <div class="subsection">
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
    </div>
  </div>
</template>

<style scoped>
/* Use the existing model-section styling from the default CSS */
.model-section {
  margin-bottom: 20px;
  padding: 16px;
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
  position: relative;
  transition: box-shadow 0.2s ease;
}

.model-section:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}


.model-title {
  cursor: pointer;
  padding: 4px;
  font-size: var(--title-font-size);
  font-weight: 500;
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
  color: var(--text-color);
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

/* Editor link styling */
.editor-link {
  cursor: pointer;
  margin-left: 4px;
  opacity: 0.7;
  transition: opacity 0.2s ease;
  font-size: 14px;
}

.editor-link:hover {
  opacity: 1;
}

/* Description styling matching CommunityModelCard */
.model-description {
  margin-bottom: 12px;
  margin-top: 12px;
}

.description-content {
  margin-top: 4px;
}

.description-text {
  position: relative;
  overflow: hidden;
  transition: max-height 0.3s ease;
  color: var(--text-color);
  line-height: 1.5;
}

.description-text.description-truncated {
  max-height: calc(1.4em * 5);
  position: relative;
}

.description-text.description-truncated::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  left: 0;
  height: 1.4em;
  background: linear-gradient(transparent, var(--card-bg-color, var(--query-window-bg)));
  pointer-events: none;
}

.description-toggle-button {
  background: none;
  border: none;
  color: var(--special-text, #646cff);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 0;
  margin-top: 4px;
  text-decoration: underline;
  transition: color 0.2s ease;
}

.description-toggle-button:hover {
  color: var(--special-text, #646cff);
  opacity: 0.8;
}

/* Source form styling */
.source-form {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid var(--border);
  background-color: var(--sidebar-bg);
}

.form-row {
  margin-bottom: 8px;
}

.form-row label {
  display: block;
  margin-bottom: 4px;
  font-size: var(--font-size);
  color: var(--text-color);
}

.form-row input,
.form-row select {
  width: 100%;
  padding: 6px;
  border: 1px solid var(--border);
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: var(--font-size);
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

/* Content area */
.model-content {
  margin-top: 16px;
}

/* Minimal sources header */
.sources-header {
  color: var(--text-color);
  padding: 4px 0;
}

.model-source {
  margin-bottom: 16px;
  padding: 12px;
  border-left: 2px solid var(--border);
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.02));
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.source-title {
  font-weight: 500;
  font-size: var(--big-font-size);
  color: var(--text-color);
}

.subsection {
  margin-bottom: 12px;
}

.collapsible {
  cursor: pointer;
  padding: 8px;
  background-color: var(--sidebar-bg);
  margin-bottom: 8px;
  font-size: var(--font-size);
  transition: background-color 0.2s;
  border: 1px solid var(--border-light);
  border-radius: 4px;
}

.collapsible:hover {
  background-color: var(--button-mouseover);
}

.collapsible-content {
  margin-bottom: 16px;
  padding: 8px;
  background-color: var(--result-window-bg);
  border: 1px solid var(--border-light);
}

.parse-error {
  color: var(--error-color, #ff0000);
  margin: 12px 0;
  padding: 8px;
  background-color: rgba(255, 0, 0, 0.1);
  border: 1px solid var(--error-color, #ff0000);
}

/* Mobile responsiveness */
@media screen and (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .controls {
    flex-wrap: wrap;
    width: 100%;
  }

  .model-source {
    padding: 8px;
  }

  .source-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>

<script lang="ts">
import { defineComponent, inject, ref, computed, nextTick } from 'vue'
import { ModelConfig, ModelSource } from '../../models'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import ModelConcept from './ModelConcept.vue'
import FetchResolver from '../../stores/resolver'
import LoadingButton from '../LoadingButton.vue'
import ErrorMessage from '../ErrorMessage.vue'
import ConceptTable from '../ConceptTable.vue'
import DatasourceTable from '../connection/DatasourceTable.vue'
import Editor from '../editor/Editor.vue'
import { type NavigationStore } from '../../stores/useScreenNavigation'

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
    const trilogyResolver = inject<FetchResolver>('trilogyResolver')
    const navigationStore = inject<NavigationStore>('navigationStore')

    if (!modelStore || !editorStore || !trilogyResolver || !connectionStore || !navigationStore)  {
      throw new Error('Missing model store or editor store!')
    }

    const isExpanded = ref<Record<string, boolean>>({})
    const isDatasourceExpanded = ref<Record<string, boolean>>({})
    const isEditing = ref<boolean>(false)
    const editableName = ref<string>('')
    const newSourceVisible = ref<Record<string, boolean>>({})
    const nameInput = ref<HTMLDivElement | null>(null)
    const isDescriptionExpanded = ref<boolean>(false)

    const index = computed(() => props.config.name)

    const shouldTruncateDescription = computed(() => {
      if (!props.config.description) return false
      const lines = props.config.description.split('\n')
      return lines.length > 5
    })

    const toggleConcepts = (index: string) => {
      isExpanded.value[index] = !isExpanded.value[index]
    }

    const toggleDatasources = (index: string) => {
      isDatasourceExpanded.value[index] = !isDatasourceExpanded.value[index]
    }

    const toggleNewSource = (index: string) => {
      newSourceVisible.value[index] = !newSourceVisible.value[index]
    }

    const toggleDescription = () => {
      isDescriptionExpanded.value = !isDescriptionExpanded.value
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

    const openEditor = (editorAddress: string) => {
      navigationStore.openTab('editors', null, editorAddress)
    }

    return {
      modelStore,
      editorStore,
      connectionStore,
      navigationStore,
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
      isDescriptionExpanded,
      toggleDescription,
      shouldTruncateDescription,
      openEditor,
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
      console.log(this.navigationStore.tabs)
      console.log(`model+${model}`)
      this.navigationStore.closeTab(null, `model+${model}`)
      // this.modelStore.removeModelConfig(model)

    },
  },
})
</script>