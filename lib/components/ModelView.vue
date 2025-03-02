<template>
  <div v-if="selectedType === 'model' && modelConfigs[selectedModel]" class="model-display">
    <ModelCard :config="modelConfigs[selectedModel]" :index="selectedModel" />
  </div>
  <div v-else-if="selectedType === 'source' && selectedSourceFull" class="editor-display">
    <Editor
      :editorName="selectedSourceFull.editor"
      context="modelView"
      @save-editors="saveEditorsCall"
    />
  </div>
  <div v-else-if="selectedType === 'concept' && selectedConceptFull" class="model-display">
    <ModelConcept :concept="selectedConceptFull" />
  </div>
  <div></div>
</template>

<style scoped>
.editor-inline {
  height: 400px;
}

.model-display {
  /* display: grid; */
  /* grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); */
  gap: 24px;
  padding: 20px;
  margin: 0 auto;
  background-color: var(--query-window-bg);
  height: 100%;
}

.editor-display {
  height: 100%;
}

.card {
  border: 1px solid var(--border);
  /* border-radius: 8px; */
  padding: 8px;
  padding-left: 16px;
  margin-bottom: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.card:hover {
  /* transform: translateY(-4px); */
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}
</style>

<script lang="ts">
import { defineComponent, inject, ref } from 'vue'
import { ModelSource, ModelConfig } from '../models' // Adjust the import path
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { EditorStoreType } from '../stores/editorStore'
import ModelConcept from './ModelConcept.vue'
import AxiosResolver from '../stores/resolver'
import LoadingButton from './LoadingButton.vue'
import ErrorMessage from './ErrorMessage.vue'
import ModelCard from './ModelCard.vue'
import Editor from './Editor.vue'
import { KeySeparator } from '../data/constants'
export default defineComponent({
  name: 'ModelConfigViewer',
  props: {
    activeModelKey: {
      type: String,
      required: true,
    },
  },
  setup() {
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

    const isEditorExpanded = ref<Record<string, boolean>>({})

    const toggleConcepts = (index: string) => {
      isExpanded.value[index] = !isExpanded.value[index]
    }

    const newSourceVisible = ref<Record<string, boolean>>({})

    const fetchParseResults = (model: string) => {
      trilogyResolver
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
          target.addModelSource(
            new ModelSource(sourceDetails.value.name, sourceDetails.value.alias, [], []),
          )
          fetchParseResults(model)
        }
      }
    }

    return {
      modelStore,
      editorStore,
      isExpanded,
      toggleConcepts,
      newSourceVisible,
      submitSourceAddition,
      sourceDetails,
      trilogyResolver,
      fetchParseResults,
      isEditorExpanded,
    }
  },
  components: {
    ModelConcept,
    LoadingButton,
    ErrorMessage,
    Editor,
    ModelCard,
  },
  computed: {
    modelConfigs(): Record<string, ModelConfig> {
      return this.modelStore.models
    },
    editorList(): string[] {
      return Object.values(this.editorStore.editors).map((editor) => editor.name)
    },

    selectedType() {
      return this.activeModelKey.split(KeySeparator)[0]
    },
    selectedPath() {
      return this.activeModelKey.split(KeySeparator).slice(1)
    },
    selectedModel() {
      return this.activeModelKey.split(KeySeparator, 2)[1]
    },
    selectedSource() {
      return this.activeModelKey.split(KeySeparator)[2]
    },
    selectedSourceFull() {
      return this.modelConfigs[this.selectedModel]?.sources.find(
        (x) => x.alias === this.selectedSource,
      )
    },
    selectedConceptNamespace() {
      return this.activeModelKey.split(KeySeparator)[3]
    },
    selectedConceptName() {
      return this.activeModelKey.split(KeySeparator)[4]
    },
    selectedConceptFull() {
      return this.modelConfigs[this.selectedModel]?.sources
        .find((x) => x.alias === this.selectedSource)
        ?.concepts.find(
          (concept) =>
            concept.name === this.selectedConceptName &&
            concept.namespace === this.selectedConceptNamespace,
        )
    },
  },
  methods: {
    saveEditorsCall() {
      this.$emit('save-editors')
    },
    clearSources(model: string) {
      this.modelConfigs[model].sources = []
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
