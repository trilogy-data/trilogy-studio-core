<script setup lang="ts">
import { computed, inject, useId } from 'vue'
import type { LLMConnectionStoreType } from '../../stores/llmStore'

const props = defineProps<{
  connectionName: string
  modelValue: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [model: string] }>()
const store = inject<LLMConnectionStoreType>('llmConnectionStore')
const id = useId()
const connection = computed(() => store?.connections[props.connectionName])
// Keep saved models selectable even when the model list has not loaded yet.
const models = computed(() =>
  [...new Set([connection.value?.model, ...(connection.value?.models || [])])].filter(
    (model): model is string => !!model,
  ),
)
</script>

<template>
  <div v-if="connection" class="chat-model-picker">
    <label :for="id">Model</label>
    <select
      :id="id"
      :value="modelValue"
      :disabled="disabled || connection.running"
      :aria-describedby="`${id}-notice`"
      data-testid="chat-model-select"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
    </select>
    <small :id="`${id}-notice`">
      Changing the model updates this connection’s default and affects all chats using it.
    </small>
  </div>
</template>

<style scoped>
.chat-model-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

label {
  font-size: 12px;
  color: var(--text-color);
}

select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
}

small {
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.4;
}

@media (max-width: 480px) {
  select {
    min-height: 44px;
    font-size: 16px;
  }
}
</style>
