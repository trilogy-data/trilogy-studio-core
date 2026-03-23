<template>
  <ModalDialog
    :show="show"
    title="Update Store Token"
    test-id="store-token-modal"
    @close="emit('close')"
  >
    <template #default>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Store</label>
          <div class="store-name">{{ storeName }}</div>
        </div>

        <div class="form-group">
          <label for="store-token-input">Session Token</label>
          <input
            id="store-token-input"
            v-model="localToken"
            type="text"
            placeholder="Paste the X-Trilogy-Token value"
            data-testid="store-token-input"
            required
          />
          <small
            >Stored in memory only. If the local server restarts, you’ll need to update it
            again.</small
          >
        </div>

        <div class="dialog-actions">
          <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
          <button type="submit" class="confirm-btn" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save Token' }}
          </button>
        </div>
      </form>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    storeName: string
    token?: string
    loading?: boolean
  }>(),
  {
    token: '',
    loading: false,
  },
)

const emit = defineEmits<{
  close: []
  save: [token: string]
}>()

const localToken = ref('')

watch(
  () => [props.show, props.token],
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    localToken.value = props.token || ''
  },
  { immediate: true },
)

const handleSubmit = () => {
  emit('save', localToken.value.trim())
}
</script>

<style scoped>
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 0.875rem;
}

.store-name {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.06);
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: #6b7280;
  font-size: 0.75rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.cancel-btn {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border: 1px solid var(--border);
}

.confirm-btn {
  background-color: var(--special-text);
  color: white;
  border: 1px solid var(--special-text);
}
</style>
