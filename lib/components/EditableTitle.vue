<template>
  <div class="editable-title" @click="startEditing">
    <span v-if="!isEditing" class="editable-text" :data-testid="testId + '-display'">
      {{ modelValue }}
      <span class="edit-indicator" :data-testid="testId + '-edit-icon'">✎</span>
    </span>
    <input
      v-else
      ref="nameInput"
      :data-testid="testId + '-input'"
      v-model="editableName"
      @blur="finishEditing"
      @keyup.enter="finishEditing"
      @keyup.esc="cancelEditing"
      class="name-input"
      type="text"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, nextTick } from 'vue'

export default defineComponent({
  name: 'EditableTitle',
  props: {
    modelValue: {
      type: String,
      required: true,
    },
    testId: {
      type: String,
      default: 'editable-title',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const isEditing = ref(false)
    const editableName = ref('')
    const nameInput = ref<HTMLInputElement | null>(null)

    const startEditing = () => {
      isEditing.value = true
      editableName.value = props.modelValue
      nextTick(() => {
        nameInput.value?.focus()
        nameInput.value?.select()
      })
    }

    const finishEditing = () => {
      isEditing.value = false
      if (editableName.value.trim() && editableName.value !== props.modelValue) {
        emit('update:modelValue', editableName.value.trim())
      }
    }

    const cancelEditing = () => {
      isEditing.value = false
      editableName.value = props.modelValue
    }

    return {
      isEditing,
      editableName,
      nameInput,
      startEditing,
      finishEditing,
      cancelEditing,
    }
  },
})
</script>

<style scoped>
.editable-title {
  font-weight: 500;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.editable-title:hover .edit-indicator {
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
  min-width: 150px;
  color: var(--text-color);
}

.name-input:focus {
  outline: none;
  border-color: #339af0;
  box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.1);
}
</style>
