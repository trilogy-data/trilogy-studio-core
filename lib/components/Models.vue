<template>
  <div class="model-display">
    <div v-for="(config, index) in modelConfigs" :key="index" class="card">
      <ModelCard :config="config" :index="index" />
    </div>
  </div>
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
export default defineComponent({
  name: 'ModelConfigViewer',
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
            new ModelSource(sourceDetails.value.name, sourceDetails.value.alias),
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
  },
  methods: {
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
