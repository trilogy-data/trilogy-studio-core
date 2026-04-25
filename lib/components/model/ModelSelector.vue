<template>
  <div class="model-anchor">
    <button class="model-trigger truncate-text" type="button" @click="toggleModelForm">
      <span class="model-trigger-text truncate-text">{{ connection.model || 'Set model' }}</span>
      <i class="mdi mdi-chevron-down model-trigger-icon"></i>
    </button>
    <div v-if="isModelFormVisible" class="model-form">
      <button
        v-for="model in availableModels"
        :key="model"
        type="button"
        class="model-option"
        :class="{ active: model === connection.model }"
        @click="selectModel(model)"
      >
        {{ model }}
      </button>
      <button type="button" class="model-option" @click="selectModel('~new-model')">
        Create New Model
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import { ModelConfig } from '../../models'
export interface ModelSelectorProps {
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
// Compute available models from the model store
const availableModels = computed(() => (modelStore ? Object.keys(modelStore.models) : []))
const toggleModelForm = () => {
  isModelFormVisible.value = !isModelFormVisible.value
}
const selectModel = async (modelName: string) => {
  if (!connectionStore) {
    return
  }

  let nextModel = modelName
  if (nextModel === '~new-model') {
    nextModel = props.connection.name
    await modelStore?.addModelConfig(
      new ModelConfig({
        name: props.connection.name,
        sources: [],
        storage: 'local',
        description: '',
      }),
    )
  }

  const conn = connectionStore.connections[props.connection.id] || connectionStore.connectionByName(props.connection.name)
  if (conn) {
    conn.model = nextModel
  }
  await saveConnections()
  isModelFormVisible.value = false
}
</script>
<style scoped>
.model-anchor {
  position: relative;
  min-width: 0;
  flex-shrink: 1;
}

.model-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: 24px;
  padding: 0 2px 0 0;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: var(--sidebar-sub-item-font-size);
  font-weight: 500;
  box-shadow: none;
}

.model-trigger:hover {
  background: transparent;
  color: var(--special-text);
}

.model-trigger-text {
  min-width: 0;
}

.model-trigger-icon {
  font-size: 14px;
  color: var(--text-faint);
}

.model-form {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  padding: 4px;
  background-color: var(--floating-surface-strong);
  box-shadow: var(--surface-shadow);
  border: 1px solid var(--border);
  border-radius: 8px;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 148px;
  white-space: nowrap;
}

.model-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 400;
  text-align: left;
  box-shadow: none;
}

.model-option:hover {
  background: var(--button-mouseover);
}

.model-option.active {
  color: var(--special-text);
  background: rgba(var(--special-text-rgb), 0.08);
}
</style>
