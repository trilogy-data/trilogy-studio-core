<template>
  <ModalDialog :show="show" title="Add Jobs Store" test-id="add-jobs-store-modal" @close="$emit('close')">
    <template #default>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Store Name</label>
          <input
            v-model="storeName"
            type="text"
            placeholder="e.g., Local Trilogy Server"
            data-testid="jobs-store-name-input"
            required
          />
        </div>

        <div class="form-group">
          <label>Base URL</label>
          <input
            v-model="baseUrl"
            type="url"
            placeholder="e.g., http://localhost:8100"
            data-testid="jobs-store-url-input"
            required
          />
          <small>Must expose `/index.json`, `/files`, `/run`, `/refresh`, and `/jobs/{id}`.</small>
        </div>

        <div class="form-group">
          <label>Token</label>
          <input
            v-model="token"
            type="text"
            placeholder="Optional X-Trilogy-Token value"
            data-testid="jobs-store-token-input"
          />
          <small>Stored in memory only. You’ll need to re-enter it after a full reload.</small>
        </div>

        <div v-if="error" class="form-error" data-testid="add-jobs-store-error">
          {{ error }}
        </div>

        <div class="dialog-actions">
          <button type="button" class="cancel-btn" @click="$emit('close')">Cancel</button>
          <button type="submit" class="confirm-btn" :disabled="loading">
            {{ loading ? 'Adding...' : 'Add Store' }}
          </button>
        </div>
      </form>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { GenericModelStore } from '../../remotes/models'
import ModalDialog from '../ModalDialog.vue'

const props = defineProps<{
  show: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  add: [store: GenericModelStore]
}>()

const storeName = ref('')
const baseUrl = ref('')
const token = ref('')
const error = ref('')

watch(
  () => props.show,
  (isVisible) => {
    if (!isVisible) {
      return
    }

    storeName.value = ''
    baseUrl.value = ''
    token.value = ''
    error.value = ''
  },
)

const handleSubmit = () => {
  if (!storeName.value || !baseUrl.value) {
    error.value = 'Store name and base URL are required.'
    return
  }

  emit('add', {
    type: 'generic',
    id: baseUrl.value.replace(/^https?:\/\//, '').replace(/\//g, '-'),
    name: storeName.value,
    baseUrl: baseUrl.value.replace(/\/$/, ''),
    token: token.value || undefined,
  })
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

.form-error {
  padding: 8px 12px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  color: #dc2626;
  font-size: 0.875rem;
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
