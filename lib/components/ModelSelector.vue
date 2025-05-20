<template>
  <div class="model-anchor">
    <button class="button truncate-text" @click="toggleModelForm">
      {{ connection.model || 'Set Model' }}
    </button>
    <div v-if="isModelFormVisible" class="model-form">
      <form @submit.prevent="submitModel">
        <select v-model="selectedModel" class="model-select" required>
          <option
            v-for="model in availableModels"
            :key="model"
            :value="model"
            class="model-select-item"
          >
            {{ model }}
          </option>
          <option key="~new-model" value="~new-model" class="model-select-item">
            Create New Model
          </option>
        </select>
        <div class="model-form-actions">
          <button type="submit">Submit</button>
          <button type="button" @click="closeModelForm">Close</button>
        </div>
      </form>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import { ModelConfig } from '../models'
interface ModelSelectorProps {
  connection: {
    name: string
    model: string | null
  }
}
const props = defineProps<ModelSelectorProps>()
const modelStore = inject<ModelConfigStoreType>('modelStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const saveConnections = inject<Function>('saveConnections', () => {})
const isModelFormVisible = ref(false)
const selectedModel = ref(props.connection.model || '')
// Compute available models from the model store
const availableModels = computed(() => (modelStore ? Object.keys(modelStore.models) : []))
const toggleModelForm = () => {
  isModelFormVisible.value = !isModelFormVisible.value
}
const closeModelForm = () => {
  isModelFormVisible.value = false
}
const submitModel = async () => {
  if (selectedModel.value && connectionStore) {
    let modelName = selectedModel.value
    if (modelName === '~new-model') {
      // Create new model
      modelName = props.connection.name
      await modelStore?.addModelConfig(
        new ModelConfig({
          name: props.connection.name,
          sources: [],
          storage: 'local',
          description: '',
        }),
      )
    }
    connectionStore.connections[props.connection.name].model = modelName
  }
  saveConnections()
  isModelFormVisible.value = false
}
</script>
<style scoped>
.model-anchor {
  position: relative;
  padding-left: 5px;
  min-width: 0;
  flex-shrink: 1;
}
.model-form {
  position: absolute;
  top: 100%;
  right: 0; /* Anchor to the right */
  background-color: var(--button-bg);
  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
  z-index: 1001;
  font-size: 12px;
  text-align: center;
  /* This ensures the form extends to the left if needed */
  white-space: nowrap;
}
.model-select {
  appearance: none;
  padding: 2px;
  font-size: 12px;
  text-align: center;
  border-radius: 0px;
  width: 100%;
}
.model-form-actions {
  display: flex;
  justify-content: space-between;
  padding: 4px;
}
.button {
  font-size: var(--button-font-size);
}
</style>
