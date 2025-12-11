<template>
  <div v-if="show" class="confirmation-overlay" @click="$emit('close')">
    <div class="confirmation-dialog" @click.stop>
      <h3>Add Model Store</h3>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Store Type: <span class="required">*</span></label>
          <select v-model="storeType">
            <option value="generic">Generic URL Store</option>
            <option value="github">GitHub Repository</option>
          </select>
        </div>

        <!-- Generic Store Fields -->
        <template v-if="storeType === 'generic'">
          <div class="form-group">
            <label>Store Name: <span class="required">*</span></label>
            <input v-model="storeName" type="text" placeholder="e.g., Local Dev Store" required />
          </div>
          <div class="form-group">
            <label>Base URL: <span class="required">*</span></label>
            <input
              v-model="baseUrl"
              type="url"
              placeholder="e.g., http://localhost:8000"
              required
            />
            <small>URL should serve an index.json file at /index.json</small>
          </div>
        </template>

        <!-- GitHub Store Fields -->
        <template v-if="storeType === 'github'">
          <div class="form-group">
            <label>Display Name: <span class="required">*</span></label>
            <input v-model="storeName" type="text" placeholder="e.g., My Custom Models" required />
          </div>
          <div class="form-group">
            <label>Repository Owner: <span class="required">*</span></label>
            <input v-model="owner" type="text" placeholder="e.g., trilogy-data" required />
          </div>
          <div class="form-group">
            <label>Repository Name: <span class="required">*</span></label>
            <input v-model="repo" type="text" placeholder="e.g., trilogy-public-models" required />
          </div>
          <div class="form-group">
            <label>Branch: <span class="required">*</span></label>
            <input v-model="branch" type="text" placeholder="e.g., main" required />
          </div>
        </template>

        <div v-if="error" class="form-error">
          {{ error }}
        </div>
        <div class="dialog-actions">
          <button type="button" class="cancel-btn" @click="$emit('close')">Cancel</button>
          <button type="submit" class="confirm-btn" :disabled="loading">
            {{ loading ? 'Adding...' : 'Add Store' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, watch } from 'vue'
import type { GenericModelStore, GithubModelStore } from '../../remotes/models'

export default {
  name: 'AddStoreModal',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close', 'add'],
  setup(props, { emit }) {
    const storeType = ref<'generic' | 'github'>('generic')
    const storeName = ref('')
    const baseUrl = ref('')
    const owner = ref('')
    const repo = ref('')
    const branch = ref('main')
    const error = ref<string | null>(null)

    // Reset form when modal is opened
    watch(
      () => props.show,
      (newShow) => {
        if (newShow) {
          storeType.value = 'generic'
          storeName.value = ''
          baseUrl.value = ''
          owner.value = ''
          repo.value = ''
          branch.value = 'main'
          error.value = null
        }
      },
    )

    const handleSubmit = async () => {
      error.value = null

      try {
        if (storeType.value === 'generic') {
          if (!storeName.value || !baseUrl.value) {
            error.value = 'Please fill in all required fields'
            return
          }

          // Generate ID from base URL
          const id = baseUrl.value.replace(/^https?:\/\//, '').replace(/\//g, '-')

          const store: GenericModelStore = {
            type: 'generic',
            id,
            name: storeName.value,
            baseUrl: baseUrl.value.replace(/\/$/, ''), // Remove trailing slash
          }

          emit('add', store)
        } else {
          if (!storeName.value || !owner.value || !repo.value || !branch.value) {
            error.value = 'Please fill in all required fields'
            return
          }

          const id = `${owner.value}-${repo.value}-${branch.value}`

          const store: GithubModelStore = {
            type: 'github',
            id,
            name: storeName.value,
            owner: owner.value,
            repo: repo.value,
            branch: branch.value,
          }

          emit('add', store)
        }
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to add store'
      }
    }

    return {
      storeType,
      storeName,
      baseUrl,
      owner,
      repo,
      branch,
      error,
      handleSubmit,
    }
  },
}
</script>

<style scoped>
.confirmation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.confirmation-dialog {
  background-color: var(--bg-color);
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 100%;
}

.confirmation-dialog h3 {
  margin: 0 0 16px 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 0.875rem;
}

.required {
  color: #dc2626;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
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
  margin-bottom: 16px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  gap: 10px;
}

.cancel-btn {
  padding: 8px 16px;
  background-color: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.confirm-btn {
  padding: 8px 16px;
  background-color: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
